import { useEffect, useRef } from 'react'
import { useEditor, EditorContent, type JSONContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Collaboration from '@tiptap/extension-collaboration'
import type * as Y from 'yjs'

interface EditorProps {
  doc: Y.Doc
  onContentChange: (headingText: string, text: string) => void
}

function extractHeadingText(node: JSONContent): string {
  const headings: string[] = []
  function walk(n: JSONContent) {
    if (n.type === 'heading') {
      const text = (n.content ?? []).map((c) => c.text ?? '').join('')
      if (text) headings.push(text)
    }
    for (const child of n.content ?? []) walk(child)
  }
  walk(node)
  return headings.join('\n')
}

export function Editor({ doc, onContentChange }: EditorProps) {
  const onContentChangeRef = useRef(onContentChange)
  onContentChangeRef.current = onContentChange
  const debounceRef = useRef<ReturnType<typeof setTimeout>>()

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ history: false }),
      Collaboration.configure({ document: doc }),
    ],
    onUpdate: ({ editor }) => {
      clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(() => {
        onContentChangeRef.current(extractHeadingText(editor.getJSON()), editor.getText())
      }, 400)
    },
  })

  // Capture the note's initial content once local persistence has hydrated the doc,
  // so search results stay fresh even for notes that are opened but never edited
  useEffect(() => {
    if (!editor) return
    onContentChangeRef.current(extractHeadingText(editor.getJSON()), editor.getText())
  }, [editor])

  useEffect(() => () => clearTimeout(debounceRef.current), [])

  return <EditorContent editor={editor} />
}
