import AuthForms from '@/components/AuthForms'
import Logo from '@/components/Logo'
import { DEMO_USERS } from '@/lib/limits'
import { safeNext } from '@/lib/auth-redirect'

export default async function Home({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  const { next } = await searchParams
  const nextPath = safeNext(typeof next === 'string' ? next : undefined)
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm rounded-xl border border-line bg-paper px-6 py-8 sm:px-8">
        <div className="mb-8 text-center">
          <h1 className="flex items-end justify-center gap-2">
            <Logo height={36} preload />
            <span className="text-2xl font-medium leading-none text-muted">Docs</span>
          </h1>
          <p className="mt-3 text-sm text-muted">Write, format and share documents.</p>
        </div>
        <AuthForms demoUsers={DEMO_USERS} next={nextPath} />
      </div>
    </main>
  )
}
