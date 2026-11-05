// Home page card preview: a game in progress. Hovering zooms into the board
// the next player is sent to, the way the game does.

import {
  animate, utils, ms, stag, clearInline, viewBoxAnimator,
} from '../../shared/js/motion.js';
import {
  svgEl, createMark, markAt, lineThrough, drawStrokes,
} from '../../shared/js/marks.js';
import { X, O } from '../../shared/js/tictactoe.js';

const P = 8; // outer padding
const B = 96; // local board
const G = 14; // gap
const C = 30; // cell
const I = 3; // local board inner padding
const S = P * 2 + B * 3 + G * 2;
const subXY = (b) => [P + (b % 3) * (B + G), P + Math.floor(b / 3) * (B + G)];
const miniXY = (c) => [I + (c % 3) * C, I + Math.floor(c / 3) * C];
const miniCenter = (c) => miniXY(c).map((v) => v + C / 2);

// A game in progress: [board, cell, player].
const MOVES = [
  [0, 0, X], [0, 4, X], [0, 8, X], [0, 1, O], [0, 6, O],
  [8, 2, O], [8, 4, O], [8, 6, O], [8, 0, X], [8, 5, X],
  [1, 4, O], [2, 0, X], [2, 8, O], [3, 5, X], [4, 2, X], [4, 6, O],
  [5, 1, O], [5, 7, X], [6, 3, X], [7, 0, O],
];
const WON = new Map([[0, [X, [0, 4, 8]]], [8, [O, [2, 4, 6]]]]);
const NEXT = 4; // the board the next player is sent to

export function buildPreview(svg) {
  const margin = 14;
  const home = { x: -margin, y: -margin, w: S + margin * 2 };
  const zoomTo = viewBoxAnimator(svg, home);

  svgEl('rect', { class: 'pv-board', width: S, height: S, rx: 18 }, svg);
  const subs = [];
  const smallLayers = [];
  const results = [];
  for (let b = 0; b < 9; b++) {
    const [x, y] = subXY(b);
    const won = WON.get(b);
    const cls = won ? `pv-sub won won-${won[0].toLowerCase()}` : 'pv-sub';
    const sub = svgEl('g', { class: cls, transform: `translate(${x} ${y})` }, svg);
    subs.push(sub);
    svgEl('rect', { class: 'pv-sub-bg', width: B, height: B, rx: 7 }, sub);
    const grid = svgEl('g', { class: 'pv-sub-grid' }, sub);
    for (const i of [1, 2]) {
      const p = I + i * C;
      svgEl('line', { x1: p, y1: I + 4, x2: p, y2: B - I - 4 }, grid);
      svgEl('line', { x1: I + 4, y1: p, x2: B - I - 4, y2: p }, grid);
    }
    smallLayers.push(svgEl('g', { class: 'pv-small' }, sub));
    if (won) {
      const [player, line] = won;
      const result = svgEl('g', { class: 'pv-big' }, sub);
      svgEl('path', { class: `pv-sub-win line-${player.toLowerCase()}`, d: lineThrough(line.map(miniCenter), 8) }, result);
      result.appendChild(createMark(player, B, 16));
      results.push(...result.querySelectorAll('path'));
    }
  }
  const marks = MOVES.map(([b, c, p]) => {
    const [x, y] = miniXY(c);
    return markAt(smallLayers[b], p, x, y, C, 8);
  });
  const macro = svgEl('g', { class: 'pv-macro' }, svg);
  for (const i of [1, 2]) {
    const p = P + i * B + (i - 0.5) * G;
    svgEl('path', { d: `M${p} ${P + 2}L${p} ${S - P - 2}` }, macro);
    svgEl('path', { d: `M${P + 2} ${p}L${S - P - 2} ${p}` }, macro);
  }
  const [rx, ry] = subXY(NEXT);
  const ring = svgEl('rect', {
    class: 'pv-ring', x: rx - 3, y: ry - 3, width: B + 6, height: B + 6, rx: 10,
  }, svg);

  const lines = [...macro.children];
  // Everything except the board we zoom into steps back while zoomed, as in the game.
  const backdrop = [macro, ...subs.filter((_, b) => b !== NEXT)];
  return {
    hide() {
      for (const n of [...lines, ...marks, ...results, ring]) n.style.opacity = '0';
    },
    async intro() {
      const drawingLines = drawStrokes(lines, 420);
      clearInline(lines, 'opacity');
      await Promise.all([
        drawingLines,
        animate(marks, {
          opacity: [0, 1], scale: [0.3, 1], duration: ms(380), delay: stag(30, { from: 'random' }), ease: 'outBack(2)',
        }),
      ]);
      clearInline(marks, 'opacity', 'transform');
      const drawing = drawStrokes(results, 300);
      clearInline(results, 'opacity');
      await drawing;
      await animate(ring, { opacity: [0, 1], duration: ms(400), ease: 'outQuad' });
      clearInline([ring], 'opacity');
    },
    enter() {
      const z = 12;
      zoomTo({ x: rx - z, y: ry - z, w: B + z * 2 }, 650);
      utils.remove(backdrop);
      animate(backdrop, { opacity: 0.18, duration: ms(450), ease: 'outQuad' });
    },
    leave() {
      zoomTo(home, 600);
      utils.remove(backdrop);
      animate(backdrop, {
        opacity: 1, duration: ms(450), delay: ms(120), ease: 'outQuad',
        onComplete: () => clearInline(backdrop, 'opacity'),
      });
    },
  };
}
