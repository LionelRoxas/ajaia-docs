'use client'

import { useFormStatus } from 'react-dom'
import { createDocumentAction } from '@/app/docs/actions'

function Submit() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
    >
      {pending ? 'Creating…' : 'New document'}
    </button>
  )
}

export default function NewDocumentButton() {
  return (
    <form action={createDocumentAction}>
      <Submit />
    </form>
  )
}
