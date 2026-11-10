# Game Cubby

Pen-and-paper games for two players sharing one screen. A static site with no
build step: plain HTML, CSS and ES modules, deployed to GitHub Pages.

**Play:** <https://5uperbug.github.io/gamecubby/>

## Games

### Mega Tic-Tac-Toe

[Ultimate tic-tac-toe](https://en.wikipedia.org/wiki/Ultimate_tic-tac-toe):
nine boards in one, and the cell you play decides which board your opponent
plays in next.

- **Pick a board, zoom in, place, confirm.** Tap a highlighted board and the
  view zooms into it. Tap a cell to place your mark (tap another to change it),
  then press **Confirm**. **All boards** goes back without moving.
- **Two rule sets** (under **New game**):
  - **Classic.** A board that is won or full is closed. Sent to a closed
    board? Play in any open board.
  - **Open boards.** A won board stays in play while it has empty cells, and
    you must play there if sent to it. Its winner never changes. Only a full
    board gives a free choice.
- The game ends in a draw once nobody can complete a line of boards, rather
  than making players fill the remaining cells.
- Optional auto-zoom when only one board is available.

### Tic-Tac-Toe

The classic 3×3 game. Tap a square to play. Scores carry across rounds, and
the starting player alternates each round. **New match** resets the score.

### Four in a Row

Drop discs into a 7×6 grid: tap anywhere in a column and the disc falls to the
lowest free space. Line up four across, down or diagonally to win the round.
Red discs carry a cross and Blue discs a ring, so colour is never the only cue.
Scores carry across rounds, and the starting player alternates each round.

### Dots and Boxes

Take turns joining two neighbouring dots. Close a box to claim it and draw
again; when every line is drawn, most boxes wins. Choose 3×3, 4×4 or 5×5
boxes under **New game**. Games won are kept across games, and the starting
player alternates.

### Gomoku

Five in a row on a 15×15 grid. On a phone the first tap zooms in on that part
of the board; tap a cell to place your mark, then **Confirm**. **New game**
offers **Freestyle** (five or more wins) or **Exactly five** (six or more
doesn't count). Games won are kept, and players take turns to start.

### Notakto

Tic-tac-toe where both players play X, on one, two or three boards (picked
under **New match**). Three in a row kills a board, and whoever kills the last
live board loses. Each X keeps its player's colour, and scores carry across
rounds.

### Order and Chaos

A 6×6 board where both players may play X or O. **Order** wins with five
identical symbols in a row (six counts too); **Chaos** wins if the board fills
first. Tap a square, then press **X** or **O**. Roles swap every round, and
**New match** can mark squares where one more symbol would make five.

### Hex

Take turns placing stones on a rhombus of hexagons. Red wins by joining the
top and bottom edges, Blue by joining left and right; the board can never
fill up without a winner, so there are no draws. Choose 7×7, 9×9 or 11×11
under **New game**. With the swap rule (on by default), the second player may
press **Swap** instead of their first move to take over the opening stone,
mirrored to face their edges. Red stones carry a cross and Blue stones a ring,
games won are kept, and the starting player alternates.

### Nine Men's Morris

Each player places nine pieces, then moves them one step along the lines. Line
up three to form a mill and remove an opposing piece (pieces in a mill are safe
unless all of them are). With three pieces left you may fly to any empty point;
you lose at two pieces or with no move. Tap a piece, then where it goes. Fifty
moves without a mill make the round a draw. Scores carry across rounds.

### Reversi

An 8×8 board that starts with four discs in the centre. Each move must trap a
line of your opponent's discs between the new disc and one of yours, and every
trapped disc flips. Dots show the legal moves, and a player with no move passes
automatically. When neither can move, the most discs wins. Red discs carry a
cross and Blue discs a ring, and the mark changes as a disc flips.

### Shared by every game

- Light and dark themes: the first visit follows the system setting, and the
  toggle saves your choice for the whole site.
- Responsive layout: stacked on phones, board plus side panel in landscape
  and on desktop.
- Animations by [anime.js](https://animejs.com/) v4. With *reduce motion* on
  in the OS, they are skipped.
- Undo (also Ctrl/Cmd+Z), keyboard play (arrow keys and Enter), and the game in
  progress survives a reload.

## Repository structure

Everything under `site/` is the website and is published as-is. Everything
else is tooling.

```
site/                        ← deployed to GitHub Pages
  index.html                 home page: the game picker
  home.css  home.js          home page styles; loads each card's preview
  favicon.svg
  games/
    mega-tic-tac-toe/        one folder per game, served at games/<slug>/
      index.html             page shell and dialogs
      style.css              board styles only
      app.js                 turn flow, UI state, persistence
      board-view.js          SVG board, viewBox zoom, board animations
      game.js                rules: pure functions, no DOM
      preview.js             animated board art for the home page card
      icon.svg               browser tab icon
    tic-tac-toe/  dots-and-boxes/  notakto/  order-and-chaos/  four-in-a-row/
    nine-mens-morris/
      index.html  style.css  app.js  game.js  preview.js  icon.svg
    hex/                     same files, plus board.js (hex geometry and stones)
    reversi/                 same files, plus discs.js (flip animation)
    gomoku/                  same files, plus board-view.js (zoom, like Mega's)
  shared/
    css/base.css             design tokens, light/dark themes, header,
                             buttons, dialogs, X/O mark colours
    css/game-shell.css       full-screen game layout: status panel, square
                             board, controls, result card, confetti
    js/theme-boot.js         applies the theme before first paint (plain <script>)
    js/theme.js              theme toggle button
    js/motion.js             the only anime.js import, reduced-motion helpers,
                             viewBox zoom animator
    js/effects.js            entrance reveal, dialogs, shake, pop, confetti
    js/marks.js              SVG helpers: X/O marks, win lines, stroke drawing
    js/storage.js            namespaced localStorage
    js/tictactoe.js          3×3 basics shared by the X/O games (lines, players)
    js/disc.js               disc drawing and the drop, for the disc games
  vendor/animejs/            anime.js 4.5.0 ESM bundle (MIT)
tests/
  mega-tic-tac-toe.test.js   Mega rules
  tic-tac-toe.test.js        classic rules and the shared 3×3 core
  <slug>.test.js             rules for each of the other games
  site.test.js               every link and import resolves; every game has
                             a home page card and preview, and links back
.github/workflows/pages.yml  runs the tests, then deploys site/
```

### Conventions

- **Rules stay pure.** Each game's `game.js` imports nothing that touches the
  DOM, so `node --test` can exercise it directly.
- **Imports are relative.** Game pages reach shared code with `../../shared/…`.
  No bare package names, because there is no bundler.
- **anime.js comes from `shared/js/motion.js`.** Upgrading anime.js means
  changing one import path.
- **Saved data is namespaced.** All of `5uperbug.github.io` is one origin, so
  keys look like `gamecubby:<slug>:<key>` (via `createStore('<slug>')`). The
  theme is stored under `gamecubby:theme`.
- **Entrances.** Elements marked `data-reveal` start hidden and are animated
  in by `reveal()`. If scripts fail, a CSS fallback shows them after 1.5 s.

### Adding a game

1. Create `site/games/<slug>/` with `index.html`, `style.css`, `app.js` and
   `game.js`. Copying `games/tic-tac-toe/` is the quickest start.
2. In `index.html`, load `../../shared/js/theme-boot.js` first, then
   `base.css`, `game-shell.css` and your `style.css`. Keep the back link
   (`href="../../"`) in the header.
3. Put the rules in `game.js` as pure functions and add
   `tests/<slug>.test.js`.
4. Add `preview.js` exporting `buildPreview(svg)`, which draws the card art
   and returns `{ hide, intro, enter, leave }`. The contract is described at
   the top of `home.js`.
5. Add a card to `site/index.html` with `data-game="<slug>"` and
   `data-accent="x"` or `"o"`. `home.js` loads the preview from the game's
   folder.
6. Run `npm test`. The site test fails if the game has no card on the home
   page, no preview or no link back, or references a file that does not
   exist.

## Run locally

ES modules do not load from `file://`, so serve `site/` over HTTP:

```bash
npm start
```

Then open <http://localhost:8000>. (`npm start` runs
`python3 -m http.server 8000 --directory site`.)

## Tests

```bash
npm test
```

## Deploy

`.github/workflows/pages.yml` runs the tests on every push and pull request.
On the default branch it then uploads `site/` to GitHub Pages. The
repository's Pages source must be set to **GitHub Actions**
(**Settings → Pages → Build and deployment**).
