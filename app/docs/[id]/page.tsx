import { notFound } from 'next/navigation'
import { requireUser } from '@/lib/auth'
import { supabaseRepo } from '@/lib/repo'
import { openLiveDocument } from '@/lib/live'
import DocEditor from '@/components/DocEditor'

export default async function DocPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await requireUser()
  const res = await openLiveDocument(supabaseRepo(), id, user.id)
  if (!res.ok) {
    if (res.error === 'not_found') notFound()
    throw new Error(res.message)
  }
  const { doc, role, ownerName, ydoc } = res.value

  return (
    <DocEditor
      key={doc.id}
      id={doc.id}
      ydoc={ydoc}
      title={doc.title}
      isOwner={role === 'owner'}
      ownerName={ownerName}
      user={{ id: user.id, name: user.name, email: user.email }}
    />
  )
}
