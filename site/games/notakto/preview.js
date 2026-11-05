// Home page card preview: two boards are already dead and one is still live.
// Hovering completes a line on the last one, which is the losing move.

import {
  animate, utils, ms, stag, wait, clearInline,
} from '../../shared/js/motion.js';
import {
  svgEl, markPaths, lineThrough, drawStrokes,
} from '../../shared/js/marks.js';
import { fadeIntoClass } from '../../shared/js/effects.js';
import { X, O } from '../../shared/js/tictactoe.js';

const S = 300; // board
const P = 15; // padding
const C = 90; // cell
const G = 30; // gap between boards
const cellXY = (c) => [P + (c % 3) * C, P + Math.floor(c / 3) * C];
const cellCenter = (c) => cellXY(c).map((v) => v + C / 2);

// Every mark is an X; [cell, who placed it]. Dead boards keep the line that killed them.
const BOARDS = [
  { marks: [[0, X], [2, O], [4, O], [8, X]], line: [0, 4, 8], by: X },
  { marks: [[1, O], [3, X], [5, O], [4, X]], line: [3, 4, 5], by: X },
  { marks: [[0, X], [1, O], [6, O], [8, X]] },
];
const LAST = { cell: 2, by: O, line: [0, 1, 2] }; // the move hovering plays

// The boards are small here, so strokes run thicker than on the classic card.
const STYLE = `
.preview-notakto .pv-grid path { stroke-width: 9; }
.preview-notakto .pv-cells .mark path { stroke-width: 17; }
.preview-notakto .pv-win { stroke-width: 15; }
.preview-notakto .pv-board { stroke: transparent; stroke-width: 4; transition: fill 0.4s ease, stroke 0.4s ease; }
.preview-notakto .nk-dead .pv-board { fill: color-mix(in srgb, var(--board) 40%, transparent); stroke: var(--line); }
.preview-notakto .nk-dead .nk-dim { opacity: 0.3; }
.preview-notakto .nk-body { transform-box: fill-box; transform-origin: center; }
`;

function xAt(parent, player, cell) {
  const [x, y] = cellXY(cell);
  const slot = svgEl('g', { transform: `translate(${x} ${y})` }, parent);
  const mark = svgEl('g', { class: `mark mark-${player.toLowerCase()}` }, slot);
  for (const d of markPaths(X, C, 24)) svgEl('path', { d }, mark);
  return mark;
}

const killLine = (parent, line, by) => svgEl('path', {
  class: `pv-win line-${by.toLowerCase()}`, d: lineThrough(line.map(cellCenter), 26),
}, parent);

export function buildPreview(svg) {
  const margin = 18;
  const w = S * 3 + G * 2 + margin * 2;
  const h = (w * 10) / 16; // the card art is 16:10
  svg.setAttribute('viewBox', `${-margin} ${(S - h) / 2} ${w} ${h}`);
  svgEl('style', {}, svg).textContent = STYLE;

  const boards = BOARDS.map((def, b) => {
    const g = svgEl('g', { class: 'nk-board', transform: `translate(${b * (S + G)} 0)` }, svg);
    const body = svgEl('g', { class: 'nk-body' }, g);
    svgEl('rect', { class: 'pv-board', width: S, height: S, rx: 22 }, body);
    const dim = svgEl('g', { class: 'nk-dim' }, body);
    const grid = svgEl('g', { class: 'pv-grid' }, dim);
    for (const i of [1, 2]) {
      const p = P + i * C;
      svgEl('path', { d: `M${p} ${P + 10}L${p} ${S - P - 10}` }, grid);
      svgEl('path', { d: `M${P + 10} ${p}L${S - P - 10} ${p}` }, grid);
    }
    const cells = svgEl('g', { class: 'pv-cells' }, dim);
    const marks = def.marks.map(([c, p]) => xAt(cells, p, c));
    const line = def.line ? killLine(body, def.line, def.by) : null;
    if (line) g.classList.add('nk-dead');
    return {
      g, body, dim, cells, marks, line, grid: [...grid.children],
    };
  });
  const dead = boards.filter((b) => b.line);
  const last = boards[2];

  let run = 0; // bumps on every enter/leave, so a stale hover sequence stops
  let added = []; // the hover move: its mark and line

  return {
    hide() {
      for (const b of boards) {
        for (const n of [...b.grid, ...b.marks, b.line].filter(Boolean)) n.style.opacity = '0';
      }
      for (const b of dead) b.g.classList.remove('nk-dead');
    },
    async intro() {
      await Promise.all(boards.map(async (b, i) => {
        await wait(i * 90);
        const drawing = drawStrokes(b.grid, 260);
        clearInline(b.grid, 'opacity');
        await drawing;
      }));
      const marks = boards.flatMap((b) => b.marks);
      await animate(marks, {
        opacity: [0, 1], scale: [0.4, 1], duration: ms(380), delay: stag(55), ease: 'outBack(2)',
      });
      clearInline(marks, 'opacity', 'transform');
      const lines = dead.map((b) => b.line);
      const drawing = drawStrokes(lines, 340);
      clearInline(lines, 'opacity');
      await drawing;
      await Promise.all(dead.map((b) => fadeIntoClass(b.g, 'nk-dead', [b.dim], 420)));
    },
    async enter() {
      const token = ++run;
      utils.remove(added);
      added.forEach((n) => n.remove());
      const mark = xAt(last.cells, LAST.by, LAST.cell);
      const line = killLine(last.body, LAST.line, LAST.by);
      line.style.opacity = '0';
      added = [mark.parentNode, line];
      const strokes = drawStrokes([...mark.querySelectorAll('path')], 200);
      await Promise.all([
        strokes,
        animate(mark, { scale: [1.4, 1], duration: ms(480), ease: 'outElastic(1, .55)' }),
      ]);
      if (token !== run) return;
      const drawing = drawStrokes([line], 340);
      clearInline([line], 'opacity');
      await drawing;
      if (token !== run) return;
      await Promise.all([
        animate(last.body, { rotate: [0, -4, 3, -1.5, 0], duration: ms(600), ease: 'inOutSine' }),
        fadeIntoClass(last.g, 'nk-dead', [last.dim], 420),
      ]);
      clearInline([last.body], 'transform');
    },
    leave() {
      run += 1;
      const gone = added;
      added = [];
      utils.remove([last.body, last.dim, ...gone]);
      clearInline([last.body], 'transform');
      if (gone.length) {
        animate(gone, {
          opacity: 0, duration: ms(250), ease: 'outQuad', onComplete: () => gone.forEach((n) => n.remove()),
        });
      }
      const from = parseFloat(getComputedStyle(last.dim).opacity);
      last.g.classList.remove('nk-dead');
      animate(last.dim, {
        opacity: [from, 1], duration: ms(350), ease: 'outQuad', onComplete: () => clearInline([last.dim], 'opacity'),
      });
    },
  };
}
