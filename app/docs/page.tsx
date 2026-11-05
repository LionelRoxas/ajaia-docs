import Link from 'next/link'
import type { ReactNode } from 'react'
import { requireUser } from '@/lib/auth'
import { supabaseRepo } from '@/lib/repo'
import { listDocumentsFor } from '@/lib/documents'
import { relativeTime } from '@/lib/time'
import NewDocumentButton from '@/components/NewDocumentButton'
import UploadButton from '@/components/UploadButton'

export default async function DocsPage() {
  const user = await requireUser()
  const { owned, shared } = await listDocumentsFor(supabaseRepo(), user.id)

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:px-6">
      <div className="flex flex-wrap items-start gap-3">
        <NewDocumentButton />
        <UploadButton />
      </div>

      <Section title="My documents" empty="No documents yet.">
        {owned.map((d) => (
          <Row key={d.id} id={d.id} title={d.title} updatedAt={d.updated_at} />
        ))}
      </Section>

      <Section title="Shared with me" empty="Nothing shared with you yet.">
        {shared.map((d) => (
          <Row key={d.id} id={d.id} title={d.title} updatedAt={d.updated_at} sharedBy={d.owner_name} />
        ))}
      </Section>
    </main>
  )
}

function Section({ title, empty, children }: { title: string; empty: string; children: ReactNode[] }) {
  return (
    <section className="mt-10">
      <h2 className="mb-3 text-sm font-semibold">{title}</h2>
      {children.length === 0 ? (
        <p className="text-sm text-muted">{empty}</p>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-paper">{children}</ul>
      )}
    </section>
  )
}

function Row({ id, title, updatedAt, sharedBy }: { id: string; title: string; updatedAt: string; sharedBy?: string }) {
  return (
    <li>
      <Link
        href={`/docs/${id}`}
        className="flex items-baseline gap-4 px-4 py-3 hover:bg-canvas focus-visible:bg-canvas focus-visible:outline-offset-[-2px]"
      >
        <span className="min-w-0 flex-1 truncate font-serif text-[17px]">{title}</span>
        {sharedBy && <span className="shrink-0 rounded-full bg-canvas px-2 py-0.5 text-xs text-muted">Shared by {sharedBy}</span>}
        <time dateTime={updatedAt} className="shrink-0 text-xs text-muted tabular-nums">
          {relativeTime(updatedAt)}
        </time>
      </Link>
    </li>
  )
}
