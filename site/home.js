// Home page: entrance animation and live board previews on the game cards.
// Hovering (or focusing) a card plays a small taste of that game: Mega zooms
// into a board, classic redraws its winning line.

import {
  animate, utils, motion, ms, stag, clearInline, wait,
} from './shared/js/motion.js';
import {
  svgEl, createMark, lineThrough, drawStrokes,
} from './shared/js/marks.js';
import { X, O } from './shared/js/tictactoe.js';
import { reveal } from './shared/js/effects.js';
import { initThemeToggle } from './shared/js/theme.js';

/** Puts a mark in its own positioned slot so the mark itself is free to scale. */
function markAt(parent, player, x, y, size, inset) {
  const slot = svgEl('g', { transform: `translate(${x} ${y})` }, parent);
  const mark = createMark(player, size, inset);
  slot.appendChild(mark);
  return mark;
}

/** Returns a function that animates the SVG viewBox (square) towards a target. */
function viewBoxAnimator(svg, start) {
  const vb = { ...start };
  const apply = () => svg.setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.w} ${vb.w}`);
  apply();
  return (to, duration) => {
    utils.remove(vb);
    return animate(vb, {
      ...to, duration: ms(duration), ease: 'inOutQuart', onUpdate: apply, onComplete: apply,
    });
  };
}

// ------------------------------------------------------------ Mega preview

const MP = 8; // outer padding
const MB = 96; // local board
const MG = 14; // gap
const MC = 30; // cell
const MI = 3; // local board inner padding
const MS = MP * 2 + MB * 3 + MG * 2;
const subXY = (b) => [MP + (b % 3) * (MB + MG), MP + Math.floor(b / 3) * (MB + MG)];
const miniXY = (c) => [MI + (c % 3) * MC, MI + Math.floor(c / 3) * MC];
const miniCenter = (c) => miniXY(c).map((v) => v + MC / 2);

// A game in progress: [board, cell, player].
const MEGA_MOVES = [
  [0, 0, X], [0, 4, X], [0, 8, X], [0, 1, O], [0, 6, O],
  [8, 2, O], [8, 4, O], [8, 6, O], [8, 0, X], [8, 5, X],
  [1, 4, O], [2, 0, X], [2, 8, O], [3, 5, X], [4, 2, X], [4, 6, O],
  [5, 1, O], [5, 7, X], [6, 3, X], [7, 0, O],
];
const MEGA_WON = new Map([[0, [X, [0, 4, 8]]], [8, [O, [2, 4, 6]]]]);
const MEGA_NEXT = 4; // the board the next player is sent to

function megaPreview(svg) {
  const margin = 14;
  const home = { x: -margin, y: -margin, w: MS + margin * 2 };
  const zoomTo = viewBoxAnimator(svg, home);

  svgEl('rect', { class: 'pv-board', width: MS, height: MS, rx: 18 }, svg);
  const subs = [];
  const smallLayers = [];
  const results = [];
  for (let b = 0; b < 9; b++) {
    const [x, y] = subXY(b);
    const won = MEGA_WON.get(b);
    const cls = won ? `pv-sub won won-${won[0].toLowerCase()}` : 'pv-sub';
    const sub = svgEl('g', { class: cls, transform: `translate(${x} ${y})` }, svg);
    subs.push(sub);
    svgEl('rect', { class: 'pv-sub-bg', width: MB, height: MB, rx: 7 }, sub);
    const grid = svgEl('g', { class: 'pv-sub-grid' }, sub);
    for (const i of [1, 2]) {
      const p = MI + i * MC;
      svgEl('line', { x1: p, y1: MI + 4, x2: p, y2: MB - MI - 4 }, grid);
      svgEl('line', { x1: MI + 4, y1: p, x2: MB - MI - 4, y2: p }, grid);
    }
    smallLayers.push(svgEl('g', { class: 'pv-small' }, sub));
    if (won) {
      const [player, line] = won;
      const result = svgEl('g', { class: 'pv-big' }, sub);
      svgEl('path', { class: `pv-sub-win line-${player.toLowerCase()}`, d: lineThrough(line.map(miniCenter), 8) }, result);
      result.appendChild(createMark(player, MB, 16));
      results.push(...result.querySelectorAll('path'));
    }
  }
  const marks = MEGA_MOVES.map(([b, c, p]) => {
    const [x, y] = miniXY(c);
    return markAt(smallLayers[b], p, x, y, MC, 8);
  });
  const macro = svgEl('g', { class: 'pv-macro' }, svg);
  for (const i of [1, 2]) {
    const p = MP + i * MB + (i - 0.5) * MG;
    svgEl('path', { d: `M${p} ${MP + 2}L${p} ${MS - MP - 2}` }, macro);
    svgEl('path', { d: `M${MP + 2} ${p}L${MS - MP - 2} ${p}` }, macro);
  }
  const [rx, ry] = subXY(MEGA_NEXT);
  const ring = svgEl('rect', {
    class: 'pv-ring', x: rx - 3, y: ry - 3, width: MB + 6, height: MB + 6, rx: 10,
  }, svg);

  const lines = [...macro.children];
  // Everything except the board we zoom into steps back while zoomed, as in the game.
  const backdrop = [macro, ...subs.filter((_, b) => b !== MEGA_NEXT)];
  return {
    /** Hides the parts that intro() animates in. */
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
      zoomTo({ x: rx - z, y: ry - z, w: MB + z * 2 }, 650);
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

// --------------------------------------------------------- classic preview

const TS = 300; // board
const TP = 15; // padding
const TC = 90; // cell
const tttXY = (c) => [TP + (c % 3) * TC, TP + Math.floor(c / 3) * TC];
const tttCenter = (c) => tttXY(c).map((v) => v + TC / 2);

// Played in this order; X takes the diagonal.
const CLASSIC_MOVES = [[4, X], [2, O], [0, X], [6, O], [8, X]];
const CLASSIC_LINE = [0, 4, 8];

function classicPreview(svg) {
  const margin = 10;
  viewBoxAnimator(svg, { x: -margin, y: -margin, w: TS + margin * 2 });

  svgEl('rect', { class: 'pv-board', width: TS, height: TS, rx: 22 }, svg);
  const grid = svgEl('g', { class: 'pv-grid' }, svg);
  for (const i of [1, 2]) {
    const p = TP + i * TC;
    svgEl('path', { d: `M${p} ${TP + 10}L${p} ${TS - TP - 10}` }, grid);
    svgEl('path', { d: `M${TP + 10} ${p}L${TS - TP - 10} ${p}` }, grid);
  }
  const layer = svgEl('g', { class: 'pv-cells' }, svg);
  const marks = new Map(CLASSIC_MOVES.map(([c, p]) => {
    const [x, y] = tttXY(c);
    return [c, markAt(layer, p, x, y, TC, 24)];
  }));
  const win = svgEl('path', { class: 'pv-win line-x', d: lineThrough(CLASSIC_LINE.map(tttCenter), 26) }, svg);
  const winners = CLASSIC_LINE.map((c) => marks.get(c));

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

// -------------------------------------------------------------------- boot

const builders = { mega: megaPreview, classic: classicPreview };

async function animateLogo() {
  const logo = document.querySelector('.logo');
  const cellsEls = [...logo.querySelectorAll('.logo-cell')];
  const strokes = [...logo.querySelectorAll('.logo-x, .logo-o')];
  for (const s of strokes) s.style.opacity = '0';
  await animate(cellsEls, { scale: [0.3, 1], duration: ms(450), delay: stag(70), ease: 'outBack(2.4)' });
  clearInline(cellsEls, 'transform');
  const drawing = drawStrokes(strokes, 260);
  clearInline(strokes, 'opacity');
  await drawing;
}

async function boot() {
  initThemeToggle(document.querySelector('#btn-theme'));

  const cards = [...document.querySelectorAll('.game-card')];
  const previews = cards.map((card) => {
    const build = builders[card.dataset.preview];
    return build ? build(card.querySelector('.preview')) : null;
  });

  if (!motion.reduced) previews.forEach((p) => p?.hide());
  reveal(document.querySelectorAll('[data-reveal]'));
  animateLogo();

  // Hover effects wait until the intros have played.
  let ready = false;
  cards.forEach((card, i) => {
    const preview = previews[i];
    if (!preview) return;
    const enter = () => { if (ready && !motion.reduced) preview.enter(); };
    const leave = () => { if (ready && !motion.reduced) preview.leave(); };
    card.addEventListener('pointerenter', enter);
    card.addEventListener('pointerleave', leave);
    card.addEventListener('focus', enter);
    card.addEventListener('blur', leave);
  });

  if (!motion.reduced) {
    await wait(250);
    await Promise.all(previews.filter(Boolean).map((p) => p.intro()));
  }
  ready = true;
}

boot();
