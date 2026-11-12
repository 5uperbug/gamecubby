// Four in a row: two players on one screen take turns dropping discs into a
// 7×6 grid. Scores are kept across rounds and the starting player alternates.

import {
  X, O, DRAW, COLS, ROWS, cellAt, colOf, rowOf, createRound, isLegal, landingRow, lastCell,
  lineKind, other, play, replayRound, undo as undoRound,
} from './game.js';
import { createDisc, fallKeyframes } from '../../shared/js/disc.js';
import {
  animate, utils, motion, ms, stag, clearInline,
} from '../../shared/js/motion.js';
import { svgEl, lineThrough, drawStrokes } from '../../shared/js/marks.js';
import {
  confetti, fadeIntoClass, openDialog, pop, reveal, shake,
} from '../../shared/js/effects.js';
import { createStore } from '../../shared/js/storage.js';
import {
  OPPONENTS, isBot, pickMove, think,
} from '../../shared/js/bot.js';
import { labelPlayers, setupWizard } from '../../shared/js/opponent.js';
import { createOnline } from '../../shared/js/online.js';
import bot from './bot.js';
import { initThemeToggle } from '../../shared/js/theme.js';

const $ = (sel) => document.querySelector(sel);
const store = createStore('four-in-a-row');

const NAMES = { [X]: 'Red', [O]: 'Blue' };

// ------------------------------------------------------------------- state

const BOT = O; // the bot always plays Blue

const freshMatch = (opponent = 'human') => ({
  scores: { X: 0, O: 0, D: 0 }, roundNo: 1, starter: X, opponent,
});

/** Reads a saved match (also the host's state in an online sync), keeping only valid fields. */
function loadMatch(saved = store.get('match')) {
  const match = freshMatch();
  if (!saved || typeof saved !== 'object') return { match, moves: [] };
  for (const key of Object.keys(match.scores)) {
    const n = saved.scores?.[key];
    if (Number.isInteger(n) && n >= 0) match.scores[key] = n;
  }
  if (Number.isInteger(saved.roundNo) && saved.roundNo > 0) match.roundNo = saved.roundNo;
  if (saved.starter === O) match.starter = O;
  if (OPPONENTS.includes(saved.opponent)) match.opponent = saved.opponent;
  return { match, moves: Array.isArray(saved.moves) ? saved.moves : [] };
}

const loaded = loadMatch();
let match = loaded.match;
let round = replayRound(match.starter, loaded.moves);

const ui = {
  busy: false, // an animation owns the board
  hover: null, // column under the pointer
  focus: null, // column with visible keyboard focus
  roving: 0, // the column in the tab order
  notice: null, // full column the player just tried
  ghost: { col: null, player: null },
  shown: { active: null, hint: '', scores: { ...match.scores } },
};

const vsBot = () => isBot(match.opponent);
const botsTurn = () => vsBot() && !round.winner && round.turn === BOT;
const vsRemote = () => match.opponent === 'remote';
/** The online friend is to move, or the room isn't ready: this screen waits. */
const friendsTurn = () => vsRemote() && !round.winner && (!online.ready || round.turn === online.theirs);
const waiting = () => botsTurn() || friendsTurn();
const idle = async () => { while (ui.busy) await think(40); };

/** Moves to take back so it is a person's turn again (0 if there are none). */
function undoSteps() {
  if (vsRemote()) return 0;
  if (!vsBot()) return round.moves.length ? 1 : 0;
  let r = round;
  for (let n = 1; n <= round.moves.length; n += 1) {
    r = undoRound(r);
    if (r.turn !== BOT) return n;
  }
  return 0;
}

function save() {
  store.set('match', { ...match, moves: round.moves });
}

// ------------------------------------------------------------------- board

const C = 100; // column width and row height
const R = 38; // disc radius
const P = 14; // frame padding
const BAND = 100; // strip above the frame where the next disc hovers
const W = COLS * C + 2 * P;
const FRAME_H = ROWS * C + 2 * P;
const H = BAND + FRAME_H; // the same as W, so the board fills the shared square
const GHOST_Y = BAND / 2;
const HALO = 8; // room around a column's wells for its tint and focus ring

const colX = (col) => P + col * C + C / 2;
const rowY = (row) => BAND + P + row * C + C / 2;
const centre = (cell) => [colX(colOf(cell)), rowY(rowOf(cell))];

const board = $('#board');
board.setAttribute('viewBox', `0 0 ${W} ${H}`);

const defs = svgEl('defs', {}, board);
const shadow = svgEl('filter', {
  id: 'fiar-shadow', x: '-10%', y: '-10%', width: '120%', height: '130%',
}, defs);
svgEl('feDropShadow', {
  class: 'frame-shadow', dx: 0, dy: 6, stdDeviation: 10,
}, shadow);
// Discs are clipped at the bottom of the frame, so the sweep can drop them
// out through it.
const clip = svgEl('clipPath', { id: 'fiar-clip' }, defs);
svgEl('rect', {
  x: -P, y: -BAND, width: W + 2 * P, height: H + BAND,
}, clip);

const frame = svgEl('rect', {
  class: 'frame', y: BAND, width: W, height: FRAME_H, rx: 24, filter: 'url(#fiar-shadow)',
}, board);

const columnsLayer = svgEl('g', { class: 'columns', 'aria-hidden': 'true', 'clip-path': 'url(#fiar-clip)' }, board);
const columns = Array.from({ length: COLS }, (_, col) => {
  const g = svgEl('g', { class: 'column' }, columnsLayer);
  svgEl('rect', {
    class: 'col-tint',
    x: colX(col) - R - HALO,
    y: rowY(0) - R - HALO,
    width: 2 * (R + HALO),
    height: rowY(ROWS - 1) - rowY(0) + 2 * (R + HALO),
    rx: R + HALO,
  }, g);
  return g;
});
const cellIds = Array.from({ length: COLS * ROWS }, (_, cell) => cell);
// Wells first, then the slots that hold discs, so discs sit on top.
const wells = cellIds.map((cell) => {
  const [cx, cy] = centre(cell);
  return svgEl('circle', {
    class: 'well', cx, cy, r: R - 1,
  }, columns[colOf(cell)]);
});
const slots = cellIds.map((cell) => {
  const [x, y] = centre(cell);
  return svgEl('g', { class: 'slot', transform: `translate(${x} ${y})` }, columns[colOf(cell)]);
});

const fxLayer = svgEl('g', { class: 'fx', 'aria-hidden': 'true' }, board);
const ghostLayer = svgEl('g', { class: 'ghost', 'aria-hidden': 'true', transform: `translate(0 ${GHOST_Y})` }, board);
const ghost = svgEl('g', {}, ghostLayer);

// Whole columns are the targets, from the top of the strip to the bottom of the frame.
const hitsLayer = svgEl('g', { class: 'hits' }, board);
const hits = Array.from({ length: COLS }, (_, col) => {
  const left = col === 0 ? 0 : P + col * C;
  const right = col === COLS - 1 ? W : P + (col + 1) * C;
  const hit = svgEl('g', {
    class: 'col', 'data-col': col, role: 'button', tabindex: -1,
  }, hitsLayer);
  svgEl('rect', {
    class: 'col-hit', x: left, width: right - left, height: H,
  }, hit);
  svgEl('rect', {
    class: 'col-ring',
    x: colX(col) - R - HALO - 2,
    y: rowY(0) - R - HALO - 2,
    width: 2 * (R + HALO + 2),
    height: rowY(ROWS - 1) - rowY(0) + 2 * (R + HALO + 2),
    rx: R + HALO + 2,
  }, hit);
  return hit;
});

const discAt = (cell) => slots[cell].firstChild;
/** Discs on the board, in cell order (row by row from the top). */
const allDiscs = () => slots.map((slot) => slot.firstChild).filter(Boolean);

function setDisc(cell, player) {
  slots[cell].replaceChildren();
  if (player) slots[cell].appendChild(createDisc(player, R));
}

function addWinLines() {
  const p = round.winner.toLowerCase();
  return round.lines.map((line) => {
    const d = lineThrough([centre(line[0]), centre(line.at(-1))], 30);
    const g = svgEl('g', { class: `win-line line-${p}` }, fxLayer);
    svgEl('path', { class: 'win-casing', d }, g);
    svgEl('path', { class: 'win-core', d }, g);
    return g;
  });
}

/** Makes the board match `round` exactly, without animating. */
function sync() {
  utils.remove(board.querySelectorAll('*'));
  fxLayer.replaceChildren();
  board.classList.remove('over', 'drawn');
  clearInline(columns, 'transform');
  round.cells.forEach((player, cell) => setDisc(cell, player));
  if (round.winner) board.classList.add('over');
  if (round.winner === DRAW) board.classList.add('drawn');
  if (round.lines.length) {
    for (const cell of round.lines.flat()) discAt(cell).classList.add('win');
    addWinLines();
  }
  ui.ghost.col = null; // its slide may have been cut short
}

/** One column is in the tab order; arrow keys move between columns. */
function setRoving(index) {
  hits.forEach((hit, col) => hit.setAttribute('tabindex', col === index ? 0 : -1));
  ui.roving = index;
}

function labelColumns() {
  hits.forEach((hit, col) => {
    const discs = [];
    for (let row = ROWS - 1; row >= 0; row--) {
      const player = round.cells[cellAt(col, row)];
      if (player) discs.push(NAMES[player]);
    }
    const free = ROWS - discs.length;
    let label = `Column ${col + 1}, empty`;
    if (discs.length) {
      const room = free ? `${free} ${free === 1 ? 'space' : 'spaces'} left` : 'full';
      label = `Column ${col + 1}, ${room}. ${discs.join(', ')} from the bottom`;
    }
    hit.setAttribute('aria-label', label);
    hit.classList.toggle('full', !free);
  });
}

/** Shows the next disc above the column under the pointer or keyboard focus. */
function updateGhost() {
  const col = ui.busy || round.winner ? null : ui.hover ?? ui.focus;
  columns.forEach((g, c) => g.classList.toggle('lit', c === col));
  board.querySelector('.well.target')?.classList.remove('target');
  ghostLayer.classList.toggle('shown', col !== null);
  if (col === null) {
    ui.ghost.col = null;
    return;
  }
  const row = landingRow(round, col);
  if (row !== -1) wells[cellAt(col, row)].classList.add('target');
  ghostLayer.classList.toggle('blocked', row === -1);
  if (ui.ghost.player !== round.turn) {
    ghost.replaceChildren(createDisc(round.turn, R));
    ui.ghost.player = round.turn;
  }
  if (ui.ghost.col === null) utils.set(ghost, { x: colX(col) });
  else if (ui.ghost.col !== col) animate(ghost, { x: colX(col), duration: ms(140), ease: 'outQuad' });
  ui.ghost.col = col;
}

// ------------------------------------------------------------------ status

const tag = (p) => `<strong class="${p.toLowerCase()}">${NAMES[p]}</strong>`;
const COUNT = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven'];
const HOW = { across: 'across', down: 'down', diagonal: 'diagonally' };

function winDetail() {
  const { lines } = round;
  if (lines.length > 1) return `${COUNT[lines.length]} lines at once`;
  return `${COUNT[lines[0].length]} ${HOW[lineKind(lines[0])]}`;
}

/** Where the last disc went, for screen readers; everyone else watches it fall. */
function lastMove() {
  const cell = lastCell(round);
  return `<span class="sr-only">${NAMES[round.cells[cell]]} played column ${colOf(cell) + 1}. </span>`;
}

const NEXT_ROUND = 'Start a new round when you’re ready.';
const nextRound = () => (vsRemote() && !online.host ? 'Your friend starts the next round.' : NEXT_ROUND);

function hintFor() {
  const net = vsRemote() && online.hint();
  if (net) return net;
  if (vsRemote() && !round.moves.length) {
    return `Round ${match.roundNo}: you’re ${tag(online.mine)}. ${round.turn === online.mine ? 'You go first.' : 'Your friend goes first.'}`;
  }
  const n = match.roundNo;
  if (round.winner === DRAW) return `The board is full, so round ${n} is a draw. ${nextRound()}`;
  if (round.winner) return `${tag(round.winner)} wins round ${n} with ${winDetail()}! ${nextRound()}`;
  if (ui.notice !== null) return `Column ${ui.notice + 1} is full. ${tag(round.turn)}, pick another column.`;
  if (friendsTurn()) return `${tag(round.turn)} (your friend) is thinking…`;
  if (botsTurn()) return `${round.moves.length ? lastMove() : ''}${tag(BOT)} (bot) is thinking…`;
  if (!round.moves.length) return `Round ${n}: ${tag(round.turn)} goes first. Tap a column to drop a disc.`;
  return `${lastMove()}${tag(round.turn)} to move.`;
}

/** Brings all non-board UI in line with the current state. */
function refresh({ holdScores = false } = {}) {
  const over = Boolean(round.winner);
  const active = over ? round.winner : round.turn; // 'D' after a draw: no player highlighted
  const accent = active === DRAW ? round.turn : active;
  document.body.classList.toggle('turn-o', accent === O);
  document.body.classList.toggle('turn-x', accent === X);

  labelPlayers(vsBot() ? BOT : vsRemote() && online.theirs, vsRemote() ? 'Friend' : 'Bot');
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
  $('#btn-undo').disabled = ui.busy || !undoSteps();
  const next = $('#btn-round');
  next.disabled = ui.busy || !round.moves.length || (vsRemote() && !online.host);
  next.classList.toggle('quiet', !over);
  board.classList.toggle('live', !over && !ui.busy && !waiting());
  labelColumns();
  updateGhost();
}

// -------------------------------------------------------------- animations

/** Keyframes for the disc in `cell` falling from the strip above the frame. */
const fall = (cell) => fallKeyframes(rowY(rowOf(cell)) - GHOST_Y, C);

/** Drops the disc in `cell` from the strip above the frame. */
async function dropDisc(cell) {
  if (motion.reduced) return;
  const disc = discAt(cell);
  await animate(disc, { y: fall(cell) });
  clearInline([disc], 'transform');
}

/** Draws a win line: its outline and its core together. */
function drawLine(group) {
  return Promise.all([...group.children].map((path) => drawStrokes([path], 420)));
}

async function intro() {
  const discs = allDiscs();
  const filled = cellIds.filter((cell) => round.cells[cell]);
  const lines = [...fxLayer.children];
  const targets = discs.map((d) => parseFloat(getComputedStyle(d).opacity));
  for (const n of [...discs, ...lines]) n.style.opacity = '0';
  await Promise.all([
    animate(frame, {
      opacity: [0, 1], scale: [0.96, 1], duration: ms(420), ease: 'outQuad',
    }),
    animate(wells, {
      opacity: [0, 1],
      scale: [0.4, 1],
      duration: ms(420),
      delay: stag(22, { grid: [COLS, ROWS], from: 'center' }),
      ease: 'outBack(1.7)',
    }),
  ]);
  clearInline([frame, ...wells], 'opacity', 'transform');
  // A game in progress drops back in, bottom row first.
  await Promise.all(filled.map((cell, i) => animate(discs[i], {
    y: fall(cell),
    opacity: { from: 0, to: targets[i], duration: ms(100) },
    delay: ms((ROWS - 1 - rowOf(cell)) * 70 + colOf(cell) * 12),
  })));
  clearInline(discs, 'opacity', 'transform');
  for (const line of lines) {
    clearInline([line], 'opacity');
    await drawLine(line);
  }
}

async function playWin() {
  for (const line of addWinLines()) await drawLine(line);
  const winners = [...new Set(round.lines.flat())].map(discAt);
  winners.forEach((disc) => disc.classList.add('win'));
  const others = allDiscs().filter((disc) => !disc.classList.contains('win'));
  confetti($('.board-area .confetti'));
  await Promise.all([
    animate(winners, {
      scale: [1, 1.2, 1], duration: ms(560), delay: stag(90), ease: 'inOutQuad',
    }),
    fadeIntoClass(board, 'over', others, 400),
  ]);
  clearInline(winners, 'transform');
}

async function playDraw() {
  const discs = allDiscs();
  await Promise.all([
    animate(discs, {
      scale: [1, 0.84, 1],
      duration: ms(600),
      delay: stag(18, { grid: [COLS, ROWS], from: 'center' }),
      ease: 'inOutSine',
    }),
    fadeIntoClass(board, 'over drawn', discs, 450),
  ]);
  clearInline(discs, 'transform');
}

/** Clears the board: every disc drops out through the bottom of the frame. */
async function sweep() {
  const filled = cellIds.filter((cell) => discAt(cell));
  const discs = filled.map(discAt);
  const lines = [...fxLayer.children];
  if (motion.reduced || (!discs.length && !lines.length)) return;
  utils.remove([...discs, ...lines]);
  await Promise.all([
    discs.length && animate(discs, {
      y: FRAME_H,
      duration: 560,
      delay: (_, i) => Math.abs(colOf(filled[i]) - (COLS - 1) / 2) * 40,
      ease: 'inQuad',
    }),
    lines.length && animate(lines, { opacity: 0, duration: 200, ease: 'outQuad' }),
  ]);
}

/** Takes the newest disc back up out of its column. */
async function lift(cell) {
  const disc = discAt(cell);
  const lines = [...fxLayer.children];
  const dimmed = board.classList.contains('over') ? allDiscs().filter((d) => d !== disc) : [];
  await Promise.all([
    animate(disc, {
      y: GHOST_Y - rowY(rowOf(cell)),
      opacity: { to: 0, delay: ms(120), duration: ms(200) },
      duration: ms(320),
      ease: 'outQuad',
    }),
    lines.length && animate(lines, { opacity: 0, duration: ms(200), ease: 'outQuad' }),
    dimmed.length && animate(dimmed, { opacity: 1, duration: ms(320), ease: 'outQuad' }),
  ]);
}

// -------------------------------------------------------------------- flow

async function place(col, how) {
  const remote = how === 'bot' || how === 'remote';
  if (ui.busy || (!remote && waiting())) return;
  if (round.winner) {
    // The round is over: point at the way forward.
    shake($('#hint'));
    pop($('#btn-round'), 1.08);
    return;
  }
  if (!isLegal(round, col)) {
    ui.notice = col;
    refresh();
    shake(columns[col], 6);
    return;
  }
  ui.busy = true;
  ui.notice = null;
  const cell = cellAt(col, landingRow(round, col));
  round = play(round, col);
  if (vsRemote() && !remote) online.send(col);
  if (round.winner) match.scores[round.winner] += 1;
  save();
  setDisc(cell, round.cells[cell]);
  refresh({ holdScores: true });

  await dropDisc(cell);
  if (round.winner === DRAW) await playDraw();
  else if (round.winner) await playWin();

  ui.busy = false;
  refresh();
  if (how === 'keyboard' && round.winner) $('#btn-round').focus();
  botTurn();
}

/** Plays the bot's move if it is the bot's turn. */
async function botTurn() {
  if (ui.busy || !botsTurn()) return;
  ui.busy = true;
  refresh();
  await think();
  ui.busy = false;
  if (botsTurn()) place(pickMove(round, bot, BOT, match.opponent), 'bot');
  else refresh();
}

/**
 * Buttons are disabled while their animation runs, which takes focus away
 * from them. Gives it back, or hands it to the board if the button stays off.
 */
function restoreFocus(button) {
  (button.disabled ? hits[ui.roving] : button).focus();
}

async function newRound() {
  if (ui.busy || !round.moves.length || (vsRemote() && !online.host)) return;
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
  ui.busy = false;
  refresh();
  if (focused) restoreFocus(button);
  if (vsRemote()) online.sync();
  botTurn();
}

async function undoMove() {
  const steps = undoSteps();
  if (ui.busy || !steps) return;
  const button = $('#btn-undo');
  const focused = document.activeElement === button;
  ui.busy = true;
  ui.notice = null;
  refresh();
  const result = round.winner;
  for (let i = 0; i < steps; i += 1) {
    await lift(lastCell(round));
    round = undoRound(round);
  }
  if (result) match.scores[result] = Math.max(0, match.scores[result] - 1);
  save();
  sync();
  ui.busy = false;
  refresh();
  if (focused) restoreFocus(button);
}

async function newMatch(opponent) {
  if (ui.busy) return;
  if (opponent !== 'remote') online.leave();
  ui.busy = true;
  ui.notice = null;
  refresh();
  await sweep();
  match = freshMatch(opponent);
  round = createRound(match.starter);
  save();
  sync();
  ui.busy = false;
  refresh();
  if (vsRemote()) online.sync();
  botTurn();
}

// ------------------------------------------------------------------ online

const online = createOnline({
  game: 'four-in-a-row',
  marks: [X, O],
  begin: async () => { await idle(); await newMatch('remote'); },
  end: async (opponent) => { await idle(); await newMatch(opponent); },
  snapshot: () => ({ ...match, moves: round.moves }),
  async onSync(state) {
    await idle();
    const loaded = loadMatch(state);
    if (loaded.match.roundNo !== match.roundNo) await sweep();
    match = { ...loaded.match, opponent: 'remote' };
    round = replayRound(match.starter, loaded.moves);
    save();
    sync();
    refresh();
  },
  async onMove(m) {
    await idle();
    if (friendsTurn() && isLegal(round, m)) place(m, 'remote');
  },
  onChange: () => refresh(),
});

// ------------------------------------------------------------------- input

const hitFrom = (target) => target.closest?.('.col');

board.addEventListener('click', (e) => {
  const hit = hitFrom(e.target);
  if (hit) place(+hit.dataset.col, 'pointer');
});

function onPointer(e) {
  const hit = hitFrom(e.target);
  const col = hit ? +hit.dataset.col : null;
  if (col === ui.hover) return;
  ui.hover = col;
  updateGhost();
}

board.addEventListener('pointerover', onPointer);
board.addEventListener('pointermove', onPointer);

board.addEventListener('pointerleave', () => {
  ui.hover = null;
  updateGhost();
});

// Focus listeners go on the HTML wrapper: on an SVG element they would make
// Chrome add the <svg> itself to the tab order.
const boardArea = $('.board-area');

boardArea.addEventListener('focusin', (e) => {
  const hit = hitFrom(e.target);
  if (!hit) return;
  setRoving(+hit.dataset.col);
  ui.focus = hit.matches(':focus-visible') ? +hit.dataset.col : null;
  updateGhost();
});

boardArea.addEventListener('focusout', (e) => {
  if (board.contains(e.relatedTarget)) return;
  ui.focus = null;
  updateGhost();
});

board.addEventListener('keydown', (e) => {
  const hit = hitFrom(e.target);
  if (!hit || e.altKey || e.ctrlKey || e.metaKey) return;
  const col = +hit.dataset.col;
  if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
    e.preventDefault();
    ui.focus = col;
    place(col, 'keyboard');
    return;
  }
  const next = {
    ArrowLeft: col - 1, ArrowRight: col + 1, Home: 0, End: COLS - 1,
  }[e.key];
  if (next === undefined) return;
  e.preventDefault();
  if (next < 0 || next >= COLS) return;
  ui.hover = null; // the keyboard takes over until the pointer moves again
  hits[next].focus();
});

$('#btn-undo').addEventListener('click', undoMove);
$('#btn-round').addEventListener('click', newRound);
$('#btn-rules').addEventListener('click', () => openDialog($('#dlg-rules')));

const matchDialog = $('#dlg-match');
const matchForm = matchDialog.querySelector('form');
setupWizard(matchForm, 'Red');
function fillMatchForm() {
  matchForm.elements.opponent.value = match.opponent;
}
const startFromForm = () => {
  const opponent = matchForm.elements.opponent.value;
  if (opponent === 'remote') online.start(matchForm.elements.room.value);
  else newMatch(opponent);
};
$('#btn-match').addEventListener('click', () => {
  fillMatchForm();
  matchDialog.returnValue = '';
  openDialog(matchDialog);
});
matchDialog.addEventListener('close', () => {
  if (matchDialog.returnValue === 'start') booted.then(startFromForm);
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
  // An online match only survives a refresh of the same tab (online.js keeps the room).
  const resumed = online.resume(vsRemote());
  if (vsRemote() && !resumed) {
    match = freshMatch();
    round = createRound(match.starter);
    save();
  }
  setRoving(Math.floor(COLS / 2));
  sync();
  ui.busy = true;
  refresh();
  reveal(document.querySelectorAll('[data-reveal]'));
  // Nothing played yet in this match: start with the setup wizard, over the intro.
  if (!resumed && !round.moves.length && match.roundNo === 1 && !Object.values(match.scores).some(Boolean)) $('#btn-match').click();
  await intro();
  ui.busy = false;
  refresh();
  botTurn();
}

const booted = boot();
