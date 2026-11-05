// Home page card preview: X takes the diagonal. Hovering redraws the win.

import {
  animate, ms, stag, clearInline, wait, viewBoxAnimator,
} from '../../shared/js/motion.js';
import {
  svgEl, markAt, lineThrough, drawStrokes,
} from '../../shared/js/marks.js';
import { X, O } from '../../shared/js/tictactoe.js';

const S = 300; // board
const P = 15; // padding
const C = 90; // cell
const cellXY = (c) => [P + (c % 3) * C, P + Math.floor(c / 3) * C];
const cellCenter = (c) => cellXY(c).map((v) => v + C / 2);

// Played in this order; X takes the diagonal.
const MOVES = [[4, X], [2, O], [0, X], [6, O], [8, X]];
const LINE = [0, 4, 8];

export function buildPreview(svg) {
  const margin = 10;
  viewBoxAnimator(svg, { x: -margin, y: -margin, w: S + margin * 2 });

  svgEl('rect', { class: 'pv-board', width: S, height: S, rx: 22 }, svg);
  const grid = svgEl('g', { class: 'pv-grid' }, svg);
  for (const i of [1, 2]) {
    const p = P + i * C;
    svgEl('path', { d: `M${p} ${P + 10}L${p} ${S - P - 10}` }, grid);
    svgEl('path', { d: `M${P + 10} ${p}L${S - P - 10} ${p}` }, grid);
  }
  const layer = svgEl('g', { class: 'pv-cells' }, svg);
  const marks = new Map(MOVES.map(([c, p]) => {
    const [x, y] = cellXY(c);
    return [c, markAt(layer, p, x, y, C, 24)];
  }));
  const win = svgEl('path', { class: 'pv-win line-x', d: lineThrough(LINE.map(cellCenter), 26) }, svg);
  const winners = LINE.map((c) => marks.get(c));

  const lines = [...grid.children];
  const all = [...marks.values()];
  return {
    hide() {
      for (const n of [...lines, ...all, win]) n.style.opacity = '0';
    },
    async intro() {
      const drawingGrid = drawStrokes(lines, 320);
      clearInline(lines, 'opacity');
      await drawingGrid;
      for (const mark of all) {
        const strokes = drawStrokes([...mark.querySelectorAll('path')], 200);
        clearInline([mark], 'opacity');
        await strokes;
        await wait(60);
      }
      const line = drawStrokes([win], 380);
      clearInline([win], 'opacity');
      await line;
    },
    enter() {
      drawStrokes([win], 380);
      animate(winners, {
        scale: [1, 1.18, 1], duration: ms(520), delay: stag(90), ease: 'inOutQuad',
        onComplete: () => clearInline(winners, 'transform'),
      });
    },
    leave() {},
  };
}
