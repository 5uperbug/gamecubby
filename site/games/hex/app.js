// Hex: two players on one screen take turns placing stones on a rhombus of
// hexagons. Red joins the top and bottom edges, Blue the left and right.
// Games won are kept across games, and the starting player alternates.

import {
  X, O, SWAP, DEFAULT_SIZE, createGame, isLegal, play, replay, undo as undoGame,
  canSwap, swap as swapGame, lastCell, cellAt, rowOf, colOf, other,
} from './game.js';
import { layout, hexagon, createStone } from './board.js';
import {
  animate, utils, motion, ms, stag, clearInline,
} from '../../shared/js/motion.js';
import { svgEl, drawStrokes } from '../../shared/js/marks.js';
import {
  confetti, fadeIntoClass, openDialog, pop, reveal, shake,
} from '../../shared/js/effects.js';
import { createStore } from '../../shared/js/storage.js';
import {
  OPPONENTS, isBot, pickMove, think,
} from '../../shared/js/bot.js';
import { labelPlayers, setupWizard } from '../../shared/js/opponent.js';
import bot from './bot.js';
import { initThemeToggle } from '../../shared/js/theme.js';

const $ = (sel) => document.querySelector(sel);
const store = createStore('hex');

const NAMES = { [X]: 'Red', [O]: 'Blue' };
const GOAL = { [X]: 'top to bottom', [O]: 'left to right' };

// ------------------------------------------------------------------- state

const BOT = O; // the bot always plays Blue

const freshWins = () => ({ X: 0, O: 0 });

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
  return { wins, game: replay(saved.size, saved.starter, moves, saved.swapRule !== false), opponent };
}

const loaded = loadMatch();
let { wins, game, opponent } = loaded;

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
  shown: { active: null, hint: '', wins: { ...wins } },
};

function save() {
  store.set('match', {
    wins, size: game.size, starter: game.starter, swapRule: game.swapRule, moves: game.moves, opponent,
  });
}

// ------------------------------------------------------------------- board

const R = 30; // hexagon corner radius
const STONE_R = R * 0.8;
const MARGIN = R * 0.6; // room for the coloured edges

const board = $('#board');
const view = {
  size: 0, geo: null, cells: [], slots: [], edges: [], fx: null, ring: null,
};

const name = (cell) => `${String.fromCharCode(65 + colOf(view.size, cell))}${rowOf(view.size, cell) + 1}`;
const stoneAt = (cell) => view.slots[cell].firstChild;
const allStones = () => view.slots.map((slot) => slot.firstChild).filter(Boolean);

/** Builds an empty board: coloured edges at the back, then the cells, then win lines and the focus ring. */
function build(size) {
  utils.remove(board.querySelectorAll('*'));
  board.replaceChildren();
  const geo = layout(size, R);
  const { box } = geo;
  board.setAttribute('viewBox', [box.x - MARGIN, box.y - MARGIN, box.width + 2 * MARGIN, box.height + 2 * MARGIN].join(' '));
  board.style.setProperty('--ratio', (box.width + 2 * MARGIN) / (box.height + 2 * MARGIN));

  const edgeLayer = svgEl('g', { class: 'edges', 'aria-hidden': 'true' }, board);
  view.edges = ['top', 'bottom', 'left', 'right'].map((side) => svgEl('path', {
    class: `edge line-${side === 'top' || side === 'bottom' ? 'x' : 'o'}`, d: geo.edges[side],
  }, edgeLayer));

  const cellLayer = svgEl('g', { class: 'cells' }, board);
  view.cells = [];
  view.slots = [];
  for (let cell = 0; cell < size * size; cell++) {
    const g = svgEl('g', {
      class: 'cell', 'data-cell': cell, role: 'button', tabindex: -1,
    }, cellLayer);
    svgEl('polygon', { class: 'cell-hex', points: hexagon(geo.centre(cell), R) }, g);
    const [x, y] = geo.centre(cell);
    view.slots.push(svgEl('g', { class: 'slot', transform: `translate(${x} ${y})` }, g));
    view.cells.push(g);
  }
  view.fx = svgEl('g', { class: 'fx', 'aria-hidden': 'true' }, board);
  view.ring = svgEl('polygon', { class: 'focus-ring', 'aria-hidden': 'true' }, board);
  view.size = size;
  view.geo = geo;
  board.setAttribute('aria-label', `Board, ${size} by ${size}. Red joins top and bottom, Blue joins left and right.`);
}

function setStone(cell, player) {
  view.slots[cell].replaceChildren();
  if (player) view.slots[cell].appendChild(createStone(player, STONE_R));
  view.cells[cell].classList.toggle('filled', Boolean(player));
  view.cells[cell].setAttribute('aria-label', `${name(cell)}, ${player ? NAMES[player] : 'empty'}`);
}

function markLast() {
  board.querySelector('.cell.last')?.classList.remove('last');
  const last = lastCell(game);
  if (last !== undefined) view.cells[last].classList.add('last');
}

/** The winning chain as a line through the centres of its stones, with an outline. */
function addChainLine() {
  const pts = game.chain.map(view.geo.centre);
  const d = `M${pts.join('L')}`;
  const g = svgEl('g', { class: `chain line-${game.winner.toLowerCase()}` }, view.fx);
  svgEl('path', { class: 'chain-casing', d }, g);
  svgEl('path', { class: 'chain-core', d }, g);
  return g;
}

/** Makes the board match `game` exactly, without animating. */
function sync() {
  if (view.size !== game.size) build(game.size);
  utils.remove(board.querySelectorAll('*'));
  clearInline([...view.cells, ...view.edges], 'opacity', 'transform');
  view.fx.replaceChildren();
  board.classList.remove('over');
  game.cells.forEach((player, cell) => setStone(cell, player));
  markLast();
  if (game.winner) {
    board.classList.add('over');
    for (const cell of game.chain) stoneAt(cell).classList.add('win');
    addChainLine();
  }
}

/** One cell is in the tab order; arrow keys move between cells. */
function setRoving(cell) {
  view.cells.forEach((g, i) => g.setAttribute('tabindex', i === cell ? 0 : -1));
}

function neighbourFor(cell, key) {
  const n = view.size;
  const r = rowOf(n, cell);
  const c = colOf(n, cell);
  const to = {
    ArrowLeft: [r, c - 1], ArrowRight: [r, c + 1], ArrowUp: [r - 1, c], ArrowDown: [r + 1, c],
    Home: [r, 0], End: [r, n - 1],
  }[key];
  if (!to) return undefined;
  const [nr, nc] = to;
  return nr >= 0 && nr < n && nc >= 0 && nc < n ? cellAt(n, nr, nc) : null;
}

// ------------------------------------------------------------------ status

const tag = (p) => `<strong class="${p.toLowerCase()}">${NAMES[p]}</strong>`;

function hintFor() {
  if (game.winner) {
    return `${tag(game.winner)} connects ${GOAL[game.winner]} in ${game.moves.length} moves!`;
  }
  const p = tag(game.turn);
  if (botsTurn()) return `${tag(BOT)} (bot) is thinking…`;
  if (!game.moves.length) return `${p} goes first. Tap any empty hexagon to place a stone.`;
  const last = lastCell(game);
  if (canSwap(game)) {
    return `<span class="sr-only">${NAMES[game.cells[last]]} played ${name(last)}. </span>${p} to move, or <strong>Swap</strong> to take that stone as your own.`;
  }
  if (game.moves.at(-1) === SWAP) {
    return `${tag(other(game.turn))} swapped: the first stone is now theirs, at ${name(last)}. ${p} to move.`;
  }
  return `<span class="sr-only">${NAMES[game.cells[last]]} played ${name(last)}. </span>${p} to move: join ${GOAL[game.turn]}.`;
}

/** Brings all non-board UI in line with the current state. */
function refresh({ holdScores = false } = {}) {
  const over = Boolean(game.winner);
  const active = over ? game.winner : game.turn;
  document.body.classList.toggle('turn-o', active === O);
  document.body.classList.toggle('turn-x', active === X);

  labelPlayers(vsBot() && BOT);
  for (const pill of document.querySelectorAll('.player')) {
    const on = pill.dataset.player === active;
    pill.classList.toggle('active', on);
    if (on && ui.shown.active !== active) animate(pill, { scale: [0.92, 1], duration: ms(500), ease: 'outBack(2.2)' });
  }
  ui.shown.active = active;

  if (!holdScores) {
    for (const p of [X, O]) {
      const node = document.querySelector(`[data-score="${p}"]`);
      node.textContent = wins[p];
      if (wins[p] > ui.shown.wins[p]) pop(node.parentElement, 1.6);
      ui.shown.wins[p] = wins[p];
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
  $('#match-note').textContent = `${n}×${n} board · Red: top to bottom · Blue: left to right`;
  $('#btn-undo').disabled = ui.busy || !undoSteps();
  $('#btn-swap').hidden = !canSwap(game) || botsTurn();
  $('#btn-swap').disabled = ui.busy;
  $('#btn-play').disabled = ui.busy || !over;
  board.classList.toggle('live', !over && !ui.busy && !botsTurn());
}

// -------------------------------------------------------------- animations

/** A new stone pops in and its cross or ring draws on. */
async function dropStone(cell) {
  const stone = stoneAt(cell);
  await Promise.all([
    animate(stone, {
      scale: [0.3, 1], opacity: [0, 1], duration: ms(380), ease: 'outBack(2)',
    }),
    drawStrokes([...stone.querySelectorAll('.stone-cue path')], 220),
  ]);
  clearInline([stone], 'opacity', 'transform');
}

/** Draws the winning chain, the stones along it pulse, everything else steps back. */
async function playWin() {
  const line = addChainLine();
  const winners = game.chain.map(stoneAt);
  winners.forEach((stone) => stone.classList.add('win'));
  const others = allStones().filter((stone) => !stone.classList.contains('win'));
  await Promise.all([...line.children].map((path) => drawStrokes([path], 520)));
  await Promise.all([
    animate(winners, {
      scale: [1, 1.18, 1], duration: ms(480), delay: stag(50), ease: 'inOutQuad',
    }),
    fadeIntoClass(board, 'over', others, 400),
  ]);
  clearInline(winners, 'transform');
}

/** Cells pop in from the middle (with any stones of a resumed game), then the edges draw on. */
async function intro() {
  const n = view.size;
  const lines = [...view.fx.children];
  for (const node of [...view.cells, ...view.edges, ...lines]) node.style.opacity = '0';
  await animate(view.cells, {
    opacity: [0, 1], scale: [0.4, 1], duration: ms(380),
    delay: stag(12, { grid: [n, n], from: 'center' }), ease: 'outBack(1.8)',
  });
  clearInline(view.cells, 'opacity', 'transform');
  const drawing = drawStrokes(view.edges, 260);
  clearInline(view.edges, 'opacity');
  await drawing;
  for (const line of lines) {
    const paths = Promise.all([...line.children].map((path) => drawStrokes([path], 420)));
    clearInline([line], 'opacity');
    await paths;
  }
}

/** Clears the board: the stones shrink away. */
async function sweep() {
  const stones = allStones();
  const lines = [...view.fx.children];
  if (motion.reduced || (!stones.length && !lines.length)) return;
  utils.remove([...stones, ...lines]);
  await Promise.all([
    stones.length && animate(stones, {
      scale: 0, opacity: 0, duration: 260, delay: stag(Math.min(12, 400 / stones.length)), ease: 'inBack(1.6)',
    }),
    lines.length && animate(lines, { opacity: 0, duration: 200, ease: 'outQuad' }),
  ]);
}

/** Fades out the newest stone (and a winning line) before the board re-syncs. */
async function takeBack(cell) {
  const nodes = [stoneAt(cell), ...view.fx.children];
  const dimmed = board.classList.contains('over') ? allStones().filter((s) => s !== stoneAt(cell)) : [];
  utils.remove(nodes);
  await Promise.all([
    animate(nodes, { opacity: 0, scale: 0.4, duration: ms(240), ease: 'inBack(1.5)' }),
    dimmed.length && animate(dimmed, { opacity: 1, duration: ms(240), ease: 'outQuad' }),
  ]);
}

// -------------------------------------------------------------------- flow

async function place(cell, how) {
  if (ui.busy || (how !== 'bot' && botsTurn())) return;
  if (game.winner) {
    // The game is over: point at the way forward.
    shake($('#hint'));
    pop($('#btn-play'), 1.08);
    return;
  }
  if (!isLegal(game, cell)) {
    shake(view.cells[cell], 3);
    return;
  }
  ui.busy = true;
  game = play(game, cell);
  if (game.winner) wins[game.winner] += 1;
  save();
  setStone(cell, game.cells[cell]);
  markLast();
  refresh({ holdScores: true });

  await dropStone(cell);
  if (game.winner) await playWin();

  ui.busy = false;
  refresh();
  if (game.winner) showResult();
  botTurn();
}

/** Plays the bot's move (a stone, or taking over the first one) if it is the bot's turn. */
async function botTurn() {
  if (ui.busy || !botsTurn()) return;
  ui.busy = true;
  refresh();
  await think();
  ui.busy = false;
  if (!botsTurn()) {
    refresh();
    return;
  }
  const move = pickMove(game, bot, BOT, opponent);
  if (move === SWAP) swapMove('bot');
  else place(move, 'bot');
}

/** The second player takes over the first stone: it fades out and reappears mirrored in their colour. */
async function swapMove(how) {
  if (ui.busy || !canSwap(game) || (how !== 'bot' && botsTurn())) return;
  ui.busy = true;
  const from = game.moves[0];
  refresh();
  await takeBack(from);
  game = swapGame(game);
  save();
  const to = lastCell(game);
  setStone(from, null);
  setStone(to, game.cells[to]);
  markLast();
  refresh();
  await dropStone(to);
  ui.busy = false;
  refresh();
  botTurn();
}

async function undoMove() {
  const steps = undoSteps();
  if (ui.busy || !steps) return;
  ui.busy = true;
  hideResult(false);
  refresh();
  const { winner } = game;
  for (let i = 0; i < steps; i += 1) {
    await takeBack(lastCell(game));
    game = undoGame(game);
    sync();
  }
  if (winner) wins[winner] = Math.max(0, wins[winner] - 1);
  save();
  sync();
  ui.busy = false;
  refresh();
}

async function newGame(size = game.size, { resetWins = false, swapRule = game.swapRule, against = opponent } = {}) {
  if (ui.busy) return;
  ui.busy = true;
  hideResult(false);
  refresh();
  await sweep();
  // Players take turns going first. A game with no stones placed does not count.
  let starter = game.moves.length ? other(game.starter) : game.starter;
  if (resetWins || against !== opponent) {
    wins = freshWins();
    starter = X;
  }
  game = createGame(size, starter, swapRule);
  opponent = against;
  save();
  sync();
  setRoving(Math.floor(game.cells.length / 2));
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
  markSvg.replaceChildren();
  const stone = createStone(game.winner, 21);
  stone.setAttribute('transform', 'translate(24 24)');
  markSvg.appendChild(stone);
  $('#result-title').textContent = `${NAMES[game.winner]} wins!`;
  $('#result-detail').textContent = `Connected ${GOAL[game.winner]} with ${game.chain.length} stones, in ${game.moves.length} moves.`;
  box.hidden = false;
  animate(card, {
    opacity: [0, 1], scale: [0.8, 1], y: [24, 0], duration: ms(650), ease: 'outBack(1.6)',
  });
  confetti(box.querySelector('.confetti'));
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

const cellFrom = (target) => target.closest?.('.cell');

board.addEventListener('click', (e) => {
  const g = cellFrom(e.target);
  if (g) place(+g.dataset.cell);
});

// Listening on the HTML wrapper: Chrome makes an <svg> with focus listeners a tab stop.
board.parentElement.addEventListener('focusin', (e) => {
  const g = cellFrom(e.target);
  if (!g) return;
  const cell = +g.dataset.cell;
  setRoving(cell);
  // Drawn on top, so neighbouring cells don't cover it.
  view.ring.setAttribute('points', hexagon(view.geo.centre(cell), R - 2));
  view.ring.classList.toggle('shown', g.matches(':focus-visible'));
});

board.parentElement.addEventListener('focusout', () => view.ring.classList.remove('shown'));

board.addEventListener('keydown', (e) => {
  const g = cellFrom(e.target);
  if (!g || e.altKey || e.ctrlKey || e.metaKey) return;
  const cell = +g.dataset.cell;
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    place(cell);
    return;
  }
  const next = neighbourFor(cell, e.key);
  if (next === undefined) return;
  e.preventDefault();
  if (next !== null) view.cells[next].focus();
});

/** After a keyboard action disables or hides the focused button, carry on from the board. */
function keepFocus() {
  const el = document.activeElement;
  if (el === document.body || el?.disabled || el?.closest('[hidden]')) {
    board.querySelector('.cell[tabindex="0"]')?.focus();
  }
}

// Keyboard activation fires click with detail 0.
const button = (action) => async (e) => {
  await action();
  if (e.detail === 0) keepFocus();
};

$('#btn-undo').addEventListener('click', button(undoMove));
$('#btn-swap').addEventListener('click', button(() => swapMove()));
$('#btn-play').addEventListener('click', button(() => newGame()));
$('#btn-again').addEventListener('click', button(() => newGame()));
$('#btn-review').addEventListener('click', async (e) => {
  const keyboard = e.detail === 0;
  await hideResult(true);
  if (keyboard) $('#btn-play').focus();
});

const newDialog = $('#dlg-new');
const newForm = newDialog.querySelector('form');
setupWizard(newForm, 'Red');

function fillNewForm() {
  newForm.elements.boardsize.value = String(game.size);
  newForm.elements.resetwins.checked = false;
  newForm.elements.swaprule.checked = game.swapRule;
  newForm.elements.opponent.value = opponent;
}

function startFromForm() {
  const size = Number(newForm.elements.boardsize.value) || DEFAULT_SIZE;
  newGame(size, {
    resetWins: newForm.elements.resetwins.checked,
    swapRule: newForm.elements.swaprule.checked,
    against: newForm.elements.opponent.value,
  });
}


$('#btn-new').addEventListener('click', () => {
  fillNewForm();
  newDialog.returnValue = '';
  openDialog(newDialog);
});

newDialog.addEventListener('close', () => {
  if (newDialog.returnValue === 'start') booted.then(startFromForm);
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
  setRoving(game.moves.at(-1) ?? Math.floor(game.cells.length / 2));
  ui.busy = true;
  refresh();
  reveal(document.querySelectorAll('[data-reveal]'));
  // Nothing played yet in this match: start with the setup wizard, over the intro.
  if (!game.moves.length && !Object.values(wins).some(Boolean)) $('#btn-new').click();
  await intro();
  ui.busy = false;
  refresh();
  if (game.winner) showResult();
  botTurn();
}

const booted = boot();
