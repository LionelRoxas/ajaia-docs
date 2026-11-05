import { notFound } from 'next/navigation'
import { requireUser } from '@/lib/auth'
import { supabaseRepo } from '@/lib/repo'
import { getDocumentFor } from '@/lib/documents'
import DocEditor from '@/components/DocEditor'

export default async function DocPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await requireUser()
  const res = await getDocumentFor(supabaseRepo(), id, user.id)
  if (!res.ok) notFound()
  const { doc, role, ownerName } = res.value

  return (
    // Keyed by version: after "Reload latest" refreshes the route, the editor remounts on the new content.
    <DocEditor
      key={doc.version}
      id={doc.id}
      version={doc.version}
      title={doc.title}
      content={doc.content}
      isOwner={role === 'owner'}
      ownerName={ownerName}
      userEmail={user.email}
    />
  )
}
