'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { deleteDocumentAction } from '@/app/docs/actions'

// Owner-only confirm; the server re-checks. `onDeleted` runs after success (refresh the list or leave the editor).
export default function DeleteDialog({
  docId,
  title,
  onClose,
  onDeleted,
}: {
  docId: string
  title: string
  onClose: () => void
  onDeleted: () => void
}) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string>()
  const cancel = useRef<HTMLButtonElement>(null)
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
    setPending(true)
    setError(undefined)
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
            onClick={onClose}
            disabled={pending}
            className="rounded-md px-3 py-1.5 text-sm text-muted hover:bg-canvas hover:text-ink disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={pending}
            className="rounded-md bg-danger px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  )
}
