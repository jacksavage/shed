# Schema versioning

**Status: deferred.** All current data is disposable. When the note format changes, wipe
the data (IndexedDB on each client plus the SQLite `ydoc_state` rows). Revisit this before
there is data worth keeping.

## The problem

Yjs stores any tree. The editor schema is only a convention that all clients follow (see
`yjs-crdt-primer.md`). When an older client opens a doc written under a newer schema:

- **Unknown attributes** are ignored by ProseMirror. They stay in Yjs until something
  rewrites that node.
- **Unknown node types or invalid content** can't be built. As far as we know,
  y-prosemirror then *deletes the element from the Yjs doc*. That deletion syncs to every
  client and to the server. (Not verified against the current y-prosemirror source;
  confirm before relying on it.)

Shed is an offline-first PWA:
- The service worker caches old builds.
- The plan allows devices to be offline for 90 days.

So clients running old schemas are expected, and one could delete content written by
newer clients for everyone.

## Rules for when it matters

- Additive changes are safe: a new optional attr with a default.
- New node types need every client to know them first. Store a version in each doc
  (`doc.getMap('meta').set('schemaVersion', n)`). A client that sees a higher version than
  it supports should open the doc read-only and prompt for an update.
- Renames and removals need migrations, and CRDT migrations lose data. A migration is a
  delete plus an insert, so concurrent offline edits to the deleted part are lost when
  they merge. Prefer lazy, idempotent, additive migrations.
- For a big change, such as switching editors, migrate into a **new fragment name** in
  the same doc and keep the old fragment until all clients have moved.
- The meta doc's `NoteEntry` shape has the same problem: add fields with defaults and read
  defensively.
