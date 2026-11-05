'use client'

import { useState, useTransition, type FormEvent } from 'react'
import { signIn, signInAsDemo, signUp } from '@/app/auth/actions'

type Demo = { email: string; name: string }

export default function AuthForms({ demoUsers, next }: { demoUsers: Demo[]; next: string }) {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const run = (fn: () => Promise<{ error: string } | undefined>) =>
    start(async () => {
      setError(null)
      const res = await fn()
      if (res) setError(res.error)
    })

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (pending) return
    const fd = new FormData(e.currentTarget)
    fd.set('next', next)
    run(() => (mode === 'signin' ? signIn(fd) : signUp(fd)))
  }

  const input = 'w-full rounded-md border border-line bg-paper px-3 py-2 text-sm placeholder:text-muted/70 focus:border-accent focus:outline-none'

  return (
    <div className="w-full space-y-6">
      <div className="space-y-2">
        {demoUsers.map((u) => (
          <button
            key={u.email}
            disabled={pending}
            onClick={() => run(() => signInAsDemo(u.email, next))}
            className="w-full rounded-md bg-accent/[0.08] px-4 py-2.5 text-sm font-medium text-accent hover:bg-accent/[0.14] disabled:opacity-50"
          >
            Continue as {u.name}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-3 text-xs text-muted">
        <div className="h-px flex-1 bg-line" />
        or
        <div className="h-px flex-1 bg-line" />
      </div>

      <form onSubmit={onSubmit} className="space-y-3">
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
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-md border border-line px-4 py-2 text-sm font-medium hover:bg-canvas disabled:opacity-50"
        >
          {mode === 'signin' ? 'Sign in' : 'Create account'}
        </button>
      </form>

      <button
        type="button"
        disabled={pending}
        onClick={() => {
          setError(null)
          setMode(mode === 'signin' ? 'signup' : 'signin')
        }}
        className="w-full text-center text-sm text-muted hover:text-ink disabled:opacity-50"
      >
        {mode === 'signin' ? 'New here? Create an account' : 'Have an account? Sign in'}
      </button>
    </div>
  )
}
