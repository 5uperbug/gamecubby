// Nine Men's Morris: two players on one screen place nine pieces each, then
// move them, taking a piece for every mill. Scores are kept across rounds
// and the starting player alternates.

import {
  X, O, DRAW, GRID, POINTS, QUIET_LIMIT, other, createRound, phaseOf, onBoard, canFly,
  removable, targets, play, replayRound, undo as undoRound,
} from './game.js';
import { createDisc } from '../../shared/js/disc.js';
import {
  animate, utils, motion, ms, stag, clearInline,
} from '../../shared/js/motion.js';
import { svgEl, lineThrough, drawStrokes } from '../../shared/js/marks.js';
import {
  confetti, fadeIntoClass, openDialog, pop, reveal, shake,
} from '../../shared/js/effects.js';
import { createStore } from '../../shared/js/storage.js';
import { initThemeToggle } from '../../shared/js/theme.js';

const $ = (sel) => document.querySelector(sel);
const store = createStore('nine-mens-morris');

const NAMES = { [X]: 'Red', [O]: 'Blue' };

// ------------------------------------------------------------------- state

const freshMatch = () => ({ scores: { X: 0, O: 0, D: 0 }, roundNo: 1, starter: X });

function loadMatch() {
  const saved = store.get('match');
  const match = freshMatch();
  if (!saved || typeof saved !== 'object') return { match, moves: [] };
  for (const key of Object.keys(match.scores)) {
    const n = saved.scores?.[key];
    if (Number.isInteger(n) && n >= 0) match.scores[key] = n;
  }
  if (Number.isInteger(saved.roundNo) && saved.roundNo > 0) match.roundNo = saved.roundNo;
  if (saved.starter === O) match.starter = O;
  return { match, moves: Array.isArray(saved.moves) ? saved.moves : [] };
}

const loaded = loadMatch();
let match = loaded.match;
let round = replayRound(match.starter, loaded.moves);

const ui = {
  busy: false, // an animation owns the board
  selected: null, // piece picked up, waiting for a destination
  roving: 0, // the point in the tab order
  shown: { active: null, hint: '', scores: { ...match.scores } },
};

function save() {
  store.set('match', { ...match, moves: round.moves });
}

// ------------------------------------------------------------------- board

const U = 100; // grid step
const M = 50; // margin
const SIZE = 6 * U + 2 * M;
const R = 30; // piece radius
const HIT = 46;

const xy = (p) => GRID[p].map((v) => M + v * U);
/** Standard morris notation: columns a–g from the left, rows 1–7 from the bottom. */
const pointName = (p) => `${'abcdefg'[GRID[p][0]]}${7 - GRID[p][1]}`;

const board = $('#board');
board.setAttribute('viewBox', `0 0 ${SIZE} ${SIZE}`);

const linesLayer = svgEl('g', { class: 'lines', 'aria-hidden': 'true' }, board);
const boardLines = [
  ...[0, 1, 2].map((i) => {
    const a = M + i * U;
    const b = SIZE - a;
    return `M${a} ${a}H${b}V${b}H${a}Z`;
  }),
  `M${SIZE / 2} ${M}V${M + 2 * U}`, `M${SIZE / 2} ${SIZE - M}V${SIZE - M - 2 * U}`,
  `M${M} ${SIZE / 2}H${M + 2 * U}`, `M${SIZE - M} ${SIZE / 2}H${SIZE - M - 2 * U}`,
].map((d) => svgEl('path', { d }, linesLayer));

const fxLayer = svgEl('g', { class: 'fx', 'aria-hidden': 'true' }, board);

const pointsLayer = svgEl('g', { class: 'points' }, board);
const points = Array.from({ length: POINTS }, (_, p) => {
  const [x, y] = xy(p);
  const g = svgEl('g', {
    class: 'pt', 'data-p': p, transform: `translate(${x} ${y})`, role: 'button', tabindex: -1,
  }, pointsLayer);
  svgEl('circle', { class: 'pt-hit', r: HIT }, g);
  svgEl('circle', { class: 'dot', r: 9 }, g);
  svgEl('circle', { class: 'pt-mark', r: R + 8 }, g);
  svgEl('g', { class: 'slot' }, g);
  svgEl('circle', { class: 'pt-ring', r: HIT }, g);
  return g;
});

const discAt = (p) => points[p].querySelector('.slot').firstChild;
const allDiscs = () => points.map((_, p) => discAt(p)).filter(Boolean);

function addMillLines() {
  return round.mills.map((mill) => svgEl('path', {
    class: `mill-line line-${round.cells[mill[0]].toLowerCase()}`, d: lineThrough([xy(mill[0]), xy(mill[2])], 16),
  }, fxLayer));
}

/** Makes the board match `round` exactly, without animating. */
function sync({ settled = true } = {}) {
  utils.remove(board.querySelectorAll('*'));
  fxLayer.replaceChildren();
  board.classList.remove('over', 'won-x', 'won-o', 'drawn');
  points.forEach((g, p) => {
    const slot = g.querySelector('.slot');
    slot.replaceChildren();
    if (round.cells[p]) slot.appendChild(createDisc(round.cells[p], R));
  });
  addMillLines();
  if (settled) endClasses().forEach((c) => board.classList.add(c));
}

function endClasses() {
  if (!round.winner) return [];
  return round.winner === DRAW ? ['over', 'drawn'] : ['over', `won-${round.winner.toLowerCase()}`];
}

/** One point is in the tab order; arrow keys move between points. */
function setRoving(index) {
  points.forEach((g, p) => g.setAttribute('tabindex', p === index ? 0 : -1));
  ui.roving = index;
}

/** Highlights what can be done right now, and labels every point for screen readers. */
function markPoints() {
  const phase = ui.busy ? 'busy' : phaseOf(round);
  const takeable = phase === 'remove' ? removable(round) : [];
  const reach = phase === 'move' && ui.selected !== null ? targets(round, ui.selected) : [];
  board.classList.toggle('removing', phase === 'remove');
  points.forEach((g, p) => {
    const owner = round.cells[p];
    const state = {
      filled: Boolean(owner),
      open: phase === 'place' && !owner,
      movable: phase === 'move' && owner === round.turn && targets(round, p).length > 0,
      selected: p === ui.selected,
      target: reach.includes(p),
      takeable: takeable.includes(p),
    };
    for (const [name, on] of Object.entries(state)) g.classList.toggle(name, on);
    const parts = [pointName(p), owner ? `${NAMES[owner]} piece` : 'empty'];
    if (state.selected) parts.push('selected');
    else if (state.target) parts.push('you can move here');
    if (state.takeable) parts.push('can be removed');
    g.setAttribute('aria-label', parts.join(', '));
  });
}

// ------------------------------------------------------------------ status

const tag = (p) => `<strong class="${p.toLowerCase()}">${NAMES[p]}</strong>`;
const NEXT_ROUND = 'Start a new round when you’re ready.';

function hintFor() {
  const n = match.roundNo;
  const { turn } = round;
  if (round.reason === 'quiet') return `${QUIET_LIMIT} moves without a mill: round ${n} is a draw. ${NEXT_ROUND}`;
  if (round.reason === 'pieces') return `${tag(round.winner)} wins round ${n}: ${tag(other(round.winner))} is down to two pieces! ${NEXT_ROUND}`;
  if (round.reason === 'blocked') return `${tag(round.winner)} wins round ${n}: ${tag(other(round.winner))} has no move left! ${NEXT_ROUND}`;
  const phase = phaseOf(round);
  if (phase === 'remove') return `Mill! ${tag(turn)}, remove a ${tag(other(turn))} piece.`;
  if (phase === 'place') {
    if (!round.moves.length) return `Round ${n}: ${tag(turn)} goes first. Tap a point to place a piece.`;
    return `${tag(turn)}, place a piece.`;
  }
  const fly = canFly(round, turn);
  if (ui.selected !== null) return `${tag(turn)}, tap a highlighted point${fly ? ' (any empty one: you can fly)' : ''}.`;
  return fly ? `${tag(turn)} has three pieces and can fly: tap a piece, then any empty point.`
    : `${tag(turn)}, tap a piece to move it.`;
}

function handText(p) {
  if (round.hand[p] > 0) return `${round.hand[p]} to place`;
  const n = onBoard(round, p);
  return canFly(round, p) && !round.winner ? `${n} left · flying` : `${n} left`;
}

/** Brings all non-board UI in line with the current state. */
function refresh({ holdScores = false } = {}) {
  const over = Boolean(round.winner);
  const active = over ? round.winner : round.turn;
  const accent = active === DRAW ? round.turn : active;
  document.body.classList.toggle('turn-o', accent === O);
  document.body.classList.toggle('turn-x', accent === X);

  for (const pill of document.querySelectorAll('.player')) {
    const on = pill.dataset.player === active;
    pill.classList.toggle('active', on);
    if (on && ui.shown.active !== active) animate(pill, { scale: [0.92, 1], duration: ms(500), ease: 'outBack(2.2)' });
    pill.querySelector('.player-hand').textContent = handText(pill.dataset.player);
  }
  ui.shown.active = active;

  if (!holdScores) {
    for (const p of [X, O]) {
      const n = match.scores[p];
      const node = document.querySelector(`[data-score="${p}"]`);
      node.textContent = n;
      if (n > ui.shown.scores[p]) pop(node.parentElement, 1.6);
      ui.shown.scores[p] = n;
    }
  }

  const hint = hintFor();
  if (hint !== ui.shown.hint) {
    const node = $('#hint');
    node.innerHTML = hint;
    animate(node, { opacity: [0, 1], x: [8, 0], duration: ms(350), ease: 'outQuad' });
    ui.shown.hint = hint;
  }

  const draws = match.scores.D;
  const notes = [`Round ${match.roundNo}`, `${draws} ${draws === 1 ? 'draw' : 'draws'}`];
  if (!over && round.quiet >= QUIET_LIMIT - 20) notes.push(`${QUIET_LIMIT - round.quiet} moves left to make a mill`);
  $('#round-note').textContent = notes.join(' · ');
  $('#btn-undo').disabled = ui.busy || !round.moves.length;
  const next = $('#btn-round');
  next.disabled = ui.busy || !round.moves.length;
  next.classList.toggle('quiet', !over);
  board.classList.toggle('live', !over && !ui.busy);
  markPoints();
}

// -------------------------------------------------------------- animations

async function intro() {
  const discs = allDiscs();
  const dots = points.map((g) => g.querySelector('.dot'));
  const mills = [...fxLayer.children];
  for (const n of [...discs, ...dots, ...mills]) n.style.opacity = '0';
  await drawStrokes(boardLines, 380);
  await animate(dots, {
    opacity: [0, 1], scale: [0, 1], duration: ms(300), delay: stag(14), ease: 'outBack(2)',
  });
  if (discs.length) {
    await animate(discs, {
      opacity: [0, 1], scale: [0.4, 1], duration: ms(360), delay: stag(30), ease: 'outBack(1.8)',
    });
  }
  clearInline([...discs, ...dots, ...mills], 'opacity', 'transform');
  if (mills.length) await drawStrokes(mills, 380);
}

async function playEnd() {
  const classes = endClasses();
  if (round.winner === DRAW) {
    await fadeIntoClass(board, classes.join(' '), allDiscs(), 450);
    return;
  }
  const losers = [...board.querySelectorAll(`.disc-${other(round.winner).toLowerCase()}`)];
  confetti($('.board-area .confetti'));
  await fadeIntoClass(board, classes.join(' '), losers, 400);
}

/** Clears the board: pieces shrink away from the centre outwards. */
async function sweep() {
  const discs = allDiscs();
  const extras = [...fxLayer.children];
  if (motion.reduced || (!discs.length && !extras.length)) return;
  utils.remove([...discs, ...extras]);
  await Promise.all([
    discs.length && animate(discs, {
      scale: 0, opacity: 0, duration: 260, delay: stag(18), ease: 'inBack(1.5)',
    }),
    extras.length && animate(extras, { opacity: 0, duration: 200, ease: 'outQuad' }),
  ]);
}

// -------------------------------------------------------------------- flow

function nudge(p) {
  shake(discAt(p) ?? points[p].querySelector('.dot'), 5);
}

/** A tap or Enter on point `p`: place, pick up, move or remove, depending on the phase. */
function tap(p, how) {
  if (ui.busy) return;
  const phase = phaseOf(round);
  if (phase === 'over') {
    // The round is over: point at the way forward.
    shake($('#hint'));
    pop($('#btn-round'), 1.08);
    return;
  }
  const owner = round.cells[p];
  if (phase === 'place') {
    if (owner) nudge(p);
    else commit({ to: p }, how);
  } else if (phase === 'remove') {
    if (removable(round).includes(p)) commit({ take: p }, how);
    else nudge(p);
  } else if (owner === round.turn) {
    if (ui.selected === p) ui.selected = null;
    else if (targets(round, p).length) ui.selected = p;
    else nudge(p);
    refresh();
  } else if (ui.selected !== null && targets(round, ui.selected).includes(p)) {
    commit({ from: ui.selected, to: p }, how);
  } else {
    nudge(p);
  }
}

async function commit(action, how) {
  ui.busy = true;
  ui.selected = null;
  if ('take' in action) {
    const lines = [...fxLayer.children];
    await Promise.all([
      animate(discAt(action.take), { scale: 0, opacity: 0, duration: ms(300), ease: 'inBack(1.6)' }),
      lines.length && animate(lines, { opacity: 0, duration: ms(250), ease: 'outQuad' }),
    ]);
  }
  round = play(round, action);
  if (round.winner) match.scores[round.winner] += 1;
  save();
  sync({ settled: false });
  const mills = [...fxLayer.children];
  for (const m of mills) m.style.opacity = '0';
  refresh({ holdScores: true });

  if ('to' in action) {
    const disc = discAt(action.to);
    if ('from' in action) {
      const [fx, fy] = xy(action.from);
      const [tx, ty] = xy(action.to);
      await animate(disc, {
        x: [fx - tx, 0], y: [fy - ty, 0], duration: ms(260 + Math.hypot(fx - tx, fy - ty) * 0.4), ease: 'inOutQuad',
      });
    } else {
      await animate(disc, { scale: [1.4, 1], opacity: [0, 1], duration: ms(420), ease: 'outBack(2)' });
    }
    clearInline([disc], 'transform', 'opacity');
  }
  clearInline(mills, 'opacity');
  if (mills.length) {
    await drawStrokes(mills, 360);
    pop($('#hint'), 1.06);
  }
  if (round.winner) await playEnd();

  ui.busy = false;
  refresh();
  if (how === 'keyboard' && round.winner) $('#btn-round').focus();
}

/**
 * Buttons are disabled while their animation runs, which takes focus away
 * from them. Gives it back, or hands it to the board if the button stays off.
 */
function restoreFocus(button) {
  (button.disabled ? points[ui.roving] : button).focus();
}

async function newRound() {
  if (ui.busy || !round.moves.length) return;
  const button = $('#btn-round');
  const focused = document.activeElement === button;
  ui.busy = true;
  ui.selected = null;
  refresh();
  await sweep();
  match.roundNo += 1;
  match.starter = other(match.starter);
  round = createRound(match.starter);
  save();
  sync();
  ui.busy = false;
  refresh();
  if (focused) restoreFocus(button);
}

function undoMove() {
  if (ui.busy || !round.moves.length) return;
  const button = $('#btn-undo');
  const focused = document.activeElement === button;
  if (round.winner) match.scores[round.winner] = Math.max(0, match.scores[round.winner] - 1);
  round = undoRound(round);
  ui.selected = null;
  save();
  sync();
  refresh();
  if (focused) restoreFocus(button);
}

async function newMatch() {
  if (ui.busy) return;
  ui.busy = true;
  ui.selected = null;
  refresh();
  await sweep();
  match = freshMatch();
  round = createRound(match.starter);
  save();
  sync();
  ui.busy = false;
  refresh();
}

// ------------------------------------------------------------------- input

const pointFrom = (target) => target.closest?.('.pt');

board.addEventListener('click', (e) => {
  const g = pointFrom(e.target);
  if (g) tap(+g.dataset.p, 'pointer');
});

// Listening on the wrapper: Chromium makes an SVG element with focus listeners a tab stop.
$('.board-area').addEventListener('focusin', (e) => {
  const g = pointFrom(e.target);
  if (g) setRoving(+g.dataset.p);
});

const ARROWS = {
  ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1],
};

/** The nearest point in the same row or column, in direction [dx, dy]. */
function step(p, [dx, dy]) {
  const [x, y] = GRID[p];
  let best = null;
  let bestDist = Infinity;
  GRID.forEach(([qx, qy], q) => {
    const d = dx ? (qx - x) * dx : (qy - y) * dy;
    const inLine = dx ? qy === y : qx === x;
    if (inLine && d > 0 && d < bestDist) {
      best = q;
      bestDist = d;
    }
  });
  return best;
}

board.addEventListener('keydown', (e) => {
  const g = pointFrom(e.target);
  if (!g || e.altKey || e.ctrlKey || e.metaKey) return;
  const p = +g.dataset.p;
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    tap(p, 'keyboard');
    return;
  }
  if (!ARROWS[e.key]) return;
  e.preventDefault();
  const q = step(p, ARROWS[e.key]);
  if (q !== null) points[q].focus();
});

$('#btn-undo').addEventListener('click', undoMove);
$('#btn-round').addEventListener('click', newRound);
$('#btn-rules').addEventListener('click', () => openDialog($('#dlg-rules')));

const matchDialog = $('#dlg-match');
$('#btn-match').addEventListener('click', () => {
  matchDialog.returnValue = '';
  openDialog(matchDialog);
});
matchDialog.addEventListener('close', () => {
  if (matchDialog.returnValue === 'start') newMatch();
});

document.addEventListener('keydown', (e) => {
  if (document.querySelector('dialog[open]')) return;
  if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'z') {
    e.preventDefault();
    undoMove();
  } else if (e.key === 'Escape' && ui.selected !== null) {
    e.preventDefault();
    ui.selected = null;
    refresh();
  }
});

// -------------------------------------------------------------------- boot

async function boot() {
  initThemeToggle($('#btn-theme'));
  setRoving(4); // top middle of the middle square
  sync();
  ui.busy = true;
  refresh();
  reveal(document.querySelectorAll('[data-reveal]'));
  await intro();
  ui.busy = false;
  refresh();
}

boot();
