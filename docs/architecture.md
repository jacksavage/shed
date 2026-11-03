# Architecture (as built)

`plan.md` is the target design. This doc records what exists today and where it differs.

## Documents

| Y.Doc | Room name | Root type | Purpose |
|---|---|---|---|
| One per note | note UUID | `XmlFragment` `default` (Tiptap's default field) | Note content, bound to the editor via y-prosemirror |
| Meta doc | `__shed_meta__` | `Map<NoteEntry>` `notes` | Note list **and** search index |

Every doc is persisted in the browser with y-indexeddb (`note:{id}`, `meta:__shed_meta__`)
and synced through Hocuspocus. The server stores one full `encodeStateAsUpdate` snapshot
per doc in SQLite (`ydoc_state`), loaded with `gc = false`.

## The meta doc is the search index

Notes have no title field. Each note's plain text and heading text are extracted in the
editor (`Editor.tsx`, debounced 400 ms, also once on open) and written into its
`NoteEntry` in the meta doc (`useNoteList.updateNoteContent`).

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

## UI

Single-pane editor, no sidebar. Navigation is via two cmdk palettes using VS Code's
browser-safe bindings: Ctrl+Shift+P / F1 (commands), Ctrl+P (note search). Ctrl+N is
unusable because Chrome never delivers it to the page. Direction: vim-style modal
keyboard model, see `keyboard-model.md`.

## Not built yet (from plan.md)

Auth (`onAuthenticate`), device IDs and `client_sync_state`, prune/recovery flow, presence
cursors, stable block IDs, service worker.
