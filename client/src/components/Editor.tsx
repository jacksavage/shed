import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Collaboration from '@tiptap/extension-collaboration'
import type * as Y from 'yjs'

interface EditorProps {
  doc: Y.Doc
}

export function Editor({ doc }: EditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ history: false }),
      Collaboration.configure({ document: doc }),
    ],
  })

  return <EditorContent editor={editor} />
}
