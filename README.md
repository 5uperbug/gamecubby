# Mega Tic-Tac-Toe

Ultimate tic-tac-toe in the browser: nine tic-tac-toe boards inside one big
board, for two players on one device. It is a static site with no build step,
so it runs as-is on GitHub Pages.

**Play it:** <https://5uperbug.github.io/gamecubby/>

Rules follow [Ultimate tic-tac-toe on Wikipedia](https://en.wikipedia.org/wiki/Ultimate_tic-tac-toe).

## Features

- **Pick a board, zoom in, place, confirm.** Each turn you tap one of the
  highlighted boards and the view zooms into it. You tap a cell to place your
  mark (tap another cell to change it), then press **Confirm**. **All boards**
  goes back without moving.
- **Two rule sets** (choose under **New game**):
  - **Classic.** A board that is won or full is closed. If you are sent to a
    closed board, you may play in any open board.
  - **Open boards.** A won board stays in play while it has empty cells. If you
    are sent there you must play there. Moves in it never change who won it.
    Only a full board gives a free choice.
- **Light and dark themes.** The first visit follows the system setting. The
  toggle in the header saves your choice.
- **Responsive.** Stacked layout on phones, board plus side panel in landscape
  and on desktop.
- **Animations** use [anime.js](https://animejs.com/) v4: zooming, stroke-drawn
  marks, board wins, a frame that flies from the cell you played to the board
  your opponent must use, and confetti on a win. With *reduce motion* turned on
  in the OS, animations are skipped.
- Undo (also Ctrl/Cmd+Z). The game in progress is saved in `localStorage`, so
  a reload picks up where you left off.
- Optional auto-zoom when only one board is available.
- Keyboard play: arrow keys move, Enter selects, Esc returns to all boards.

The game ends in a draw when nobody can complete a line of boards any more,
rather than making players fill the remaining cells.

## Run locally

ES modules do not load from `file://`, so serve the folder over HTTP:

```bash
python3 -m http.server 8000
```

Then open <http://localhost:8000>.

## Tests

The rules engine (`js/game.js`) has no DOM dependencies and is covered by
`node:test`:

```bash
npm test
```

## Deploy to GitHub Pages

The workflow in `.github/workflows/pages.yml` runs the tests on every push and
publishes the site from the repository's default branch.

1. In the repository go to **Settings → Pages**.
2. Under **Build and deployment**, set **Source** to **GitHub Actions**.
3. Push to the default branch, or run the workflow by hand from the
   **Actions** tab.

All paths are relative, so the site works at
`https://<user>.github.io/<repo>/`. Because there is no build step, you can
also use **Deploy from a branch** with the root folder instead of the workflow.

## Project layout

```
index.html               page shell, dialogs
css/style.css            themes (CSS custom properties), layout, board styles
js/game.js               pure rules engine (moves, local/global wins, variant)
js/board-view.js         SVG board, viewBox zoom, all board animations
js/app.js                turn flow, UI state, dialogs, theme, persistence
vendor/animejs/          anime.js 4.5.0 ESM bundle (MIT)
tests/game.test.js       rules tests
```
