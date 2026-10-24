# Architecture (as built)

`plan.md` is the target design. This doc records what exists today and where it differs.

## Documents

| Y.Doc | Room name | Root type | Purpose |
|---|---|---|---|
| One per note | note UUID | `XmlFragment` `blocknote` | Note content in BlockNote's schema, bound to the editor via y-prosemirror |
| Meta doc | `__shed_meta__` | `Map<NoteEntry>` `notes` | Note list **and** search index |

Before BlockNote, note content lived in Tiptap's default field, `default`. BlockNote's
node structure differs (`blockGroup` / `blockContainer` wrappers around every block), so
it got its own field rather than trying to read the old one; old test data under
`default` is simply ignored.

Every doc is persisted in the browser with y-indexeddb (`note:{id}`, `meta:__shed_meta__`)
and synced through Hocuspocus. The server stores one full `encodeStateAsUpdate` snapshot
per doc in SQLite (`ydoc_state`), loaded with `gc = false`.

## The meta doc is the search index

Notes have no title field. Each note's plain text and heading text are extracted in the
editor (`Editor.tsx`) and written into its `NoteEntry` in the meta doc
(`useNoteList.updateNoteContent`). Extraction walks BlockNote's `editor.document`
(`Block[]`):
- `headingText`: the text of every `heading` block, one per line.
- `text`: every block's text, one per line, depth-first through nested children; each
  table cell is its own line.

When it runs:
- On every change (local or remote), debounced 400 ms. A change still inside the
  debounce window when the editor unmounts (switching notes) is flushed then.
- Once on open, so notes that are opened but never edited stay fresh, **unless the
  note's fragment is empty**. An empty fragment means this device doesn't have the
  content yet (not cached, still arriving from the server), and extracting would blank
  the note in every client's search. When the content arrives it comes in as a remote
  change and is extracted then.

Why: search (Ctrl+P, `lib/noteSearch.ts`) has to cover every note, but loading every
note's Y.Doc just to search would be slow and would break offline-first startup. The meta
doc is small, always loaded, and synced, so every client has a complete, offline search
index. Heading matches rank above body-only matches; the note's label is its first heading
line, else its first text line.

Divergences from `plan.md`:
- No SQL `notes` table, no `/notes` REST route, no MiniSearch worker, no server-side FTS5
  yet. The meta doc replaced the first two; search is a linear scan on the client.

### Known issue: meta doc growth

Each `metaMap.set` replaces the whole entry, text included. On the client (gc on) the old
value is garbage-collected. On the server (gc off, see primer) **every old value is kept**.
Measured: 100 writes of a 10 KB entry → 10 KB blob with gc on, ~980 KB with gc off. So
the meta doc's server blob grows with (edits × note size) across all notes. Options: store
text in a `Y.Text` per note and diff into it, keep only a short preview in the meta doc and
do full-text search server-side (FTS5), or allow GC on the meta doc specifically (it has
no editor binding, so the plan's GC concerns don't apply to it the same way).

## Editor wiring

BlockNote (shadcn UI kit) is confined to `components/Editor.tsx` and its `editor.css`;
nothing else imports it (see `editor-choice.md`, "Lock-in").

- `App.tsx` creates the note's `Y.Doc` (with y-indexeddb) and `HocuspocusProvider`
  when `activeNoteId` changes, and holds them as a `NoteSession` tagged with the note
  id once IndexedDB has hydrated the doc.
- It renders `<Editor key={noteId} doc provider onContentChange>` only while the
  session's tag matches `activeNoteId`. On a note switch, that render already sees a
  mismatch and unmounts the editor; only then does the effect cleanup destroy the old
  provider, persistence and doc. The editor (whose view teardown removes the y-sync and
  cursor plugins) never outlives the Y types it observes.
- `Editor` calls `useCreateBlockNote(withCollaboration({ collaboration: { fragment:
  doc.getXmlFragment('blocknote'), provider: { awareness }, user } }))`. The editor is
  recreated per note because the component is re-keyed.
- Presence cursors use the provider's awareness. With no auth, each tab picks a random
  name and colour, kept in `sessionStorage` so it survives a reload of that tab.
- Undo is BlockNote's Yjs undo (y-prosemirror's `UndoManager`), so it only undoes local
  changes.

Styling: Tailwind v4 is present only because the shadcn kit needs it, and is scoped to
the kit (no preflight; see the comments in `editor.css`). The rest of the app is plain
CSS in `global.css`. React is 19 because the kit's menus need it.

## UI

Single-pane editor, no sidebar. Navigation is via two cmdk palettes using VS Code's
browser-safe bindings: Ctrl+Shift+P / F1 (commands), Ctrl+P (note search). Ctrl+N is
unusable because Chrome never delivers it to the page. Direction: vim-style modal
keyboard model, see `keyboard-model.md`.

## Not built yet (from plan.md)

Auth (`onAuthenticate`), device IDs and `client_sync_state`, prune/recovery flow, service
worker. Presence cursors and stable block IDs now come with BlockNote (every block has an
`id` attribute), though nothing uses the IDs yet.
