// Reversi: two players on one screen place discs that trap and flip each
// other's. Scores are kept across rounds and the starting player alternates.

import {
  X, O, DRAW, SIZE, CELLS, cellAt, rowOf, colOf, countDiscs, createRound, isLegal, legalMoves,
  other, play, replayRound, undo as undoRound,
} from './game.js';
import { setDisc, morph } from './discs.js';
import {
  animate, utils, motion, ms, stag, clearInline,
} from '../../shared/js/motion.js';
import { svgEl } from '../../shared/js/marks.js';
import {
  confetti, openDialog, pop, reveal, shake,
} from '../../shared/js/effects.js';
import { createStore } from '../../shared/js/storage.js';
import { initThemeToggle } from '../../shared/js/theme.js';

const $ = (sel) => document.querySelector(sel);
const store = createStore('reversi');

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
  notice: null, // square the player just tried that isn't a legal move
  shown: { active: null, hint: '', scores: { ...match.scores } },
};

function save() {
  store.set('match', { ...match, moves: round.moves });
}

// ------------------------------------------------------------------- board

const C = 50; // square
const P = 12; // padding
const R = 19; // disc radius
const S = SIZE * C + 2 * P;
const centre = (cell) => [P + colOf(cell) * C + C / 2, P + rowOf(cell) * C + C / 2];
const where = (cell) => `row ${rowOf(cell) + 1}, column ${colOf(cell) + 1}`;

const board = $('#board');
board.setAttribute('viewBox', `0 0 ${S} ${S}`);

const gridLayer = svgEl('g', { class: 'grid', 'aria-hidden': 'true' }, board);
for (let i = 1; i < SIZE; i++) {
  const p = P + i * C;
  svgEl('path', { d: `M${p} ${P + 4}L${p} ${S - P - 4}` }, gridLayer);
  svgEl('path', { d: `M${P + 4} ${p}L${S - P - 4} ${p}` }, gridLayer);
}

const cellsLayer = svgEl('g', { class: 'cells' }, board);
// Each square is a positioned group around a body that is free to shake.
const cells = Array.from({ length: CELLS }, (_, cell) => {
  const [x, y] = centre(cell);
  const g = svgEl('g', {
    class: 'cell', 'data-cell': cell, transform: `translate(${x} ${y})`, role: 'button', tabindex: -1,
  }, cellsLayer);
  const body = svgEl('g', { class: 'cell-body' }, g);
  svgEl('rect', {
    class: 'cell-hit', x: -C / 2 + 3, y: -C / 2 + 3, width: C - 6, height: C - 6, rx: 9,
  }, body);
  svgEl('circle', { class: 'move-dot', r: 6 }, body);
  svgEl('g', { class: 'slot' }, body);
  return g;
});
const slots = cells.map((g) => g.querySelector('.slot'));
const allDiscs = () => slots.map((slot) => slot.firstChild).filter(Boolean);

/** Makes the board match `round` exactly, without animating. */
function sync() {
  utils.remove(board.querySelectorAll('*'));
  round.cells.forEach((player, cell) => setDisc(slots[cell], player, R));
  board.classList.toggle('over', Boolean(round.winner));
  board.classList.toggle('won-x', round.winner === X);
  board.classList.toggle('won-o', round.winner === O);
}

/** One square is in the tab order; arrow keys move between squares. */
function setRoving(index) {
  cells.forEach((g, cell) => g.setAttribute('tabindex', cell === index ? 0 : -1));
}

function labelCells() {
  const legal = new Set(ui.busy ? [] : legalMoves(round));
  const last = round.moves.at(-1);
  cells.forEach((g, cell) => {
    const player = round.cells[cell];
    let state = player ? NAMES[player] : 'empty';
    if (legal.has(cell)) state += ', you can play here';
    g.setAttribute('aria-label', `Row ${rowOf(cell) + 1}, column ${colOf(cell) + 1}, ${state}`);
    g.classList.toggle('legal', legal.has(cell));
    g.classList.toggle('last', cell === last);
  });
}

// ------------------------------------------------------------------ status

const tag = (p) => `<strong class="${p.toLowerCase()}">${NAMES[p]}</strong>`;
const discs = (n) => `${n} ${n === 1 ? 'disc' : 'discs'}`;
const NEXT_ROUND = 'Start a new round when you’re ready.';

/** What the last move did, for screen readers; everyone else watches the discs flip. */
function lastMove() {
  const cell = round.moves.at(-1);
  const counts = countDiscs(round.cells);
  const n = round.flipped.length;
  return `<span class="sr-only">${NAMES[round.cells[cell]]} played ${where(cell)} and flipped ${discs(n)}. `
    + `Red ${counts[X]}, Blue ${counts[O]}. </span>`;
}

function hintFor() {
  const n = match.roundNo;
  const counts = countDiscs(round.cells);
  const done = round.cells.includes(null) ? 'Neither player can move. ' : '';
  if (round.winner === DRAW) return `${lastMove()}${done}${counts[X]} discs each: round ${n} is a draw. ${NEXT_ROUND}`;
  if (round.winner) {
    const loser = other(round.winner);
    return `${lastMove()}${done}${tag(round.winner)} wins round ${n}, ${counts[round.winner]} to ${counts[loser]}! ${NEXT_ROUND}`;
  }
  if (ui.notice !== null) return `That square traps no discs. ${tag(round.turn)}, pick a square with a dot.`;
  if (!round.moves.length) return `Round ${n}: ${tag(round.turn)} goes first. Tap a square with a dot.`;
  if (round.passed) return `${lastMove()}${tag(round.passed)} has no move and passes. ${tag(round.turn)} plays again.`;
  return `${lastMove()}${tag(round.turn)} to move.`;
}

/** Brings all non-board UI in line with the current state. */
function refresh({ holdScores = false } = {}) {
  const over = Boolean(round.winner);
  const active = over ? round.winner : round.turn; // 'D' after a draw: no player highlighted
  const accent = active === DRAW ? round.turn : active;
  document.body.classList.toggle('turn-o', accent === O);
  document.body.classList.toggle('turn-x', accent === X);

  const counts = countDiscs(round.cells);
  for (const pill of document.querySelectorAll('.player')) {
    const p = pill.dataset.player;
    const on = p === active;
    pill.classList.toggle('active', on);
    if (on && ui.shown.active !== active) animate(pill, { scale: [0.92, 1], duration: ms(500), ease: 'outBack(2.2)' });
    pill.querySelector('[data-count]').textContent = discs(counts[p]);
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
  $('#round-note').textContent = `Round ${match.roundNo} · ${draws} ${draws === 1 ? 'draw' : 'draws'}`;
  $('#btn-undo').disabled = ui.busy || !round.moves.length;
  const next = $('#btn-round');
  next.disabled = ui.busy || !round.moves.length;
  next.classList.toggle('quiet', !over);
  board.classList.toggle('live', !over && !ui.busy);
  labelCells();
}

// -------------------------------------------------------------- animations

async function intro() {
  const list = allDiscs();
  if (!list.length) return;
  await animate(list, {
    scale: [0, 1], duration: ms(380), delay: stag(12), ease: 'outBack(1.8)',
  });
  clearInline(list, 'transform');
}

/** Clears the board: discs shrink away row by row. */
async function sweep() {
  const list = allDiscs();
  if (motion.reduced || !list.length) return;
  utils.remove(list);
  await animate(list, {
    scale: 0, duration: 260, delay: stag(8), ease: 'inBack(1.4)',
  });
}

async function playEnd() {
  board.classList.add('over');
  if (round.winner === DRAW) return;
  board.classList.add(`won-${round.winner.toLowerCase()}`);
  confetti($('.board-area .confetti'));
  const winners = allDiscs().filter((d) => d.classList.contains(`disc-${round.winner.toLowerCase()}`));
  await animate(winners, {
    scale: [1, 1.15, 1], duration: ms(500), delay: stag(12), ease: 'inOutQuad',
  });
  clearInline(winners, 'transform');
}

// -------------------------------------------------------------------- flow

async function place(cell, how) {
  if (ui.busy) return;
  if (round.winner) {
    // The round is over: point at the way forward.
    shake($('#hint'));
    pop($('#btn-round'), 1.08);
    return;
  }
  if (!isLegal(round, cell)) {
    ui.notice = cell;
    refresh();
    shake(cells[cell].querySelector('.cell-body'), 4);
    return;
  }
  ui.busy = true;
  ui.notice = null;
  const before = round.cells;
  round = play(round, cell);
  if (round.winner) match.scores[round.winner] += 1;
  save();
  refresh({ holdScores: true });

  await morph(slots, before, round.cells, cell, R);
  if (round.passed) shake(document.querySelector(`.player[data-player="${round.passed}"]`));
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
  (button.disabled ? board.querySelector('.cell[tabindex="0"]') : button).focus();
}

async function newRound() {
  if (ui.busy || !round.moves.length) return;
  const button = $('#btn-round');
  const focused = document.activeElement === button;
  ui.busy = true;
  ui.notice = null;
  refresh();
  await sweep();
  match.roundNo += 1;
  match.starter = other(match.starter);
  round = createRound(match.starter);
  save();
  sync();
  await intro();
  ui.busy = false;
  refresh();
  if (focused) restoreFocus(button);
}

async function undoMove() {
  if (ui.busy || !round.moves.length) return;
  const button = $('#btn-undo');
  const focused = document.activeElement === button;
  ui.busy = true;
  ui.notice = null;
  const result = round.winner;
  const last = round.moves.at(-1);
  const before = round.cells;
  round = undoRound(round);
  if (result) match.scores[result] = Math.max(0, match.scores[result] - 1);
  save();
  board.classList.remove('over', 'won-x', 'won-o');
  refresh();
  await morph(slots, before, round.cells, last, R);
  sync();
  ui.busy = false;
  refresh();
  if (focused) restoreFocus(button);
}

async function newMatch() {
  if (ui.busy) return;
  ui.busy = true;
  ui.notice = null;
  refresh();
  await sweep();
  match = freshMatch();
  round = createRound(match.starter);
  save();
  sync();
  await intro();
  ui.busy = false;
  refresh();
}

// ------------------------------------------------------------------- input

board.addEventListener('click', (e) => {
  const g = e.target.closest('.cell');
  if (g) place(+g.dataset.cell, 'pointer');
});

// Listening on the wrapper: Chromium makes an SVG element with focus listeners a tab stop.
board.parentElement.addEventListener('focusin', (e) => {
  const g = e.target.closest?.('.cell');
  if (g) setRoving(+g.dataset.cell);
});

board.addEventListener('keydown', (e) => {
  const g = e.target.closest?.('.cell');
  if (!g || e.altKey || e.ctrlKey || e.metaKey) return;
  const cell = +g.dataset.cell;
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    place(cell, 'keyboard');
    return;
  }
  const step = {
    ArrowLeft: [0, -1], ArrowRight: [0, 1], ArrowUp: [-1, 0], ArrowDown: [1, 0],
  }[e.key];
  if (!step) return;
  e.preventDefault();
  const row = rowOf(cell) + step[0];
  const col = colOf(cell) + step[1];
  if (row >= 0 && row < SIZE && col >= 0 && col < SIZE) cells[cellAt(row, col)].focus();
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
  if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z') {
    e.preventDefault();
    undoMove();
  }
});

// -------------------------------------------------------------------- boot

async function boot() {
  initThemeToggle($('#btn-theme'));
  setRoving(legalMoves(round)[0] ?? cellAt(3, 3));
  sync();
  ui.busy = true;
  refresh();
  reveal(document.querySelectorAll('[data-reveal]'));
  await intro();
  ui.busy = false;
  refresh();
}

boot();
