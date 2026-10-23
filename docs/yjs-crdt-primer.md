# Yjs / CRDT primer

Background for working on shed's sync stack. Explains how the pieces work and why some
rules in this repo exist.

## The stack in one paragraph

**ProseMirror** is the editor engine: a schema-checked document tree plus state,
transactions and a contentEditable view. **Tiptap** wraps ProseMirror in an extension
API and React bindings. **Yjs** is a CRDT library: a replicated data structure that any
number of replicas can edit independently and merge in any order, all ending up in the
same state. **y-prosemirror** binds a ProseMirror document to a Yjs `XmlFragment` in both
directions (Tiptap's `Collaboration` extension wraps it). **y-indexeddb** persists a
Y.Doc in the browser. **Hocuspocus** is a WebSocket server that relays Yjs updates and
awareness between clients, with hooks for loading and storing docs. It doesn't care what
is inside a doc.

## How Yjs is organised

Bottom to top:

1. **Items.** All data is stored as items. Each item has an ID `(clientID, clock)` and
   records `origin` (the item to its left when inserted) and `rightOrigin` (the item to
   its right). The CRDT algorithm only sees sequences of items and key→item lists.
2. **Shared types** built from items:
   - `Y.Map`: keys, last writer wins per key
   - `Y.Array`: an ordered list
   - `Y.Text`: characters plus formatting attributes, read and written as a delta
   - `Y.XmlFragment`: an ordered list of `XmlElement` / `XmlText` children
   - `Y.XmlElement`: a fragment plus an immutable `nodeName` and an attribute map
   - `Y.XmlText`: a `Y.Text` that can live inside an XML tree
3. **Y.Doc**: a set of named root types (`doc.getMap('notes')`,
   `doc.getXmlFragment('default')`). A doc can have several roots, including several
   fragments.

### Clocks are counters, not time

- `clientID` is a random 32-bit number generated for each `Y.Doc` instance. A new one is
  made on every page load, not once per device.
- `clock` counts how much content that client has inserted. It is not wall-clock time.
- Example: a new doc inserting `"hello"` has state vector `{clientID: 5}`.
- Item IDs are therefore unique without any clock sync between devices.

What does matter:
- **clientID reuse.** Two live replicas with the same clientID would corrupt each other.
  Random IDs plus a fresh ID per doc instance make this negligible, but don't reuse a
  clientID yourself, e.g. by persisting it.
- **State vectors grow per session, not per device.** Every page load adds an entry. That
  is why `plan.md` tracks devices with its own `device_id`.
- **"Last writer wins" in `Y.Map` is not chronological.** Concurrent sets to one key are
  resolved deterministically, using clientID and position. The winner isn't necessarily
  the later write.
- **Wall-clock time only appears in our own fields** (`created_at`, `updated_at` in the
  meta doc). Client clock skew can misorder sorting there. That is cosmetic.

### YATA: how concurrent edits merge

Yjs implements a variant of YATA (Nicolaescu et al., 2016).

- **Insertion.** A new item is placed between its `origin` and `rightOrigin`. If another
  replica concurrently inserted at the same spot, a deterministic rule compares the
  origins of the conflicting items and breaks ties by clientID. Every replica computes the
  same order whatever order updates arrive in, so the result is commutative and
  idempotent. One person's consecutive typing stays together and doesn't interleave with
  another person's text. (Exact non-interleaving guarantees vary between sequence CRDTs;
  the later Fugue paper, 2023, studies this.)
- **Deletion** sets a flag (a *tombstone*) instead of removing the item. Later inserts may
  reference it as an origin, so its ID has to survive. Deletions travel as a compact
  *delete set* of ID ranges.
- **Garbage collection** (`gc: true`) throws away a deleted item's *content* but keeps a
  small ID placeholder. With `gc: false`, deleted content is kept forever. The shed
  server runs with gc off (plan §10).
- **Run-length merging.** Consecutive inserts by one client merge into a single item with
  a length. This is why Yjs docs stay compact despite tracking every character.
- **Sync** = exchange state vectors (`clientID → highest clock seen`), then send the items
  the other side lacks plus the delete set. Updates that arrive before the items they
  depend on are held as *pending* until those arrive.

### Why XML types instead of Map/Array/Text

A rich-text editor document is a tree. Each node has a type name, attributes, ordered
children, and leaves of formatted text. You could build that from
`Map{type, attrs: Map, children: Array<…|Text>}`. `XmlElement` packs all of it into one
shared type: a child list, an attribute map, and a fixed `nodeName`. Compared with
building it yourself:

- Fewer types and items per node, so less overhead.
- One event (`YXmlEvent`) reports both attribute and child changes for a node.
- It is the convention y-prosemirror (and other bindings) already speak.
- `XmlText` is a `Y.Text`, so formatting runs merge character by character.

`nodeName` can't change after creation. When ProseMirror changes a paragraph into a
heading, y-prosemirror replaces the element. So **a stable block identity has to be an
attribute that the editor preserves** (BlockNote's `id`, Tiptap's `extension-unique-id`).
Yjs's own item IDs won't do.

A flat rich-text doc can use a single `Y.Text`; Quill's binding does this. Nested blocks
need the tree.

## The schema lives in the editor, not in Yjs

Yjs validates nothing: an `XmlFragment` accepts any tree. How a Tiptap note is stored:

```
<heading level="1">Groceries</heading><paragraph>buy <bold>milk</bold></paragraph>
```

| ProseMirror | Yjs |
|---|---|
| `doc` | root `XmlFragment` |
| block/inline node | `XmlElement` (`nodeName` = node type, attributes = attrs) |
| text + marks | one `XmlText`; marks are formatting attributes, e.g. delta `[{"insert":"buy "},{"insert":"milk","attributes":{"bold":{}}}]` |

Inserting `new Y.XmlElement('bogusNode')` into that fragment succeeds. Only the
ProseMirror schema, applied when y-prosemirror rebuilds the editor document, decides what
is valid. See `schema-versioning.md` for what goes wrong when clients disagree about it.

Two consequences:

- **Server code can be schema-agnostic.** Concatenating the text of every `XmlText`
  extracts searchable text whichever editor schema wrote the doc.
- **The meta doc's `NoteEntry` type is only a TypeScript type.** Nothing enforces it at
  runtime either.

## ProseMirror in more detail

Written by Marijn Haverbeke, who also wrote CodeMirror. Its modules:

- **prosemirror-model**: the `Schema`, which has node specs and mark specs.
  - Nodes declare a `content` expression (`"block+"`, `"inline*"`, `"paragraph block*"`),
    `group`, `attrs` with defaults, and `parseDOM`/`toDOM`.
  - The document is an immutable tree that always conforms to the schema.
  - Positions are integer offsets that count tokens through the tree.
- **prosemirror-transform**: changes are `Step`s (replace, add/remove mark, …). Each step
  is invertible and produces a position *mapping*. This is the base for undo and for
  rebasing positions.
- **prosemirror-state**: `EditorState` (doc + selection + plugin state). A `Transaction`
  is a batch of steps plus selection and metadata. Plugins add state, props and key
  handling.
- **prosemirror-view**: renders state to contentEditable, turns DOM input back into
  transactions, and supports custom `NodeView`s.
- Utilities: `keymap`, `commands`, `history`, `inputrules`, `schema-list`, `collab`.
  `collab` is a central-authority scheme that y-prosemirror replaces in shed.

## Tiptap and StarterKit

Tiptap wraps ProseMirror concepts as `Node`, `Mark` and `Extension` classes. It adds a
chainable command API (`editor.chain().focus().toggleBold().run()`) and React bindings,
and it ships no UI of its own ("headless").

**StarterKit** is a bundle of common extensions. In v2, which shed uses today:
- Nodes: Document, Paragraph, Text, Heading, Blockquote, BulletList, OrderedList,
  ListItem, CodeBlock, HorizontalRule, HardBreak
- Marks: Bold, Italic, Strike, Code
- Helpers: History, Dropcursor, Gapcursor

v3 adds Link, Underline, list keymaps and a trailing node, and renames History to
UndoRedo.

Shed configures `history: false`. ProseMirror's history would undo other users' edits;
with Collaboration, undo comes from y-prosemirror's Yjs-based undo, which only undoes
local changes.

StarterKit's `Document` is `content: "block+"`, a **flat** list of blocks. Nesting only
exists inside lists and blockquotes. A heading's "section" is implicit: everything up to
the next heading. This matters for the outliner direction in `keyboard-model.md`.

## Hocuspocus's role

- One room per document name. A room holds one in-memory Y.Doc shared by every connected
  client.
- Hooks:
  - `onLoadDocument`: seed the doc from SQLite.
  - `onStoreDocument`: debounced; write a snapshot.
  - `onAuthenticate`, `onDisconnect`, etc.
- It relays Yjs sync messages and awareness (presence) over one WebSocket per provider.
- It doesn't interpret content, so changing the editor schema never requires server
  changes.
