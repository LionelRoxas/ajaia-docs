'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useRef, useState } from 'react'
import { relativeTime } from '@/lib/time'
import DeleteDialog from './DeleteDialog'

export default function OwnedRow({ id, title, updatedAt }: { id: string; title: string; updatedAt: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)
  const close = () => {
    setOpen(false)
    trigger.current?.focus()
  }
  return (
    <li className="group flex items-center hover:bg-canvas">
      <Link
        href={`/docs/${id}`}
        className="flex min-w-0 flex-1 items-baseline gap-4 py-3 pl-4 focus-visible:bg-canvas focus-visible:outline-offset-[-2px]"
      >
        <span className="min-w-0 flex-1 truncate font-serif text-[17px]">{title}</span>
        <time dateTime={updatedAt} className="shrink-0 text-xs text-muted tabular-nums">
          {relativeTime(updatedAt)}
        </time>
      </Link>
      {/* Space is always reserved, so showing the icon never shifts the row. */}
      <button
        ref={trigger}
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Delete ${title}`}
        className="mx-2 flex size-8 shrink-0 items-center justify-center rounded-md text-muted opacity-0 transition-opacity hover:bg-paper hover:text-danger focus-visible:opacity-100 group-hover:opacity-100 max-sm:opacity-100 [@media(hover:none)]:opacity-100"
      >
        <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.5 8h6l.5-8M6.75 7v3.5M9.25 7v3.5" />
        </svg>
      </button>
      {open && (
        <DeleteDialog
          docId={id}
          title={title}
          onClose={close}
          onDeleted={() => {
            setOpen(false)
            router.refresh()
          }}
        />
      )}
    </li>
  )
}
