/** Who else has this document open. Hidden when you're alone. */
export default function Presence({ names }: { names: string[] }) {
  if (names.length === 0) return null
  const list = names.join(', ')
  return (
    <p className="flex min-w-0 items-center gap-1.5 text-sm text-muted" title={`Editing: ${list}`}>
      <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-[#0f7b6c]" />
      <span className="truncate">Editing: {list}</span>
    </p>
  )
}
