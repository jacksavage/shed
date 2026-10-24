# Keyboard model (draft)

**Status: proposal, nothing built.** The goal is a full keyboard experience with vim-style
modes and Workflowy-style folding. Mouse is an optional path for some users.

## Modes

The editor has nested modes. Esc goes up one level. The exit from text normal to outline
is an open question; see "Esc from text normal" below.

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
- **Esc from text normal.** Vim users press Esc over and over out of habit. Notebook vim
  modes therefore *don't* let plain Esc leave the cell: jupyterlab-vim and marimo use
  Shift-Esc / Ctrl-Esc. jupyterlab-vim later added an opt-in "double duty Esc".
  Leaving a block in shed costs less than in a notebook if re-entering with `i` puts the
  caret back where it was. Proposal: plain Esc exits (the original design), remember the
  caret per block, and offer a setting for Shift-Esc-only exit.
- **Flat vs tree, revisited.** Notebooks are flat cell lists, yet "collapsible headings"
  folds them well by deriving sections from heading levels. A flat model could handle
  heading folding. Workflowy-style sublist folding and subtree moves still need a tree.

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

### Notebooks (Jupyter, marimo, Datalore, Colab)

Notebooks are the closest mainstream match for this model. Jupyter's **command mode /
edit mode** split is shed's outline mode / text modes, and vim plugins add a third layer
in between, exactly as proposed here.

| Tool | What to borrow |
|---|---|
| Jupyter command mode | Esc → command mode, Enter → edit. `a`/`b` insert above/below, `dd` delete, `z` undo cell delete, `x`/`c`/`v` cut/copy/paste, `Shift-M` merge, `Ctrl-Shift--` split, `m`/`y`/`1`–`6` change cell type and heading level, `Shift-J/K` extend selection |
| jupyterlab-vim | Three layers: command mode → vim normal → insert. `gg`/`G` first/last cell, `Ctrl-J/K` move between cells from inside vim. Shift-Esc leaves the cell; plain Esc stays in vim normal |
| marimo (vim keymap) | Ctrl/Cmd-Esc from vim normal → command mode. Plain `j`/`k`, `gg`/`G`, `Shift-J/K` extend selection, `i`/Enter back into the cell. Optional user `.vimrc` |
| Datalore | Plain `k`/`j` for previous/next cell in command mode |
| Collapsible headings (Jupyter) | Left/Right collapse/expand the selected heading's section in command mode, Ctrl-Shift-Left/Right collapse/expand all. Matches the `h`/`l` fold proposal |
| Colab | `Ctrl-M` prefix chord for every command-mode key. A precedent for working within browser-reserved keys |

What this suggests for shed:
- Add block-type keys in outline mode: `1`–`6` heading level, `0` paragraph (Jupyter).
- Add join and split blocks: `gJ` / split at caret (Jupyter merge/split).
- `Shift-J/K` means "extend selection" in Jupyter, marimo and Datalore, but this doc uses
  it for "move block". Keep move on `J`/`K` (vim-ish) or switch to the notebook
  convention. Choose before building.
- A `.vimrc`-style user remap file (marimo) is cheap if bindings are data from the start.
