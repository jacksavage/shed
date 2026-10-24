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
