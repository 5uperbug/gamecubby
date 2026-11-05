// Classic tic-tac-toe: two players on one screen, scores kept across rounds.
// The starting player alternates every round.

import {
  X, O, DRAW, createRound, isLegal, play, replayRound, undo as undoRound,
} from './game.js';
import { POSITION_NAMES, other } from '../../shared/js/tictactoe.js';
import {
  animate, stagger, utils, motion, ms, stag, clearInline,
} from '../../shared/js/motion.js';
import {
  svgEl, createMark, lineThrough, drawStrokes,
} from '../../shared/js/marks.js';
import {
  confetti, fadeIntoClass, openDialog, pop, reveal, shake,
} from '../../shared/js/effects.js';
import { createStore } from '../../shared/js/storage.js';
import { initThemeToggle } from '../../shared/js/theme.js';

const $ = (sel) => document.querySelector(sel);
const store = createStore('tic-tac-toe');

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
  shown: { active: null, hint: '', scores: { ...match.scores } },
};

function save() {
  store.set('match', { ...match, moves: round.moves });
}

// ------------------------------------------------------------------- board

const SIZE = 300;
const PAD = 15;
const CELL = 90;
const cellXY = (c) => [PAD + (c % 3) * CELL, PAD + Math.floor(c / 3) * CELL];
const cellCenter = (c) => cellXY(c).map((v) => v + CELL / 2);
const cellName = (c) => POSITION_NAMES[c].replace(/^./, (s) => s.toUpperCase());

const board = $('#board');
board.setAttribute('viewBox', `0 0 ${SIZE} ${SIZE}`);

const gridLayer = svgEl('g', { class: 'grid', 'aria-hidden': 'true' }, board);
for (const i of [1, 2]) {
  const p = PAD + i * CELL;
  svgEl('path', { d: `M${p} ${PAD + 10}L${p} ${SIZE - PAD - 10}` }, gridLayer);
  svgEl('path', { d: `M${PAD + 10} ${p}L${SIZE - PAD - 10} ${p}` }, gridLayer);
}

const cellsLayer = svgEl('g', { class: 'cells' }, board);
const cells = Array.from({ length: 9 }, (_, c) => {
  const [x, y] = cellXY(c);
  const cell = svgEl('g', {
    class: 'cell', 'data-cell': c, transform: `translate(${x} ${y})`, role: 'button', tabindex: -1,
  }, cellsLayer);
  svgEl('rect', { class: 'cell-hit', x: 6, y: 6, width: CELL - 12, height: CELL - 12, rx: 14 }, cell);
  svgEl('g', { class: 'slot' }, cell);
  return cell;
});

const fxLayer = svgEl('g', { class: 'fx', 'aria-hidden': 'true' }, board);

const markOf = (c) => cells[c].querySelector('.mark');

function setCell(c, player) {
  const cell = cells[c];
  const slot = cell.querySelector('.slot');
  slot.replaceChildren();
  if (player) slot.appendChild(createMark(player, CELL, 24));
  cell.classList.toggle('filled', Boolean(player));
  cell.setAttribute('aria-label', `${cellName(c)}, ${player ? `taken by ${player}` : 'empty'}`);
}

function addWinLine() {
  const p = round.winner.toLowerCase();
  return svgEl('path', { class: `win-line line-${p}`, d: lineThrough(round.line.map(cellCenter), 26) }, fxLayer);
}

/** Makes the board match `round` exactly, without animating. */
function sync() {
  utils.remove(board.querySelectorAll('*'));
  fxLayer.replaceChildren();
  board.classList.remove('over', 'drawn');
  cells.forEach((cell, c) => {
    cell.classList.remove('win');
    clearInline([cell.querySelector('.slot')], 'transform');
    setCell(c, round.cells[c]);
  });
  if (round.winner) board.classList.add('over');
  if (round.winner === DRAW) board.classList.add('drawn');
  if (round.line) {
    round.line.forEach((c) => cells[c].classList.add('win'));
    addWinLine();
  }
}

/** One cell is in the tab order; arrow keys move between cells. */
function setRoving(index) {
  cells.forEach((cell, c) => cell.setAttribute('tabindex', c === index ? 0 : -1));
}

// ------------------------------------------------------------------ status

const tag = (p) => `<strong class="${p.toLowerCase()}">${p}</strong>`;

function hintFor() {
  const n = match.roundNo;
  if (round.winner === DRAW) return `Round ${n} is a draw. Start a new round when you’re ready.`;
  if (round.winner) return `${tag(round.winner)} wins round ${n}! Start a new round when you’re ready.`;
  if (!round.moves.length) return `Round ${n}: ${tag(round.turn)} goes first. Tap a square.`;
  return `${tag(round.turn)} to move.`;
}

/** Brings all non-board UI in line with the current state. */
function refresh({ holdScores = false } = {}) {
  const over = Boolean(round.winner);
  const active = over ? round.winner : round.turn; // 'D' after a draw: no player highlighted
  const accent = active === DRAW ? round.turn : active;
  document.body.classList.toggle('turn-o', accent === O);
  document.body.classList.toggle('turn-x', accent === X);

  for (const pill of document.querySelectorAll('.player')) {
    const on = pill.dataset.player === active;
    pill.classList.toggle('active', on);
    if (on && ui.shown.active !== active) animate(pill, { scale: [0.92, 1], duration: ms(500), ease: 'outBack(2.2)' });
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
}

// -------------------------------------------------------------- animations

async function intro() {
  const lines = [...gridLayer.querySelectorAll('path')];
  const marks = [...board.querySelectorAll('.cell .mark')];
  const winLines = [...fxLayer.children];
  const targets = marks.map((m) => parseFloat(getComputedStyle(m).opacity));
  for (const m of [...marks, ...winLines]) m.style.opacity = '0';
  await drawStrokes(lines, 320);
  await Promise.all(marks.map((m, i) => animate(m, {
    opacity: [0, targets[i]], scale: [0.5, 1], duration: ms(420), delay: ms(i * 60), ease: 'outBack(1.8)',
  })));
  clearInline([...marks, ...winLines], 'opacity', 'transform');
  if (winLines.length) await drawStrokes(winLines, 360);
}

async function playWin() {
  const line = addWinLine();
  await drawStrokes([line], 380);
  round.line.forEach((c) => cells[c].classList.add('win'));
  const winners = round.line.map((c) => markOf(c));
  const others = [...board.querySelectorAll('.cell:not(.win) .mark')];
  confetti($('.board-area .confetti'));
  await Promise.all([
    animate(winners, { scale: [1, 1.2, 1], duration: ms(560), delay: stag(90), ease: 'inOutQuad' }),
    fadeIntoClass(board, 'over', others, 400),
  ]);
  clearInline(winners, 'transform');
}

async function playDraw() {
  const marks = [...board.querySelectorAll('.cell .mark')];
  await Promise.all([
    animate(marks, {
      rotate: [0, -12, 9, -4, 0], duration: ms(650), delay: stag(35, { from: 'center' }), ease: 'inOutSine',
    }),
    fadeIntoClass(board, 'over drawn', marks, 450),
  ]);
  clearInline(marks, 'transform');
}

/** Clears the board with a quick scatter. */
async function sweep() {
  const marks = [...board.querySelectorAll('.cell .mark')];
  const lines = [...fxLayer.children];
  if (motion.reduced || (!marks.length && !lines.length)) return;
  utils.remove([...marks, ...lines]);
  await Promise.all([
    marks.length && animate(marks, {
      opacity: 0, scale: 0.3, duration: 260, delay: stagger(30, { from: 'random' }), ease: 'inBack(1.6)',
    }),
    lines.length && animate(lines, { opacity: 0, duration: 200, ease: 'outQuad' }),
  ]);
}

// -------------------------------------------------------------------- flow

async function place(c, how) {
  if (ui.busy) return;
  if (round.winner) {
    // The round is over: point at the way forward.
    shake($('#hint'));
    pop($('#btn-round'), 1.08);
    return;
  }
  if (!isLegal(round, c)) {
    shake(cells[c].querySelector('.slot'), 6);
    return;
  }
  ui.busy = true;
  const player = round.turn;
  round = play(round, c);
  if (round.winner) match.scores[round.winner] += 1;
  save();
  refresh({ holdScores: true });

  setCell(c, player);
  const mark = markOf(c);
  drawStrokes([...mark.querySelectorAll('path')], 220);
  await animate(mark, { scale: [1.4, 1], duration: ms(520), ease: 'outElastic(1, .55)' });
  clearInline([mark], 'transform');

  if (round.winner === DRAW) await playDraw();
  else if (round.winner) await playWin();

  ui.busy = false;
  refresh();
  if (how === 'keyboard' && round.winner) $('#btn-round').focus();
}

async function newRound() {
  if (ui.busy || !round.moves.length) return;
  ui.busy = true;
  refresh();
  await sweep();
  match.roundNo += 1;
  match.starter = other(match.starter);
  round = createRound(match.starter);
  save();
  sync();
  ui.busy = false;
  refresh();
}

async function undoMove() {
  if (ui.busy || !round.moves.length) return;
  ui.busy = true;
  refresh();
  const last = round.moves.at(-1);
  const result = round.winner;
  const lines = [...fxLayer.children];
  await Promise.all([
    animate(markOf(last), { opacity: 0, scale: 0.4, duration: ms(240), ease: 'inBack(1.5)' }),
    lines.length && animate(lines, { opacity: 0, duration: ms(200), ease: 'outQuad' }),
  ]);
  round = undoRound(round);
  if (result) match.scores[result] = Math.max(0, match.scores[result] - 1);
  save();
  sync();
  ui.busy = false;
  refresh();
}

async function newMatch() {
  if (ui.busy) return;
  ui.busy = true;
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

board.addEventListener('click', (e) => {
  const cell = e.target.closest('.cell');
  if (cell) place(+cell.dataset.cell, 'pointer');
});

board.addEventListener('focusin', (e) => {
  const cell = e.target.closest?.('.cell');
  if (cell) setRoving(+cell.dataset.cell);
});

board.addEventListener('keydown', (e) => {
  const cell = e.target.closest?.('.cell');
  if (!cell) return;
  const c = +cell.dataset.cell;
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    place(c, 'keyboard');
    return;
  }
  const delta = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -3, ArrowDown: 3 }[e.key];
  if (delta === undefined) return;
  e.preventDefault();
  const col = c % 3;
  if ((delta === -1 && col === 0) || (delta === 1 && col === 2)) return;
  const next = c + delta;
  if (next >= 0 && next < 9) cells[next].focus();
});

$('#btn-undo').addEventListener('click', undoMove);
$('#btn-round').addEventListener('click', newRound);

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
  setRoving(0);
  sync();
  ui.busy = true;
  refresh();
  reveal(document.querySelectorAll('[data-reveal]'));
  await intro();
  ui.busy = false;
  refresh();
}

boot();
