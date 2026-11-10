// Gomoku: five in a row on a 15×15 grid, for two players on one screen.
// When cells are too small to tap reliably, the first tap zooms in on that
// part of the board. Every move is placed first, then confirmed.

import {
  X, O, DRAW, CENTER, createGame, isLegal, play, replay, undo as undoGame, overlines, other,
  rowOf, colOf,
} from './game.js';
import { BoardView } from './board-view.js';
import {
  animate, ms, clearInline, wait,
} from '../../shared/js/motion.js';
import { createMark, svgEl } from '../../shared/js/marks.js';
import {
  confetti, openDialog, pop, reveal, shake,
} from '../../shared/js/effects.js';
import { createStore } from '../../shared/js/storage.js';
import {
  OPPONENTS, isBot, pickMove, think,
} from '../../shared/js/bot.js';
import { labelPlayers, setupWizard } from '../../shared/js/opponent.js';
import bot from './bot.js';
import { initThemeToggle } from '../../shared/js/theme.js';

const $ = (sel) => document.querySelector(sel);
const store = createStore('gomoku');

// Cells drawn smaller than this, in CSS pixels, are too fiddly to tap: the first tap zooms in.
const MIN_TAP = 34;

// ------------------------------------------------------------------- state

function load() {
  const saved = store.get('match');
  const scores = { X: 0, O: 0 };
  if (!saved || typeof saved !== 'object') return { scores, game: createGame(), opponent: 'human' };
  for (const p of [X, O]) {
    const n = saved.scores?.[p];
    if (Number.isInteger(n) && n >= 0) scores[p] = n;
  }
  const moves = Array.isArray(saved.moves) ? saved.moves : [];
  const opponent = OPPONENTS.includes(saved.opponent) ? saved.opponent : 'human';
  return { scores, game: replay(saved.rules, saved.starter, moves), opponent };
}

const BOT = O; // the bot always plays O

let { scores, game, opponent } = load();

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

function save() {
  store.set('match', {
    scores, rules: game.rules, starter: game.starter, moves: game.moves, opponent,
  });
}

const ui = {
  small: false, // cells are too small to tap, so the first tap zooms in
  pending: null, // cell chosen but not confirmed
  busy: false, // an animation owns the board
  committing: null, // { player, cell } while a confirmed move animates
  focusReturn: null, // control button to give focus back to after an action
  shown: { active: null, hint: '', scores: { ...scores } },
};

const view = new BoardView($('#board'), { onCell });

// ------------------------------------------------------------- status text

const tag = (p) => `<strong class="${p.toLowerCase()}">${p}</strong>`;
const NUMBERS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
const inARow = (n) => `${NUMBERS[n] ?? n} in a row`;
const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const longestLine = () => Math.max(...game.lines.map((line) => line.length));
const where = (cell) => `row ${rowOf(cell) + 1}, column ${colOf(cell) + 1}`;

function hintFor() {
  if (game.winner === DRAW) return 'The board is full. It’s a draw.';
  if (game.winner) return `${tag(game.winner)} wins with ${inARow(longestLine())}!`;
  if (ui.committing) return `${tag(ui.committing.player)} played ${where(ui.committing.cell)}.`;
  const p = tag(game.turn);
  if (botsTurn()) return `${tag(BOT)} (bot) is thinking…`;
  if (ui.pending !== null) return `${p}: confirm your move, or tap another cell.`;
  if (view.zoomed) return `${p}: tap a cell to place your mark.`;
  const lead = game.moves.length ? `${p} to move.` : `${p} goes first.`;
  const overline = game.rules.exactFive ? overlines(game)[0] : null;
  if (overline) return `${capitalize(inARow(overline.length))} doesn’t count. ${lead}`;
  return ui.small ? `${lead} Tap where you want to play to zoom in.` : `${lead} Tap a cell to place your mark.`;
}

/** Brings all non-board UI in line with the current state. */
function refresh({ holdScores = false } = {}) {
  const over = Boolean(game.winner);
  const active = over ? game.winner : game.turn; // 'D' after a draw: no pill is highlighted
  const accent = active === DRAW ? game.turn : active;
  document.body.classList.toggle('turn-o', accent === O);
  document.body.classList.toggle('turn-x', accent === X);
  document.body.classList.toggle('game-over', over);

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
      node.textContent = scores[p];
      if (scores[p] > ui.shown.scores[p]) pop(node.parentElement, 1.6);
      ui.shown.scores[p] = scores[p];
    }
  }

  const hint = hintFor();
  if (hint !== ui.shown.hint) {
    const node = $('#hint');
    node.innerHTML = hint;
    animate(node, { opacity: [0, 1], x: [8, 0], duration: ms(350), ease: 'outQuad' });
    ui.shown.hint = hint;
  }

  $('#rules-note').textContent = game.rules.exactFive
    ? 'Exactly five: six or more in a row doesn’t count'
    : 'Freestyle: five or more in a row wins';

  $('#btn-undo').disabled = ui.busy || !undoSteps();
  const back = $('#btn-back');
  back.disabled = ui.busy || (ui.pending === null && !view.zoomed);
  back.classList.toggle('cancel', !ui.small);
  $('#back-label').textContent = ui.small ? 'Whole board' : 'Cancel';
  const primary = $('#btn-confirm');
  primary.disabled = ui.busy || (!over && ui.pending === null);
  primary.classList.toggle('again', over);
  $('#confirm-label').textContent = over ? 'Play again' : 'Confirm';
  view.setInput(tapMode(over), ui.busy || botsTurn());
}

/** Disabling a focused button drops focus to the page, so actions note which control had it. */
function holdFocus() {
  const focused = document.activeElement;
  ui.focusReturn = focused?.matches('.controls button') ? focused : null;
}

/** Gives focus back to that control, or to the board if the control is now off (Confirm, Cancel). */
function restoreFocus() {
  const button = ui.focusReturn;
  ui.focusReturn = null;
  const active = document.activeElement;
  if (!button || (active !== document.body && active !== button)) return;
  if (button.disabled) view.focus();
  else button.focus();
}

/** What the next tap on the board does. */
function tapMode(over) {
  if (ui.busy || over || botsTurn()) return '';
  return view.zoomed || !ui.small ? 'place' : 'zoom';
}

/** Picks tap-to-zoom or direct placement from the size the cells are drawn at. */
function syncMode() {
  ui.small = view.cellPx() < MIN_TAP;
  if (!ui.small && view.zoomed && !ui.busy) {
    // The board grew big enough: show it whole, keeping any pending mark.
    ui.busy = true;
    refresh();
    view.zoomOut().then(() => {
      ui.busy = false;
      refresh();
    });
    return;
  }
  refresh();
}

// ------------------------------------------------------------------- flow

async function onCell(cell, how) {
  const keyboard = how === 'keyboard';
  if (ui.busy || botsTurn()) return;
  if (game.winner) {
    // The game is over: point at the way forward.
    shake($('#hint'));
    pop($('#btn-confirm'), 1.08);
    return;
  }
  if (ui.small && !view.zoomed) {
    await zoomIn(cell);
    // The keyboard cursor already names an exact cell, so place the mark there too.
    if (!keyboard || !isLegal(game, cell)) return;
  } else if (!isLegal(game, cell)) {
    view.shakeCell(cell);
    return;
  }
  if (ui.pending === cell) {
    await confirmMove();
    return;
  }
  placePending(cell);
}

async function zoomIn(cell) {
  ui.busy = true;
  refresh();
  await view.zoomIn(cell);
  ui.busy = false;
  refresh();
}

function placePending(cell) {
  ui.pending = cell;
  view.showPending(cell, game.turn);
  view.keepVisible(cell);
  refresh();
  animate('#btn-confirm', { scale: [0.94, 1], duration: ms(450), ease: 'outBack(2.5)' });
}

async function confirmMove() {
  if (ui.busy || ui.pending === null) return;
  const cell = ui.pending;
  const player = game.turn;
  holdFocus();
  ui.busy = true;
  ui.pending = null;
  ui.committing = { player, cell };
  game = play(game, cell);
  if (game.winner === X || game.winner === O) scores[game.winner] += 1;
  save();
  refresh({ holdScores: true });

  await view.commit(cell, player);
  await view.zoomOut();
  ui.committing = null;
  if (game.winner === DRAW) await view.playDraw();
  else if (game.winner) await view.playWin(game.lines, game.winner);
  ui.busy = false;
  refresh();
  if (game.winner) showResult();
  syncMode();
  restoreFocus();
  botTurn();
}

/** Places and confirms the bot's move. */
async function botTurn() {
  if (ui.busy || !botsTurn()) return;
  ui.busy = true;
  refresh();
  await think();
  if (botsTurn()) {
    const cell = pickMove(game, bot, BOT, opponent);
    ui.pending = cell;
    view.showPending(cell, game.turn);
    view.keepVisible(cell);
    await wait(250);
  }
  ui.busy = false;
  if (ui.pending !== null) confirmMove();
  else refresh();
}

async function cancelMove() {
  if (ui.busy || (ui.pending === null && !view.zoomed)) return;
  holdFocus();
  view.clearPending();
  ui.pending = null;
  if (view.zoomed) {
    ui.busy = true;
    refresh();
    await view.zoomOut();
    ui.busy = false;
  }
  refresh();
  syncMode();
  restoreFocus();
}

async function undoMove() {
  const steps = undoSteps();
  if (ui.busy || !steps) return;
  holdFocus();
  ui.busy = true;
  hideResult(false);
  view.clearPending();
  ui.pending = null;
  refresh();
  await view.zoomOut();
  const result = game.winner;
  for (let i = 0; i < steps; i += 1) {
    await view.takeBack(game.moves.at(-1));
    game = undoGame(game);
    view.sync(game);
  }
  if (result === X || result === O) scores[result] = Math.max(0, scores[result] - 1);
  save();
  view.sync(game);
  ui.busy = false;
  refresh();
  syncMode();
  restoreFocus();
}

/** Players take turns to start. A game nobody moved in keeps its starter. */
function nextStarter(resetScores) {
  if (resetScores) return X;
  return game.moves.length ? other(game.starter) : game.starter;
}

async function newGame({ exactFive = game.rules.exactFive, resetScores = false, against = opponent } = {}) {
  if (ui.busy) {
    // Chosen in the dialog while an animation was finishing: start right after it.
    setTimeout(() => newGame({ exactFive, resetScores, against }), 120);
    return;
  }
  // A new opponent starts a new score.
  if (against !== opponent) resetScores = true;
  holdFocus();
  ui.busy = true;
  hideResult(false);
  view.clearPending();
  ui.pending = null;
  refresh();
  await view.zoomOut();
  await view.sweep();
  const starter = nextStarter(resetScores);
  if (resetScores) scores = { X: 0, O: 0 };
  game = createGame({ exactFive }, starter);
  opponent = against;
  save();
  view.sync(game);
  view.setCursor(CENTER);
  refresh();
  await view.intro();
  ui.busy = false;
  refresh();
  syncMode();
  restoreFocus();
  botTurn();
}

// ------------------------------------------------------------------ result

function showResult() {
  const box = $('#result');
  const card = box.querySelector('.result-card');
  const markSvg = box.querySelector('.result-mark');
  const moves = `${game.moves.length} moves`;
  markSvg.replaceChildren();
  if (game.winner === DRAW) {
    const g = svgEl('g', { class: 'draw-sign' }, markSvg);
    svgEl('path', { d: 'M12 19h24' }, g);
    svgEl('path', { d: 'M12 29h24' }, g);
    $('#result-title').textContent = 'Draw';
    $('#result-detail').textContent = `The board is full · ${moves}`;
  } else {
    markSvg.appendChild(createMark(game.winner, 48, 10));
    $('#result-title').textContent = `${game.winner} wins!`;
    $('#result-detail').textContent = `${capitalize(inARow(longestLine()))} · ${moves}`;
  }
  box.hidden = false;
  animate(card, { opacity: [0, 1], scale: [0.8, 1], y: [24, 0], duration: ms(650), ease: 'outBack(1.6)' });
  if (game.winner !== DRAW) confetti(box.querySelector('.confetti'));
  $('#btn-again').focus({ preventScroll: true });
}

async function hideResult(animated = true) {
  const box = $('#result');
  if (box.hidden) return;
  const card = box.querySelector('.result-card');
  const hadFocus = card.contains(document.activeElement);
  if (animated) await animate(card, { opacity: 0, scale: 0.9, y: 16, duration: ms(250), ease: 'inQuad' });
  box.hidden = true;
  box.querySelector('.confetti').replaceChildren();
  clearInline([card], 'opacity', 'transform');
  if (hadFocus) view.focus();
}

// ----------------------------------------------------------------- dialogs

const newDialog = $('#dlg-new');
const newForm = newDialog.querySelector('form');
setupWizard(newForm, 'X');

function showStarter() {
  $('#starter-note').innerHTML = `${tag(nextStarter(newForm.resetScores.checked))} moves first.`;
}

function fillNewForm() {
  newForm.rule.value = game.rules.exactFive ? 'exact' : 'freestyle';
  newForm.resetScores.checked = false;
  newForm.elements.opponent.value = opponent;
  showStarter();
}

function startFromForm() {
  newGame({
    exactFive: newForm.rule.value === 'exact',
    resetScores: newForm.resetScores.checked,
    against: newForm.elements.opponent.value,
  });
}


$('#btn-new').addEventListener('click', () => {
  fillNewForm();
  newDialog.returnValue = '';
  openDialog(newDialog);
});

newForm.resetScores.addEventListener('change', showStarter);

newDialog.addEventListener('close', () => {
  if (newDialog.returnValue === 'start') booted.then(startFromForm);
});

$('#btn-rules').addEventListener('click', () => openDialog($('#dlg-rules')));

// ---------------------------------------------------------------- controls

$('#btn-confirm').addEventListener('click', () => (game.winner ? newGame() : confirmMove()));
$('#btn-back').addEventListener('click', cancelMove);
$('#btn-undo').addEventListener('click', undoMove);
$('#btn-again').addEventListener('click', () => newGame());
$('#btn-review').addEventListener('click', () => hideResult(true));

const ARROWS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'];

document.addEventListener('keydown', (e) => {
  if (document.querySelector('dialog[open]')) return;
  if (e.key === 'Escape') {
    if (!$('#result').hidden) {
      hideResult(true);
    } else if (ui.pending !== null || view.zoomed) {
      e.preventDefault();
      cancelMove();
    }
  } else if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z') {
    e.preventDefault();
    undoMove();
  } else if (ARROWS.includes(e.key) && (!document.activeElement || document.activeElement === document.body)) {
    // Arrow keys with nothing focused go straight to the board.
    e.preventDefault();
    view.focus();
  }
});

new ResizeObserver(() => syncMode()).observe($('#board'));

// -------------------------------------------------------------------- boot

async function boot() {
  initThemeToggle($('#btn-theme'));
  view.sync(game);
  view.setCursor(game.moves.at(-1) ?? CENTER);
  ui.busy = true;
  syncMode();
  reveal(document.querySelectorAll('[data-reveal]'));
  // Nothing played yet in this match: start with the setup wizard, over the intro.
  if (!game.moves.length && !Object.values(scores).some(Boolean)) $('#btn-new').click();
  await view.intro();
  ui.busy = false;
  refresh();
  if (game.winner) showResult();
  botTurn();
}

const booted = boot();
