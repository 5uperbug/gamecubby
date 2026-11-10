// Dots and Boxes: two players on one screen take turns joining neighbouring
// dots. Closing a box claims it and earns another line. Games won are kept
// across games, and the starting player alternates.

import {
  X, O, DRAW, createGame, isLegal, play, replay, undo as undoGame,
  hLine, vLine, lineAt, lineEnds, lineCount, scores, other,
} from './game.js';
import {
  animate, svg, utils, motion, ms, stag, clearInline,
} from '../../shared/js/motion.js';
import { svgEl, createMark, drawStrokes } from '../../shared/js/marks.js';
import {
  confetti, fadeIntoClass, openDialog, pop, reveal, shake,
} from '../../shared/js/effects.js';
import { createStore } from '../../shared/js/storage.js';
import {
  OPPONENTS, isBot, pickMove, think,
} from '../../shared/js/bot.js';
import { addOpponentChoice, labelPlayers } from '../../shared/js/opponent.js';
import bot from './bot.js';
import { initThemeToggle } from '../../shared/js/theme.js';

const $ = (sel) => document.querySelector(sel);
const store = createStore('dots-and-boxes');

// ------------------------------------------------------------------- state

const BOT = O; // the bot always plays O

const freshWins = () => ({ X: 0, O: 0, D: 0 });

function loadMatch() {
  const saved = store.get('match');
  const wins = freshWins();
  if (!saved || typeof saved !== 'object') return { wins, game: createGame(), opponent: 'human' };
  for (const key of Object.keys(wins)) {
    const n = saved.wins?.[key];
    if (Number.isInteger(n) && n >= 0) wins[key] = n;
  }
  const moves = Array.isArray(saved.moves) ? saved.moves : [];
  const opponent = OPPONENTS.includes(saved.opponent) ? saved.opponent : 'human';
  return { wins, game: replay(saved.size, saved.starter, moves), opponent };
}

const loaded = loadMatch();
let wins = loaded.wins;
let game = loaded.game;
let { opponent } = loaded;

const vsBot = () => isBot(opponent);
const botsTurn = () => vsBot() && !game.winner && game.turn === BOT;

/** Moves to take back so it is a person's turn again (0 if there are none). */
function undoSteps() {
  if (!vsBot()) return game.moves.length ? 1 : 0;
  let g = game;
  for (let n = 1; n <= game.moves.length; n += 1) {
    g = undoGame(g);
    if (g.turn !== BOT) return n;
  }
  return 0;
}

const ui = {
  busy: false, // an animation owns the board
  shown: { active: null, hint: '', scores: scores(game) },
};

function save() {
  store.set('match', {
    wins, size: game.size, starter: game.starter, moves: game.moves, opponent,
  });
}

// ------------------------------------------------------------------- board

const STEP = 60; // distance between neighbouring dots, in SVG units
const PAD = STEP / 2; // room for the outer lines' tap areas
const DOT_R = 5.5;
const FILL_INSET = 3.5; // half a line's width
const MARK_INSET = 19;
const RING = 10; // half the height of a line's focus ring

const board = $('#board');
const view = {
  size: 0, slots: [], boxes: [], dots: [], last: null,
};

const dotXY = ([r, c]) => [PAD + c * STEP, PAD + r * STEP];
const dotName = ([r, c]) => `row ${r + 1} column ${c + 1}`;
const lineEl = (line) => view.slots[line].querySelector('.slot-line');
const pathOf = (line) => view.slots[line].querySelector('.slot-guide').getAttribute('d');

function buildSlot(size, line, parent) {
  const [[x1, y1], [x2, y2]] = lineEnds(size, line).map(dotXY);
  const across = y1 === y2;
  const h = STEP / 2;
  // The tap area is the diamond between the two dots and the middles of the
  // boxes on either side, so together the slots cover the whole grid.
  const corners = across
    ? [[x1, y1], [x1 + h, y1 - h], [x2, y2], [x1 + h, y1 + h]]
    : [[x1, y1], [x1 + h, y1 + h], [x2, y2], [x1 - h, y1 + h]];
  const slot = svgEl('g', {
    class: 'slot', 'data-line': line, role: 'button', tabindex: -1,
  }, parent);
  svgEl('polygon', { class: 'slot-hit', points: corners.join(' ') }, slot);
  const d = `M${x1} ${y1}L${x2} ${y2}`;
  svgEl('path', { class: 'slot-guide', d }, slot);
  svgEl('path', { class: 'slot-ghost', d }, slot);
  const ring = across
    ? { x: x1 + RING, y: y1 - RING, width: STEP - 2 * RING, height: 2 * RING }
    : { x: x1 - RING, y: y1 + RING, width: 2 * RING, height: STEP - 2 * RING };
  svgEl('rect', { class: 'slot-focus', rx: RING, ...ring }, slot);
  return slot;
}

/** Builds an empty grid: boxes at the back, then the line slots, then the dots. */
function build(size) {
  utils.remove(board.querySelectorAll('*'));
  board.replaceChildren();
  const extent = 2 * PAD + size * STEP;
  board.setAttribute('viewBox', `0 0 ${extent} ${extent}`);

  const boxLayer = svgEl('g', { class: 'boxes', 'aria-hidden': 'true' }, board);
  view.boxes = Array.from({ length: size * size }, (_, b) => {
    const [x, y] = dotXY([Math.floor(b / size), b % size]);
    return svgEl('g', { class: 'box', transform: `translate(${x} ${y})` }, boxLayer);
  });
  view.last = svgEl('path', { class: 'last-line', 'aria-hidden': 'true' }, board);
  const slotLayer = svgEl('g', { class: 'slots' }, board);
  view.slots = Array.from({ length: lineCount(size) }, (_, line) => buildSlot(size, line, slotLayer));
  const dotLayer = svgEl('g', { class: 'dots', 'aria-hidden': 'true' }, board);
  view.dots = [];
  for (let r = 0; r <= size; r++) {
    for (let c = 0; c <= size; c++) {
      const [cx, cy] = dotXY([r, c]);
      view.dots.push(svgEl('circle', { class: 'grid-dot', cx, cy, r: DOT_R }, dotLayer));
    }
  }
  view.size = size;
}

function setLine(line, owner) {
  const slot = view.slots[line];
  lineEl(line)?.remove();
  slot.classList.toggle('drawn', Boolean(owner));
  if (owner) {
    const path = svgEl('path', { class: `slot-line line-${owner.toLowerCase()}`, d: pathOf(line) });
    slot.querySelector('.slot-ghost').before(path);
  }
  const [a, b] = lineEnds(view.size, line);
  const state = owner ? `drawn by ${owner}` : 'empty';
  slot.setAttribute('aria-label', `Line between ${dotName(a)} and ${dotName(b)}, ${state}`);
  slot.setAttribute('aria-disabled', owner ? 'true' : 'false');
}

function setBox(b, owner) {
  const box = view.boxes[b];
  box.replaceChildren();
  box.classList.remove('claimed-x', 'claimed-o');
  if (!owner) return;
  box.classList.add(`claimed-${owner.toLowerCase()}`);
  const side = STEP - 2 * FILL_INSET;
  svgEl('rect', {
    class: 'box-fill', x: FILL_INSET, y: FILL_INSET, width: side, height: side, rx: 4,
  }, box);
  box.appendChild(createMark(owner, STEP, MARK_INSET));
}

/** Moves the glow to the latest line. */
function markLast() {
  const { last } = game;
  view.last.setAttribute('class', last ? `last-line line-${last.player.toLowerCase()}` : 'last-line');
  if (last) view.last.setAttribute('d', pathOf(last.line));
  else view.last.removeAttribute('d');
}

/** Makes the board match `game` exactly, without animating. */
function sync() {
  if (view.size !== game.size) build(game.size);
  utils.remove(board.querySelectorAll('*'));
  clearInline([...view.dots, ...board.querySelectorAll('.slot-guide'), view.last], 'opacity', 'transform');
  game.lines.forEach((owner, line) => setLine(line, owner));
  game.boxes.forEach((owner, b) => setBox(b, owner));
  markLast();
  board.classList.toggle('over', Boolean(game.winner));
}

/** One slot is in the tab order; arrow keys move between slots. */
function setRoving(line) {
  view.slots.forEach((slot, i) => slot.setAttribute('tabindex', i === line ? 0 : -1));
}

/**
 * The slot an arrow key leads to. Rows of horizontal and vertical lines
 * alternate down the board; up and down step between them through the
 * line's first dot, so two presses return to the same column.
 */
function neighbour(line, key) {
  const n = view.size;
  const { dir, r, c } = lineAt(n, line);
  const across = dir === 'h';
  const same = across ? hLine : vLine;
  switch (key) {
    case 'ArrowLeft': return c > 0 ? same(n, r, c - 1) : null;
    case 'ArrowRight': return c < (across ? n - 1 : n) ? same(n, r, c + 1) : null;
    case 'ArrowDown':
      if (across) return r < n ? vLine(n, r, c) : null;
      return hLine(n, r + 1, Math.min(c, n - 1));
    case 'ArrowUp':
      if (across) return r > 0 ? vLine(n, r - 1, c) : null;
      return hLine(n, r, Math.min(c, n - 1));
    default: return undefined;
  }
}

// ------------------------------------------------------------------ status

const tag = (p) => `<strong class="${p.toLowerCase()}">${p}</strong>`;

function hintFor() {
  const { X: x, O: o } = scores(game);
  if (game.winner === DRAW) return `It’s a draw: ${x} boxes each.`;
  if (game.winner) {
    const [won, lost] = game.winner === X ? [x, o] : [o, x];
    return `${tag(game.winner)} wins, ${won} boxes to ${lost}!`;
  }
  const p = tag(game.turn);
  if (botsTurn()) {
    const closed = game.last?.player === BOT && game.last.boxes.length;
    return `${tag(BOT)} (bot) ${closed ? 'closed a box and goes again' : 'is thinking'}…`;
  }
  if (!game.moves.length) return `${p} goes first. Tap between two dots to draw a line.`;
  const closed = game.last.boxes.length;
  if (closed) return `${p} closed ${closed === 2 ? 'two boxes' : 'a box'}. <strong>Go again!</strong>`;
  return `${p} to move.`;
}

/** Brings all non-board UI in line with the current state. */
function refresh({ holdScores = false } = {}) {
  const over = Boolean(game.winner);
  const active = over ? game.winner : game.turn; // 'D' after a draw: no player highlighted
  const accent = active === DRAW ? game.turn : active;
  document.body.classList.toggle('turn-o', accent === O);
  document.body.classList.toggle('turn-x', accent === X);

  labelPlayers(vsBot() && BOT);
  for (const pill of document.querySelectorAll('.player')) {
    const on = pill.dataset.player === active;
    pill.classList.toggle('active', on);
    if (on && ui.shown.active !== active) animate(pill, { scale: [0.92, 1], duration: ms(500), ease: 'outBack(2.2)' });
  }
  ui.shown.active = active;

  if (!holdScores) {
    const now = scores(game);
    for (const p of [X, O]) {
      const node = document.querySelector(`[data-score="${p}"]`);
      node.textContent = now[p];
      if (now[p] > ui.shown.scores[p]) pop(node.parentElement, 1.6);
      ui.shown.scores[p] = now[p];
    }
  }

  const hint = hintFor();
  if (hint !== ui.shown.hint) {
    const node = $('#hint');
    node.innerHTML = hint;
    animate(node, { opacity: [0, 1], x: [8, 0], duration: ms(350), ease: 'outQuad' });
    ui.shown.hint = hint;
  }

  const n = game.size;
  const draws = wins.D ? ` · Draws: ${wins.D}` : '';
  $('#match-note').textContent = `${n}×${n} boxes · Games won: X ${wins.X}, O ${wins.O}${draws}`;
  $('#btn-undo').disabled = ui.busy || !undoSteps();
  $('#btn-play').disabled = ui.busy || !over;
  board.classList.toggle('live', !over && !ui.busy && !botsTurn());
}

// -------------------------------------------------------------- animations

/** Draws strokes on together with a short stagger (drawStrokes goes one by one). */
function drawTogether(paths, duration, step) {
  if (!paths.length) return Promise.resolve();
  return animate(svg.createDrawable(paths), {
    draw: ['0 0', '0 1'], duration: ms(duration), delay: stag(step), ease: 'inOutQuad',
  });
}

/** Orders board elements from the top-left corner to the bottom-right one. */
function diagonal(nodes) {
  return nodes
    .map((node) => {
      const r = node.getBoundingClientRect();
      return [r.left + r.top + (r.width + r.height) / 2, node];
    })
    .sort((a, b) => a[0] - b[0])
    .map(([, node]) => node);
}

/** Claimed boxes fill with a pop while their marks draw in. */
async function fillBoxes(boxes, step = 0) {
  const fills = boxes.map((box) => box.querySelector('.box-fill'));
  const marks = boxes.map((box) => box.querySelector('.mark'));
  for (const fill of fills) fill.style.opacity = '0';
  const strokes = marks.flatMap((mark) => [...mark.querySelectorAll('path')]);
  const drawing = drawTogether(strokes, 240, step ? step / 2 : 120);
  clearInline(marks, 'opacity');
  await Promise.all([
    animate(fills, {
      opacity: [0, 1], scale: [0.2, 1], duration: ms(420), delay: stag(step), ease: 'outBack(2.2)',
    }),
    drawing,
  ]);
  clearInline(fills, 'opacity', 'transform');
}

/** The grid pops in from the middle, then any lines and boxes of a resumed game. */
async function intro() {
  const n = view.size + 1;
  const guides = [...board.querySelectorAll('.slot-guide')];
  const lines = diagonal([...board.querySelectorAll('.slot-line')]);
  const boxes = diagonal(view.boxes.filter((box) => box.firstChild));
  const marks = boxes.map((box) => box.querySelector('.mark'));
  const fills = boxes.map((box) => box.querySelector('.box-fill'));
  for (const node of [...view.dots, ...guides, ...lines, ...marks, ...fills, view.last]) {
    node.style.opacity = '0';
  }
  await Promise.all([
    animate(view.dots, {
      opacity: [0, 1], scale: [0, 1], duration: ms(450),
      delay: stag(30, { grid: [n, n], from: 'center' }), ease: 'outBack(2.4)',
    }),
    animate(guides, { opacity: [0, 1], duration: ms(500), delay: ms(200), ease: 'outQuad' }),
  ]);
  clearInline([...view.dots, ...guides], 'opacity', 'transform');
  if (lines.length) {
    const drawing = drawTogether(lines, 240, Math.min(30, 700 / lines.length));
    clearInline(lines, 'opacity');
    await drawing;
  }
  if (boxes.length) await fillBoxes(boxes, Math.min(60, 500 / boxes.length));
  // The glow on the latest line comes back last (CSS hides it on a finished game).
  clearInline([view.last], 'opacity');
}

/** The winner's marks bounce in a wave (or every mark wobbles after a draw). */
async function playEnd() {
  const draw = game.winner === DRAW;
  const owned = view.boxes.filter((_, b) => draw || game.boxes[b] === game.winner);
  const marks = diagonal(owned.map((box) => box.querySelector('.mark')));
  const lines = [...board.querySelectorAll('.slot-line'), view.last];
  await Promise.all([
    draw
      ? animate(marks, {
        rotate: [0, -14, 10, -5, 0], duration: ms(650), delay: stag(25), ease: 'inOutSine',
      })
      : animate(marks, {
        scale: [1, 1.35, 1], duration: ms(520), delay: stag(40), ease: 'inOutQuad',
      }),
    fadeIntoClass(board, 'over', lines, 450),
  ]);
  clearInline(marks, 'transform');
}

/** The same player draws again: their pill pulses. */
function goAgain() {
  const pill = $(`.player[data-player="${game.turn}"]`);
  animate(pill, { scale: [1, 1.08, 1, 1.04, 1], duration: ms(700), ease: 'inOutSine' });
}

/** Sweeps the board clear from the top-left corner. */
async function sweep() {
  if (motion.reduced) return;
  const nodes = diagonal([
    ...view.dots, ...board.querySelectorAll('.slot-guide, .slot-line, .box > *'), view.last,
  ]);
  utils.remove(nodes);
  await animate(nodes, {
    opacity: 0, scale: 0.2, duration: 260, delay: (_, i, total) => (i / total) * 420, ease: 'inBack(1.6)',
  });
}

/** Fades out whatever the last line added, before the board re-syncs. */
async function takeBack({ line, boxes }) {
  const nodes = [lineEl(line), view.last, ...boxes.flatMap((b) => [...view.boxes[b].children])];
  utils.remove(nodes);
  await animate(nodes, { opacity: 0, scale: 0.4, duration: ms(240), ease: 'inBack(1.5)' });
}

// -------------------------------------------------------------------- flow

async function drawLine(line, how) {
  if (ui.busy || (how !== 'bot' && botsTurn())) return;
  if (game.winner) {
    // The game is over: point at the way forward.
    shake($('#hint'));
    pop($('#btn-play'), 1.08);
    return;
  }
  if (!isLegal(game, line)) {
    shake(lineEl(line), 3);
    return;
  }
  ui.busy = true;
  game = play(game, line);
  const { player, boxes } = game.last;
  if (game.winner) wins[game.winner] += 1;
  save();
  refresh({ holdScores: true });

  setLine(line, player);
  markLast();
  await drawStrokes([lineEl(line)], 200);
  if (boxes.length) {
    boxes.forEach((b) => setBox(b, player));
    await fillBoxes(boxes.map((b) => view.boxes[b]));
  }
  if (game.winner) await playEnd();

  ui.busy = false;
  refresh();
  if (game.winner) showResult();
  else if (boxes.length) goAgain();
  botTurn();
}

/** Plays the bot's move if it is the bot's turn. */
async function botTurn() {
  if (ui.busy || !botsTurn()) return;
  ui.busy = true;
  refresh();
  await think();
  ui.busy = false;
  if (botsTurn()) drawLine(pickMove(game, bot, BOT, opponent), 'bot');
  else refresh();
}

async function undoMove() {
  const steps = undoSteps();
  if (ui.busy || !steps) return;
  ui.busy = true;
  hideResult(false);
  refresh();
  const { winner } = game;
  for (let i = 0; i < steps; i += 1) {
    await takeBack(game.last);
    game = undoGame(game);
    sync();
  }
  if (winner) wins[winner] = Math.max(0, wins[winner] - 1);
  save();
  ui.busy = false;
  refresh();
}

async function newGame(size = game.size, { resetWins = false, against = opponent } = {}) {
  if (ui.busy) return;
  ui.busy = true;
  hideResult(false);
  refresh();
  await sweep();
  // Players take turns going first. A game with no lines drawn does not count.
  let starter = game.moves.length ? other(game.starter) : game.starter;
  if (resetWins || against !== opponent) {
    wins = freshWins();
    starter = X;
  }
  game = createGame(size, starter);
  opponent = against;
  save();
  sync();
  setRoving(0);
  refresh();
  await intro();
  ui.busy = false;
  refresh();
  botTurn();
}

// ------------------------------------------------------------------ result

function showResult() {
  const box = $('#result');
  const card = box.querySelector('.result-card');
  const markSvg = box.querySelector('.result-mark');
  const { X: x, O: o } = scores(game);
  const where = `on the ${game.size}×${game.size} board`;
  markSvg.replaceChildren();
  if (game.winner === DRAW) {
    const g = svgEl('g', { class: 'draw-sign' }, markSvg);
    svgEl('path', { d: 'M12 19h24' }, g);
    svgEl('path', { d: 'M12 29h24' }, g);
    $('#result-title').textContent = 'Draw';
    $('#result-detail').textContent = `${x} boxes each ${where}.`;
  } else {
    markSvg.appendChild(createMark(game.winner, 48, 10));
    const [won, lost] = game.winner === X ? [x, o] : [o, x];
    $('#result-title').textContent = `${game.winner} wins!`;
    $('#result-detail').textContent = `${won} boxes to ${lost} ${where}.`;
  }
  box.hidden = false;
  animate(card, {
    opacity: [0, 1], scale: [0.8, 1], y: [24, 0], duration: ms(650), ease: 'outBack(1.6)',
  });
  if (game.winner !== DRAW) confetti(box.querySelector('.confetti'));
  $('#btn-again').focus({ preventScroll: true });
}

async function hideResult(animated = true) {
  const box = $('#result');
  if (box.hidden) return;
  const card = box.querySelector('.result-card');
  if (animated) await animate(card, { opacity: 0, scale: 0.9, y: 16, duration: ms(250), ease: 'inQuad' });
  box.hidden = true;
  box.querySelector('.confetti').replaceChildren();
  clearInline([card], 'opacity', 'transform');
}

// ------------------------------------------------------------------- input

board.addEventListener('click', (e) => {
  const slot = e.target.closest('.slot');
  if (slot) drawLine(+slot.dataset.line);
});

// Listening on the HTML wrapper: Chrome makes an <svg> with focus listeners a tab stop.
board.parentElement.addEventListener('focusin', (e) => {
  const slot = e.target.closest?.('.slot');
  if (slot) setRoving(+slot.dataset.line);
});

board.addEventListener('keydown', (e) => {
  const slot = e.target.closest?.('.slot');
  if (!slot) return;
  const line = +slot.dataset.line;
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    drawLine(line);
    return;
  }
  const next = neighbour(line, e.key);
  if (next === undefined) return;
  e.preventDefault();
  if (next !== null) view.slots[next].focus();
});

/** After a keyboard action disables or hides the focused button, carry on from the board. */
function keepFocus() {
  const el = document.activeElement;
  if (el === document.body || el?.disabled || el?.closest('[hidden]')) {
    board.querySelector('.slot[tabindex="0"]')?.focus();
  }
}

// Keyboard activation fires click with detail 0.
const button = (action) => async (e) => {
  await action();
  if (e.detail === 0) keepFocus();
};

$('#btn-undo').addEventListener('click', button(undoMove));
$('#btn-play').addEventListener('click', button(() => newGame()));
$('#btn-again').addEventListener('click', button(() => newGame()));
$('#btn-review').addEventListener('click', async (e) => {
  const keyboard = e.detail === 0;
  await hideResult(true);
  if (keyboard) $('#btn-play').focus();
});

const newDialog = $('#dlg-new');
const newForm = newDialog.querySelector('form');
addOpponentChoice(newForm, 'X');

$('#btn-new').addEventListener('click', () => {
  newForm.elements.boardsize.value = String(game.size);
  newForm.elements.resetwins.checked = false;
  newForm.elements.opponent.value = opponent;
  newDialog.returnValue = '';
  openDialog(newDialog);
});

newDialog.addEventListener('close', () => {
  if (newDialog.returnValue !== 'start') return;
  newGame(Number(newForm.elements.boardsize.value), {
    resetWins: newForm.elements.resetwins.checked, against: newForm.elements.opponent.value,
  });
});

$('#btn-rules').addEventListener('click', () => openDialog($('#dlg-rules')));

document.addEventListener('keydown', (e) => {
  if (document.querySelector('dialog[open]')) return;
  if (e.key === 'Escape' && !$('#result').hidden) {
    hideResult(true);
  } else if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z') {
    e.preventDefault();
    undoMove();
  }
});

// -------------------------------------------------------------------- boot

async function boot() {
  initThemeToggle($('#btn-theme'));
  sync();
  setRoving(Math.max(0, game.lines.indexOf(null)));
  ui.busy = true;
  refresh();
  reveal(document.querySelectorAll('[data-reveal]'));
  await intro();
  ui.busy = false;
  refresh();
  if (game.winner) showResult();
  botTurn();
}

boot();
