import Link from 'next/link'
import { getUser } from '@/lib/auth'
import { signOut } from '@/app/auth/actions'
import Logo from '@/components/Logo'

export default async function Header() {
  const user = await getUser()
  // Signed-out visitors see the sign-in page, which carries its own large wordmark.
  if (!user) return null
  return (
    <header className="flex h-14 items-center justify-between border-b border-line bg-paper px-4 sm:px-6">
      <Link href="/docs" className="flex items-center gap-2 rounded" aria-label="Ajaia Docs home">
        <Logo height={22} />
        <span className="text-[15px] font-medium text-muted">Docs</span>
      </Link>
      <div className="flex items-center gap-3 text-sm">
        <span className="text-muted">{user.name}</span>
        <form action={signOut}>
          <button type="submit" className="rounded-md px-2.5 py-1.5 text-ink hover:bg-canvas">
            Sign out
          </button>
        </form>
      </div>
    </header>
  )
}
