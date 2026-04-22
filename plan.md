# Collaborative Notes PWA — Architecture Design Document

**Version:** 1.1  
**Status:** Draft  
**Stack:** Tiptap · Yjs · Hocuspocus · SQLite · Workbox

-----

## 1. Overview

This document describes the architecture for an offline-first, multi-user collaborative note-taking Progressive Web App (PWA). The system allows multiple users to edit shared notes simultaneously, with full offline support and automatic conflict-free sync on reconnect.

The guiding principle is that **the Yjs CRDT document is the source of truth** — not the database. All other persistence and indexing is derived from it.

-----

## 2. Technology Decisions

### 2.1 Editor: Tiptap

Tiptap is chosen over plain ProseMirror and Lexical for the following reasons:

- Built on ProseMirror, so it inherits battle-tested document model stability
- First-class Yjs integration via `@tiptap/extension-collaboration` (wraps `y-prosemirror`)
- Built-in awareness/cursor support via `@tiptap/extension-collaboration-cursor`
- Eliminates manual ProseMirror plugin wiring while retaining full extensibility

### 2.2 CRDT Layer: Yjs

Yjs is chosen over Automerge:

- Mature, production-tested editor bindings across ProseMirror, Tiptap, and others
- Native offline persistence via `y-indexeddb`
- Built-in awareness protocol for ephemeral presence data (cursors, online status)
- Automatic delta sync on reconnect — no custom conflict resolution code required

### 2.3 Sync Server: Hocuspocus

Hocuspocus is the Tiptap-native WebSocket sync server:

- Rooms identified by document UUID — matches the 1:1 note-to-Y.Doc model
- Extensible hook system for auth, persistence, and search indexing
- Handles awareness relay alongside document sync in the same connection

### 2.4 Database: SQLite (better-sqlite3)

SQLite is used as the server-side secondary store:

- Stores Yjs binary state blobs (for server-side doc restoration after restart)
- Stores note metadata: title, owner, timestamps, collaborators
- FTS5 virtual table for full-text search over extracted note content

### 2.5 Service Worker: Workbox

The service worker handles **app shell and static asset caching only**. It does not intercept or cache WebSocket/Yjs traffic — offline document state is handled entirely by `y-indexeddb` in the browser.

-----

## 3. System Architecture

```
┌─────────────────────────────────────────────────────┐
│                    Client (PWA)                     │
│                                                     │
│  ┌─────────────┐    ┌──────────────┐               │
│  │   Tiptap    │◄──►│    Y.Doc     │               │
│  │   Editor    │    │  (per note)  │               │
│  └─────────────┘    └──────┬───────┘               │
│                            │                        │
│                   ┌────────┴────────┐               │
│                   │                 │               │
│             ┌─────▼─────┐   ┌──────▼──────┐        │
│             │y-indexeddb│   │ Hocuspocus  │        │
│             │  (local)  │   │  Provider   │        │
│             └───────────┘   └──────┬──────┘        │
│                                    │ WebSocket      │
│  ┌──────────────────┐              │               │
│  │  Service Worker  │              │               │
│  │  (Workbox/assets)│              │               │
│  └──────────────────┘              │               │
└───────────────────────────────────┬┘               │
                                    │
┌───────────────────────────────────▼───────────────┐
│                 Hocuspocus Server                 │
│                                                   │
│  ┌────────────────┐  ┌──────────────────────┐    │
│  │ onAuthenticate │  │   onLoadDocument     │    │
│  │ (JWT on WS     │  │   (restore Y.Doc     │    │
│  │  upgrade)      │  │    from SQLite)      │    │
│  └────────────────┘  └──────────────────────┘    │
│                                                   │
│  ┌────────────────────────────────────────────┐   │
│  │ onStoreDocument                            │   │
│  │ (persist binary + update FTS5 search table)│   │
│  └────────────────────────────────────────────┘   │
│                                                   │
└───────────────────────┬───────────────────────────┘
                        │
┌───────────────────────▼───────────────────────────┐
│                   SQLite Database                  │
│                                                   │
│  ┌──────────┐  ┌────────────┐  ┌───────────────┐  │
│  │  notes   │  │ ydoc_state │  │  notes_fts    │  │
│  │(metadata)│  │  (binary)  │  │  (FTS5 index) │  │
│  └──────────┘  └────────────┘  └───────────────┘  │
└───────────────────────────────────────────────────┘
```

-----

## 4. Data Model

### 4.1 The Yjs Document

Each note maps **1:1 to a `Y.Doc`**. The ProseMirror document maps automatically to a `Y.XmlFragment` inside the Y.Doc via `y-prosemirror` — this is not managed directly by application code.

The ProseMirror schema defines block types (paragraph, heading, list item, etc.). Every block node carries a **stable UUID attribute** managed by `@tiptap/extension-unique-id`. These IDs survive reordering, merging, and splitting, and are the reliable handle for per-block operations in a collaborative context.

### 4.2 SQLite Schema

```sql
-- Note metadata
CREATE TABLE notes (
  id          TEXT PRIMARY KEY,   -- UUID, matches Hocuspocus room name
  title       TEXT NOT NULL,
  owner_id    TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);

-- Server-side Yjs binary persistence
CREATE TABLE ydoc_state (
  note_id     TEXT PRIMARY KEY REFERENCES notes(id),
  state       BLOB NOT NULL        -- Y.encodeStateAsUpdate() binary
);

-- Full-text search (extracted from Y.XmlFragment)
CREATE VIRTUAL TABLE notes_fts USING fts5(
  note_id UNINDEXED,
  content
);

-- Per-client, per-note sync progress tracking
CREATE TABLE client_sync_state (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL REFERENCES users(id),
  device_id       TEXT NOT NULL,   -- stable UUID per browser/device, stored in IndexedDB
  note_id         TEXT NOT NULL REFERENCES notes(id),
  state_vector    BLOB NOT NULL,   -- Y.encodeStateVector() at last sync
  last_seen_at    INTEGER NOT NULL,
  UNIQUE(user_id, device_id, note_id)
);

-- Audit trail for admin prune operations
CREATE TABLE pruned_clients (
  id                    TEXT PRIMARY KEY,
  user_id               TEXT NOT NULL,
  device_id             TEXT NOT NULL,
  note_id               TEXT NOT NULL,
  pruned_at             INTEGER NOT NULL,
  pruned_by             TEXT NOT NULL,   -- admin user_id
  state_vector_at_prune BLOB             -- snapshot for audit trail
);
```

### 4.3 What Lives Where

|Data                         |Location                  |Why                                           |
|-----------------------------|--------------------------|----------------------------------------------|
|Document content (CRDT state)|Yjs Y.Doc                 |Source of truth                               |
|Offline copy of doc          |y-indexeddb (browser)     |Instant load, offline edits                   |
|Server copy of doc           |ydoc_state (SQLite BLOB)  |Restore after server restart                  |
|Note metadata                |notes (SQLite)            |Listing, ownership, timestamps                |
|Search index                 |notes_fts (SQLite FTS5)   |Fast full-text queries                        |
|Client sync progress         |client_sync_state (SQLite)|Storage alert thresholds, compaction floor    |
|Prune audit log              |pruned_clients (SQLite)   |Admin accountability, reconnect detection     |
|Presence/cursors             |Yjs Awareness (in-memory) |Ephemeral, never persisted                    |
|Local recovery backup        |y-indexeddb (browser)     |Preserved before overwrite on pruned reconnect|
|Static assets                |Service Worker cache      |Offline app shell                             |

-----

## 5. Offline-First Flow

```
User opens a note
        │
        ▼
Instantiate Y.Doc + bind y-indexeddb
        │
        ▼
Editor loads immediately from IndexedDB
(user sees content with zero network dependency)
        │
        ▼
HocuspocusProvider connects in background
        │
        ├─── Connected ──────────────────────────────────►
        │                                                 │
        │                                         Yjs merges local
        │                                         state with server
        │                                         (automatic, CRDT)
        │
        └─── Offline / Disconnected ─────────────────────►
                                                          │
                                              Edits accumulate in
                                              local Y.Doc + IndexedDB
                                              (across tab closes too)
                                                          │
                                              On reconnect, Yjs syncs
                                              the diff automatically
```

No custom conflict resolution code is required at any point in this flow.

-----

## 6. Server Architecture

### 6.1 Hocuspocus Hooks

**`onAuthenticate`**

- Fires on WebSocket upgrade, before the client joins a room
- Validates the JWT from the connection request
- Rejects unauthenticated connections immediately
- Sets user identity and `device_id` on the connection context (used by awareness and sync tracking)
- Checks `pruned_clients` — if this (user, device, note) combination has been pruned, flags `context.wasPruned` for handling in `onLoadDocument`

**`onLoadDocument`**

- Fires when a room is first opened on the server
- Loads the stored Yjs binary from `ydoc_state` and applies it to the Y.Doc with `gc: false` (see Section 11)
- Restores document state after server restarts
- If `context.wasPruned` is set, signals the client to run the recovery flow before accepting the server snapshot

**`onStoreDocument`**

- Fires after each save cycle (debounced by Hocuspocus)
- Writes `Y.encodeStateAsUpdate(doc)` as a full snapshot to `ydoc_state` — always overwrites, never appends
- Extracts plain text from `Y.XmlFragment` (via `extractText`) and updates `notes_fts`

**`onDisconnect`**

- Fires when a client WebSocket closes
- Encodes the current state vector (`Y.encodeStateVector(doc)`) and upserts it into `client_sync_state` for this (user, device, note) combination
- Also updated periodically during long active sessions, not only on disconnect

### 6.2 Deployment

- Single Hocuspocus instance for straightforward deployments
- Clustered deployments require **sticky-session load balancing** (WebSocket connections must route to the same node for a given room)
- Room names are note UUIDs — no separate room management needed

-----

## 7. Client Architecture

### 7.1 Project Structure

```
client/
├── src/
│   ├── components/
│   │   ├── Editor.tsx              # Tiptap editor component
│   │   ├── NoteList.tsx            # Note listing sidebar
│   │   ├── PresenceAvatars.tsx     # Awareness / online users UI
│   │   └── PruneNotification.tsx   # Banner shown after pruned reconnect
│   ├── extensions/
│   │   └── Block.ts                # ProseMirror block node with stable UUID
│   ├── hooks/
│   │   ├── useEditor.ts            # Tiptap + Yjs initialisation
│   │   └── usePresence.ts          # Awareness state → UI
│   ├── lib/
│   │   ├── ydoc.ts                 # Y.Doc factory + y-indexeddb binding
│   │   ├── provider.ts             # HocuspocusProvider factory
│   │   └── recovery.ts             # Local backup write/read on pruned reconnect
│   ├── search/
│   │   ├── searchWorker.ts         # MiniSearch in a Web Worker
│   │   ├── useSearch.ts            # Search hook: query + index update
│   │   └── extractText.ts          # Y.XmlFragment → plain text
│   ├── store/
│   │   └── notes.ts                # Note metadata state (Zustand or Jotai)
│   └── sw.ts                       # Workbox service worker (asset cache only)

server/
├── src/
│   ├── index.ts                    # Hocuspocus server entry point
│   ├── hooks/
│   │   ├── onLoadDocument.ts       # Load Yjs binary from SQLite (gc: false)
│   │   ├── onStoreDocument.ts      # Persist binary + update FTS5 table
│   │   ├── onAuthenticate.ts       # JWT validation, prune check on WS upgrade
│   │   └── onDisconnect.ts         # Upsert client state vector to client_sync_state
│   ├── jobs/
│   │   └── storageAlert.ts         # Daily job: query stale clients on large notes
│   ├── admin/
│   │   ├── routes.ts               # Admin API: list alerts, execute prune
│   │   └── compaction.ts           # Prune logic: remove client, compact Y.Doc
│   └── db/
│       ├── client.ts               # better-sqlite3 singleton
│       ├── schema.sql              # Table definitions
│       └── queries.ts              # Typed query helpers
```

### 7.2 Initialisation Sequence (per note)

1. Read `device_id` from IndexedDB — generate and persist a new UUID if this is a first visit on this browser/device. This ID must be stable across sessions and is sent as a WebSocket connection parameter alongside the auth token.
1. Create `Y.Doc` instance
1. Bind `y-indexeddb` with key `note:{uuid}` — this immediately loads any locally stored state
1. Pass the `Y.Doc` to Tiptap’s `CollaborationExtension`
1. Mount the editor — user sees content instantly from local state
1. Instantiate `HocuspocusProvider` with the note UUID as the room name, passing `device_id` in connection params
1. Provider connects in background, Yjs merges remote state automatically
1. If the server signals `wasPruned`, run the recovery flow (see Section 11) before applying server state
1. Set local awareness state (user display name, avatar colour) on connect

### 7.3 Search

Full-text search runs in a **Web Worker** using MiniSearch, keeping the main thread unblocked. Text is extracted from the `Y.XmlFragment` using a recursive walker (`extractText.ts`). The search index is updated via the `onStoreDocument` hook on the server (for cross-client consistency) and locally after each edit cycle.

-----

## 8. Awareness (Presence)

Yjs Awareness is an ephemeral, in-memory layer that rides alongside document sync. It is **never persisted**.

Used for:

- Live cursor positions (via `@tiptap/extension-collaboration-cursor`)
- User display name and avatar colour
- Online/offline status indicator

The local awareness state is set on editor mount with the authenticated user’s identity. It resets on disconnect — this is intentional behaviour.

-----

## 9. What to Avoid

|Anti-pattern                                                        |Why                                                                                                  |
|--------------------------------------------------------------------|-----------------------------------------------------------------------------------------------------|
|A user-triggered “Save” button                                      |Yjs updates are continuous. Persistence flows from Hocuspocus hooks.                                 |
|Storing editor HTML/JSON as the primary DB format                   |It will drift from Yjs state and cause reconciliation failures.                                      |
|Using Socket.io or a generic WebSocket server with manual Yjs wiring|Hocuspocus already handles this correctly. Don’t re-implement it.                                    |
|Intercepting WebSocket traffic in the Service Worker                |It will break Yjs sync. The SW handles assets only.                                                  |
|Storing awareness state to the database                             |Awareness is ephemeral by design. Persisting it creates stale presence bugs.                         |
|Appending Yjs update deltas to `ydoc_state`                         |Blobs grow unboundedly. Always overwrite with a full `encodeStateAsUpdate` snapshot.                 |
|Enabling GC on the server Y.Doc                                     |Risk of pruning tombstones that reconnecting clients still reference. Keep `gc: false` on the server.|

-----

## 10. Yjs Garbage Collection Strategy

### 10.1 The Problem

Yjs stores a log of every operation ever applied to a document — not just the current visible content. Every character typed and deleted, every formatting change, leaves an entry. This log grows monotonically. A heavily edited note may have a Yjs binary blob many times larger than the plain text content it represents.

Additionally, Yjs marks deleted content with tombstones rather than removing it outright. Tombstones are required for correct CRDT merging: if two clients independently delete the same content, the tombstone ensures both arrive at the same result. Pruning tombstones before all clients have seen them causes sync failures.

### 10.2 GC Configuration

**Server Y.Doc: `gc: false`**

The server’s Y.Doc is created with garbage collection disabled:

```typescript
// onLoadDocument hook
const doc = new Y.Doc({ gc: false })
Y.applyUpdate(doc, storedBinary)
return doc
```

This makes the server the complete, lossless historical record. Any client, regardless of how old its state vector is, can always get a correct diff from the server. Correctness is prioritised over storage size at the server layer.

**Client Y.Doc: `gc: true` (default)**

Clients keep GC enabled. Client local state is disposable — the server is always the canonical source a client can recover from. If a client’s GC prunes a tombstone it needs, the worst case is fetching a larger diff from the server on reconnect, not a sync failure.

### 10.3 `onStoreDocument` Snapshot Strategy

Always write a full snapshot, never append deltas:

```typescript
const state = Y.encodeStateAsUpdate(document.document)
db.saveYdocState(document.name, state) // overwrites previous blob
```

`Y.encodeStateAsUpdate` with no second argument produces the minimal encoding of the current document state. Even with `gc: false`, this keeps blobs at the smallest possible size for a complete-history doc.

### 10.4 Blob Size Growth

With `gc: false` on the server, blobs grow over time and never shrink automatically. The rate of growth depends on edit churn — light notes may stay small indefinitely, while heavily-collaborated documents with lots of typing and deletion can grow into the MB range.

Monitor blob sizes in production. A note blob exceeding 20× its plain-text content size is worth investigating. The admin alert system (Section 11) handles the intervention workflow.

-----

## 11. Storage Alerts and Client Prune Flow

This system detects when a stale client is anchoring excessive blob growth on a specific note, surfaces it to an admin for review, and provides a safe path to remove the anchor — with a recovery mechanism for the affected user on their next login.

### 11.1 Client Sync State Tracking

The `client_sync_state` table records the last known state vector for each (user, device, note) combination. This is updated in `onDisconnect` and periodically during active sessions:

```typescript
// onDisconnect hook
const sv = Y.encodeStateVector(document.document)
db.upsertClientSyncState({
  userId: context.userId,
  deviceId: context.deviceId,
  noteId: document.name,
  stateVector: sv,
  lastSeenAt: Date.now()
})
```

`device_id` is a stable UUID generated on first visit and stored in IndexedDB on the client. It is passed as a WebSocket connection parameter. Tracking per-device (not just per-user) is essential — a user may have multiple devices at different sync points, and the oldest one is the one anchoring the compaction floor.

### 11.2 Alert Query

A scheduled daily job queries for (client, note) pairs where both conditions are true simultaneously: the client is stale (not seen in 90 days) and the note blob is large (over 5MB):

```sql
SELECT
  css.note_id,
  css.user_id,
  css.device_id,
  css.last_seen_at,
  ys.size_bytes,
  n.title
FROM client_sync_state css
JOIN (
  SELECT note_id, length(state) AS size_bytes
  FROM ydoc_state
) ys ON ys.note_id = css.note_id
JOIN notes n ON n.id = css.note_id
WHERE css.last_seen_at < (unixepoch() - 90 * 86400) * 1000
  AND ys.size_bytes > 5242880   -- 5MB
ORDER BY ys.size_bytes DESC
```

Alerts are scoped per (client, note) — not globally per client. A user may have a stale device that only anchors one large note; the admin should be able to act on that specific combination without affecting others.

### 11.3 Admin Panel

The alert surface shows each affected note with the specific stale clients anchoring it:

```
⚠ Storage alerts — 2 notes affected

  "Q3 Product Roadmap"   8.2MB
    └─ james@co.com / MacBook Chrome   last seen 97 days ago
    [Prune this client from this note]

  "Engineering Runbook"  6.1MB
    └─ sara@co.com / iPhone Safari     last seen 112 days ago
    └─ sara@co.com / Work laptop       last seen 134 days ago
    [Prune sara / iPhone] [Prune sara / Work laptop]
```

The admin must confirm before any prune is executed. The action is deliberately not automated — it involves discarding a user’s local state and should remain a human decision.

### 11.4 Prune Operation (Server)

When an admin confirms a prune for a (user, device, note) combination:

1. Write a record to `pruned_clients` with the current state vector as an audit snapshot
1. Delete the row from `client_sync_state` — this client no longer anchors the compaction floor
1. Recompute the minimum state vector across remaining clients for this note
1. Run compaction: create a fresh Y.Doc, apply only updates that postdate the minimum state vector, write the result back to `ydoc_state`

The affected user is **not notified at prune time**. Notification happens on reconnect, when it is actionable. A user may never reconnect on that device, and a notification to a stale device serves no purpose.

### 11.5 Reconnect Detection and Recovery Flow

On WebSocket connect, `onAuthenticate` checks `pruned_clients` for this (user, device, note):

```typescript
const pruneRecord = db.getPruneRecord({
  userId: context.userId,
  deviceId: context.deviceId,
  noteId: document.name
})
if (pruneRecord) {
  context.wasPruned = true
  context.pruneRecord = pruneRecord
}
```

When `wasPruned` is set, the server signals the client before initiating normal sync. The client runs a recovery flow before accepting the server snapshot:

```typescript
if (serverSignalsPruned) {
  // 1. Copy current local Y.Doc state to a recovery key in IndexedDB
  const currentState = Y.encodeStateAsUpdate(ydoc)
  const recoveryKey = `note-recovery:${noteId}:${Date.now()}`
  await localforage.setItem(recoveryKey, currentState)

  // 2. Record a reference so the UI can surface it
  await localforage.setItem(`note-recovery-ref:${noteId}`, {
    key: recoveryKey,
    prunedAt: pruneRecord.prunedAt,
    savedAt: Date.now()
  })

  // 3. Accept the full server snapshot — reinitialise the editor
  const freshDoc = new Y.Doc()
  Y.applyUpdate(freshDoc, serverSnapshot)
  // reinitialise editor with freshDoc...
}
```

After this completes, the editor displays a non-blocking notification:

```
ℹ  This note was compacted while you were away.
   A backup of your local version has been saved.
   [View local backup]  [Dismiss]
```

“View local backup” opens a read-only editor view of the recovered Y.Doc state, or exports it as plain text. The user can manually recover any content that diverged. The backup is not auto-merged — the point is to make locally diverged content visible, not to reintroduce it automatically.

-----

## 12. Open Questions / Future Considerations

- **Access control model:** Per-note permissions (owner / editor / viewer) need to be enforced in `onAuthenticate` and at the API layer for metadata operations.
- **Note deletion:** Deleting a note must clean up `y-indexeddb` entries on each client, the Hocuspocus room, and the SQLite rows atomically. `client_sync_state` and `pruned_clients` rows for the note should also be purged.
- **Scalability beyond single-node:** Multi-node Hocuspocus deployments need sticky sessions or a Redis-backed awareness/state relay.
- **Export formats:** Plain text and HTML snapshots can be derived from `Y.XmlFragment` on demand — these should not be stored as a primary format.
- **Local backup retention:** The `note-recovery:*` IndexedDB keys written during the prune recovery flow are never automatically cleaned up. A TTL or explicit user-dismissal action should eventually purge them.
- **Maximum offline window communication:** The 90-day stale threshold is a product behaviour that affects users. It should be documented in user-facing terms — e.g., “Local changes on a device inactive for more than 90 days may not be synced.”
