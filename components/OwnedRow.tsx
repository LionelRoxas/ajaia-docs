'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { relativeTime } from '@/lib/time'
import DeleteDocumentButton from './DeleteDocumentButton'

export default function OwnedRow({ id, title, updatedAt }: { id: string; title: string; updatedAt: string }) {
  const router = useRouter()
  return (
    <li className="flex items-center hover:bg-canvas">
      <Link
        href={`/docs/${id}`}
        className="flex min-w-0 flex-1 items-baseline gap-4 px-4 py-3 focus-visible:bg-canvas focus-visible:outline-offset-[-2px]"
      >
        <span className="min-w-0 flex-1 truncate font-serif text-[17px]">{title}</span>
        <time dateTime={updatedAt} className="shrink-0 text-xs text-muted tabular-nums">
          {relativeTime(updatedAt)}
        </time>
      </Link>
      <DeleteDocumentButton docId={id} title={title} onDeleted={() => router.refresh()} className="mr-2" />
    </li>
  )
}
