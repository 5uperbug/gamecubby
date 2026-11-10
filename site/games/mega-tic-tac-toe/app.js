import {
  X, O, DRAW, POSITION_NAMES, createGame, applyMove, playableBoards, isLegalMove,
  isBoardOpen, replay, undo as undoGame, boardsWon,
} from './game.js';
import { BoardView } from './board-view.js';
import { animate, ms, wait } from '../../shared/js/motion.js';
import { createMark, svgEl } from '../../shared/js/marks.js';
import {
  confetti, openDialog, pop, reveal, shake,
} from '../../shared/js/effects.js';
import { createStore } from '../../shared/js/storage.js';
import {
  OPPONENTS, isBot, pickMove, think,
} from '../../shared/js/bot.js';
import { addOpponentChoice, labelPlayers } from '../../shared/js/opponent.js';
import bot from './bot.js';
import { initThemeToggle } from '../../shared/js/theme.js';

const store = createStore('mega-tic-tac-toe');

// ------------------------------------------------------------------- state

const $ = (sel) => document.querySelector(sel);

const ui = {
  mode: 'overview', // 'overview' | 'zoom'
  board: null, // zoomed board
  pending: null, // { b, c } chosen but not confirmed
  busy: false, // an animation owns the board
  committing: null, // move being animated after confirm
  keyboard: false, // last activation came from the keyboard
  shown: { turn: null, hint: '', scores: { X: 0, O: 0 } },
};

const BOT = O; // the bot always plays O

let prefs = { autoZoom: false, ...store.get('prefs') };
let opponent = OPPONENTS.includes(store.get('game')?.opponent) ? store.get('game').opponent : 'human';
let state = loadGame();

const vsBot = () => isBot(opponent);
const botsTurn = () => vsBot() && !state.winner && state.turn === BOT;

/** Moves to take back so it is a person's turn again (0 if there are none). */
function undoSteps() {
  if (!vsBot()) return state.history.length ? 1 : 0;
  let s = state;
  for (let n = 1; n <= state.history.length; n += 1) {
    s = undoGame(s);
    if (s.turn !== BOT) return n;
  }
  return 0;
}

function loadGame() {
  const saved = store.get('game');
  if (saved && Array.isArray(saved.moves)) {
    const moves = saved.moves
      .filter((m) => Array.isArray(m) && m.length === 2)
      .map(([board, cell]) => ({ board, cell }));
    return replay(saved.rules || {}, moves);
  }
  return createGame({});
}

function saveGame() {
  store.set('game', { rules: state.rules, moves: state.history.map((m) => [m.board, m.cell]), opponent });
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
  if (botsTurn()) return `${tag(BOT)} (bot) is ${ui.pending ? 'playing here' : 'thinking'}…`;
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

  labelPlayers(vsBot() && BOT);
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
    if (ui.shown.scores[p] !== n && n > 0) pop(node.parentElement, 1.6);
    ui.shown.scores[p] = n;
  }

  const hint = hintFor();
  if (hint !== ui.shown.hint) {
    const node = $('#hint');
    node.innerHTML = hint;
    animate(node, { opacity: [0, 1], x: [8, 0], duration: ms(350), ease: 'outQuad' });
    ui.shown.hint = hint;
  }

  $('#rules-note').textContent = state.rules.openBoards ? 'Rules: open boards variant' : 'Rules: classic';
  $('#btn-undo').disabled = ui.busy || !undoSteps();
  $('#btn-back').disabled = ui.busy || ui.mode !== 'zoom';
  $('#btn-confirm').disabled = ui.busy || !ui.pending;
  view.labelBoards(state, ui.mode === 'overview' ? playableBoards(state) : []);
}

// ------------------------------------------------------------------- flow

async function onBoard(b, how) {
  ui.keyboard = how === 'keyboard';
  if (ui.busy || state.winner || botsTurn()) return;
  if (!playableBoards(state).includes(b)) {
    view.shake(b);
    shake($('#hint'));
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
  if (ui.busy || ui.mode !== 'zoom' || b !== ui.board || botsTurn()) return;
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

  if (botsTurn()) {
    const boards = playableBoards(state);
    await view.sendTo(b, c, boards, state.turn);
    await view.highlight(boards, state.turn);
    ui.busy = false;
    botTurn();
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

/** Plays the bot's move the way a person would: zoom in, place, confirm. */
async function botTurn() {
  if (ui.busy || !botsTurn()) return;
  ui.busy = true;
  refresh();
  await think();
  if (!botsTurn()) {
    ui.busy = false;
    refresh();
    return;
  }
  const [b, c] = pickMove(state, bot, BOT, opponent);
  ui.mode = 'zoom';
  ui.board = b;
  refresh();
  await view.zoomIn(b);
  ui.pending = { b, c };
  view.showPending(b, c, state.turn);
  refresh();
  await wait(ms(400));
  ui.busy = false;
  confirmMove();
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
  const steps = undoSteps();
  if (ui.busy || !steps) return;
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
  view.clearHighlight();
  for (let i = 0; i < steps; i += 1) {
    const last = state.history.at(-1);
    const prev = undoGame(state);
    await view.takeBack(last, prev.boards[last.board] !== state.boards[last.board]);
    state = prev;
    view.sync(state);
  }
  saveGame();
  await view.highlight(playableBoards(state), state.turn);
  ui.busy = false;
  refresh();
}

async function newGame(rules, against = opponent) {
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
  opponent = against;
  saveGame();
  view.sync(state);
  refresh();
  await view.intro();
  await view.highlight(playableBoards(state), state.turn);
  ui.busy = false;
  refresh();
  botTurn();
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
    const g = svgEl('g', { class: 'draw-sign' }, markSvg);
    svgEl('path', { d: 'M12 19h24' }, g);
    svgEl('path', { d: 'M12 29h24' }, g);
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

// ----------------------------------------------------------------- dialogs

const newDialog = $('#dlg-new');
const newForm = newDialog.querySelector('form');
addOpponentChoice(newForm, 'X');

$('#btn-new').addEventListener('click', () => {
  newForm.variant.value = state.rules.openBoards ? 'open' : 'classic';
  newForm.autozoom.checked = prefs.autoZoom;
  newForm.elements.opponent.value = opponent;
  newDialog.returnValue = '';
  openDialog(newDialog);
});

newDialog.addEventListener('close', () => {
  if (newDialog.returnValue !== 'start') return;
  prefs = { ...prefs, autoZoom: newForm.autozoom.checked };
  store.set('prefs', prefs);
  newGame({ openBoards: newForm.variant.value === 'open' }, newForm.elements.opponent.value);
});

$('#btn-rules').addEventListener('click', () => openDialog($('#dlg-rules')));

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
  initThemeToggle($('#btn-theme'));
  view.sync(state);
  ui.busy = true;
  refresh();
  reveal(document.querySelectorAll('[data-reveal]'));
  await view.intro();
  await view.highlight(playableBoards(state), state.turn);
  ui.busy = false;
  refresh();
  if (state.winner) showResult();
  botTurn();
}

boot();
