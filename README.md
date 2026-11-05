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
  home.css  home.js          home page styles, card previews and animations
  favicon.svg
  games/
    mega-tic-tac-toe/        one folder per game, served at games/<slug>/
      index.html             page shell and dialogs
      style.css              board styles only
      app.js                 turn flow, UI state, persistence
      board-view.js          SVG board, viewBox zoom, board animations
      game.js                rules: pure functions, no DOM
      icon.svg               browser tab icon
    tic-tac-toe/
      index.html  style.css  app.js  game.js  icon.svg
  shared/
    css/base.css             design tokens, light/dark themes, header,
                             buttons, dialogs, X/O mark colours
    css/game-shell.css       full-screen game layout: status panel, square
                             board, controls, result card, confetti
    js/theme-boot.js         applies the theme before first paint (plain <script>)
    js/theme.js              theme toggle button
    js/motion.js             the only anime.js import, plus reduced-motion helpers
    js/effects.js            entrance reveal, dialogs, shake, pop, confetti
    js/marks.js              SVG helpers: X/O marks, win lines, stroke drawing
    js/storage.js            namespaced localStorage
    js/tictactoe.js          3×3 basics shared by the X/O games (lines, players)
  vendor/animejs/            anime.js 4.5.0 ESM bundle (MIT)
tests/
  mega-tic-tac-toe.test.js   Mega rules
  tic-tac-toe.test.js        classic rules and the shared 3×3 core
  site.test.js               every link and import resolves; every game is
                             linked from the home page and links back
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
4. Add a card for the game to `site/index.html`. A preview is optional: add a
   builder to `home.js` and set `data-preview` on the card.
5. Run `npm test`. The site test fails if the game has no card on the home
   page, has no link back, or references a file that does not exist.

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
