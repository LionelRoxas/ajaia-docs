import 'server-only'
import { marked } from 'marked'
import mammoth from 'mammoth'
import { generateJSON } from '@tiptap/html/server'
import type { JSONContent } from '@tiptap/core'
import { editorExtensions } from '@/lib/editor-extensions'
import { DEFAULT_TITLE, TITLE_MAX, UPLOAD_MAX_BYTES } from '@/lib/limits'
import type { Result } from '@/lib/types'

const UNSUPPORTED = 'Supports .txt, .md, .docx up to 1 MB'
const UNREADABLE = "Couldn't read that file"
const invalid = (message: string): Result<never> => ({ ok: false, error: 'invalid', message })

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

function textToHtml(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .split(/\n{2,}/)
    .filter((p) => p.trim() !== '')
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, '<br>')}</p>`)
    .join('')
}

export async function fileToDocument(file: {
  name: string
  size: number
  bytes: ArrayBuffer
}): Promise<Result<{ title: string; content: JSONContent }>> {
  const dot = file.name.lastIndexOf('.')
  const ext = dot >= 0 ? file.name.slice(dot).toLowerCase() : ''
  if (!['.txt', '.md', '.docx'].includes(ext)) return invalid(UNSUPPORTED)
  if (file.size > UPLOAD_MAX_BYTES || file.bytes.byteLength > UPLOAD_MAX_BYTES) return invalid(UNSUPPORTED)

  try {
    let html: string
    if (ext === '.docx') {
      html = (await mammoth.convertToHtml({ buffer: Buffer.from(file.bytes) })).value
    } else {
      const text = new TextDecoder().decode(file.bytes)
      html = ext === '.txt' ? textToHtml(text) : await marked.parse(text)
    }
    const content = generateJSON(html, editorExtensions) as JSONContent
    const title = file.name.slice(0, dot).trim().slice(0, TITLE_MAX).trim() || DEFAULT_TITLE
    return { ok: true, value: { title, content } }
  } catch {
    return invalid(UNREADABLE)
  }
}
