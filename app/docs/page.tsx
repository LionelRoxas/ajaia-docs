import { requireUser } from '@/lib/auth'

export default async function DocsPage() {
  const user = await requireUser()
  return <main className="p-6">Signed in as {user.name}</main>
}
