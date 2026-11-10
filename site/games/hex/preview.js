// Home page card preview: a 7×7 game in progress, where Red is one stone
// away from joining top and bottom. Hovering plays that stone and draws the chain.

import {
  animate, utils, ms, stag, clearInline,
} from '../../shared/js/motion.js';
import { svgEl, drawStrokes } from '../../shared/js/marks.js';
import { X, cellAt, replay } from './game.js';
import { layout, hexagon, createStone } from './board.js';

const N = 7;
const R = 20;
const M = 12; // margin around the board, room for the coloured edges

// Red moves first; its seventh stone, at row 5 column 3, completes the chain.
const MOVES = [
  [0, 3], [3, 3], [1, 3], [2, 4], [2, 2], [4, 3], [3, 2], [1, 5], [5, 1], [3, 0], [6, 1], [5, 2], [4, 2],
].map(([r, c]) => cellAt(N, r, c));

const STYLE = `
.preview-hex .cell-hex { fill: var(--sub-bg); stroke: var(--line); stroke-width: 1.5; transform-box: fill-box; transform-origin: center; }
.preview-hex .edge { fill: none; stroke-width: 11; stroke-linecap: round; stroke-linejoin: round; }
.preview-hex .stone { transform-box: fill-box; transform-origin: center; }
.preview-hex .stone-x .stone-body { fill: var(--x); }
.preview-hex .stone-o .stone-body { fill: var(--o); }
.preview-hex .stone-cue * { fill: none; stroke: var(--board); stroke-linecap: round; opacity: 0.9; }
.preview-hex .hex-casing { fill: none; stroke: var(--board); stroke-width: 10; stroke-linecap: round; stroke-linejoin: round; }
.preview-hex .hex-core { fill: none; stroke-width: 4; stroke-linecap: round; stroke-linejoin: round; }
`;

export function buildPreview(svg) {
  const geo = layout(N, R);
  const { box } = geo;
  svg.setAttribute('viewBox', `${box.x - M} ${box.y - M} ${box.width + 2 * M} ${box.height + 2 * M}`);
  svgEl('style', {}, svg).textContent = STYLE;

  const edges = ['top', 'bottom', 'left', 'right'].map((side) => svgEl('path', {
    class: `edge line-${side === 'top' || side === 'bottom' ? 'x' : 'o'}`, d: geo.edges[side],
  }, svg));
  const cells = Array.from({ length: N * N }, (_, cell) => svgEl('polygon', {
    class: 'cell-hex', points: hexagon(geo.centre(cell), R),
  }, svg));

  const game = replay(N, X, MOVES);
  const layer = svgEl('g', {}, svg);
  const stones = MOVES.map((cell) => {
    const [x, y] = geo.centre(cell);
    const slot = svgEl('g', { transform: `translate(${x} ${y})` }, layer);
    return slot.appendChild(createStone(game.cells[cell], R * 0.8));
  });
  const last = stones.at(-1);
  const d = `M${game.chain.map(geo.centre).join('L')}`;
  const win = svgEl('g', { class: 'line-x' }, svg);
  const strokes = [
    svgEl('path', { class: 'hex-casing', d }, win),
    svgEl('path', { class: 'hex-core', d }, win),
  ];
  const winners = game.chain.map((cell) => stones[MOVES.indexOf(cell)]);
  // Shown only on hover, so they start hidden even when nothing animates.
  for (const n of [last, win]) n.style.opacity = '0';
  let run = 0; // the latest hover; an older one stops when a newer starts

  return {
    hide() {
      for (const n of [...cells, ...edges, ...stones.slice(0, -1)]) n.style.opacity = '0';
    },
    async intro() {
      await animate(cells, {
        opacity: [0, 1], scale: [0.4, 1], duration: ms(360),
        delay: stag(10, { grid: [N, N], from: 'center' }), ease: 'outBack(1.8)',
      });
      clearInline(cells, 'opacity', 'transform');
      const drawing = drawStrokes(edges, 240);
      clearInline(edges, 'opacity');
      await drawing;
      const shown = stones.slice(0, -1);
      await animate(shown, {
        opacity: [0, 1], scale: [0.3, 1], duration: ms(300), delay: stag(70), ease: 'outBack(2)',
      });
      clearInline(shown, 'opacity', 'transform');
    },
    async enter() {
      const id = ++run;
      utils.remove([last, win, ...winners]);
      clearInline(winners, 'transform');
      win.style.opacity = '0';
      await animate(last, {
        opacity: [0, 1], scale: [0.3, 1], duration: ms(380), ease: 'outBack(2)',
      });
      if (id !== run) return;
      clearInline([win], 'opacity');
      await Promise.all(strokes.map((path) => drawStrokes([path], 420)));
      if (id !== run) return;
      await animate(winners, {
        scale: [1, 1.18, 1], duration: ms(440), delay: stag(60), ease: 'inOutQuad',
      });
      if (id === run) clearInline(winners, 'transform');
    },
    leave() {
      run += 1;
      utils.remove([last, win, ...winners]);
      clearInline(winners, 'transform');
      animate([last, win], { opacity: 0, duration: ms(250), ease: 'outQuad' });
    },
  };
}
