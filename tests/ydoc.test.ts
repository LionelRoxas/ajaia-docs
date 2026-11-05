import { describe, it, expect } from 'vitest'
import * as Y from 'yjs'
import { fromB64, jsonToYState, mergeStates, toB64, yStateToJson } from '@/lib/ydoc'

const base = {
  type: 'doc',
  content: [
    { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Title' }] },
    { type: 'paragraph', content: [{ type: 'text', text: 'bold', marks: [{ type: 'bold' }] }] },
    { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'item' }] }] }] },
  ],
}
const json = (s: Uint8Array) => JSON.stringify(yStateToJson(s))

describe('ydoc', () => {
  it('round-trips JSON through Yjs state', () => {
    expect(yStateToJson(jsonToYState(base))).toEqual(base)
  })
  it('b64 round-trips', () => {
    const s = jsonToYState(base)
    expect(fromB64(toB64(s))).toEqual(s)
  })
  function edit(state: Uint8Array, text: string) {
    const d = new Y.Doc()
    Y.applyUpdate(d, state)
    let update!: Uint8Array
    d.on('update', (u: Uint8Array) => { update = u })
    const frag = d.getXmlFragment('default')
    const p = new Y.XmlElement('paragraph')
    p.insert(0, [new Y.XmlText(text)])
    frag.insert(frag.length, [p])
    return update
  }
  it('merges concurrent edits once each', () => {
    const b = jsonToYState(base)
    const merged = json(mergeStates([b, edit(b, 'AAA'), edit(b, 'BBB')]))
    expect(merged.match(/AAA/g)).toHaveLength(1)
    expect(merged.match(/BBB/g)).toHaveLength(1)
  })
  it('merging the same update twice is idempotent', () => {
    const b = jsonToYState(base)
    const u = edit(b, 'AAA')
    expect(json(mergeStates([b, u, u]))).toBe(json(mergeStates([b, u])))
  })
})
