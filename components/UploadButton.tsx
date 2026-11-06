'use client'

import { useRef, useState, useTransition, type ChangeEvent } from 'react'
import { unstable_rethrow } from 'next/navigation'
import { importDocumentAction } from '@/app/docs/actions'

export default function UploadButton() {
  const input = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const onChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.currentTarget.files?.[0]
    e.currentTarget.value = '' // allow re-selecting the same file after an error
    if (!file || pending) return
    const fd = new FormData()
    fd.append('file', file)
    start(async () => {
      setError(null)
      try {
        const res = await importDocumentAction(fd)
        if (res) setError(res.error)
      } catch (err) {
        unstable_rethrow(err) // let Next's own redirect signal through
        setError('Upload failed. Try again.')
      }
    })
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={pending}
          onClick={() => input.current?.click()}
          className="rounded-md border border-line bg-paper px-4 py-2 text-sm font-medium hover:bg-canvas disabled:opacity-50"
        >
          {pending ? 'Uploading…' : 'Upload'}
        </button>
        <span className="text-xs text-muted">Supports .txt, .md, .docx up to 1 MB</span>
      </div>
      <input
        ref={input}
        type="file"
        name="file"
        accept=".txt,.md,.docx,text/plain,text/markdown,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        onChange={onChange}
        className="hidden"
        tabIndex={-1}
        aria-hidden
      />
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  )
}
