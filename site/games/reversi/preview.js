// Home page card preview: a round in progress where Red's next disc traps
// Blue lines in three directions. Hovering plays that move again.

import {
  animate, utils, ms, stag, clearInline, wait,
} from '../../shared/js/motion.js';
import { svgEl } from '../../shared/js/marks.js';
import {
  X, SIZE, CELLS, rowOf, colOf, replayRound,
} from './game.js';
import { setDisc, morph } from './discs.js';

const C = 40; // square
const P = 8; // padding
const R = 15.5; // disc radius
const S = SIZE * C + 2 * P;
const M = 12; // margin around the board

// Red moves first; the last move flips discs in three directions.
const MOVES = [37, 45, 53, 54, 19, 52, 61, 34, 33, 18, 17, 20, 43, 29, 21];
const LAST = MOVES.at(-1);

const STYLE = `
.preview-reversi .pv-grid path { stroke: color-mix(in srgb, var(--line-strong) 50%, var(--board)); stroke-width: 1.6; }
.preview-reversi .disc { transform-box: fill-box; transform-origin: center; }
.preview-reversi .disc-x .disc-body { fill: var(--x); }
.preview-reversi .disc-o .disc-body { fill: var(--o); }
.preview-reversi .disc-cue { fill: none; stroke: var(--board); stroke-linecap: round; opacity: 0.85; }
`;

export function buildPreview(svg) {
  svg.setAttribute('viewBox', `${-M} ${-M} ${S + 2 * M} ${S + 2 * M}`);
  svgEl('style', {}, svg).textContent = STYLE;
  svgEl('rect', { class: 'pv-board', width: S, height: S, rx: 16 }, svg);
  const grid = svgEl('g', { class: 'pv-grid' }, svg);
  for (let i = 1; i < SIZE; i++) {
    const p = P + i * C;
    svgEl('path', { d: `M${p} ${P + 3}L${p} ${S - P - 3}` }, grid);
    svgEl('path', { d: `M${P + 3} ${p}L${S - P - 3} ${p}` }, grid);
  }

  const before = replayRound(X, MOVES.slice(0, -1)).cells;
  const after = replayRound(X, MOVES).cells;
  const layer = svgEl('g', {}, svg);
  const slots = Array.from({ length: CELLS }, (_, cell) => svgEl('g', {
    transform: `translate(${P + colOf(cell) * C + C / 2} ${P + rowOf(cell) * C + C / 2})`,
  }, layer));
  const discs = () => slots.map((slot) => slot.firstChild).filter(Boolean);
  const reset = () => before.forEach((player, cell) => setDisc(slots[cell], player, R));
  reset();

  let run = 0; // the latest replay; an older one is left behind when a newer starts

  return {
    hide() {
      for (const disc of discs()) disc.style.opacity = '0';
    },
    async intro() {
      const list = discs();
      await animate(list, {
        scale: [0, 1],
        opacity: { from: 0, to: 1, duration: ms(80) },
        duration: ms(360),
        delay: stag(40),
        ease: 'outBack(1.8)',
      });
      clearInline(list, 'opacity', 'transform');
      await morph(slots, before, after, LAST, R);
    },
    async enter() {
      const id = ++run;
      utils.remove(discs());
      reset();
      await wait(120);
      if (id === run) await morph(slots, before, after, LAST, R);
    },
    leave() {},
  };
}
