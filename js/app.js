import { animate, stagger, utils } from '../vendor/animejs/anime.esm.min.js';
import {
  X, O, DRAW, POSITION_NAMES, createGame, applyMove, playableBoards, isLegalMove,
  isBoardOpen, replay, undo as undoGame, boardsWon,
} from './game.js';
import { BoardView, createMark, ms, motion } from './board-view.js';

// ----------------------------------------------------------------- storage

const KEYS = { game: 'mttt.game', prefs: 'mttt.prefs', theme: 'mttt.theme' };

const store = {
  get(key) {
    try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode */ }
  },
};

// ------------------------------------------------------------------- state

const $ = (sel) => document.querySelector(sel);
const wait = (t) => new Promise((resolve) => setTimeout(resolve, ms(t)));

const ui = {
  mode: 'overview', // 'overview' | 'zoom'
  board: null, // zoomed board
  pending: null, // { b, c } chosen but not confirmed
  busy: false, // an animation owns the board
  committing: null, // move being animated after confirm
  keyboard: false, // last activation came from the keyboard
  shown: { turn: null, hint: '', scores: { X: 0, O: 0 } },
};

let prefs = { autoZoom: false, ...store.get(KEYS.prefs) };
let state = loadGame();

function loadGame() {
  const saved = store.get(KEYS.game);
  if (saved && Array.isArray(saved.moves)) {
    const moves = saved.moves
      .filter((m) => Array.isArray(m) && m.length === 2)
      .map(([board, cell]) => ({ board, cell }));
    return replay(saved.rules || {}, moves);
  }
  return createGame({});
}

function saveGame() {
  store.set(KEYS.game, { rules: state.rules, moves: state.history.map((m) => [m.board, m.cell]) });
}

const view = new BoardView($('#board'), { onBoard, onCell });

// ------------------------------------------------------------- status text

const tag = (p) => `<strong class="${p.toLowerCase()}">${p}</strong>`;
const where = (b) => `<strong>${POSITION_NAMES[b]}</strong>`;

function hintFor() {
  if (state.winner === DRAW) return 'It’s a draw — nobody can complete a line of boards.';
  if (state.winner) return `${tag(state.winner)} wins the game!`;
  if (ui.committing) {
    const { player, board, cell } = ui.committing;
    return `${tag(player)} played the ${POSITION_NAMES[cell]} cell of the ${where(board)} board.`;
  }
  const p = tag(state.turn);
  if (ui.mode === 'zoom') {
    if (ui.pending) return `${p}: confirm your move, or tap another cell.`;
    return `${p}: place your mark in the ${where(ui.board)} board.`;
  }
  const boards = playableBoards(state);
  if (!state.history.length) return `${p} starts — pick any board to zoom in.`;
  if (boards.length === 1) {
    const owner = state.boards[boards[0]];
    if (owner === X || owner === O) {
      return `${p}: you’re sent to the ${where(boards[0])} board. ${owner} already won it, but it still has room, so you play there.`;
    }
    return `${p}: you’re sent to the ${where(boards[0])} board. Tap it to zoom in.`;
  }
  if (state.target !== null && !isBoardOpen(state, state.target)) {
    return `${p}: the ${where(state.target)} board is closed, so pick any highlighted board.`;
  }
  return `${p}: pick any highlighted board.`;
}

/** Brings all non-board UI in line with the current state. */
function refresh() {
  const over = Boolean(state.winner);
  const shownTurn = over ? (state.winner === DRAW ? state.turn : state.winner) : state.turn;
  document.body.classList.toggle('turn-o', shownTurn === O);
  document.body.classList.toggle('turn-x', shownTurn === X);
  document.body.classList.toggle('rules-open', state.rules.openBoards);
  document.body.classList.toggle('game-over', over);

  for (const pill of document.querySelectorAll('.player')) {
    const active = over ? pill.dataset.player === state.winner : pill.dataset.player === state.turn;
    pill.classList.toggle('active', active);
    if (active && ui.shown.turn !== shownTurn) {
      animate(pill, { scale: [0.92, 1], duration: ms(500), ease: 'outBack(2.2)' });
    }
  }
  ui.shown.turn = shownTurn;

  for (const p of [X, O]) {
    const n = boardsWon(state, p);
    const node = document.querySelector(`[data-score="${p}"]`);
    node.textContent = n;
    if (ui.shown.scores[p] !== n && n > 0) {
      animate(node.parentElement, { scale: [1.6, 1], duration: ms(700), ease: 'outElastic(1, .5)' });
    }
    ui.shown.scores[p] = n;
  }

  const hint = hintFor();
  if (hint !== ui.shown.hint) {
    const node = $('#hint');
    node.innerHTML = hint;
    animate(node, { opacity: [0, 1], x: [8, 0], duration: ms(350), ease: 'outQuad' });
    ui.shown.hint = hint;
  }

  $('#rules-badge').textContent = state.rules.openBoards ? 'Rules: open boards variant' : 'Rules: classic';
  $('#btn-undo').disabled = ui.busy || !state.history.length;
  $('#btn-back').disabled = ui.busy || ui.mode !== 'zoom';
  $('#btn-confirm').disabled = ui.busy || !ui.pending;
  view.labelBoards(state, ui.mode === 'overview' ? playableBoards(state) : []);
}

function nudgeHint() {
  animate('#hint', { x: [0, -5, 5, -3, 3, 0], duration: ms(400), ease: 'linear' });
}

// ------------------------------------------------------------------- flow

async function onBoard(b, how) {
  ui.keyboard = how === 'keyboard';
  if (ui.busy || state.winner) return;
  if (!playableBoards(state).includes(b)) {
    view.shake(b);
    nudgeHint();
    return;
  }
  await zoomIn(b);
}

async function zoomIn(b) {
  ui.busy = true;
  ui.mode = 'zoom';
  ui.board = b;
  ui.pending = null;
  refresh();
  await view.zoomIn(b);
  ui.busy = false;
  refresh();
  if (ui.keyboard) {
    const first = state.cells[b].findIndex((v) => v === null);
    view.focusCell(b, first === -1 ? 0 : first);
  }
}

function onCell(b, c, how) {
  ui.keyboard = how === 'keyboard';
  if (ui.busy || ui.mode !== 'zoom' || b !== ui.board) return;
  if (!isLegalMove(state, b, c)) {
    view.shakeCell(b, c);
    return;
  }
  if (!ui.pending || ui.pending.c !== c) {
    ui.pending = { b, c };
    view.showPending(b, c, state.turn);
    refresh();
    animate('#btn-confirm', { scale: [0.94, 1], duration: ms(450), ease: 'outBack(2.5)' });
  }
  if (ui.keyboard) $('#btn-confirm').focus();
}

async function confirmMove() {
  if (ui.busy || !ui.pending) return;
  const { b, c } = ui.pending;
  ui.busy = true;
  ui.committing = { player: state.turn, board: b, cell: c };
  ui.pending = null;
  refresh();

  const { state: next, events } = applyMove(state, b, c);
  state = next;
  saveGame();

  await view.commit(events);
  ui.mode = 'overview';
  ui.board = null;
  await view.zoomOut();
  ui.committing = null;
  refresh();

  if (events.gameWon || events.gameDrawn) {
    if (events.gameWon) await view.playGameWin(events.gameLine, events.player);
    else await view.playGameDraw();
    ui.busy = false;
    refresh();
    showResult();
    return;
  }

  const boards = playableBoards(state);
  await view.sendTo(b, c, boards, state.turn);
  await view.highlight(boards, state.turn);
  ui.busy = false;
  refresh();

  if (prefs.autoZoom && boards.length === 1) {
    await wait(250);
    if (!ui.busy && ui.mode === 'overview' && state.history.length && !state.winner) await zoomIn(boards[0]);
  } else if (ui.keyboard) {
    view.focusBoard(boards[0]);
  }
}

async function backToOverview() {
  if (ui.busy || ui.mode !== 'zoom') return;
  const b = ui.board;
  ui.busy = true;
  view.clearPending();
  ui.pending = null;
  ui.mode = 'overview';
  ui.board = null;
  refresh();
  await view.zoomOut();
  await view.highlight(playableBoards(state), state.turn);
  ui.busy = false;
  refresh();
  if (ui.keyboard) view.focusBoard(b);
}

async function undoMove() {
  if (ui.busy || !state.history.length) return;
  ui.busy = true;
  hideResult(false);
  view.clearPending();
  ui.pending = null;
  if (ui.mode === 'zoom') {
    ui.mode = 'overview';
    ui.board = null;
    refresh();
    await view.zoomOut();
  }
  refresh();
  const last = state.history.at(-1);
  const prev = undoGame(state);
  view.clearHighlight();
  await view.takeBack(last, prev.boards[last.board] !== state.boards[last.board]);
  state = prev;
  saveGame();
  view.sync(state);
  await view.highlight(playableBoards(state), state.turn);
  ui.busy = false;
  refresh();
}

async function newGame(rules) {
  if (ui.busy) return;
  ui.busy = true;
  hideResult(false);
  view.clearPending();
  ui.pending = null;
  if (ui.mode === 'zoom') {
    ui.mode = 'overview';
    ui.board = null;
    refresh();
    await view.zoomOut();
  }
  view.clearHighlight();
  await view.clearAway();
  state = createGame(rules);
  saveGame();
  view.sync(state);
  refresh();
  await view.intro();
  await view.highlight(playableBoards(state), state.turn);
  ui.busy = false;
  refresh();
}

// ------------------------------------------------------------------ result

function showResult() {
  const box = $('#result');
  const card = box.querySelector('.result-card');
  const markSvg = box.querySelector('.result-mark');
  const moves = state.history.length;
  const scoreX = boardsWon(state, X);
  const scoreO = boardsWon(state, O);
  markSvg.replaceChildren();
  if (state.winner === DRAW) {
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('class', 'draw-sign');
    g.innerHTML = '<path d="M12 19h24"/><path d="M12 29h24"/>';
    markSvg.appendChild(g);
    $('#result-title').textContent = 'Draw';
    $('#result-detail').textContent = `Boards won: X ${scoreX} – ${scoreO} O · ${moves} moves`;
  } else {
    markSvg.appendChild(createMark(state.winner, 48, 10));
    $('#result-title').textContent = `${state.winner} wins!`;
    const n = state.winner === X ? scoreX : scoreO;
    $('#result-detail').textContent = `Three boards in a row · ${n} board${n === 1 ? '' : 's'} won · ${moves} moves`;
  }
  box.hidden = false;
  animate(card, { opacity: [0, 1], scale: [0.8, 1], y: [24, 0], duration: ms(650), ease: 'outBack(1.6)' });
  if (state.winner !== DRAW) confetti(box.querySelector('.confetti'));
  $('#btn-again').focus({ preventScroll: true });
}

async function hideResult(animated = true) {
  const box = $('#result');
  if (box.hidden) return;
  const card = box.querySelector('.result-card');
  if (animated) await animate(card, { opacity: 0, scale: 0.9, y: 16, duration: ms(250), ease: 'inQuad' });
  box.hidden = true;
  box.querySelector('.confetti').replaceChildren();
  card.style.removeProperty('opacity');
  card.style.removeProperty('transform');
}

function confetti(host) {
  if (motion.reduced) return;
  host.replaceChildren();
  const css = getComputedStyle(document.documentElement);
  const colours = ['--x', '--o', '--focus'].map((v) => css.getPropertyValue(v).trim()).concat('#f5b82e');
  const pieces = Array.from({ length: 44 }, (_, i) => {
    const piece = document.createElement('i');
    piece.style.background = colours[i % colours.length];
    host.appendChild(piece);
    return piece;
  });
  animate(pieces, {
    x: () => utils.random(-190, 190),
    y: [
      { to: () => utils.random(-230, -90), duration: 600, ease: 'outCubic' },
      { to: () => utils.random(140, 300), duration: 1100, ease: 'inQuad' },
    ],
    rotate: () => utils.random(-720, 720),
    scale: [{ from: 0, to: () => utils.random(6, 12) / 10, duration: 250 }],
    opacity: [{ to: 1, duration: 100 }, { to: 0, delay: 1200, duration: 400 }],
    duration: 1700,
    delay: stagger(12),
    ease: 'outQuad',
    onComplete: () => host.replaceChildren(),
  });
}

// ----------------------------------------------------------------- dialogs

function openDialog(dialog) {
  dialog.showModal();
  animate(dialog, { opacity: [0, 1], y: [28, 0], scale: [0.96, 1], duration: ms(420), ease: 'outBack(1.4)' });
}

const newDialog = $('#dlg-new');
const newForm = newDialog.querySelector('form');

$('#btn-new').addEventListener('click', () => {
  newForm.variant.value = state.rules.openBoards ? 'open' : 'classic';
  newForm.autozoom.checked = prefs.autoZoom;
  newDialog.returnValue = '';
  openDialog(newDialog);
});

newDialog.addEventListener('close', () => {
  if (newDialog.returnValue !== 'start') return;
  prefs = { ...prefs, autoZoom: newForm.autozoom.checked };
  store.set(KEYS.prefs, prefs);
  newGame({ openBoards: newForm.variant.value === 'open' });
});

$('#btn-rules').addEventListener('click', () => openDialog($('#dlg-rules')));

// ------------------------------------------------------------------- theme

function applyTheme(theme, { persist = true, animateIcon = true } = {}) {
  document.documentElement.dataset.theme = theme;
  if (persist) {
    try { localStorage.setItem(KEYS.theme, theme); } catch { /* ignore */ }
  }
  const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute('content', bg));
  const btn = $('#btn-theme');
  btn.setAttribute('aria-label', theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');
  btn.title = btn.getAttribute('aria-label');
  if (animateIcon) {
    animate(btn.querySelector('svg'), { rotate: [-120, 0], scale: [0.4, 1], duration: ms(600), ease: 'outBack(2)' });
  }
}

$('#btn-theme').addEventListener('click', () => {
  applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
});

window.matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', (e) => {
  let saved = null;
  try { saved = localStorage.getItem(KEYS.theme); } catch { /* ignore */ }
  if (!saved) applyTheme(e.matches ? 'dark' : 'light', { persist: false });
});

// ---------------------------------------------------------------- controls

$('#btn-confirm').addEventListener('click', confirmMove);
$('#btn-back').addEventListener('click', (e) => {
  ui.keyboard = e.detail === 0;
  backToOverview();
});
$('#btn-undo').addEventListener('click', undoMove);
$('#btn-again').addEventListener('click', () => newGame(state.rules));
$('#btn-review').addEventListener('click', () => hideResult(true));

document.addEventListener('keydown', (e) => {
  if (document.querySelector('dialog[open]')) return;
  if (e.key === 'Escape') {
    if (!$('#result').hidden) {
      hideResult(true);
    } else if (ui.mode === 'zoom') {
      e.preventDefault();
      ui.keyboard = true;
      backToOverview();
    }
  } else if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z') {
    e.preventDefault();
    undoMove();
  }
});

// -------------------------------------------------------------------- boot

async function boot() {
  applyTheme(document.documentElement.dataset.theme, { persist: false, animateIcon: false });
  view.sync(state);
  ui.busy = true;
  refresh();
  const chrome = ['.topbar', '.status', '.controls'].map((s) => $(s));
  animate(chrome, {
    opacity: [0, 1], y: [-10, 0], duration: ms(500), delay: stagger(ms(90)), ease: 'outQuad',
    onComplete: () => chrome.forEach((n) => n.style.removeProperty('transform')),
  });
  await view.intro();
  await view.highlight(playableBoards(state), state.turn);
  ui.busy = false;
  refresh();
  if (state.winner) showResult();
}

boot();
