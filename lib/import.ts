import 'server-only'
import { marked } from 'marked'
import mammoth from 'mammoth'
import JSZip from 'jszip'
import { generateJSON } from '@tiptap/html/server'
import type { JSONContent } from '@tiptap/core'
import { editorExtensions } from '@/lib/editor-extensions'
import { DEFAULT_TITLE, TITLE_MAX, UPLOAD_MAX_BYTES } from '@/lib/limits'
import type { Result } from '@/lib/types'

const UNSUPPORTED = 'Supports .txt, .md, .docx up to 1 MB'
const UNREADABLE = "Couldn't read that file"
const invalid = (message: string): Result<never> => ({ ok: false, error: 'invalid', message })

// Zip-bomb guard: limits on entry count, total unzipped bytes, and HTML size.
const DOCX_MAX_ENTRIES = 200
const DOCX_MAX_UNZIPPED = 10 * 1024 * 1024
const HTML_MAX_CHARS = 3_000_000

class Unreadable extends Error {}

async function checkDocx(bytes: ArrayBuffer): Promise<void> {
  let zip: JSZip
  try {
    zip = await JSZip.loadAsync(bytes)
  } catch {
    throw new Unreadable()
  }
  const entries = Object.values(zip.files)
  if (entries.length > DOCX_MAX_ENTRIES) throw new Unreadable()
  let total = 0
  for (const entry of entries) {
    if (entry.dir) continue
    // Stream each entry so a bomb is stopped at the cap, not fully inflated first.
    await new Promise<void>((resolve, reject) => {
      const stream = entry.nodeStream('nodebuffer')
      stream.on('data', (chunk: Buffer) => {
        total += chunk.byteLength
        if (total > DOCX_MAX_UNZIPPED) {
          stream.pause()
          reject(new Unreadable())
        }
      })
      stream.on('error', () => reject(new Unreadable()))
      stream.on('end', () => resolve())
    })
  }
}

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
      await checkDocx(file.bytes)
      html = (await mammoth.convertToHtml({ buffer: Buffer.from(file.bytes) })).value
    } else {
      const text = new TextDecoder().decode(file.bytes)
      html = ext === '.txt' ? textToHtml(text) : await marked.parse(text)
    }
    if (html.length > HTML_MAX_CHARS) return invalid(UNREADABLE)
    const content = generateJSON(html, editorExtensions) as JSONContent
    const title = file.name.slice(0, dot).trim().slice(0, TITLE_MAX).trim() || DEFAULT_TITLE
    return { ok: true, value: { title, content } }
  } catch (e) {
    if (!(e instanceof Unreadable)) console.error('import failed', e)
    return invalid(UNREADABLE)
  }
}
