# Keyboard model (draft)

**Status: proposal, nothing built.** The goal is a full keyboard experience with vim-style
modes and Workflowy-style folding. Mouse is an optional path for some users.

## Modes

The editor has nested modes. Esc always goes up one level.

```
Outline mode  ──i/a/Enter──►  Text normal  ──i/a/o──►  Insert
(block cursor)  ◄────Esc────  (vim normal)  ◄──Esc───
                                   │ v
                                   ▼
                              Text visual
```

- **Outline mode**: the cursor is a whole block. j/k move between blocks. Structural
  commands (fold, move, indent, delete) act on blocks and their children.
- **Text normal**: vim normal mode inside one block's text (motions and operators).
  An earlier draft called this "visual mode". In vim terms that's normal mode, and
  `v` from here enters actual visual (selection) mode.
- **Insert**: plain typing.
- **Outline visual** (`V` in outline mode): select a range of blocks and act on all of
  them.

## Proposed bindings: outline mode

| Keys | Action | Prior art |
|---|---|---|
| `j` / `k` | next / previous visible block | vim |
| `gg` / `G` | first / last block | vim |
| `h` | collapse; if already collapsed or a leaf, go to parent | file trees (nvim-tree, ranger) |
| `l` | expand; if already expanded, go to first child | file trees |
| `za` / `zo` / `zc` | toggle / open / close fold | vim folding |
| `zM` / `zR` | fold all / unfold all | vim |
| `Tab` | cycle fold: folded → children → subtree | org-mode, Vimliner |
| `[[` / `]]` | previous / next sibling, skipping children | vim section motions |
| `i` / `a` | enter block: text normal at start / end | — |
| `I` / `A` | enter block straight into insert at start / end | vim |
| `o` / `O` | new sibling below / above, in insert | vim |
| `>` / `<` | indent / outdent the block with its children | vim `>>` / `<<` |
| `J` / `K` | move the block (and subtree) down / up | mirrors j/k; vim-unimpaired uses `]e`/`[e` |
| `dd` / `yy` / `p` / `P` | delete / yank / paste block subtrees | vim |
| `u` / `Ctrl-r` | undo / redo (Yjs UndoManager, local changes only) | vim |
| `Enter` | zoom into block (show only its subtree) | Workflowy |
| `-` / `Backspace` | zoom out to parent | vim-vinegar `-` |
| `Ctrl-o` / `Ctrl-i` | jump list back / forward across notes and zooms | vim |
| `/` | search within the note | vim |
| `Space` (leader) | leader key, e.g. `Space f` find note, `Space p` commands | Spacemacs, LazyVim |
| `:` | command palette (alias of Ctrl+Shift+P) | vim |

The VS Code bindings (Ctrl+P, Ctrl+Shift+P/F1) stay, for non-vim users.

## Text normal mode: suggested scope

Blocks are short prose, so a modest subset covers nearly all real use:
- motions: `h l w b e W B E 0 ^ $ f t F T ; ,`
- operators: `d c y` with text objects `iw aw i" a" i( a( ip`
- edits: `x r ~ p P . u`
- counts

`j`/`k` on the first or last line of a block should move to the previous or next block,
so moving through text feels continuous.

## Design decisions this forces

- **A tree document model.** Folding "all sections and sublists" and moving subtrees is
  trivial if every block can have child blocks (Workflowy, BlockNote). It is awkward with
  StarterKit's flat `block+` document, where a heading's section is implicit. Recommended:
  an explicit tree. Headings become styling, not structure.
- **Stable block IDs** (plan §4.1) are needed to key fold state, zoom targets and jump
  list entries.
- **Fold state is per-user view state.** Store it locally (IndexedDB, keyed by block ID),
  not in the shared doc. Otherwise one user's folding collapses blocks for everyone.
- **Esc ownership.** Palettes and menus need to consume Esc before the mode stack sees it.

## Libraries and prior art

- **No maintained vim library exists for ProseMirror or Tiptap.** Neither npm nor the
  ProseMirror forum turned one up, and the ProseMirror maintainer has said they don't plan
  to write one ([forum](https://discuss.prosemirror.net/t/prosemirror-vim-bindings/2549)).
  Text normal mode would be built on `prosemirror-keymap` / `handleKeyDown`, as a small
  state machine for counts, operators and motions.
- **codemirror-vim** (`@replit/codemirror-vim`) is the most complete browser vim and the
  reference for behaviour. It is tied to CodeMirror and can't be dropped into
  ProseMirror.
- **Vimflowy** (github.com/WuTheFWasThat/vimflowy) is an open-source vim-modal
  Workflowy clone. It is the closest prior art for outline-mode semantics: zoom, folding,
  block moves. It appears to be unmaintained. Use it for reference, not as a dependency.
- **Vimliner**, **org-mode / evil-org**: Tab fold cycling, outline conventions.
