// Home page card preview: a 6×6 board of mixed X and O where the last move
// completes five O's for Order. Hovering redraws the line through the five.

import {
  animate, svg as drawable, utils, ms, stag, clearInline, viewBoxAnimator,
} from '../../shared/js/motion.js';
import {
  svgEl, markAt, lineThrough, drawStrokes,
} from '../../shared/js/marks.js';
import { X, O } from '../../shared/js/tictactoe.js';

const N = 6;
const S = 312; // board
const P = 12; // padding
const C = 48; // cell
const cellXY = (c) => [P + (c % N) * C, P + Math.floor(c / N) * C];
const cellCenter = (c) => cellXY(c).map((v) => v + C / 2);

// Rows from the top. Order's five O's run down the diagonal from the top right.
const POSITION = [
  'X.OX.O',
  '.OX.O.',
  'OX.OX.',
  '.XOX.O',
  'XO.XO.',
  '.X.O.X',
];
const FIVE = [5, 10, 15, 20, 25];
const LAST = 15; // the move that completes the five, drawn last

const STYLE = `
.preview-order-and-chaos .pv-grid path {
  stroke: color-mix(in srgb, var(--line-strong) 50%, var(--board));
  stroke-width: 2.6;
}
.preview-order-and-chaos .pv-cells .mark path { stroke-width: 6; }
.preview-order-and-chaos .pv-win { stroke-width: 8; }
`;

export function buildPreview(svg) {
  const margin = 12;
  viewBoxAnimator(svg, { x: -margin, y: -margin, w: S + margin * 2 });

  svgEl('style', {}, svg).textContent = STYLE;
  svgEl('rect', { class: 'pv-board', width: S, height: S, rx: 22 }, svg);
  const grid = svgEl('g', { class: 'pv-grid' }, svg);
  for (let i = 1; i < N; i++) {
    const p = P + i * C;
    svgEl('path', { d: `M${p} ${P + 6}L${p} ${S - P - 6}`, 'data-i': i }, grid);
    svgEl('path', { d: `M${P + 6} ${p}L${S - P - 6} ${p}`, 'data-i': i }, grid);
  }

  const layer = svgEl('g', { class: 'pv-cells' }, svg);
  const marks = new Map();
  POSITION.join('').split('').forEach((ch, c) => {
    if (ch !== X && ch !== O) return;
    const [x, y] = cellXY(c);
    marks.set(c, markAt(layer, ch, x, y, C, 12));
  });
  const ends = [cellCenter(FIVE[0]), cellCenter(FIVE.at(-1))];
  const win = svgEl('path', { class: 'pv-win line-o', d: lineThrough(ends, 16) }, svg);

  const lines = [...grid.children];
  const five = FIVE.map((c) => marks.get(c));
  const others = [...marks].filter(([c]) => !FIVE.includes(c)).map(([, m]) => m);
  // A shuffled playing order that ends with the completing move.
  const order = [...marks.keys()]
    .filter((c) => c !== LAST)
    .sort((a, b) => ((a * 7) % 11) - ((b * 7) % 11) || a - b)
    .concat(LAST)
    .map((c) => marks.get(c));
  const all = [...marks.values()];

  return {
    hide() {
      for (const n of [...lines, ...all, win]) n.style.opacity = '0';
    },
    async intro() {
      const drawingGrid = animate(drawable.createDrawable(lines), {
        draw: ['0.5 0.5', '0 1'],
        duration: ms(380),
        delay: (line) => ms(Math.abs(line.dataset.i - N / 2) * 60),
        ease: 'outQuad',
      });
      clearInline(lines, 'opacity');
      await drawingGrid;

      const paths = [];
      const delays = [];
      order.forEach((mark, k) => {
        [...mark.querySelectorAll('path')].forEach((path, j) => {
          paths.push(path);
          delays.push(k * 50 + j * 90);
        });
      });
      const drawingMarks = animate(drawable.createDrawable(paths), {
        draw: ['0 0', '0 1'], duration: ms(180), delay: (_, i) => ms(delays[i]), ease: 'inOutQuad',
      });
      clearInline(all, 'opacity');
      await drawingMarks;

      const line = drawStrokes([win], 420);
      clearInline([win], 'opacity');
      await line;
    },
    enter() {
      drawStrokes([win], 420);
      utils.remove(others);
      animate(others, { opacity: 0.3, duration: ms(300), ease: 'outQuad' });
      animate(five, {
        scale: [1, 1.2, 1], duration: ms(520), delay: stag(70), ease: 'inOutQuad',
        onComplete: () => clearInline(five, 'transform'),
      });
    },
    leave() {
      utils.remove(others);
      animate(others, {
        opacity: 1, duration: ms(300), ease: 'outQuad',
        onComplete: () => clearInline(others, 'opacity'),
      });
    },
  };
}
