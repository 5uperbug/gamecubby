// Home page card preview: a game in progress, where Red's last disc lands at
// the foot of a diagonal four. Hovering drops that disc again and redraws the win.

import {
  animate, utils, ms, stag, clearInline,
} from '../../shared/js/motion.js';
import { svgEl, lineThrough, drawStrokes } from '../../shared/js/marks.js';
import {
  X, COLS, ROWS, cellAt, colOf, rowOf, createRound, landingRow, play,
} from './game.js';
import { createDisc, fallKeyframes } from '../../shared/js/disc.js';

const C = 40; // cell
const R = 15.5; // disc radius
const P = 6; // frame padding
const W = COLS * C + 2 * P;
const H = ROWS * C + 2 * P;
const M = 14; // margin around the frame
const TOP = -M - R - 2; // discs start just out of sight above the art

const centre = (cell) => [P + colOf(cell) * C + C / 2, P + rowOf(cell) * C + C / 2];

// Red moves first; the last move completes a diagonal from the bottom left.
const MOVES = [3, 2, 2, 3, 3, 4, 4, 4, 5, 5, 4, 6, 1];

const STYLE = `
.preview-four-in-a-row .fiar-well { fill: var(--sub-bg); stroke: var(--line); stroke-width: 1.2; }
.preview-four-in-a-row .disc { transform-box: fill-box; transform-origin: center; }
.preview-four-in-a-row .disc-x .disc-body { fill: var(--x); }
.preview-four-in-a-row .disc-o .disc-body { fill: var(--o); }
.preview-four-in-a-row .disc-cue { fill: none; stroke: var(--board); stroke-linecap: round; opacity: 0.85; }
.preview-four-in-a-row .fiar-casing { fill: none; stroke: var(--board); stroke-width: 9; stroke-linecap: round; }
.preview-four-in-a-row .pv-win { stroke-width: 4.4; }
`;

/** The cell each move lands in, and the finished round. */
function replayMoves() {
  let round = createRound(X);
  const cells = MOVES.map((col) => {
    const cell = cellAt(col, landingRow(round, col));
    round = play(round, col);
    return cell;
  });
  return { cells, round };
}

const fall = (cell) => fallKeyframes(centre(cell)[1] - TOP, C);

export function buildPreview(svg) {
  svg.setAttribute('viewBox', `${-M} ${-M} ${W + 2 * M} ${H + 2 * M}`);
  svgEl('style', {}, svg).textContent = STYLE;
  svgEl('rect', { class: 'pv-board', width: W, height: H, rx: 12 }, svg);
  for (let cell = 0; cell < COLS * ROWS; cell++) {
    const [cx, cy] = centre(cell);
    svgEl('circle', {
      class: 'fiar-well', cx, cy, r: R - 0.5,
    }, svg);
  }

  const { cells, round } = replayMoves();
  const layer = svgEl('g', {}, svg);
  const discs = cells.map((cell) => {
    const [x, y] = centre(cell);
    const slot = svgEl('g', { transform: `translate(${x} ${y})` }, layer);
    return slot.appendChild(createDisc(round.cells[cell], R));
  });

  const [line] = round.lines;
  const d = lineThrough([centre(line[0]), centre(line.at(-1))], 13);
  const win = svgEl('g', {}, svg);
  const strokes = [
    svgEl('path', { class: 'fiar-casing', d }, win),
    svgEl('path', { class: 'pv-win line-x', d }, win),
  ];
  const winners = line.map((cell) => discs[cells.indexOf(cell)]);
  const lastCell = cells.at(-1);
  const last = discs.at(-1);
  let run = 0; // the latest replay; an older one stops when a newer starts

  const showWin = async (id) => {
    clearInline([win], 'opacity');
    await Promise.all(strokes.map((path) => drawStrokes([path], 380)));
    if (id !== run) return;
    await animate(winners, {
      scale: [1, 1.2, 1], duration: ms(520), delay: stag(90), ease: 'inOutQuad',
    });
    if (id === run) clearInline(winners, 'transform');
  };

  return {
    hide() {
      for (const n of [...discs, win]) n.style.opacity = '0';
    },
    async intro() {
      await Promise.all(discs.map((disc, i) => animate(disc, {
        y: fall(cells[i]),
        opacity: { from: 0, to: 1, duration: ms(60) },
        delay: ms(i * 85),
      })));
      clearInline(discs, 'opacity', 'transform');
      await showWin(run);
    },
    async enter() {
      const id = ++run;
      utils.remove([...discs, ...strokes, win]);
      clearInline(discs, 'transform');
      win.style.opacity = '0';
      await animate(last, { y: fall(lastCell) });
      if (id !== run) return;
      clearInline([last], 'transform');
      await showWin(id);
    },
    leave() {},
  };
}
