import type { Status } from '@/lib/save-queue'

const LABEL: Record<Exclude<Status, 'idle'>, string> = {
  saving: 'Saving…',
  saved: 'Saved',
  conflict: 'Conflict',
  error: 'Error',
}

export default function SaveStatus({ status, message }: { status: Status; message?: string }) {
  return (
    <p role="status" aria-live="polite" className="flex min-w-0 items-baseline gap-2 text-sm">
      {status !== 'idle' && (
        <span className={status === 'error' || status === 'conflict' ? 'font-medium text-danger' : 'text-muted'}>
          {LABEL[status]}
        </span>
      )}
      {status === 'error' && message && <span className="truncate text-muted">{message}</span>}
    </p>
  )
}
