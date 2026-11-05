'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState, useTransition, type KeyboardEvent } from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import type { JSONContent } from '@tiptap/core'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { editorExtensions } from '@/lib/editor-extensions'
import { CONTENT_MAX_BYTES, DEFAULT_TITLE, TITLE_MAX } from '@/lib/limits'
import {
  CONFLICT_MESSAGE,
  NO_ACCESS_MESSAGE,
  SESSION_EXPIRED_MESSAGE,
  createSaveQueue,
  type Patch,
  type SaveQueue,
  type Status,
} from '@/lib/save-queue'
import { saveDocumentAction } from '@/app/docs/[id]/actions'
import Toolbar from './Toolbar'
import SaveStatus from './SaveStatus'
import SharePanel from './SharePanel'

const DEBOUNCE_MS = 1000
const tooLarge = (c: JSONContent) => new TextEncoder().encode(JSON.stringify(c)).length > CONTENT_MAX_BYTES
// After these the queue sends nothing more, so the editor goes read-only.
const isStopped = (s: Status, m?: string) =>
  s === 'conflict' || (s === 'error' && (m === NO_ACCESS_MESSAGE || m === SESSION_EXPIRED_MESSAGE))

type Props = {
  id: string
  version: number
  title: string
  content: JSONContent
  isOwner: boolean
  ownerName: string
  userEmail: string
}

export default function DocEditor({ id, version, title: initialTitle, content, isOwner, ownerName, userEmail }: Props) {
  const router = useRouter()
  const [status, setStatus] = useState<Status>('idle')
  const [message, setMessage] = useState<string>()
  const [title, setTitle] = useState(initialTitle)
  const [copied, setCopied] = useState<'ok' | 'failed' | null>(null)
  const [reloading, startReload] = useTransition()
  const savedTitle = useRef(initialTitle)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const latestDoc = useRef<ProseMirrorNode | null>(null) // immutable snapshot; still readable after the editor is destroyed
  const unsaved = useRef(false) // a change was handed to the queue and not yet confirmed
  const halted = useRef(false) // conflict or lost access: nothing more will save

  const queue = useRef<SaveQueue | null>(null)
  // Created once on mount (not during render) so its callbacks may touch refs.
  useEffect(() => {
    queue.current ??= createSaveQueue({
      initialVersion: version,
      // Oversize content is rejected locally so it never hits the request body limit.
      send: async (patch, v) =>
        patch.content && tooLarge(patch.content)
          ? { ok: false, error: 'invalid', message: 'Document is too large' }
          : saveDocumentAction({ id, version: v, ...patch }),
      onStatus: (s, m) => {
        if (isStopped(s, m)) halted.current = true
        if (s === 'saved') {
          unsaved.current = false
          if (timer.current) return // newer typing is still waiting for its debounce: stay on "Saving…"
        }
        setStatus(s)
        setMessage(m)
      },
    })
  }, [id, version])
  const push = (patch: Patch) => {
    unsaved.current = true
    queue.current?.push(patch)
  }

  const editor = useEditor({
    extensions: editorExtensions,
    content,
    immediatelyRender: false,
    editorProps: {
      attributes: { class: 'doc-body', 'aria-label': 'Document body' },
    },
    onUpdate: ({ editor: e }) => {
      if (halted.current) return
      setStatus('saving')
      setMessage(undefined)
      latestDoc.current = e.state.doc
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(flushNow, DEBOUNCE_MS)
    },
  })

  // Send the pending debounced edit now (on debounce, Back link, and unmount via client navigation),
  // and resend anything the queue kept after a failed request.
  function flushNow() {
    if (timer.current && latestDoc.current) {
      clearTimeout(timer.current)
      timer.current = null
      push({ content: latestDoc.current.toJSON() })
    }
    void queue.current?.flush()
  }
  useEffect(() => () => flushNow(), []) // eslint-disable-line react-hooks/exhaustive-deps -- refs only

  const readOnly = isStopped(status, message)
  useEffect(() => {
    if (readOnly) editor?.setEditable(false)
  }, [readOnly, editor])

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (!unsaved.current && !timer.current) return
      e.preventDefault()
      e.returnValue = '' // older browsers need this to show the prompt
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [])

  const saveTitle = () => {
    const next = title.trim() || DEFAULT_TITLE
    if (next !== title) setTitle(next)
    if (next === savedTitle.current || halted.current) return
    savedTitle.current = next
    push({ title: next })
  }

  const onTitleKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return
    e.preventDefault()
    editor?.commands.focus('start')
  }

  const copyText = async () => {
    if (!editor) return
    try {
      await navigator.clipboard.writeText(editor.getText())
      setCopied('ok')
    } catch {
      setCopied('failed')
    }
  }

  const conflict = status === 'conflict'

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
          <div className="hidden min-w-0 max-w-[16rem] sm:block">
            <SaveStatus status={status} message={message} />
          </div>
          {isOwner ? (
            <SharePanel docId={id} currentEmail={userEmail} />
          ) : (
            <span className="shrink-0 rounded-full bg-canvas px-2 py-0.5 text-xs text-muted">Shared by {ownerName}</span>
          )}
        </div>
      </div>

      <div className="px-3 py-6 sm:px-6 sm:py-10">
        <div className="mx-auto mb-3 max-w-[50rem] sm:hidden">
          <SaveStatus status={status} message={message} />
        </div>

        {conflict && (
          <div
            role="alert"
            className="mx-auto mb-4 flex max-w-[50rem] flex-wrap items-center gap-x-4 gap-y-3 rounded-lg border border-danger/30 bg-danger/[0.05] px-4 py-3"
          >
            <div className="min-w-0 flex-1 text-sm">
              <p className="text-ink">{CONFLICT_MESSAGE}</p>
              {copied === 'failed' && <p className="mt-1 text-danger">Couldn&apos;t copy. Select the text and copy it manually.</p>}
            </div>
            <div className="flex shrink-0 gap-2">
              <button
                type="button"
                onClick={copyText}
                className="rounded-md border border-line bg-paper px-3 py-1.5 text-sm font-medium hover:bg-canvas"
              >
                {copied === 'ok' ? 'Copied' : 'Copy my text'}
              </button>
              <button
                type="button"
                disabled={reloading}
                onClick={() => startReload(() => router.refresh())}
                className="rounded-md border border-line bg-paper px-3 py-1.5 text-sm font-medium hover:bg-canvas disabled:opacity-50"
              >
                Reload latest
              </button>
            </div>
          </div>
        )}

        <article className="mx-auto min-h-[70vh] max-w-[50rem] rounded-sm border border-line bg-paper px-6 py-10 sm:px-16 sm:py-14">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={saveTitle}
            onKeyDown={onTitleKey}
            maxLength={TITLE_MAX}
            readOnly={readOnly}
            placeholder={DEFAULT_TITLE}
            aria-label="Title"
            className="w-full bg-transparent font-serif text-[2rem] font-semibold leading-tight tracking-[-0.01em] text-ink placeholder:text-muted/60 read-only:text-muted focus:outline-none"
          />
          <div className="mt-6">
            <EditorContent editor={editor} />
          </div>
        </article>
      </div>
    </main>
  )
}
