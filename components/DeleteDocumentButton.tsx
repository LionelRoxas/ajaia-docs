'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { deleteDocumentAction } from '@/app/docs/actions'

// Owner-only; the server re-checks. `onDeleted` runs after success (refresh the list or leave the editor).
export default function DeleteDocumentButton({
  docId,
  title,
  onDeleted,
  className = '',
}: {
  docId: string
  title: string
  onDeleted: () => void
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string>()
  const trigger = useRef<HTMLButtonElement>(null)
  const cancel = useRef<HTMLButtonElement>(null)
  const headingId = useId()

  const close = () => {
    setOpen(false)
    trigger.current?.focus()
  }

  useEffect(() => {
    if (!open) return
    cancel.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !pending) close()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, pending])

  const confirm = async () => {
    setPending(true)
    setError(undefined)
    try {
      const r = await deleteDocumentAction(docId)
      if (r.ok) {
        setOpen(false)
        onDeleted()
        return
      }
      setError(r.message)
    } catch {
      setError('Something went wrong. Try again.')
    }
    setPending(false)
  }

  return (
    <>
      <button
        ref={trigger}
        type="button"
        onClick={() => {
          setError(undefined)
          setOpen(true)
        }}
        aria-label={`Delete ${title}`}
        className={`shrink-0 rounded-md px-2.5 py-1.5 text-sm text-muted hover:bg-canvas hover:text-danger ${className}`}
      >
        Delete
      </button>
      {open && (
        <div
          className="fixed inset-0 z-30 flex items-center justify-center bg-ink/30 p-4"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !pending) close()
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={headingId}
            className="w-[min(24rem,100%)] rounded-lg border border-line bg-paper p-5 shadow-lg"
          >
            <h2 id={headingId} className="text-sm font-semibold break-words">
              Delete “{title}”? This can’t be undone.
            </h2>
            <p role="alert" className="mt-2 min-h-5 text-sm text-danger">
              {error}
            </p>
            <div className="mt-3 flex justify-end gap-2">
              <button
                ref={cancel}
                type="button"
                onClick={close}
                disabled={pending}
                className="rounded-md px-3.5 py-1.5 text-sm text-muted hover:bg-canvas hover:text-ink disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirm}
                disabled={pending}
                className="rounded-md bg-danger px-3.5 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
