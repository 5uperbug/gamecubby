// Home page card preview: a corner of a Gomoku board in mid-game, where X has
// an open four. Hovering zooms in a little, plays the fifth X and draws the line.

import {
  animate, svg as animeSvg, utils, ms, stag, clearInline, viewBoxAnimator,
} from '../../shared/js/motion.js';
import { svgEl, markAt, lineThrough } from '../../shared/js/marks.js';
import { X, O } from '../../shared/js/tictactoe.js';

const N = 9; // cells across the cropped board
const C = 40; // cell
const S = N * C;
const INSET = 10;
const center = ([r, c]) => [c * C + C / 2, r * C + C / 2];

// Played in this order, [row, col, player]. X now has an open four on the diagonal.
const MOVES = [
  [4, 4, X], [4, 3, O], [3, 3, X], [3, 4, O], [4, 2, X], [5, 4, O],
  [5, 5, X], [4, 5, O], [3, 6, X], [2, 3, O], [2, 2, X], [6, 3, O],
];
const FIFTH = [6, 6];
const FIVE = [[2, 2], [3, 3], [4, 4], [5, 5], FIFTH];

const STYLE = `
  .preview-gomoku .pv-grid path { stroke: var(--line); stroke-width: 2.2; }
  .preview-gomoku .pv-cells .mark path { stroke-width: 5.6; }
  .preview-gomoku .pv-win { stroke-width: 7; }
  .preview-gomoku .pv-last { fill: var(--o-soft); }
`;

export function buildPreview(svg) {
  const margin = 12;
  const home = { x: -margin, y: -margin, w: S + margin * 2 };
  const near = { x: 0.75 * C, y: 0.75 * C, w: 7.5 * C };
  const zoomTo = viewBoxAnimator(svg, home);

  svgEl('style', {}, svg).textContent = STYLE;
  // The grid fades towards the edges: this is only part of a bigger board.
  const defs = svgEl('defs', {}, svg);
  const fade = svgEl('radialGradient', { id: 'pv-gomoku-fade-g' }, defs);
  svgEl('stop', { offset: 0.6, 'stop-color': '#fff' }, fade);
  svgEl('stop', { offset: 1, 'stop-color': '#fff', 'stop-opacity': 0.1 }, fade);
  const mask = svgEl('mask', {
    id: 'pv-gomoku-fade', maskUnits: 'userSpaceOnUse', x: 0, y: 0, width: S, height: S,
  }, defs);
  svgEl('rect', { width: S, height: S, fill: 'url(#pv-gomoku-fade-g)' }, mask);

  svgEl('rect', { class: 'pv-board', width: S, height: S, rx: 22 }, svg);
  const [lr, lc] = MOVES.at(-1);
  const last = svgEl('rect', {
    class: 'pv-last', x: lc * C + 3, y: lr * C + 3, width: C - 6, height: C - 6, rx: 7,
  }, svg);
  const grid = svgEl('g', { class: 'pv-grid', mask: 'url(#pv-gomoku-fade)' }, svg);
  for (let i = 1; i < N; i++) {
    svgEl('path', { d: `M${i * C} 0V${S}` }, grid);
    svgEl('path', { d: `M0 ${i * C}H${S}` }, grid);
  }
  const layer = svgEl('g', { class: 'pv-cells' }, svg);
  const marks = MOVES.map(([r, c, p]) => markAt(layer, p, c * C, r * C, C, INSET));
  const fifth = markAt(layer, X, FIFTH[1] * C, FIFTH[0] * C, C, INSET);
  const win = svgEl('path', {
    class: 'pv-win line-x', d: lineThrough([center(FIVE[0]), center(FIFTH)], 14),
  }, svg);

  const lines = [...grid.children];
  const five = FIVE.map(([r, c]) => (r === FIFTH[0] && c === FIFTH[1]
    ? fifth
    : marks[MOVES.findIndex(([mr, mc]) => mr === r && mc === c)]));
  // Shown only on hover, so they start hidden even when nothing animates.
  const extra = [fifth, win];
  for (const n of extra) n.style.opacity = '0';
  let drawing = null;

  return {
    hide() {
      for (const n of [...lines, ...marks, last]) n.style.opacity = '0';
    },
    async intro() {
      const strokes = marks.flatMap((m, i) => [...m.querySelectorAll('path')].map((p, arm) => [p, i * 85 + arm * 90]));
      const drawGrid = animate(animeSvg.createDrawable(lines), {
        draw: ['0 0', '0 1'], duration: ms(420), delay: stag(22, { from: 'center' }), ease: 'inOutQuad',
      });
      clearInline(lines, 'opacity');
      await drawGrid;
      const drawMarks = animate(animeSvg.createDrawable(strokes.map(([p]) => p)), {
        draw: ['0 0', '0 1'], duration: ms(200), delay: (_, i) => ms(strokes[i][1]), ease: 'inOutQuad',
      });
      clearInline(marks, 'opacity');
      await drawMarks;
      await animate(last, { opacity: [0, 1], duration: ms(300), ease: 'outQuad' });
      clearInline([last], 'opacity');
    },
    enter() {
      zoomTo(near, 650);
      drawing?.cancel();
      utils.remove([...extra, ...five]);
      clearInline(five, 'transform');
      for (const n of extra) n.style.opacity = '1';
      const paths = [...fifth.querySelectorAll('path'), win];
      drawing = animate(animeSvg.createDrawable(paths), {
        draw: ['0 0', '0 1'],
        duration: (_, i) => ms(i < 2 ? 200 : 420),
        delay: (_, i) => ms([250, 360, 620][i]),
        ease: 'inOutQuad',
      });
      animate(five, {
        scale: [1, 1.2, 1], duration: ms(480), delay: stag(70, { start: ms(1000) }), ease: 'inOutQuad',
        onComplete: () => clearInline(five, 'transform'),
      });
    },
    leave() {
      zoomTo(home, 600);
      utils.remove([...extra, ...five]);
      clearInline(five, 'transform');
      animate(extra, { opacity: 0, duration: ms(300), ease: 'outQuad' });
    },
  };
}
