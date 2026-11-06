'use client'

import { useCallback, useEffect, useId, useRef, useState } from 'react'
import DeleteDialog from './DeleteDialog'

// Owner-only overflow menu after Share; room for more document actions later.
export default function MoreMenu({ docId, title, onDeleted }: { docId: string; title: string; onDeleted: () => void }) {
  const [open, setOpen] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const button = useRef<HTMLButtonElement>(null)
  const item = useRef<HTMLButtonElement>(null)
  const menuId = useId()

  useEffect(() => {
    if (!open) return
    item.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setOpen(false)
      button.current?.focus()
    }
    const onDown = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onDown)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onDown)
    }
  }, [open])

  const closeConfirm = useCallback(() => {
    setConfirming(false)
    button.current?.focus()
  }, [])

  return (
    <div ref={root} className="relative shrink-0">
      <button
        ref={button}
        type="button"
        aria-label="More"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((o) => !o)}
        className="flex size-8 items-center justify-center rounded-md text-muted hover:bg-canvas hover:text-ink"
      >
        <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" fill="currentColor">
          <circle cx="3.5" cy="8" r="1.25" />
          <circle cx="8" cy="8" r="1.25" />
          <circle cx="12.5" cy="8" r="1.25" />
        </svg>
      </button>
      {open && (
        <div
          id={menuId}
          role="menu"
          className="absolute right-0 top-full z-20 mt-2 w-44 rounded-lg border border-line bg-paper p-1 shadow-lg"
        >
          <button
            ref={item}
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false)
              setConfirming(true)
            }}
            className="w-full rounded-md px-2.5 py-1.5 text-left text-sm text-danger hover:bg-canvas"
          >
            Delete document
          </button>
        </div>
      )}
      {confirming && (
        <DeleteDialog
          docId={docId}
          title={title}
          onClose={closeConfirm}
          onDeleted={() => {
            setConfirming(false)
            onDeleted()
          }}
        />
      )}
    </div>
  )
}
