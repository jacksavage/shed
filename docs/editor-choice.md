# Editor choice: Tiptap vs BlockNote vs BlockSuite

**Status: adopted — BlockNote 0.56 with the shadcn UI kit** (2026-10-24). Shed used
Tiptap 2 + StarterKit before. The evaluation below is kept as the record of why; what was
learned while adopting it is under "Adoption notes" at the end.

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

## BlockNote: chosen

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

Measured in shed itself (full app, `npm run build`, 2026-10-24):

| Build | JS | CSS | Initial total | Lazy chunks |
|---|---|---|---|---|
| Tiptap 2 + StarterKit, React 18 (before) | 204 KB | 0.9 KB | ~205 KB | — |
| BlockNote + shadcn, React 18 | 443 KB | 15 KB | ~458 KB | 110 KB |
| BlockNote + shadcn, React 19 (shipped) | 467 KB | 15 KB | ~482 KB | 110 KB |

So the switch costs about **+277 KB gz** on first load: ~253 KB for BlockNote and the
kit, ~24 KB for React 19 (which the kit needs, see below). That is more than the
minimal-editor delta above (+213 KB). The difference is React 19, plus a second copy of
`lib0` (BlockNote core pins a 1.0 RC; Yjs and Hocuspocus use 0.2) and BlockNote's table,
code-highlighting and file-block extensions that a minimal build may tree-shake less of
in a real app. Code-splitting the editor out of the initial chunk is a possible
follow-up; it wouldn't shrink the total, but the note list and palettes could render
first.

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

## Adoption notes

What turned out to matter when switching (details and the "why" are in the commit
messages of the switch).

### Collaboration API moved in 0.56

`collaboration` is no longer a plain `useCreateBlockNote` option. It comes from
`@blocknote/core/yjs`: `useCreateBlockNote(withCollaboration({ collaboration: { fragment,
provider, user } }))`. That entry point imports `y-prosemirror`, which is only an
*optional* peer dependency of `@blocknote/core` (the alternative is the Yjs 14
`@y/prosemirror` line under `@blocknote/core/y`), so it has to be installed explicitly.
`provider` only needs `{ awareness }`; Hocuspocus types its awareness as nullable, so
shed passes `provider.awareness ?? undefined`.

### The shadcn kit needs React 19 and a Tailwind theme

- **React 19.** The kit's components are current-style shadcn: plain function
  components that take `ref` as a prop, no `forwardRef`. base-ui passes the kit's
  `Button` a ref as a menu anchor; React 18 drops it, so menus triggered from a button
  (the block drag-handle menu, colour and table menus) open invisibly at `opacity: 0`.
  The package's peer range says React 18 is fine; in practice it isn't. The slash menu
  and formatting toolbar work on 18 because BlockNote positions those itself.
- **Theme tokens.** The kit ships Tailwind utility classes (`bg-popover`,
  `text-muted-foreground`, …) but no shadcn theme variables, and no compiled
  utilities. Shed's `components/editor.css` defines shadcn's neutral tokens and maps them
  into Tailwind's theme. Re-theming the menus means changing those variables.
- **Tailwind kept small.** No preflight (it's a global reset and would restyle the cmdk
  palettes); only the theme and utilities layers, generated only from the kit's dist
  (`source(none)` + one `@source`). The handful of resets the kit's buttons need are
  re-applied scoped to `.bn-shadcn`. The `dark:` variant is bound to a `.dark` class so
  the kit doesn't follow the OS into a dark theme the app doesn't have.
- The kit's menus reference `animate-in` / `fade-in-0` classes from `tw-animate-css`,
  which isn't installed, so menus appear without animation. Harmless; add the package
  if animation is wanted.

### Search extraction and the empty-doc race

Extraction now walks `editor.document` (`Block[]`) rather than ProseMirror JSON. On a
device that doesn't have a note cached yet, the editor mounts on an empty fragment and
the content arrives from the server afterwards. Extracting at that moment writes empty
text into the shared meta doc and blanks the note in every client's search, so the
initial extraction is skipped while the fragment is empty; the server's content arrives
as a change and is extracted then. (The Tiptap version had the same race.)

### Things to watch

- **First block id.** BlockNote names the first block of a fresh document literally
  `initialBlockId`. If two offline clients both open the same empty note, both may
  create one. Check that BlockNote's unique-ID handling regenerates duplicates after
  they merge before keying fold state on block IDs (`keyboard-model.md`).
- **Its own keymap.** BlockNote binds Tab / Shift-Tab (nest / unnest), Mod-Alt-0…6
  and Mod-Shift-6…9 (block types), Shift-Mod-Up/Down (move block), Mod-z / Mod-y /
  Shift-Mod-z (Yjs undo), Mod-a (select block then document), Shift-Enter, and `/`
  (slash menu) and `:` (emoji picker) as triggers. A modal layer has to intercept keys
  before these in non-insert modes. None of them collide with the app's Ctrl+P,
  Ctrl+Shift+P or F1, which still work with focus in the editor and with the slash menu
  open.
