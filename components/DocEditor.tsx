'use client'

import Link from 'next/link'
import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import Collaboration from '@tiptap/extension-collaboration'
import CollaborationCaret from '@tiptap/extension-collaboration-caret'
import * as Y from 'yjs'
import { Awareness } from 'y-protocols/awareness'
import { liveEditorExtensions } from '@/lib/editor-extensions'
import { DEFAULT_TITLE, TITLE_MAX } from '@/lib/limits'
import { FRAGMENT, fromB64 } from '@/lib/ydoc'
import { supabaseLiveChannel } from '@/lib/live-provider'
import { createLiveSession, type LiveSession } from '@/lib/live-session'
import { colorFor, safeCaretColor } from '@/lib/caret-colors'
import { defaultSelectionBuilder } from '@tiptap/y-tiptap'
import {
  NO_ACCESS_MESSAGE,
  SESSION_EXPIRED_MESSAGE,
  createLiveSaver,
  type LiveSaver,
  type Status,
} from '@/lib/live-save'
import { createBrowserSupabase } from '@/lib/supabase/browser'
import { getLiveEpochAction, saveLiveUpdateAction, saveTitleAction } from '@/app/docs/[id]/actions'
import Toolbar from './Toolbar'
import SaveStatus from './SaveStatus'
import SharePanel from './SharePanel'
import Presence from './Presence'

// Peer carets: color limited to our palette, name inserted as text.
type CaretUser = { name?: unknown; color?: unknown }
function renderCaret(user: CaretUser): HTMLElement {
  const color = safeCaretColor(user.color)
  const caret = document.createElement('span')
  caret.classList.add('collaboration-carets__caret')
  caret.style.borderColor = color
  const label = document.createElement('div')
  label.classList.add('collaboration-carets__label')
  label.style.backgroundColor = color
  label.textContent = typeof user.name === 'string' ? user.name.slice(0, 60) : ''
  caret.append(label)
  return caret
}
const renderSelection = (user: CaretUser) =>
  defaultSelectionBuilder({ name: typeof user.name === 'string' ? user.name : '', color: safeCaretColor(user.color) })

// After these nothing more will save, so the editor goes read-only.
const isStopMessage = (m?: string) => m === NO_ACCESS_MESSAGE || m === SESSION_EXPIRED_MESSAGE

type Session = { ydoc: Y.Doc; live: LiveSession; saver: LiveSaver }

type Props = {
  id: string
  ydoc: string // base64 Yjs state from the server
  epoch: number // share epoch: live topic doc:{id}:{epoch}
  title: string
  isOwner: boolean
  ownerName: string
  user: { id: string; name: string; email: string }
}

export default function DocEditor({ id, ydoc: serverState, epoch: initialEpoch, title: initialTitle, isOwner, ownerName, user }: Props) {
  const [status, setStatus] = useState<Status>('idle')
  const [message, setMessage] = useState<string>()
  const [stopped, setStopped] = useState(false)
  const [peers, setPeers] = useState<string[]>([])
  const [title, setTitle] = useState(initialTitle)
  const [session, setSession] = useState<Session | null>(null)
  const [initialState] = useState(serverState) // later props never replace the live document
  const [startEpoch] = useState(initialEpoch)
  const savedTitle = useRef(initialTitle)
  const titleFocused = useRef(false)
  const titleAtFocus = useRef(initialTitle)
  const remoteTitle = useRef<string | null>(null) // arrived while the field was focused
  const titleSaving = useRef(false)
  const sessionRef = useRef<Session | null>(null)

  const report = (s: Status, m?: string) => {
    if (s === 'error' && isStopMessage(m)) {
      // Nothing more will save: drop pending work now so beforeunload stays quiet and no request fires.
      sessionRef.current?.saver.stop()
      setStopped(true)
    }
    setStatus(s)
    setMessage(m)
  }
  const reportRef = useRef(report)
  useEffect(() => {
    reportRef.current = report
  })

  // One live session per mount: Y.Doc from the server state, Realtime relay, and the save loop.
  useEffect(() => {
    const ydoc = new Y.Doc()
    Y.applyUpdate(ydoc, fromB64(initialState))
    const awareness = new Awareness(ydoc)
    const client = createBrowserSupabase()
    const live = createLiveSession({
      ydoc,
      awareness,
      epoch: startEpoch,
      channelFor: (e) => supabaseLiveChannel(client, id, e),
      fetchLive: () => getLiveEpochAction(id),
      onPeers: (names) => setPeers(names.filter((n) => n !== user.name)),
      // Title broadcasts are only a hint; this is the title the server has.
      onTitle: (t) => {
        if (titleFocused.current) {
          remoteTitle.current = t
          return
        }
        savedTitle.current = t
        setTitle(t)
      },
      onLost: (reason) => reportRef.current('error', reason === 'session' ? SESSION_EXPIRED_MESSAGE : NO_ACCESS_MESSAGE),
    })
    const saver = createLiveSaver({
      ydoc,
      isRemote: (o) => o === live.origin,
      send: async (update) => {
        const res = await saveLiveUpdateAction({ id, update })
        if (res.ok) live.noteEpoch(res.value.epoch) // unshared elsewhere: move to the new topic
        return res
      },
      onStatus: (s, m) => reportRef.current(s, m),
    })
    const s = { ydoc, live, saver }
    sessionRef.current = s
    setSession(s) // the editor is built on this session
    return () => {
      void saver.flush() // client navigation away: send what's left (the request outlives the unmount)
      saver.destroy()
      live.destroy()
      awareness.destroy()
      if (sessionRef.current === s) sessionRef.current = null
    }
  }, [id, initialState, startEpoch, user.name])

  const editor = useEditor(
    {
      extensions: session
        ? [
            ...liveEditorExtensions,
            Collaboration.configure({ document: session.ydoc, field: FRAGMENT }),
            CollaborationCaret.configure({
              provider: session.live,
              user: { name: user.name, color: colorFor(user.id) },
              render: renderCaret,
              selectionRender: renderSelection,
            }),
          ]
        : liveEditorExtensions,
      // No `content`: the Y.Doc is the content.
      editable: !!session,
      immediatelyRender: false,
      editorProps: {
        attributes: { class: 'doc-body', 'aria-label': 'Document body' },
      },
    },
    [session],
  )

  // Lost access or session: freeze the editor and leave the channel.
  useEffect(() => {
    if (!stopped) return
    editor?.setEditable(false)
    sessionRef.current?.saver.stop()
    sessionRef.current?.live.destroy()
    setPeers([]) // eslint-disable-line react-hooks/set-state-in-effect -- nobody is shown once we've left
  }, [stopped, editor])

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (!sessionRef.current?.saver.hasUnsaved() && !titleSaving.current) return
      e.preventDefault()
      e.returnValue = '' // older browsers need this to show the prompt
    }
    // Tab hidden (often right before closing): send pending edits while the page can still fetch.
    const onHide = () => {
      if (document.visibilityState === 'hidden') void sessionRef.current?.saver.flush()
    }
    window.addEventListener('beforeunload', warn)
    document.addEventListener('visibilitychange', onHide)
    return () => {
      window.removeEventListener('beforeunload', warn)
      document.removeEventListener('visibilitychange', onHide)
    }
  }, [])

  const saveTitle = async () => {
    titleFocused.current = false
    const remote = remoteTitle.current
    remoteTitle.current = null
    if (remote !== null && title === titleAtFocus.current) {
      // Renamed elsewhere while focused here, and untouched here: take theirs.
      savedTitle.current = remote
      setTitle(remote)
      return
    }
    const next = title.trim() || DEFAULT_TITLE
    if (next !== title) setTitle(next)
    if (next === savedTitle.current || stopped) return
    savedTitle.current = next
    titleSaving.current = true
    report('saving')
    let res: Awaited<ReturnType<typeof saveTitleAction>>
    try {
      res = await saveTitleAction({ id, title: next })
    } catch {
      res = { ok: false, error: 'invalid', message: "Couldn't save. Check your connection." }
    }
    titleSaving.current = false
    if (res.ok) {
      sessionRef.current?.live.send('title', {}) // a hint: peers fetch the title from the server
      if (!sessionRef.current?.saver.hasUnsaved()) report('saved')
      return
    }
    if (res.error === 'not_found' || res.error === 'forbidden') report('error', NO_ACCESS_MESSAGE)
    else if (res.error === 'unauthorized') report('error', SESSION_EXPIRED_MESSAGE)
    else {
      savedTitle.current = '' // let the next blur retry
      report('error', res.message)
    }
  }

  const onTitleKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return
    e.preventDefault()
    editor?.commands.focus('start') // blurs the title, which saves it
  }

  const flushNow = () => void sessionRef.current?.saver.flush()
  const readOnly = stopped || !session

  return (
    <main className="flex flex-1 flex-col">
      <div className="sticky top-0 z-10 border-b border-line bg-paper">
        <div className="mx-auto flex h-12 max-w-[56rem] items-center gap-3 px-4 sm:px-6">
          <Link
            href="/docs"
            onClick={flushNow}
            className="-ml-2 flex shrink-0 items-center gap-1 rounded-md px-2 py-1.5 text-sm text-muted hover:bg-canvas hover:text-ink"
          >
            <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6">
              <path d="M10 3.5 5.5 8l4.5 4.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="sr-only sm:not-sr-only">Documents</span>
          </Link>
          <span aria-hidden="true" className="h-5 w-px shrink-0 bg-line" />
          <div className="min-w-0 flex-1 overflow-x-auto [scrollbar-width:none]">
            <Toolbar editor={editor} disabled={readOnly} />
          </div>
          <div className="hidden min-w-0 max-w-[12rem] sm:block">
            <Presence names={peers} />
          </div>
          <div className="hidden min-w-0 max-w-[16rem] sm:block">
            <SaveStatus status={status} message={message} />
          </div>
          {isOwner ? (
            <SharePanel docId={id} currentEmail={user.email} onUnshared={() => void sessionRef.current?.live.rekey()} />
          ) : (
            <span className="shrink-0 rounded-full bg-canvas px-2 py-0.5 text-xs text-muted">Shared by {ownerName}</span>
          )}
        </div>
      </div>

      <div className="px-3 py-6 sm:px-6 sm:py-10">
        <div className="mx-auto mb-3 flex max-w-[50rem] flex-wrap items-baseline justify-between gap-x-4 gap-y-1 sm:hidden">
          <SaveStatus status={status} message={message} />
          <Presence names={peers} />
        </div>

        <article className="mx-auto min-h-[70vh] max-w-[50rem] rounded-sm border border-line bg-paper px-6 py-10 sm:px-16 sm:py-14">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onFocus={() => {
              titleFocused.current = true
              titleAtFocus.current = title
            }}
            onBlur={saveTitle}
            onKeyDown={onTitleKey}
            maxLength={TITLE_MAX}
            readOnly={stopped}
            placeholder={DEFAULT_TITLE}
            aria-label="Title"
            className="w-full bg-transparent font-serif text-[2rem] font-semibold leading-tight tracking-[-0.01em] text-ink placeholder:text-muted/60 read-only:text-muted focus:outline-none"
          />
          <div className="mt-6">
            <EditorContent editor={session ? editor : null} />
          </div>
        </article>
      </div>
    </main>
  )
}
