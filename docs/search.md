# Search

## What shed has today: a corpus, not an index

`architecture.md` calls the meta doc a "search index". That's loose wording. The meta doc
holds a **copy of each note's extracted text** (`NoteEntry.text`, `headingText`), which is
a *search corpus*. `lib/noteSearch.ts` searches it with a linear scan: lowercase substring
matching per query word, heading matches ranked first, recent notes first within a tier.
No inverted index is involved.

That's fine at small scale. A scan costs O(total text) per keystroke and has no stemming
or relevance ranking. The meta doc also carries all note text to every client, and to the
server's gc-off blob (see the growth issue in `architecture.md`).

## Full-text search refresher

An FTS engine has these parts:

1. **Tokenization**: split text into terms, e.g. `"Buying milk!"` → `buying`, `milk`.
2. **Normalization**: lowercase, fold diacritics (`café` → `cafe`), optionally **stem**
   (`buying` → `buy`) and drop stop words. Queries go through the same pipeline, so they
   match.
3. **Inverted index**: the reverse lookup, `term → postings list`. Each posting holds
   `(docId, term frequency, positions)`. A query looks up its terms instead of reading
   every document. Positions support phrase (`"buy milk"`) and proximity queries.
4. **Query evaluation**:
   - AND/OR intersect or union the postings lists.
   - Prefix queries (`mil*`) need a sorted term dictionary or a prefix index.
   - Typo tolerance needs fuzzy term matching: edit distance, or trigrams.
5. **Ranking**: usually **BM25**. A term scores higher when it appears often in this doc
   (TF) and rarely across all docs (IDF), adjusted for document length. Field boosts give
   one field more weight, e.g. headings count more than body text.
6. **Snippets/highlighting**: use positions to cut an excerpt around the matches.
7. **Updates**: on an edit, remove the doc's old postings and add the new ones. Engines
   batch this and merge segments in the background.

The source text usually still exists somewhere, because snippets need it. The index is
the term → doc mapping built on top of it.

### Options for shed

| Option | Where | Notes |
|---|---|---|
| Linear scan of the meta doc (today) | client | Simple, works offline, doesn't scale; no stemming or BM25 |
| MiniSearch / FlexSearch / Orama | client (Web Worker) | In-memory inverted index with BM25, prefix and fuzzy search, field boosts. Can be built from the meta doc corpus or from local Y.Docs. Works offline. `plan.md` §7.3 picked MiniSearch |
| SQLite FTS5 | server | Real inverted index on disk: `bm25()`, `snippet()`/`highlight()`, tokenizers `unicode61`, `porter` (stemming), `trigram` (substring/fuzzy). Built in `onStoreDocument` from the Y.Doc. Needs a network round trip; offline search would need a client fallback |

A likely end state: keep only short previews in the meta doc (for the note list), index
locally available docs in a client worker, and use FTS5 on the server for everything.

## Do we need a stored copy of the text?

**Not for snippets.** Results only need the text of the top k notes (about 10), and that
can come from the notes themselves:

- **Open read-only without the server:** `new Y.Doc()` + `new IndexeddbPersistence(name,
  doc)`, await `whenSynced`, walk the `XmlFragment`'s `XmlText` nodes, then `destroy()`.
  Don't create a provider. IndexedDB works in Web Workers, so a search worker can do this
  off the main thread.
- **Cost:** measured in Node, decoding a heavily edited ~6 KB-text note (8 KB update) and
  extracting its text takes about 0.5 ms. The browser adds the IndexedDB read, a few ms
  per doc. Ten snippets on demand is well within budget for each query.
- The index itself only needs terms → note IDs (+ positions). It can be rebuilt from the
  local docs at any time, so it's a disposable local cache, not data.

The real constraint is **coverage**. IndexedDB only holds notes this device has opened.
The synced meta doc corpus exists so search covers notes this device has never opened.
Without it, the options are:
- **background-prefetch every note doc** on connect, which an offline-first app arguably
  needs anyway, or else unopened notes aren't available offline either;
- **ask the server (FTS5) when online**, with local search covering what's on the device
  when offline.

The distinction that matters: a **local, rebuildable cache** of text or an index is fine.
A **shared CRDT copy** is what's costly: it syncs to every client, and the server keeps
its whole history with gc off.

## Fuzzy matching

"Fuzzy" covers several unrelated techniques:

| Technique | What it matches | Where it fits |
|---|---|---|
| Prefix | `gro` → `groceries` | Search-as-you-type. MiniSearch `prefix: true`, FTS5 `gro*` |
| Edit distance (Levenshtein / Damerau) | `grocries` → `groceries` (1 edit) | Typos. Usually a budget relative to term length, e.g. MiniSearch `fuzzy: 0.2`. Engines walk the term dictionary (radix tree / automaton) with a bounded distance instead of comparing against every term |
| Character n-grams (trigrams) | Substrings and misspellings through shared 3-grams | FTS5 `trigram` tokenizer, Postgres `pg_trgm`. Robust; bigger index |
| Subsequence (fzf style) | `grcy` → `groceries` | Short strings: palette commands, note labels. cmdk already does this. Poor for body text |
| Stemming / lemmatization | `buying` → `buy` | Word forms, not typos. FTS5 `porter` |
| Phonetic (Soundex/Metaphone) | `smyth` → `smith` | Names; niche |

None of these is semantic: they match spellings, not meaning.

## Semantic search

Semantic search matches meaning ("dentist appointment" finds "teeth cleaning on
Tuesday"). The standard approach is **embeddings**:

1. **Chunk** notes. Blocks or heading sections are natural chunks, and stable block IDs
   let a result jump straight to the block.
2. **Embed** each chunk with an embedding model: text → a vector of e.g. 384 floats.
3. **Store** the vectors as derived data (IndexedDB locally, or SQLite on the server),
   **never in Yjs**.
4. **Query:** embed the query, then rank chunks by cosine similarity.
5. **Keep it fresh:** re-embed only the blocks that changed. Key on block ID + content
   hash, and debounce.

Where the model runs:
- **In the browser:** transformers.js (ONNX / WebGPU) with a small model such as
  all-MiniLM-L6-v2, bge-small or gte-small (tens of MB quantized). Works offline after one
  download, keeps notes private, but costs CPU/battery while indexing.
- **On the server:** the same models via ONNX, or a hosted embedding API. Sending note
  text to a third party is a privacy trade-off. `sqlite-vec` puts vector search next to
  FTS5 in SQLite.
- Embedding a query also needs the model, so offline semantic search means a model on the
  device. Otherwise, fall back to keyword search when offline.
- All vectors must come from the same model and version. Changing models means
  re-embedding everything.

Scale: a personal corpus of ~10k chunks × 384 dims is about 15 MB of float32.
Brute-force cosine over that takes a few ms, so no vector index (HNSW etc.) is needed
until roughly 100k+ chunks.

**Hybrid ranking** is the usual answer. Semantic search alone misses exact terms (names,
codes, rare words). Keyword search alone misses paraphrases. Run both and merge with
**Reciprocal Rank Fusion**: `score = Σ 1/(60 + rank)` across the result lists.

Possible next step: "ask your notes". Retrieve chunks this way, then have an LLM answer
from them (RAG). That needs the network.

## Suggested path

1. A MiniSearch index in a Web Worker, built from local Y.Docs: prefix + fuzzy, BM25,
   heading boost. Snippets come from the top-k docs on demand.
2. Background-prefetch all notes so the local index covers everything offline. Then shrink
   the meta doc to short previews, which also fixes its growth problem.
3. Later, block-level embeddings in the same worker (transformers.js + brute-force
   cosine), merged with keyword results using RRF.

## BlockNote and search

BlockNote has **no full-text search**: no cross-document index and no built-in
find/replace (checked in the v0.56 packages). It's an editor. Indexing documents is the
app's job. What it provides is a way to get text out:

- `editor.document` returns the typed `Block[]` tree. Walk it to collect text, headings,
  or per-block entries keyed by block `id`. Block IDs would make block-level hits
  possible, e.g. jumping straight to the matching section.
- `blocksToMarkdownLossy` / `blocksToHTMLLossy` serialize blocks to text formats.
- `@blocknote/server-util` does the same on the server from a Y.Doc. `editor-choice.md`
  recommends a schema-agnostic `XmlText` walker instead, so the server stays independent
  of BlockNote.
