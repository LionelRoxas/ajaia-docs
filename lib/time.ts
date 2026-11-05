const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })
const STEPS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['second', 60],
  ['minute', 60],
  ['hour', 24],
  ['day', 7],
  ['week', 4.35],
  ['month', 12],
  ['year', Infinity],
]

/** "just now", "5 minutes ago", "yesterday", "3 weeks ago" … */
export function relativeTime(iso: string, now: number = Date.now()): string {
  let delta = (new Date(iso).getTime() - now) / 1000
  if (Math.abs(delta) < 45) return 'just now'
  for (const [unit, size] of STEPS) {
    if (Math.abs(delta) < size) return rtf.format(Math.round(delta), unit)
    delta /= size
  }
  return rtf.format(Math.round(delta), 'year')
}
