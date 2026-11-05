import * as Y from 'yjs'
import {
  type Awareness,
  applyAwarenessUpdate,
  encodeAwarenessUpdate,
  removeAwarenessStates,
} from 'y-protocols/awareness'
import type { SupabaseClient } from '@supabase/supabase-js'
import { fromB64, toB64 } from './ydoc'

/** Thin broadcast channel: payloads are JSON; the sender never receives its own messages. */
export interface LiveChannel {
  send(event: string, payload: Record<string, unknown>): void
  on(event: string, cb: (payload: Record<string, unknown>) => void): void
  /** cb gets the channel status; 'SUBSCRIBED' may fire again after a reconnect. */
  subscribe(cb: (status: string) => void): void
  unsubscribe(): void
}

export interface LiveProvider {
  /** Pass the provider to CollaborationCaret.configure({ provider }); it reads `awareness`. */
  awareness: Awareness
  destroy(): void
}

type AwarenessChange = { added: number[]; updated: number[]; removed: number[] }

export function createLiveProvider(opts: {
  channel: LiveChannel
  ydoc: Y.Doc
  awareness: Awareness
  onPeers?: (names: string[]) => void
  onStatus?: (status: string) => void
}): LiveProvider {
  const { channel, ydoc, awareness, onPeers, onStatus } = opts
  const origin = Symbol('live-provider')
  let ready = false
  let destroyed = false

  const send = (event: string, payload: Record<string, unknown>) => {
    if (ready && !destroyed) channel.send(event, payload)
  }
  const sendAwareness = (clients: number[]) =>
    send('awareness', { a: toB64(encodeAwarenessUpdate(awareness, clients)) })

  const onDocUpdate = (update: Uint8Array, o: unknown) => {
    if (o !== origin) send('update', { u: toB64(update) })
  }

  const onAwarenessUpdate = ({ added, updated, removed }: AwarenessChange, o: unknown) => {
    if (o === origin) return
    const self = awareness.clientID
    if ([...added, ...updated, ...removed].includes(self)) sendAwareness([self])
  }

  let lastPeers = ''
  const reportPeers = () => {
    if (!onPeers) return
    const names: string[] = []
    awareness.getStates().forEach((state, id) => {
      const name = (state as { user?: { name?: unknown } }).user?.name
      if (id !== awareness.clientID && typeof name === 'string' && !names.includes(name)) names.push(name)
    })
    names.sort()
    const key = JSON.stringify(names)
    if (key !== lastPeers) {
      lastPeers = key
      onPeers(names)
    }
  }

  channel.on('update', (p) => {
    if (typeof p.u === 'string') Y.applyUpdate(ydoc, fromB64(p.u), origin)
  })
  channel.on('sync', (p) => {
    if (typeof p.sv !== 'string') return
    send('update', { u: toB64(Y.encodeStateAsUpdate(ydoc, fromB64(p.sv))) })
    sendAwareness([awareness.clientID])
    // Ask the joiner back for anything it had before connecting; replies don't recurse.
    if (!p.reply) send('sync', { sv: toB64(Y.encodeStateVector(ydoc)), reply: true })
  })
  channel.on('awareness', (p) => {
    if (typeof p.a === 'string') applyAwarenessUpdate(awareness, fromB64(p.a), origin)
  })

  ydoc.on('update', onDocUpdate)
  awareness.on('update', onAwarenessUpdate)
  awareness.on('change', reportPeers)

  channel.subscribe((status) => {
    if (destroyed) return
    onStatus?.(status)
    if (status !== 'SUBSCRIBED') return
    ready = true
    send('sync', { sv: toB64(Y.encodeStateVector(ydoc)) })
    sendAwareness([awareness.clientID])
  })

  return {
    awareness,
    destroy() {
      if (destroyed) return
      ydoc.off('update', onDocUpdate)
      awareness.off('change', reportPeers)
      // Tell peers we're gone (handled by onAwarenessUpdate) before going silent.
      removeAwarenessStates(awareness, [awareness.clientID], 'destroy')
      awareness.off('update', onAwarenessUpdate)
      destroyed = true
      channel.unsubscribe()
    },
  }
}

export function supabaseLiveChannel(client: SupabaseClient, docId: string): LiveChannel {
  const ch = client.channel(`doc:${docId}`, { config: { private: true, broadcast: { self: false } } })
  return {
    send(event, payload) {
      void ch.send({ type: 'broadcast', event, payload })
    },
    on(event, cb) {
      ch.on('broadcast', { event }, (msg) => cb((msg.payload ?? {}) as Record<string, unknown>))
    },
    subscribe(cb) {
      ch.subscribe((status) => cb(status))
    },
    unsubscribe() {
      void client.removeChannel(ch)
    },
  }
}
