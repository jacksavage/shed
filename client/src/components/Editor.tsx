// The only module that imports BlockNote. Keeping it contained here is what keeps the
// exit cheap if BlockNote is ever dropped (see docs/editor-choice.md, "Lock-in").
import { useEffect, useMemo, useRef } from 'react'
import { useCreateBlockNote } from '@blocknote/react'
import { BlockNoteView } from '@blocknote/shadcn'
import { withCollaboration } from '@blocknote/core/yjs'
import type { Block, BlockNoteEditor } from '@blocknote/core'

// Extraction walks whatever schema the editor has, so it doesn't pin the generics
type AnyBlock = Block<any, any, any>
import type { HocuspocusProvider } from '@hocuspocus/provider'
import type * as Y from 'yjs'
import '@blocknote/shadcn/style.css'
import './editor.css'

interface EditorProps {
  doc: Y.Doc
  provider: HocuspocusProvider
  onContentChange: (headingText: string, text: string) => void
}

// The XmlFragment BlockNote binds to. Tiptap used 'default'; the node structure differs,
// so BlockNote gets its own field rather than trying to read old Tiptap content.
const FRAGMENT_NAME = 'blocknote'

const CURSOR_COLORS = ['#e11d48', '#d97706', '#16a34a', '#0891b2', '#2563eb', '#7c3aed', '#c026d3']
const CURSOR_NAMES = ['Otter', 'Heron', 'Badger', 'Lynx', 'Wren', 'Marten', 'Kestrel', 'Newt', 'Ibex', 'Puffin']

function pick<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)]
}

// There is no auth yet, so each tab invents a display identity for presence cursors.
// sessionStorage keeps it stable across reloads of the same tab, while separate tabs
// (and separate browser contexts) still get distinct cursors.
function tabUser(): { name: string; color: string } {
  const key = 'shed:cursor-user'
  try {
    const stored = sessionStorage.getItem(key)
    if (stored) return JSON.parse(stored)
  } catch {
    // Storage blocked or corrupt — fall through and generate a fresh one
  }
  const user = { name: pick(CURSOR_NAMES), color: pick(CURSOR_COLORS) }
  try {
    sessionStorage.setItem(key, JSON.stringify(user))
  } catch {
    // Not persisting is fine; the identity just won't survive a reload
  }
  return user
}

const user = tabUser()

// Text of one block's inline content. Tables keep their content in rows of cells
// instead of an inline array; each cell becomes its own line so cells don't run together.
function blockText(block: AnyBlock): string[] {
  const content = block.content as unknown
  if (Array.isArray(content)) return [inlineText(content)]
  if (content && typeof content === 'object' && (content as { type?: string }).type === 'tableContent') {
    const rows = (content as { rows: { cells: unknown[] }[] }).rows
    return rows.flatMap((row) => row.cells.map((cell) => inlineText(Array.isArray(cell) ? cell : (cell as { content: unknown[] }).content)))
  }
  return []
}

// Inline content is styled text and links (which wrap styled text). Custom inline
// content isn't used, so anything else contributes nothing.
function inlineText(items: unknown[]): string {
  return items
    .map((item) => {
      const node = item as { type: string; text?: string; content?: unknown[] }
      if (node.type === 'text') return node.text ?? ''
      if (node.type === 'link') return inlineText(node.content ?? [])
      return ''
    })
    .join('')
}

/**
 * Rebuilds the two search strings the meta doc stores (see docs/architecture.md):
 * headingText is every heading block's text, text is every block's text, one per line,
 * depth-first through nested children.
 */
function extractSearchText(blocks: AnyBlock[]): { headingText: string; text: string } {
  const headings: string[] = []
  const lines: string[] = []
  function walk(list: AnyBlock[]) {
    for (const block of list) {
      const texts = blockText(block)
      for (const t of texts) if (t) lines.push(t)
      if (block.type === 'heading' && texts[0]) headings.push(texts[0])
      walk(block.children)
    }
  }
  walk(blocks)
  return { headingText: headings.join('\n'), text: lines.join('\n') }
}

export function Editor({ doc, provider, onContentChange }: EditorProps) {
  const onContentChangeRef = useRef(onContentChange)
  onContentChangeRef.current = onContentChange
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  const fragment = useMemo(() => doc.getXmlFragment(FRAGMENT_NAME), [doc])

  // App re-keys this component per note and destroys doc + provider in its effect
  // cleanup, which runs after this component unmounts. So the editor (and its y-sync /
  // cursor plugins) is always torn down before the Y types it observes are destroyed.
  // The deps still list doc/provider so a future caller that swaps them without
  // re-keying gets a fresh editor instead of one bound to a dead doc.
  const editor = useCreateBlockNote(
    withCollaboration({
      collaboration: {
        fragment,
        // Hocuspocus types awareness as nullable; BlockNote only needs it for cursors
        provider: { awareness: provider.awareness ?? undefined },
        user,
        showCursorLabels: 'activity',
      },
    }),
    [fragment, provider],
  )

  useEffect(() => {
    const emit = (ed: BlockNoteEditor<any, any, any>) => {
      const { headingText, text } = extractSearchText(ed.document)
      onContentChangeRef.current(headingText, text)
    }

    // Initial extraction, so search stays fresh even for notes that are opened but never
    // edited. Two guards against writing empty text into the (shared) search index:
    //  - editor.document is only meaningful once the view is mounted: y-sync fills the
    //    ProseMirror doc from the fragment when its plugin view initialises.
    //    BlockNoteView mounts from a ref callback, which runs before this effect;
    //    onMount covers the other order.
    //  - An empty fragment means this device doesn't have the note's content yet (not
    //    in IndexedDB, still on its way from the server), not that the note is empty.
    //    A genuinely new note already has empty text from createNote. When the content
    //    does arrive, y-sync applies it as a remote change and onChange below extracts.
    const emitInitial = () => {
      if (fragment.length > 0) emit(editor)
    }
    if (editor.domElement?.isConnected) emitInitial()
    const offMount = editor.onMount(emitInitial)

    let pending = false
    const offChange = editor.onChange((ed) => {
      pending = true
      clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(() => {
        pending = false
        emit(ed)
      }, 400)
    })

    return () => {
      offMount()
      offChange()
      clearTimeout(debounceRef.current)
      // Flush an edit still inside the debounce window (e.g. typing, then Ctrl+P to
      // another note). The view is already unmounted here, but the editor keeps its
      // last ProseMirror state, so editor.document still reads the final content.
      if (pending) emit(editor)
    }
  }, [editor, fragment])

  // theme is forced light: the rest of the app has no dark mode yet, and the shadcn
  // kit's dark: variants would otherwise follow the OS setting.
  return <BlockNoteView editor={editor} theme="light" className="shed-editor" />
}
