'use client'

import { useState, useTransition } from 'react'
import { signIn, signInAsDemo, signUp } from '@/app/auth/actions'

type Demo = { email: string; name: string }

export default function AuthForms({ demoUsers }: { demoUsers: Demo[] }) {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const run = (fn: () => Promise<{ error: string } | undefined>) =>
    start(async () => {
      setError(null)
      const res = await fn()
      if (res) setError(res.error)
    })

  const input = 'w-full rounded border border-zinc-300 px-3 py-2 text-sm'

  return (
    <div className="mx-auto w-full max-w-sm space-y-6">
      <div className="space-y-2">
        {demoUsers.map((u) => (
          <button
            key={u.email}
            disabled={pending}
            onClick={() => run(() => signInAsDemo(u.email))}
            className="w-full rounded bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
          >
            Continue as {u.name}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-3 text-xs text-zinc-400">
        <div className="h-px flex-1 bg-zinc-200" />
        or
        <div className="h-px flex-1 bg-zinc-200" />
      </div>

      <form
        action={(fd) => run(() => (mode === 'signin' ? signIn(fd) : signUp(fd)))}
        className="space-y-3"
      >
        {mode === 'signup' && (
          <input name="name" placeholder="Name" required autoComplete="name" className={input} />
        )}
        <input name="email" type="email" placeholder="Email" required autoComplete="email" className={input} />
        <input
          name="password"
          type="password"
          placeholder="Password"
          required
          minLength={mode === 'signup' ? 8 : undefined}
          autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
          className={input}
        />
        {error && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={pending}
          className="w-full rounded border border-zinc-300 px-4 py-2 text-sm font-medium hover:bg-zinc-100 disabled:opacity-50"
        >
          {mode === 'signin' ? 'Sign in' : 'Create account'}
        </button>
      </form>

      <button
        type="button"
        onClick={() => {
          setError(null)
          setMode(mode === 'signin' ? 'signup' : 'signin')
        }}
        className="w-full text-center text-sm text-zinc-600 underline"
      >
        {mode === 'signin' ? 'New here? Create an account' : 'Have an account? Sign in'}
      </button>
    </div>
  )
}
