// Order and Chaos: two players on one screen who swap roles every round.
// Order tries to line up five identical symbols, Chaos tries to fill the
// board first, and on every turn either of them may place an X or an O.
// A move is two steps: select a square, then choose the symbol.

import {
  X, O, ORDER, CHAOS, P1, P2, SIDE, CELL_COUNT,
  createRound, play, replayRound, undo as undoRound, threats,
  roleOf, playerFor, roundWinner, rowOf, colOf,
} from './game.js';
import {
  animate, svg, utils, motion, ms, stag, clearInline,
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
const store = createStore('order-and-chaos');

const NAMES = { [P1]: 'Player 1', [P2]: 'Player 2' };
const ROLE_NAMES = { [ORDER]: 'Order', [CHAOS]: 'Chaos' };

// ------------------------------------------------------------------- state

const freshMatch = () => ({ scores: { [P1]: 0, [P2]: 0 }, roundNo: 1 });

function loadMatch() {
  const saved = store.get('match');
  const match = freshMatch();
  if (!saved || typeof saved !== 'object') return { match, moves: [] };
  for (const p of [P1, P2]) {
    const n = saved.scores?.[p];
    if (Number.isInteger(n) && n >= 0) match.scores[p] = n;
  }
  if (Number.isInteger(saved.roundNo) && saved.roundNo > 0) match.roundNo = saved.roundNo;
  return { match, moves: Array.isArray(saved.moves) ? saved.moves : [] };
}

const loaded = loadMatch();
let match = loaded.match;
let round = replayRound(loaded.moves);
let prefs = { threats: store.get('prefs')?.threats === true };

const ui = {
  busy: false, // an animation owns the board
  selected: null, // square picked for the next move, waiting for X or O
  tips: new Map(), // cell → symbols that would complete five there
  shown: { active: null, hint: '', scores: { ...match.scores } },
};

function save() {
  store.set('match', { ...match, moves: round.moves });
}

// ------------------------------------------------------------------- board

const SIZE = 312;
const PAD = 12;
const CELL = 48;
const TIP = 12; // threat mark size
const cellXY = (c) => [PAD + colOf(c) * CELL, PAD + rowOf(c) * CELL];
const cellCenter = (c) => cellXY(c).map((v) => v + CELL / 2);
const cellName = (c) => `Row ${rowOf(c) + 1}, column ${colOf(c) + 1}`;

const board = $('#board');
board.setAttribute('viewBox', `0 0 ${SIZE} ${SIZE}`);

const gridLayer = svgEl('g', { class: 'grid', 'aria-hidden': 'true' }, board);
for (let i = 1; i < SIDE; i++) {
  const p = PAD + i * CELL;
  svgEl('path', { d: `M${p} ${PAD + 6}L${p} ${SIZE - PAD - 6}`, 'data-i': i }, gridLayer);
  svgEl('path', { d: `M${PAD + 6} ${p}L${SIZE - PAD - 6} ${p}`, 'data-i': i }, gridLayer);
}

// One frame marks the selected square and glides when the selection moves.
const cursor = svgEl('g', { class: 'cursor', 'aria-hidden': 'true' }, board);
const cursorBox = svgEl('rect', {
  class: 'cursor-box', x: 4, y: 4, width: CELL - 8, height: CELL - 8, rx: 9,
}, cursor);
const cursorAt = { x: 0, y: 0 };
const moveCursor = () => cursor.setAttribute('transform', `translate(${cursorAt.x} ${cursorAt.y})`);

const cellsLayer = svgEl('g', { class: 'cells' }, board);
const cells = Array.from({ length: CELL_COUNT }, (_, c) => {
  const [x, y] = cellXY(c);
  const cell = svgEl('g', {
    class: 'cell', 'data-cell': c, transform: `translate(${x} ${y})`, role: 'button', tabindex: -1,
  }, cellsLayer);
  svgEl('rect', { class: 'cell-hit', x: 2, y: 2, width: CELL - 4, height: CELL - 4, rx: 10 }, cell);
  svgEl('g', { class: 'tip' }, cell);
  svgEl('g', { class: 'slot' }, cell);
  return cell;
});

const fxLayer = svgEl('g', { class: 'fx', 'aria-hidden': 'true' }, board);

const markOf = (c) => cells[c].querySelector('.slot .mark');

function setCell(c, symbol) {
  const cell = cells[c];
  const slot = cell.querySelector('.slot');
  slot.replaceChildren();
  if (symbol) slot.appendChild(createMark(symbol, CELL, 12));
  cell.classList.toggle('filled', Boolean(symbol));
}

function markLast() {
  const last = round.moves.at(-1);
  cells.forEach((cell, c) => cell.classList.toggle('last', c === last?.cell));
}

function labelCells() {
  cells.forEach((cell, c) => {
    const parts = [cellName(c), round.cells[c] || 'empty'];
    cell.classList.toggle('selected', c === ui.selected);
    if (c === ui.selected) parts.push('selected');
    const tips = ui.tips.get(c);
    if (tips) parts.push(`${tips.join(' or ')} here makes five`);
    cell.setAttribute('aria-label', parts.join(', '));
  });
}

function addWinLine() {
  const { line } = round;
  const symbol = round.cells[line[0]].toLowerCase();
  const ends = [cellCenter(line[0]), cellCenter(line.at(-1))];
  return svgEl('path', { class: `win-line line-${symbol}`, d: lineThrough(ends, 16) }, fxLayer);
}

/** Shows or hides the threat marks. Returns the marks that just appeared. */
function syncTips() {
  const list = prefs.threats && !round.winner ? threats(round.cells) : [];
  ui.tips = new Map(list.map((t) => [t.cell, t.symbols]));
  const added = [];
  cells.forEach((cell, c) => {
    const tip = cell.querySelector('.tip');
    const symbols = ui.tips.get(c) || [];
    const key = symbols.join('');
    if ((tip.dataset.key || '') === key) return;
    tip.dataset.key = key;
    tip.replaceChildren();
    symbols.forEach((symbol, i) => {
      const x = CELL - 5 - TIP * (symbols.length - i) - 2 * (symbols.length - 1 - i);
      const holder = svgEl('g', { transform: `translate(${x} 5)` }, tip);
      holder.appendChild(createMark(symbol, TIP, 2));
      added.push(holder);
    });
  });
  return added;
}

/** Makes the board match `round` exactly, without animating. */
function sync() {
  utils.remove(board.querySelectorAll('*'));
  fxLayer.replaceChildren();
  board.classList.remove('over', `won-${ORDER}`, `won-${CHAOS}`);
  cells.forEach((cell, c) => {
    cell.classList.remove('win');
    clearInline([cell.querySelector('.slot')], 'transform');
    setCell(c, round.cells[c]);
  });
  if (round.winner) board.classList.add('over', `won-${round.winner}`);
  if (round.line) {
    round.line.forEach((c) => cells[c].classList.add('win'));
    addWinLine();
  }
  markLast();
  syncTips();
}

/** One cell is in the tab order; arrow keys move between cells. */
function setRoving(index) {
  cells.forEach((cell, c) => cell.setAttribute('tabindex', c === index ? 0 : -1));
}

// --------------------------------------------------------------- selection

function showCursor(c) {
  const [x, y] = cellXY(c);
  const appearing = !cursor.classList.contains('on');
  utils.remove(cursorAt);
  cursor.classList.add('on');
  if (appearing) {
    Object.assign(cursorAt, { x, y });
    moveCursor();
    animate(cursorBox, { scale: [0.6, 1], duration: ms(320), ease: 'outBack(2.2)' });
  } else {
    animate(cursorAt, {
      x, y, duration: ms(170), ease: 'outQuad', onUpdate: moveCursor, onComplete: moveCursor,
    });
  }
}

function clearSelection() {
  if (ui.selected === null) return;
  ui.selected = null;
  utils.remove(cursorAt);
  cursor.classList.remove('on');
}

function select(c) {
  if (ui.busy) return;
  if (round.winner) {
    // The round is over: point at the way forward.
    shake($('#hint'));
    pop($('#btn-round'), 1.08);
    return;
  }
  if (round.cells[c] !== null) {
    shake(cells[c].querySelector('.slot'), 4);
    return;
  }
  const buttons = [$('#btn-x'), $('#btn-o')];
  if (ui.selected === c) {
    animate(buttons, { scale: [1.06, 1], duration: ms(400), ease: 'outBack(2.5)' });
    return;
  }
  const first = ui.selected === null;
  ui.selected = c;
  setRoving(c);
  showCursor(c);
  refresh();
  if (first) animate(buttons, { scale: [0.94, 1], duration: ms(450), delay: stag(60), ease: 'outBack(2.5)' });
}

/** Keyboard focus carries the selection: an empty square is selected, a full one clears it. */
function follow(c) {
  if (ui.busy || round.winner || ui.selected === c) return;
  if (round.cells[c] === null) {
    select(c);
  } else if (ui.selected !== null) {
    clearSelection();
    refresh();
  }
}

/** Catches up with keyboard focus that moved while an animation had the board. */
function followFocus() {
  const cell = document.activeElement?.closest?.('.cell');
  if (cell && board.contains(cell) && cell.matches(':focus-visible')) follow(+cell.dataset.cell);
}

// ------------------------------------------------------------------ status

const pills = [...document.querySelectorAll('.player')];

const who = (player) => `<strong>${NAMES[player]}</strong>`;
const roleTag = (role) => `<strong class="${role}">${ROLE_NAMES[role]}</strong>`;
const symbols = `<strong class="x">X</strong> or <strong class="o">O</strong>`;

function hintFor() {
  const n = match.roundNo;
  if (round.winner === ORDER) {
    return `Five in a row! ${who(roundWinner(round, n))} wins round ${n} as ${roleTag(ORDER)}.`;
  }
  if (round.winner === CHAOS) {
    return `The board is full with no five. ${who(roundWinner(round, n))} wins round ${n} as ${roleTag(CHAOS)}.`;
  }
  const player = who(playerFor(round.turn, n));
  const role = roleTag(round.turn);
  if (ui.selected !== null) {
    const c = ui.selected;
    return `${player} (${role}): choose ${symbols} for row ${rowOf(c) + 1}, column ${colOf(c) + 1}.`;
  }
  if (!round.moves.length) return `Round ${n}: ${player} is ${role} and goes first. Tap a square.`;
  if (round.turn === ORDER) return `${player} (${role}): line up five. Tap a square.`;
  return `${player} (${role}): block the five. Tap a square.`;
}

/** Puts each player's current role on their pill. */
function setRoles() {
  for (const pill of pills) {
    const role = roleOf(pill.dataset.player, match.roundNo);
    const chip = pill.querySelector('.role');
    pill.dataset.role = role;
    chip.dataset.role = role;
    chip.querySelector('.role-name').textContent = ROLE_NAMES[role];
  }
}

/** Brings all non-board UI in line with the current state. */
function refresh({ holdScores = false } = {}) {
  const over = Boolean(round.winner);
  const role = over ? round.winner : round.turn;
  const active = playerFor(role, match.roundNo);
  document.body.classList.toggle('turn-order', role === ORDER);
  document.body.classList.toggle('turn-chaos', role === CHAOS);

  setRoles();
  for (const pill of pills) {
    const on = pill.dataset.player === active;
    pill.classList.toggle('active', on);
    if (on && ui.shown.active !== active) animate(pill, { scale: [0.92, 1], duration: ms(500), ease: 'outBack(2.2)' });
  }
  ui.shown.active = active;

  if (!holdScores) {
    for (const p of [P1, P2]) {
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

  const left = round.cells.filter((s) => s === null).length;
  $('#round-note').textContent = `Round ${match.roundNo} · ${left} ${left === 1 ? 'square' : 'squares'} left`;

  const canPlace = !ui.busy && !over && ui.selected !== null;
  $('#btn-x').disabled = !canPlace;
  $('#btn-o').disabled = !canPlace;
  $('#btn-undo').disabled = ui.busy || !round.moves.length;
  const next = $('#btn-round');
  next.disabled = ui.busy || !round.moves.length;
  next.classList.toggle('quiet', !over);
  board.classList.toggle('live', !over && !ui.busy);
  labelCells();
}

// -------------------------------------------------------------- animations

async function intro() {
  const lines = [...gridLayer.children];
  const marks = [...board.querySelectorAll('.slot .mark')];
  const tips = [...board.querySelectorAll('.tip > g')];
  const winLines = [...fxLayer.children];
  const targets = marks.map((m) => parseFloat(getComputedStyle(m).opacity));
  for (const n of [...marks, ...tips, ...winLines]) n.style.opacity = '0';
  // Grid lines grow from their middles, rippling out from the centre of the board.
  await animate(svg.createDrawable(lines), {
    draw: ['0.5 0.5', '0 1'],
    duration: ms(460),
    delay: (line) => ms(Math.abs(line.dataset.i - SIDE / 2) * 70),
    ease: 'outQuad',
  });
  await Promise.all(marks.map((m, i) => animate(m, {
    opacity: [0, targets[i]], scale: [0.5, 1], duration: ms(420), delay: ms(i * 22), ease: 'outBack(1.8)',
  })));
  clearInline([...marks, ...winLines], 'opacity', 'transform');
  if (winLines.length) await drawStrokes(winLines, 420);
  if (tips.length) await animate(tips, { opacity: [0, 1], duration: ms(300), ease: 'outQuad' });
  clearInline(tips, 'opacity');
}

function showTips(added) {
  if (!added.length) return;
  animate(added, { opacity: [0, 1], duration: ms(300), delay: stag(40), ease: 'outQuad' });
  animate(added.map((h) => h.firstChild), { scale: [0.3, 1], duration: ms(420), delay: stag(40), ease: 'outBack(2)' });
}

async function playOrderWin() {
  const line = addWinLine();
  await drawStrokes([line], 420);
  round.line.forEach((c) => cells[c].classList.add('win'));
  const winners = round.line.map(markOf);
  const others = [...board.querySelectorAll('.cell:not(.win) .slot .mark')];
  confetti($('.board-area .confetti'));
  await Promise.all([
    animate(winners, { scale: [1, 1.25, 1], duration: ms(560), delay: stag(80), ease: 'inOutQuad' }),
    fadeIntoClass(board, `over won-${ORDER}`, others, 400),
  ]);
  clearInline(winners, 'transform');
}

/** The full board shudders, settles, and takes on Chaos's colour. */
async function playChaosWin() {
  const marks = [...board.querySelectorAll('.slot .mark')];
  const r = (n) => utils.random(-n, n);
  await Promise.all([
    ...marks.map((m) => animate(m, {
      x: [0, r(3), r(3), r(2), 0],
      y: [0, r(3), r(3), r(2), 0],
      rotate: [0, r(16), r(16), r(8), 0],
      duration: ms(760),
      delay: ms(utils.random(0, 120)),
      ease: 'inOutSine',
    })),
    animate(board, { x: [0, -6, 6, -4, 4, -2, 0], duration: ms(760), ease: 'inOutSine' }),
  ]);
  clearInline([...marks, board], 'transform');
  confetti($('.board-area .confetti'));
  await Promise.all([
    animate(marks, {
      scale: [1, 0.82, 1], duration: ms(520), delay: stag(14, { grid: [SIDE, SIDE], from: 'center' }), ease: 'inOutQuad',
    }),
    fadeIntoClass(board, `over won-${CHAOS}`, marks, 500),
  ]);
  clearInline(marks, 'transform');
}

/** Clears the board with a sweep from left to right. */
async function sweep() {
  const marks = [...board.querySelectorAll('.slot .mark')];
  const extras = [...fxLayer.children, ...board.querySelectorAll('.tip > g')];
  if (motion.reduced || (!marks.length && !extras.length)) return;
  utils.remove([...marks, ...extras]);
  const cols = marks.map((m) => colOf(+m.closest('.cell').dataset.cell));
  await Promise.all([
    marks.length && animate(marks, {
      x: 22, opacity: 0, scale: 0.4, duration: 280,
      delay: (_, i) => cols[i] * 50 + utils.random(0, 40),
      ease: 'inBack(1.4)',
    }),
    extras.length && animate(extras, { opacity: 0, duration: 200, ease: 'outQuad' }),
  ]);
}

/** The roles change hands: each role chip flies across to its new player. */
async function swapRoles() {
  const chips = pills.map((p) => p.querySelector('.role'));
  if (motion.reduced) {
    setRoles();
    return;
  }
  const from = chips.map((chip) => chip.getBoundingClientRect());
  const ghosts = chips.map((chip, i) => {
    const ghost = chip.cloneNode(true);
    ghost.classList.add('flying');
    ghost.setAttribute('aria-hidden', 'true');
    Object.assign(ghost.style, {
      left: `${from[i].left}px`,
      top: `${from[i].top}px`,
      width: `${from[i].width}px`,
      height: `${from[i].height}px`,
      zIndex: i === 0 ? 21 : 20, // the chip that grows passes in front
    });
    document.body.appendChild(ghost);
    return ghost;
  });
  chips.forEach((chip) => { chip.style.visibility = 'hidden'; });
  setRoles();
  const to = chips.map((chip) => chip.getBoundingClientRect());
  refresh(); // the new round's pills and hint, while the chips are in the air
  await Promise.all(ghosts.map((ghost, i) => animate(ghost, {
    x: to[1 - i].left - from[i].left,
    y: to[1 - i].top - from[i].top,
    scale: i === 0 ? [1, 1.18, 1] : [1, 0.86, 1],
    duration: 760,
    ease: 'inOutCubic',
  })));
  // Land: the real chips take over underneath as the copies fade.
  clearInline(chips, 'visibility');
  await animate(ghosts, { opacity: 0, duration: 160, ease: 'outQuad' });
  ghosts.forEach((ghost) => ghost.remove());
}

// -------------------------------------------------------------------- flow

async function place(symbol, how) {
  if (ui.busy) return;
  if (round.winner) {
    // The round is over: point at the way forward.
    shake($('#hint'));
    pop($('#btn-round'), 1.08);
    return;
  }
  const c = ui.selected;
  if (c === null) {
    shake($('#hint'));
    return;
  }
  ui.busy = true;
  round = play(round, c, symbol);
  clearSelection();
  const winner = roundWinner(round, match.roundNo);
  if (winner) match.scores[winner] += 1;
  save();
  refresh({ holdScores: true });
  if (how === 'keyboard' && !board.contains(document.activeElement)) cells[c].focus();

  setCell(c, symbol);
  markLast();
  const mark = markOf(c);
  drawStrokes([...mark.querySelectorAll('path')], 220);
  await animate(mark, { scale: [1.4, 1], duration: ms(520), ease: 'outElastic(1, .55)' });
  clearInline([mark], 'transform');

  if (round.winner === ORDER) await playOrderWin();
  else if (round.winner === CHAOS) await playChaosWin();
  else showTips(syncTips());

  ui.busy = false;
  refresh();
  if (how === 'keyboard' && round.winner) $('#btn-round').focus();
  followFocus();
}

async function newRound(how) {
  if (ui.busy || !round.moves.length) return;
  ui.busy = true;
  clearSelection();
  refresh();
  await sweep();
  match.roundNo += 1;
  round = createRound();
  save();
  sync();
  await swapRoles();
  ui.busy = false;
  refresh();
  if (how === 'keyboard') board.querySelector('.cell[tabindex="0"]').focus();
}

async function undoMove(how) {
  if (ui.busy || !round.moves.length) return;
  ui.busy = true;
  clearSelection();
  refresh();
  const last = round.moves.at(-1);
  const winner = roundWinner(round, match.roundNo);
  const lines = [...fxLayer.children];
  await Promise.all([
    animate(markOf(last.cell), { opacity: 0, scale: 0.4, duration: ms(240), ease: 'inBack(1.5)' }),
    lines.length && animate(lines, { opacity: 0, duration: ms(200), ease: 'outQuad' }),
  ]);
  round = undoRound(round);
  if (winner) match.scores[winner] = Math.max(0, match.scores[winner] - 1);
  save();
  sync();
  ui.busy = false;
  // Offer the same square again: often the fix is the other symbol.
  select(last.cell);
  refresh();
  if (how === 'keyboard') cells[last.cell].focus();
}

async function newMatch() {
  if (ui.busy) return;
  ui.busy = true;
  clearSelection();
  refresh();
  await sweep();
  const swapping = roleOf(P1, match.roundNo) !== ORDER;
  match = freshMatch();
  round = createRound();
  save();
  sync();
  if (swapping) await swapRoles();
  ui.busy = false;
  refresh();
}

// ------------------------------------------------------------------- input

board.addEventListener('click', (e) => {
  const cell = e.target.closest('.cell');
  if (cell) select(+cell.dataset.cell);
});

// Listening on the wrapper: Chromium makes an SVG element with focus listeners a tab stop.
board.parentElement.addEventListener('focusin', (e) => {
  const cell = e.target.closest?.('.cell');
  if (!cell) return;
  setRoving(+cell.dataset.cell);
  if (cell.matches(':focus-visible')) follow(+cell.dataset.cell);
});

board.addEventListener('keydown', (e) => {
  const cell = e.target.closest?.('.cell');
  if (!cell) return;
  const c = +cell.dataset.cell;
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    select(c);
    return;
  }
  const step = {
    ArrowLeft: [0, -1], ArrowRight: [0, 1], ArrowUp: [-1, 0], ArrowDown: [1, 0],
  }[e.key];
  if (!step) return;
  e.preventDefault();
  const row = rowOf(c) + step[0];
  const col = colOf(c) + step[1];
  if (row >= 0 && row < SIDE && col >= 0 && col < SIDE) cells[row * SIDE + col].focus();
});

for (const button of [$('#btn-x'), $('#btn-o')]) {
  button.addEventListener('click', (e) => place(button.dataset.symbol, e.detail === 0 ? 'keyboard' : 'pointer'));
}
$('#btn-undo').addEventListener('click', (e) => undoMove(e.detail === 0 ? 'keyboard' : 'pointer'));
$('#btn-round').addEventListener('click', (e) => newRound(e.detail === 0 ? 'keyboard' : 'pointer'));

const matchDialog = $('#dlg-match');
const matchForm = matchDialog.querySelector('form');
$('#btn-match').addEventListener('click', () => {
  matchForm.threats.checked = prefs.threats;
  matchDialog.returnValue = '';
  openDialog(matchDialog);
});
matchDialog.addEventListener('close', () => {
  if (matchDialog.returnValue !== 'start') return;
  prefs = { threats: matchForm.threats.checked };
  store.set('prefs', prefs);
  newMatch();
});

$('#btn-rules').addEventListener('click', () => openDialog($('#dlg-rules')));

document.addEventListener('keydown', (e) => {
  if (document.querySelector('dialog[open]')) return;
  const key = e.key.toLowerCase();
  if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && key === 'z') {
    e.preventDefault();
    undoMove('keyboard');
    return;
  }
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (key === X.toLowerCase() || key === O.toLowerCase()) {
    e.preventDefault();
    place(key.toUpperCase(), 'keyboard');
  } else if (e.key === 'Escape' && ui.selected !== null) {
    e.preventDefault();
    clearSelection();
    refresh();
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
  followFocus();
}

boot();
