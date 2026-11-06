'use client'

import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { DEMO_USERS } from '@/lib/limits'
import type { Profile } from '@/lib/types'
import { listSharesAction, shareAction, unshareAction } from '@/app/docs/[id]/actions'

// Share state stays local to the panel: no route refresh, so the editor is never remounted mid-edit.
export default function SharePanel({
  docId,
  currentEmail,
  onUnshared,
}: {
  docId: string
  currentEmail: string
  /** After a successful removal: the editor moves the live channel to the new share epoch. */
  onUnshared?: () => void
}) {
  const [open, setOpen] = useState(false)
  const [people, setPeople] = useState<Profile[] | null>(null)
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const button = useRef<HTMLButtonElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const panelId = useId()

  const refresh = async () => {
    const r = await listSharesAction(docId)
    if (r.ok) setPeople(r.value)
    else setError(r.message)
  }

  useEffect(() => {
    if (!open) return
    void refresh() // eslint-disable-line react-hooks/set-state-in-effect -- fetch on open
    input.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setOpen(false)
      button.current?.focus()
    }
    const onDown = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onDown)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onDown)
    }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps -- refresh only closes over docId

  const run = async (fn: () => Promise<{ ok: boolean; message?: string }>) => {
    setBusy(true)
    setError(undefined)
    try {
      const r = await fn()
      if (!r.ok) setError(r.message)
      else await refresh()
      return r.ok
    } catch {
      setError('Something went wrong. Try again.')
      return false
    } finally {
      setBusy(false)
    }
  }

  const add = async (e: FormEvent) => {
    e.preventDefault()
    if (!email.trim() || busy) return
    if (await run(() => shareAction(docId, email))) setEmail('')
  }

  const hint = DEMO_USERS.filter((u) => u.email !== currentEmail.toLowerCase())
    .map((u) => u.email)
    .join(', ')

  return (
    <div ref={root} className="relative shrink-0">
      <button
        ref={button}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
        className="rounded-md bg-accent px-3.5 py-1.5 text-sm font-medium text-white hover:bg-accent-hover"
      >
        Share
      </button>
      {open && (
        <div
          id={panelId}
          role="dialog"
          aria-label="Share document"
          className="absolute right-0 top-full z-20 mt-2 w-[min(22rem,calc(100vw-2rem))] rounded-lg border border-line bg-paper p-4 shadow-lg"
        >
          <form onSubmit={add} className="flex gap-2">
            <label htmlFor={`${panelId}-email`} className="sr-only">
              Email
            </label>
            <input
              ref={input}
              id={`${panelId}-email`}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              autoComplete="off"
              className="min-w-0 flex-1 rounded-md border border-line px-2.5 py-1.5 text-sm"
            />
            <button
              type="submit"
              disabled={busy}
              className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
            >
              Add
            </button>
          </form>
          <p role="alert" className="mt-2 min-h-5 text-sm text-danger">
            {error}
          </p>
          <ul className="mt-1 divide-y divide-line">
            {people?.map((p) => (
              <li key={p.id} className="flex items-center gap-3 py-2">
                <div className="min-w-0 flex-1 text-sm">
                  <div className="truncate font-medium">{p.name}</div>
                  <div className="truncate text-muted">{p.email}</div>
                </div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={async () => {
                    if (await run(() => unshareAction(docId, p.id))) onUnshared?.()
                  }}
                  aria-label={`Remove ${p.name}`}
                  className="rounded-md px-2 py-1 text-sm text-muted hover:bg-canvas hover:text-danger disabled:opacity-50"
                >
                  Remove
                </button>
              </li>
            ))}
            {people?.length === 0 && <li className="py-2 text-sm text-muted">Not shared with anyone</li>}
          </ul>
          <p className="mt-3 text-xs text-muted">Demo users: {hint}</p>
        </div>
      )}
    </div>
  )
}
