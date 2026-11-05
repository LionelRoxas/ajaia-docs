'use client'

import { useEditorState, type Editor } from '@tiptap/react'
import type { ReactNode } from 'react'

type Level = 1 | 2 | 3

export default function Toolbar({ editor, disabled }: { editor: Editor | null; disabled: boolean }) {
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) =>
      e && {
        bold: e.isActive('bold'),
        italic: e.isActive('italic'),
        underline: e.isActive('underline'),
        h1: e.isActive('heading', { level: 1 }),
        h2: e.isActive('heading', { level: 2 }),
        h3: e.isActive('heading', { level: 3 }),
        bullet: e.isActive('bulletList'),
        ordered: e.isActive('orderedList'),
      },
  })
  const off = disabled || !editor
  const chain = () => editor!.chain().focus()
  const heading = (level: Level) => chain().toggleHeading({ level }).run()

  return (
    <div role="toolbar" aria-label="Formatting" className="flex w-max items-center gap-0.5">
      <Btn label="Bold" shortcut="Ctrl+B" on={s?.bold} off={off} run={() => chain().toggleBold().run()}>
        <span className="font-bold">B</span>
      </Btn>
      <Btn label="Italic" shortcut="Ctrl+I" on={s?.italic} off={off} run={() => chain().toggleItalic().run()}>
        <span className="font-serif italic">I</span>
      </Btn>
      <Btn label="Underline" shortcut="Ctrl+U" on={s?.underline} off={off} run={() => chain().toggleUnderline().run()}>
        <span className="underline underline-offset-2">U</span>
      </Btn>
      <Sep />
      <Btn label="Heading 1" on={s?.h1} off={off} run={() => heading(1)}>H1</Btn>
      <Btn label="Heading 2" on={s?.h2} off={off} run={() => heading(2)}>H2</Btn>
      <Btn label="Heading 3" on={s?.h3} off={off} run={() => heading(3)}>H3</Btn>
      <Sep />
      <Btn label="Bullet list" on={s?.bullet} off={off} run={() => chain().toggleBulletList().run()}>
        <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" fill="currentColor">
          <circle cx="2.5" cy="4" r="1.25" />
          <circle cx="2.5" cy="8" r="1.25" />
          <circle cx="2.5" cy="12" r="1.25" />
          <rect x="6" y="3.25" width="8.5" height="1.5" rx=".75" />
          <rect x="6" y="7.25" width="8.5" height="1.5" rx=".75" />
          <rect x="6" y="11.25" width="8.5" height="1.5" rx=".75" />
        </svg>
      </Btn>
      <Btn label="Numbered list" on={s?.ordered} off={off} run={() => chain().toggleOrderedList().run()}>
        <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" fill="currentColor">
          <text x="0.5" y="6" fontSize="5.5" fontFamily="inherit" fontWeight="600">1</text>
          <text x="0.5" y="13.5" fontSize="5.5" fontFamily="inherit" fontWeight="600">2</text>
          <rect x="6" y="3.25" width="8.5" height="1.5" rx=".75" />
          <rect x="6" y="11.25" width="8.5" height="1.5" rx=".75" />
        </svg>
      </Btn>
    </div>
  )
}

function Btn({
  label,
  shortcut,
  on,
  off,
  run,
  children,
}: {
  label: string
  shortcut?: string
  on?: boolean
  off: boolean
  run: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={!!on}
      title={shortcut ? `${label} (${shortcut})` : label}
      disabled={off}
      // Keep the text selection: don't let the button take focus on mousedown.
      onMouseDown={(e) => e.preventDefault()}
      onClick={run}
      className="flex h-8 min-w-8 items-center justify-center rounded-md px-2 text-sm text-ink hover:bg-canvas disabled:opacity-40 disabled:hover:bg-transparent aria-pressed:bg-accent/[0.1] aria-pressed:text-accent"
    >
      {children}
    </button>
  )
}

const Sep = () => <span aria-hidden="true" className="mx-1 h-5 w-px bg-line" />
