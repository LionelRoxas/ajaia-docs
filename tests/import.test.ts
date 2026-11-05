import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import type { JSONContent } from '@tiptap/core'
import { fileToDocument } from '@/lib/import'

const enc = (s: string) => new TextEncoder().encode(s).buffer as ArrayBuffer
const mk = (name: string, s: string) => ({ name, size: s.length, bytes: enc(s) })
const fixture = (name: string) => {
  const b = readFileSync(path.join(import.meta.dirname, 'fixtures', name))
  return { name, size: b.length, bytes: b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer }
}
const walk = (n: JSONContent, out: JSONContent[] = []) => { out.push(n); n.content?.forEach((c) => walk(c, out)); return out }
const MSG = 'Supports .txt, .md, .docx up to 1 MB'

describe('fileToDocument', () => {
  it('imports markdown', async () => {
    const r = await fileToDocument(mk('a.md', '# Hi\n\n**bold** and\n\n- item'))
    if (!r.ok) throw new Error(r.message)
    expect(r.value.content.content?.[0]).toMatchObject({ type: 'heading', attrs: { level: 1 } })
    const all = walk(r.value.content)
    expect(all.some((n) => n.marks?.some((m) => m.type === 'bold'))).toBe(true)
    expect(all.some((n) => n.type === 'bulletList')).toBe(true)
  })
  it('keeps html in txt literal', async () => {
    const r = await fileToDocument(mk('a.txt', '<script>alert(1)</script>\n\nsecond\nline'))
    if (!r.ok) throw new Error(r.message)
    const all = walk(r.value.content)
    expect(all.some((n) => n.text === '<script>alert(1)</script>')).toBe(true)
    expect(all.some((n) => n.type === 'hardBreak')).toBe(true)
    expect(r.value.content.content).toHaveLength(2)
  })
  it('accepts uppercase extension', async () => {
    const r = await fileToDocument(mk('notes.TXT', 'x'))
    expect(r).toMatchObject({ ok: true, value: { title: 'notes' } })
  })
  it('falls back to default title and trims long ones', async () => {
    expect(await fileToDocument(mk('.txt', 'x'))).toMatchObject({ ok: true, value: { title: 'Untitled document' } })
    const r = await fileToDocument(mk('a'.repeat(300) + '.txt', 'x'))
    if (!r.ok) throw new Error(r.message)
    expect(r.value.title).toHaveLength(200)
  })
  it('rejects pdf', async () => {
    expect(await fileToDocument(mk('a.pdf', 'x'))).toEqual({ ok: false, error: 'invalid', message: MSG })
  })
  it('rejects oversize', async () => {
    const r = await fileToDocument({ name: 'a.txt', size: 1_048_577, bytes: new ArrayBuffer(1_048_577) })
    expect(r).toEqual({ ok: false, error: 'invalid', message: MSG })
  })
  it('imports docx', async () => {
    const r = await fileToDocument(fixture('sample.docx'))
    if (!r.ok) throw new Error(r.message)
    expect(r.value.title).toBe('sample')
    const all = walk(r.value.content)
    expect(all.some((n) => n.type === 'heading')).toBe(true)
    expect(all.some((n) => n.marks?.some((m) => m.type === 'bold'))).toBe(true)
    expect(all.some((n) => n.type === 'bulletList')).toBe(true)
  })
  it('rejects corrupt docx', async () => {
    expect(await fileToDocument(fixture('corrupt.docx'))).toEqual({ ok: false, error: 'invalid', message: "Couldn't read that file" })
  })
  it('strips scripts, images and javascript: links from markdown', async () => {
    const md = ['[x](javascript:alert(1))', '<script>alert(1)</script>', '<img src=x onerror=alert(1)>'].join('\n\n')
    const r = await fileToDocument(mk('x.md', md))
    if (!r.ok) throw new Error(r.message)
    const all = walk(r.value.content)
    const hrefs = all.flatMap((n) => n.marks ?? []).filter((m) => m.type === 'link').map((m) => String(m.attrs?.href ?? ''))
    expect(hrefs.some((h) => h.trim().toLowerCase().startsWith('javascript:'))).toBe(false)
    expect(all.some((n) => ['script', 'img', 'image'].includes(n.type ?? ''))).toBe(false)
  })
})
