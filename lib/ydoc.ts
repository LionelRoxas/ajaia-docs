import * as Y from 'yjs'
import { getSchema, type JSONContent } from '@tiptap/core'
import { prosemirrorJSONToYDoc, yDocToProsemirrorJSON } from '@tiptap/y-tiptap'
import { editorExtensions } from './editor-extensions'

export const FRAGMENT = 'default'
const schema = getSchema(editorExtensions)

export function jsonToYState(content: JSONContent): Uint8Array {
  return Y.encodeStateAsUpdate(prosemirrorJSONToYDoc(schema, content, FRAGMENT))
}

export function yStateToJson(state: Uint8Array): JSONContent {
  const doc = new Y.Doc()
  Y.applyUpdate(doc, state)
  return yDocToProsemirrorJSON(doc, FRAGMENT) as JSONContent
}

export function mergeStates(states: Uint8Array[]): Uint8Array {
  return Y.mergeUpdates(states)
}

export function toB64(u: Uint8Array): string {
  let s = ''
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000))
  return btoa(s)
}

export function fromB64(s: string): Uint8Array {
  const bin = atob(s)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}
