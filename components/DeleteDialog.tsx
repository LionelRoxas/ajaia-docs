'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { deleteDocumentAction } from '@/app/docs/actions'

// Owner-only confirm; the server re-checks. `onDeleted` runs after success (refresh the list or leave the editor).
export default function DeleteDialog({
  docId,
  title,
  onClose,
  onDeleted,
  onPendingChange,
}: {
  docId: string
  title: string
  onClose: () => void
  onDeleted: () => void
  /** true when a delete starts, false if it failed (so the editor can ignore its own cut-off meanwhile). */
  onPendingChange?: (pending: boolean) => void
}) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string>()
  const cancel = useRef<HTMLButtonElement>(null)
  const confirmBtn = useRef<HTMLButtonElement>(null)
  const headingId = useId()

  useEffect(() => {
    cancel.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !pending) onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [pending, onClose])

  const confirm = async () => {
    if (pending) return // aria-disabled keeps focus, so block double submit here
    setPending(true)
    setError(undefined)
    onPendingChange?.(true)
    try {
      const r = await deleteDocumentAction(docId)
      if (r.ok) {
        onDeleted()
        return
      }
      setError(r.message)
    } catch {
      setError('Something went wrong. Try again.')
    }
    onPendingChange?.(false)
    setPending(false)
  }

  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center bg-ink/30 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !pending) onClose()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        className="w-[min(22rem,100%)] rounded-lg border border-line bg-paper p-4 shadow-lg"
        onKeyDown={(e) => {
          if (e.key !== 'Tab') return
          // Keep focus inside the dialog: Cancel <-> Delete.
          const [first, last] = [cancel.current, confirmBtn.current]
          if (e.shiftKey && document.activeElement === first) {
            e.preventDefault()
            last?.focus()
          } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault()
            first?.focus()
          }
        }}
      >
        <h2 id={headingId} className="text-sm font-semibold break-words">
          Delete “{title}”? This can’t be undone.
        </h2>
        <p role="alert" className="mt-2 min-h-5 text-sm text-danger">
          {error}
        </p>
        <div className="mt-2 flex justify-end gap-2">
          <button
            ref={cancel}
            type="button"
            onClick={() => {
              if (!pending) onClose()
            }}
            aria-disabled={pending}
            className="rounded-md px-3 py-1.5 text-sm text-muted hover:bg-canvas hover:text-ink aria-disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            ref={confirmBtn}
            type="button"
            onClick={confirm}
            aria-disabled={pending}
            className="rounded-md bg-danger px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 aria-disabled:opacity-50"
          >
            {pending ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  )
}
