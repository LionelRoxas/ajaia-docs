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
import { createLiveProvider, supabaseLiveChannel, type LiveProvider } from '@/lib/live-provider'
import {
  NO_ACCESS_MESSAGE,
  SESSION_EXPIRED_MESSAGE,
  createLiveSaver,
  type LiveSaver,
  type Status,
} from '@/lib/live-save'
import { createBrowserSupabase } from '@/lib/supabase/browser'
import { saveLiveUpdateAction, saveTitleAction } from '@/app/docs/[id]/actions'
import Toolbar from './Toolbar'
import SaveStatus from './SaveStatus'
import SharePanel from './SharePanel'
import Presence from './Presence'

// Caret colors: distinct, and dark enough for the white name label.
const COLORS = ['#2453d6', '#c0362c', '#0f7b6c', '#8a4bd6', '#b45309', '#be185d', '#0369a1', '#4d7c0f']
function colorFor(userId: string): string {
  let h = 0
  for (let i = 0; i < userId.length; i++) h = (h * 31 + userId.charCodeAt(i)) >>> 0
  return COLORS[h % COLORS.length]
}

// After these nothing more will save, so the editor goes read-only.
const isStopMessage = (m?: string) => m === NO_ACCESS_MESSAGE || m === SESSION_EXPIRED_MESSAGE

type Session = { ydoc: Y.Doc; provider: LiveProvider; saver: LiveSaver }

type Props = {
  id: string
  ydoc: string // base64 Yjs state from the server
  title: string
  isOwner: boolean
  ownerName: string
  user: { id: string; name: string; email: string }
}

export default function DocEditor({ id, ydoc: serverState, title: initialTitle, isOwner, ownerName, user }: Props) {
  const [status, setStatus] = useState<Status>('idle')
  const [message, setMessage] = useState<string>()
  const [stopped, setStopped] = useState(false)
  const [peers, setPeers] = useState<string[]>([])
  const [title, setTitle] = useState(initialTitle)
  const [session, setSession] = useState<Session | null>(null)
  const [initialState] = useState(serverState) // later props never replace the live document
  const savedTitle = useRef(initialTitle)
  const titleFocused = useRef(false)
  const titleSaving = useRef(false)
  const sessionRef = useRef<Session | null>(null)

  const report = (s: Status, m?: string) => {
    if (s === 'error' && isStopMessage(m)) setStopped(true)
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
    const channel = supabaseLiveChannel(createBrowserSupabase(), id)
    channel.on('title', (p) => {
      if (typeof p.t !== 'string' || titleFocused.current) return
      const t = p.t.slice(0, TITLE_MAX)
      savedTitle.current = t
      setTitle(t)
    })
    const provider = createLiveProvider({ channel, ydoc, awareness, onPeers: (names) => setPeers(names.filter((n) => n !== user.name)) })
    const saver = createLiveSaver({
      ydoc,
      isRemote: (o) => o === provider.origin,
      send: (update) => saveLiveUpdateAction({ id, update }),
      onStatus: (s, m) => reportRef.current(s, m),
    })
    const s = { ydoc, provider, saver }
    sessionRef.current = s
    setSession(s) // the editor is built on this session
    return () => {
      void saver.flush() // client navigation away: send what's left (the request outlives the unmount)
      saver.destroy()
      provider.destroy()
      awareness.destroy()
      if (sessionRef.current === s) sessionRef.current = null
    }
  }, [id, initialState, user.name])

  const editor = useEditor(
    {
      extensions: session
        ? [
            ...liveEditorExtensions,
            Collaboration.configure({ document: session.ydoc, field: FRAGMENT }),
            CollaborationCaret.configure({ provider: session.provider, user: { name: user.name, color: colorFor(user.id) } }),
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
    sessionRef.current?.provider.destroy()
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
      sessionRef.current?.provider.send('title', { t: res.value.title })
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
            <SharePanel docId={id} currentEmail={user.email} />
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
            onFocus={() => (titleFocused.current = true)}
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
