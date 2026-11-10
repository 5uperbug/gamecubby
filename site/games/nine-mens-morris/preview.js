// Home page card preview: Red slides a piece up to close a mill along the
// top, then takes a Blue piece. Hovering plays the move again.

import { animate, utils, ms, stag, clearInline } from '../../shared/js/motion.js';
import { svgEl, lineThrough, drawStrokes } from '../../shared/js/marks.js';
import { X, O, GRID } from './game.js';
import { createDisc } from '../../shared/js/disc.js';

const U = 40;
const M = 22;
const SIZE = 6 * U + 2 * M;
const R = 13;
const xy = (p) => GRID[p].map((v) => M + v * U);

const RED = [0, 1, 4, 10];
const BLUE = [9, 13, 19, 22, 16];
const FROM = 14; // Red's moving piece starts here...
const TO = 2; // ...and closes 0 1 2 here
const TAKEN = 13;

const STYLE = `
.preview-nine-mens-morris .nmm-lines { fill: none; stroke: var(--line-strong); stroke-width: 2.4; stroke-linejoin: round; }
.preview-nine-mens-morris .nmm-dot { fill: var(--line-strong); }
.preview-nine-mens-morris .disc { transform-box: fill-box; transform-origin: center; }
.preview-nine-mens-morris .disc-x .disc-body { fill: var(--x); }
.preview-nine-mens-morris .disc-o .disc-body { fill: var(--o); }
.preview-nine-mens-morris .disc-cue { fill: none; stroke: var(--board); stroke-linecap: round; opacity: 0.85; }
.preview-nine-mens-morris .nmm-mill { fill: none; stroke-width: 5; stroke-linecap: round; opacity: 0.55; }
`;

export function buildPreview(svg) {
  svg.setAttribute('viewBox', `0 0 ${SIZE} ${SIZE}`);
  svgEl('style', {}, svg).textContent = STYLE;
  svgEl('rect', { class: 'pv-board', width: SIZE, height: SIZE, rx: 14 }, svg);
  const lines = [0, 1, 2].map((i) => {
    const a = M + i * U;
    const b = SIZE - a;
    return svgEl('path', { class: 'nmm-lines', d: `M${a} ${a}H${b}V${b}H${a}Z` }, svg);
  });
  const half = SIZE / 2;
  lines.push(svgEl('path', {
    class: 'nmm-lines',
    d: `M${half} ${M}v${2 * U}M${half} ${SIZE - M}v${-2 * U}M${M} ${half}h${2 * U}M${SIZE - M} ${half}h${-2 * U}`,
  }, svg));
  GRID.forEach((_, p) => {
    const [cx, cy] = xy(p);
    svgEl('circle', { class: 'nmm-dot', cx, cy, r: 3.5 }, svg);
  });

  const mill = svgEl('path', { class: 'nmm-mill line-x', d: lineThrough([xy(0), xy(2)], 8) }, svg);
  const piece = (player, p) => {
    const [x, y] = xy(p);
    const slot = svgEl('g', { transform: `translate(${x} ${y})` }, svg);
    return slot.appendChild(createDisc(player, R));
  };
  const reds = RED.map((p) => piece(X, p));
  const blues = BLUE.map((p) => piece(O, p));
  const mover = piece(X, TO);
  const taken = blues[BLUE.indexOf(TAKEN)];
  const [fx, fy] = xy(FROM);
  const [tx, ty] = xy(TO);
  const discs = [...reds, ...blues, mover];
  let run = 0;

  /** Back to the position before Red's move. */
  const reset = () => {
    utils.remove([mover, taken, mill]);
    utils.set(mover, { x: fx - tx, y: fy - ty });
    clearInline([taken], 'opacity', 'transform');
    mill.style.opacity = '0';
  };

  const playMove = async (id) => {
    await animate(mover, { x: 0, y: 0, duration: ms(520), ease: 'inOutQuad' });
    if (id !== run) return;
    clearInline([mill], 'opacity');
    await drawStrokes([mill], 320);
    if (id !== run) return;
    await animate(taken, { scale: 0, opacity: 0, duration: ms(320), ease: 'inBack(1.6)' });
  };

  reset();
  return {
    hide() {
      for (const n of [...lines, ...discs]) n.style.opacity = '0';
    },
    async intro() {
      clearInline(lines, 'opacity');
      await drawStrokes(lines, 420);
      await animate(discs, {
        opacity: [0, 1], scale: [0.4, 1], duration: ms(320), delay: stag(50), ease: 'outBack(1.8)',
      });
      clearInline(discs, 'opacity');
      await playMove(run);
    },
    async enter() {
      const id = ++run;
      reset();
      await playMove(id);
    },
    leave() {},
  };
}
