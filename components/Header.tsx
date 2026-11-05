import Link from 'next/link'
import { getUser } from '@/lib/auth'
import { signOut } from '@/app/auth/actions'

export default async function Header() {
  const user = await getUser()
  return (
    <header className="flex items-center justify-between border-b border-zinc-200 bg-white px-6 py-3">
      <Link href={user ? '/docs' : '/'} className="text-lg font-semibold">
        Ajaia Docs
      </Link>
      {user && (
        <div className="flex items-center gap-4 text-sm">
          <span className="text-zinc-600">{user.name}</span>
          <form action={signOut}>
            <button type="submit" className="rounded border border-zinc-300 px-3 py-1 hover:bg-zinc-100">
              Sign out
            </button>
          </form>
        </div>
      )}
    </header>
  )
}
