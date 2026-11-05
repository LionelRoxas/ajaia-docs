import AuthForms from '@/components/AuthForms'
import { DEMO_USERS } from '@/lib/limits'

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-8 px-4 py-16">
      <div className="text-center">
        <h1 className="text-3xl font-semibold">Ajaia Docs</h1>
        <p className="mt-2 text-sm text-zinc-600">Write, format and share documents.</p>
      </div>
      <AuthForms demoUsers={DEMO_USERS} />
    </main>
  )
}
