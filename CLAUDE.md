# shed — notes for Claude

Collaborative, offline-first notes PWA: BlockNote (on Tiptap/ProseMirror) + Yjs + Hocuspocus + SQLite.
See `README.md` for dev commands.

## Documentation is part of the work

The owner uses architecture/design questions to build shared understanding. Treat every
question about structure, architecture, or a design decision as something that belongs in
the repo, not just in chat:

- Answer in chat, then record the substance in `docs/` (update an existing doc before
  creating a new one; `docs/README.md` is the index).
- Put the "why" of a change in detailed commit message bodies, and non-obvious constraints
  in code comments next to the code they constrain.
- Claude has no memory between sessions — anything not in the repo is lost.

`plan.md` is the original design doc. Parts are superseded; `docs/architecture.md`
describes what is actually built and where it diverges from the plan.

## Standing decisions

- **No backward compatibility yet.** All data is test data and can be wiped. Don't write
  migrations or legacy-shape handling; change the format and clear the data instead.
  (Schema versioning is designed but deferred — see `docs/schema-versioning.md`.)
- **Keyboard-first, vim-style UX** is the target, with mouse as an optional path.
  See `docs/keyboard-model.md`. Palettes mirror VS Code bindings (Ctrl+Shift+P/F1, Ctrl+P).
- Yjs is the source of truth; nothing else stores note content as primary data.
- **BlockNote stays inside `client/src/components/Editor.tsx`**, with exact-pinned
  versions (pre-1.0). See `docs/editor-choice.md` for why and how to keep the exit cheap.
