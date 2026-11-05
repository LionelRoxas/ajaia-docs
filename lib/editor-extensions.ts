import StarterKit from '@tiptap/starter-kit'
import type { Extensions } from '@tiptap/core'

const starterKit = { heading: { levels: [1, 2, 3] as (1 | 2 | 3)[] } }

// Shared by the editor and the importer so stored JSON always matches the schema.
export const editorExtensions: Extensions = [StarterKit.configure(starterKit)]

// Same schema for the live editor; Collaboration brings its own (Yjs) undo, so StarterKit's is off.
export const liveEditorExtensions: Extensions = [StarterKit.configure({ ...starterKit, undoRedo: false })]
