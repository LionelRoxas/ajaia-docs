import StarterKit from '@tiptap/starter-kit'
import type { Extensions } from '@tiptap/core'

// Shared by the editor and the importer so stored JSON always matches the schema.
export const editorExtensions: Extensions = [StarterKit.configure({ heading: { levels: [1, 2, 3] } })]
