# Editor choice: Tiptap vs BlockNote vs BlockSuite

**Status: evaluating.** Shed uses Tiptap 2 + StarterKit. BlockNote is the leading
candidate for Notion-style blocks.

## BlockSuite: rejected

AFFiNE's editor framework. Its strength is "edgeless" whiteboard mode.

Against it:
- Its own Yjs layout (Y.Map block trees) and rich-text layer, not ProseMirror.
- Lit web components rather than React.
- Development moved into the AFFiNE monorepo around early 2025.
- Thin documentation for outside users, and a lot of API churn.

Switching would break the stored format and server text extraction, and gain little
outside whiteboarding. If canvas notes are ever wanted, make them a separate note type:
tldraw or Excalidraw both have Yjs bindings.

## BlockNote: strong candidate

Notion-style block editor for React, built **on Tiptap/ProseMirror**. As of v0.56 it runs
on Tiptap 3. It accepts Yjs 13 or Yjs 14 (`@y/y`) as peer dependencies.

It provides:
- Slash menu, drag handles, toolbars
- Nested blocks and a stable `id` on every block
- A typed `Block[]` API
- Collaboration through y-prosemirror (`collaboration: { fragment, provider, user }`)

Licensing: the core is MPL-2.0. The "XL" packages (multi-column, PDF/DOCX export, AI) are
GPL-3.0 or commercial. Avoid those.

### UI kits and bundle size

Measured with Vite on 2026-10-23. Each build is a minimal editor with collaboration, React
18. Sizes are gzipped initial load. All three BlockNote builds also have about 110 KB gz
of chunks that load on demand, such as the emoji picker.

| Setup | JS | CSS | Total |
|---|---|---|---|
| Tiptap 2 + StarterKit (current) | 195 KB | — | ~195 KB |
| BlockNote + ariakit | 364 KB | 10 KB | ~374 KB |
| BlockNote + Mantine | 355 KB | 37 KB | ~392 KB |
| BlockNote + shadcn | 393 KB | 15 KB | ~408 KB |

- **Mantine** is MIT and fully free. It's BlockNote's default and best-polished kit.
- **shadcn** saves nothing on size: it adds `@base-ui/react`, `lucide-react` and
  `tailwind-merge`. It also needs Tailwind v4 as a peer dependency. The reason to choose
  it is visual consistency, because BlockNote accepts your own shadcn components through
  `shadCNComponents`.
- **ariakit** is the smallest and the most unstyled.
- Changing kits later is mostly a change of import plus re-theming.

### Lock-in

| Layer | Owner | Tied to BlockNote? |
|---|---|---|
| Hocuspocus, y-indexeddb, SQLite blobs, meta doc | shed | No; they see opaque Y.Docs |
| Y.Doc ↔ editor sync, undo, cursors | y-prosemirror | No; Tiptap uses the same plugins |
| Node structure inside the `XmlFragment` | BlockNote schema | **Yes** (data) |
| Custom blocks, menus, `Block[]` API | BlockNote | **Yes** (code) |
| `@blocknote/server-util` | BlockNote | Optional |

BlockNote's tree looks like
`<blockgroup><blockcontainer id=…><heading level="1">…</heading></blockcontainer></blockgroup>`.
Dropping BlockNote would need:
- a one-time fragment migration (headless BlockNote → HTML → new schema), or a fork of
  its schema extensions (MPL-2.0);
- rebuilding the UI;
- porting any `createReactBlockSpec` blocks to Tiptap node views.

The sync and storage stack would not change.

To keep the exit cheap:
- Confine BlockNote to `Editor.tsx`.
- Extract text on the server with a schema-agnostic `XmlText` walker, not `server-util`.
- Never store BlockNote JSON as data.
- Hold off on custom blocks.
- Pin exact versions: it's pre-1.0, and minor releases break things.

### Relevance to the outliner direction

BlockNote's model is a tree: every block can have nested children. That matches
Workflowy-style folding (see `keyboard-model.md`). StarterKit's flat `block+` document
doesn't. The other way to get a tree is a custom Tiptap schema shaped much like
BlockNote's. BlockNote's own mouse-first UI and key handling may conflict with a modal
keyboard layer; test this early.
