// Home page card preview: a game part-way through, with a few boxes claimed.
// Hovering draws the line that closes the next box, and the box fills.

import {
  animate, svg as anime, utils, ms, stag, clearInline,
} from '../../shared/js/motion.js';
import { svgEl, createMark, drawStrokes } from '../../shared/js/marks.js';
import { X, O } from '../../shared/js/tictactoe.js';

const N = 4; // boxes per side
const STEP = 60;
const PAD = 30;
const S = 2 * PAD + N * STEP; // board size
const dotXY = (r, c) => [PAD + c * STEP, PAD + r * STEP];
const across = (r, c) => [[r, c], [r, c + 1]];
const down = (r, c) => [[r, c], [r + 1, c]];
const pathOf = ([a, b]) => `M${dotXY(...a).join(' ')}L${dotXY(...b).join(' ')}`;

// Lines drawn so far, in the order they were played.
const LINES = [
  [across(0, 0), O], [down(2, 1), X], [across(0, 2), O], [down(0, 0), X],
  [across(1, 0), O], [down(0, 1), X], [down(1, 0), O], [down(1, 1), X],
  [across(2, 0), X], [across(4, 0), O], [across(2, 3), X], [down(2, 4), O],
  [down(2, 3), X], [across(3, 3), O], [down(3, 4), O], [down(3, 3), X],
  [across(4, 3), O], [across(0, 3), X], [down(1, 4), O], [down(3, 2), X],
  [across(1, 1), X], [across(2, 1), O],
];
// Boxes claimed so far: [row, column, owner].
const CLAIMED = [[0, 0, X], [1, 0, X], [2, 3, O], [3, 3, O]];
// O's next line closes box (1, 1).
const MOVE = down(1, 2);
const TARGET = [1, 1];

const STYLE = `
.preview-dots-and-boxes .db-dot { fill: var(--line-strong); transform-box: fill-box; transform-origin: center; }
.preview-dots-and-boxes .db-guide {
  fill: none; stroke: var(--line); stroke-width: 2.6; stroke-linecap: round; stroke-dasharray: 0 7.5;
}
.preview-dots-and-boxes .db-line { fill: none; stroke-width: 8; stroke-linecap: round; }
.preview-dots-and-boxes .db-fill { transform-box: fill-box; transform-origin: center; }
.preview-dots-and-boxes .db-fill-x { fill: var(--x-soft); }
.preview-dots-and-boxes .db-fill-o { fill: var(--o-soft); }
.preview-dots-and-boxes .db-box .mark path { stroke-width: 6; }
`;

/** A claimed box: its soft fill and the owner's mark. */
function addBox(parent, [r, c], player) {
  const [x, y] = dotXY(r, c);
  const box = svgEl('g', { class: 'db-box', transform: `translate(${x} ${y})` }, parent);
  const fill = svgEl('rect', {
    class: `db-fill db-fill-${player.toLowerCase()}`, x: 3.5, y: 3.5, width: STEP - 7, height: STEP - 7, rx: 4,
  }, box);
  const mark = createMark(player, STEP, 19);
  box.appendChild(mark);
  return { box, fill, mark, strokes: [...mark.querySelectorAll('path')] };
}

/** Fills boxes with a pop while their marks draw in. */
function fillIn(parts, step) {
  const fills = parts.map((p) => p.fill);
  const marks = parts.map((p) => p.mark);
  const strokes = parts.flatMap((p) => p.strokes);
  const drawing = animate(anime.createDrawable(strokes), {
    draw: ['0 0', '0 1'], duration: ms(240), delay: stag(step / 2), ease: 'inOutQuad',
  });
  clearInline(marks, 'opacity');
  return Promise.all([
    drawing,
    animate(fills, {
      opacity: [0, 1], scale: [0.2, 1], duration: ms(420), delay: stag(step), ease: 'outBack(2.2)',
      onComplete: () => clearInline(fills, 'opacity', 'transform'),
    }),
  ]);
}

export function buildPreview(svg) {
  const margin = 10;
  svg.setAttribute('viewBox', `${-margin} ${-margin} ${S + margin * 2} ${S + margin * 2}`);
  svgEl('style', {}, svg).textContent = STYLE;
  svgEl('rect', { class: 'pv-board', width: S, height: S, rx: 22 }, svg);

  const boxLayer = svgEl('g', {}, svg);
  const guideLayer = svgEl('g', {}, svg);
  const lineLayer = svgEl('g', {}, svg);
  const dotLayer = svgEl('g', {}, svg);

  for (let r = 0; r <= N; r++) {
    for (let c = 0; c < N; c++) svgEl('path', { class: 'db-guide', d: pathOf(across(r, c)) }, guideLayer);
  }
  for (let r = 0; r < N; r++) {
    for (let c = 0; c <= N; c++) svgEl('path', { class: 'db-guide', d: pathOf(down(r, c)) }, guideLayer);
  }
  const guides = [...guideLayer.children];
  const lines = LINES.map(([ends, p]) => svgEl('path', {
    class: `db-line line-${p.toLowerCase()}`, d: pathOf(ends),
  }, lineLayer));
  const boxes = CLAIMED.map(([r, c, p]) => addBox(boxLayer, [r, c], p));
  const dots = [];
  for (let r = 0; r <= N; r++) {
    for (let c = 0; c <= N; c++) {
      const [cx, cy] = dotXY(r, c);
      dots.push(svgEl('circle', { class: 'db-dot', cx, cy, r: 6.5 }, dotLayer));
    }
  }

  // The hover move is rebuilt on every enter, so an interrupted one never lingers.
  let move = null;
  let token = 0;

  function dropMove() {
    if (!move) return Promise.resolve();
    const nodes = [move.line, move.box.box];
    move = null;
    utils.remove(nodes);
    return animate(nodes, {
      opacity: 0, duration: ms(220), ease: 'outQuad', onComplete: () => nodes.forEach((n) => n.remove()),
    });
  }

  return {
    hide() {
      const parts = boxes.flatMap((b) => [b.fill, b.mark]);
      for (const n of [...dots, ...guides, ...lines, ...parts]) n.style.opacity = '0';
    },
    async intro() {
      await Promise.all([
        animate(dots, {
          opacity: [0, 1], scale: [0, 1], duration: ms(420),
          delay: stag(28, { grid: [N + 1, N + 1], from: 'center' }), ease: 'outBack(2.4)',
          onComplete: () => clearInline(dots, 'opacity', 'transform'),
        }),
        animate(guides, {
          opacity: [0, 1], duration: ms(450), delay: ms(180), ease: 'outQuad',
          onComplete: () => clearInline(guides, 'opacity'),
        }),
      ]);
      const drawing = animate(anime.createDrawable(lines), {
        draw: ['0 0', '0 1'], duration: ms(240), delay: stag(45), ease: 'inOutQuad',
      });
      clearInline(lines, 'opacity');
      await drawing;
      await fillIn(boxes, 90);
    },
    async enter() {
      const t = ++token;
      dropMove();
      const line = svgEl('path', { class: 'db-line line-o', d: pathOf(MOVE) }, lineLayer);
      const box = addBox(boxLayer, TARGET, O);
      box.fill.style.opacity = '0';
      box.mark.style.opacity = '0';
      move = { line, box };
      await drawStrokes([line], 260);
      if (t !== token) return;
      await fillIn([box], 0);
      if (t !== token) return;
      animate(box.mark, { scale: [1, 1.25, 1], duration: ms(420), ease: 'inOutQuad' });
    },
    leave() {
      token += 1;
      dropMove();
    },
  };
}
