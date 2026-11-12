// Notakto: tic-tac-toe where both players place X's, on one to three boards.
// Three in a row kills a board, and whoever kills the last live board loses.
// Scores carry across rounds and the starting player alternates.

import {
  X, O, BOARD_COUNTS, DEFAULT_BOARD_COUNT, POSITION_NAMES, other, createRound, isLegal, isLive,
  liveBoards, mustLose, play, replayRound, undo as undoRound,
} from './game.js';
import {
  animate, stagger, utils, motion, ms, stag, wait, clearInline,
} from '../../shared/js/motion.js';
import {
  svgEl, markPaths, lineThrough, drawStrokes,
} from '../../shared/js/marks.js';
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
const store = createStore('notakto');

// Internally the players are X and O, so the shared pill and turn colours apply.
const NAMES = { [X]: 'Player 1', [O]: 'Player 2' };

// ------------------------------------------------------------------- state

const BOT = O; // the bot always plays Player 2

const freshMatch = (boardCount = DEFAULT_BOARD_COUNT, opponent = 'human') => ({
  scores: { [X]: 0, [O]: 0 }, roundNo: 1, starter: X, boardCount, opponent,
});

/** Reads a saved match (also the host's state in an online sync), keeping only valid fields. */
function loadMatch(saved = store.get('match')) {
  const match = freshMatch();
  if (!saved || typeof saved !== 'object') return { match, moves: [] };
  for (const p of [X, O]) {
    const n = saved.scores?.[p];
    if (Number.isInteger(n) && n >= 0) match.scores[p] = n;
  }
  if (Number.isInteger(saved.roundNo) && saved.roundNo > 0) match.roundNo = saved.roundNo;
  if (saved.starter === O) match.starter = O;
  if (BOARD_COUNTS.includes(saved.boardCount)) match.boardCount = saved.boardCount;
  if (OPPONENTS.includes(saved.opponent)) match.opponent = saved.opponent;
  return { match, moves: Array.isArray(saved.moves) ? saved.moves : [] };
}

const loaded = loadMatch();
let match = loaded.match;
const roundSettings = () => ({ boardCount: match.boardCount, starter: match.starter });
let round = replayRound(roundSettings(), loaded.moves);

const ui = {
  busy: false, // an animation owns the board
  layout: null, // how the boards are arranged right now
  focus: [0, 0], // the cell holding the boards' tab stop
  shown: { active: null, over: false, hint: '', scores: { ...match.scores } },
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

// ------------------------------------------------------------------ layout

const TILE = 300; // one board, in SVG units
const PAD = 15;
const CELL = 90;
const GAP = 30; // between boards
const cellXY = (c) => [PAD + (c % 3) * CELL, PAD + Math.floor(c / 3) * CELL];
const cellCenter = (c) => cellXY(c).map((v) => v + CELL / 2);

// Ways to arrange the boards, in board-sized steps, favourite first: two side
// by side or three in a triangle, then a row, then a stack.
const ARRANGEMENTS = {
  1: [[[0, 0]]],
  2: [[[0, 0], [1, 0]], [[0, 0], [0, 1]]],
  3: [[[0.5, 0], [0, 1], [1, 1]], [[0, 0], [1, 0], [2, 0]], [[0, 0], [0, 1], [0, 2]]],
};

// Boards this big (in CSS pixels) are roomy; past that, size stops mattering.
const ROOMY = 340;

/** The arrangement that gives the biggest boards in a `width` × `height` area. */
function arrange(count, width, height) {
  return ARRANGEMENTS[count].map((steps, i) => {
    const spots = steps.map(([x, y]) => [x * (TILE + GAP), y * (TILE + GAP)]);
    const w = Math.max(...spots.map(([x]) => x)) + TILE;
    const h = Math.max(...spots.map(([, y]) => y)) + TILE;
    const key = `${count}:${i}`;
    const size = Math.min(ROOMY, TILE * Math.min(width / w, height / h));
    // Lean towards the favourite, and towards the current arrangement so the
    // boards don't hop around when the status text changes length.
    const bias = (i === 0 ? 1.1 : 1) * (key === ui.layout?.key ? 1.05 : 1);
    return { key, spots, w, h, score: size * bias };
  }).reduce((best, a) => (a.score > best.score ? a : best));
}

const board = $('#board');
const area = $('.board-area');

/** Moves the boards into the arrangement that suits the board area. */
function applyLayout() {
  if (!tiles.length) return;
  const next = arrange(tiles.length, area.clientWidth, area.clientHeight);
  if (next.key === ui.layout?.key) return;
  ui.layout = next;
  board.setAttribute('viewBox', `0 0 ${next.w} ${next.h}`);
  board.style.setProperty('--ratio', next.w / next.h);
  tiles.forEach((t, b) => t.el.setAttribute('transform', `translate(${next.spots[b].join(' ')})`));
}

const cellPoint = (b, c) => cellCenter(c).map((v, i) => v + ui.layout.spots[b][i]);
const tileCenter = (b) => ui.layout.spots[b].map((v) => v + TILE / 2);

// ------------------------------------------------------------------- board

const tilesLayer = svgEl('g', { class: 'tiles' }, board);
const fxLayer = svgEl('g', { class: 'fx', 'aria-hidden': 'true' }, board);
let tiles = [];

function buildTiles(count) {
  utils.remove(board.querySelectorAll('*'));
  tilesLayer.replaceChildren();
  fxLayer.replaceChildren();
  board.setAttribute('aria-label', count > 1 ? 'Boards' : 'Board');
  tiles = Array.from({ length: count }, (_, b) => buildTile(b));
  ui.layout = null;
  applyLayout();
}

function buildTile(b) {
  const el = svgEl('g', { class: 'tile', 'data-board': b }, tilesLayer);
  const body = svgEl('g', { class: 'tile-body', role: 'group' }, el);
  svgEl('rect', { class: 'tile-bg', width: TILE, height: TILE, rx: 22 }, body);
  const grid = svgEl('g', { class: 'grid', 'aria-hidden': 'true' }, body);
  for (const i of [1, 2]) {
    const p = PAD + i * CELL;
    svgEl('path', { d: `M${p} ${PAD + 10}L${p} ${TILE - PAD - 10}` }, grid);
    svgEl('path', { d: `M${PAD + 10} ${p}L${TILE - PAD - 10} ${p}` }, grid);
  }
  const cellsLayer = svgEl('g', { class: 'cells' }, body);
  const cells = Array.from({ length: 9 }, (_, c) => {
    const [x, y] = cellXY(c);
    const cell = svgEl('g', {
      class: 'cell', 'data-board': b, 'data-cell': c, transform: `translate(${x} ${y})`, role: 'button',
    }, cellsLayer);
    svgEl('rect', { class: 'cell-hit', x: 6, y: 6, width: CELL - 12, height: CELL - 12, rx: 14 }, cell);
    svgEl('g', { class: 'slot' }, cell);
    return cell;
  });
  const fx = svgEl('g', { class: 'tile-fx', 'aria-hidden': 'true' }, body);
  // A dead board shrugs off the mouse.
  el.addEventListener('pointerenter', (e) => {
    if (e.pointerType === 'mouse' && !ui.busy && !round.winner && !isLive(round, b)) shake(body, 3);
  });
  return { el, body, grid, cellsLayer, cells, fx };
}

/** Every mark is an X, tinted with the colour of the player who placed it. */
function createX(player) {
  const g = svgEl('g', { class: `mark mark-${player.toLowerCase()}` });
  for (const d of markPaths(X, CELL, 24)) svgEl('path', { d }, g);
  return g;
}

const markOf = (b, c) => tiles[b].cells[c].querySelector('.mark');

function setCell(b, c) {
  const who = round.cells[b][c];
  const cell = tiles[b].cells[c];
  const slot = cell.querySelector('.slot');
  slot.replaceChildren();
  if (who) slot.appendChild(createX(who));
  cell.classList.toggle('filled', Boolean(who));
  labelCell(b, c);
}

const capitalise = (s) => s.replace(/^./, (ch) => ch.toUpperCase());
const boardName = (b) => (tiles.length > 1 ? `Board ${b + 1}` : 'Board');

function labelCell(b, c) {
  const who = round.cells[b][c];
  const where = `${POSITION_NAMES[c]} cell`;
  const name = tiles.length > 1 ? `Board ${b + 1}, ${where}` : capitalise(where);
  tiles[b].cells[c].setAttribute('aria-label', `${name}, ${who ? `X by ${NAMES[who]}` : 'empty'}`);
}

function labelTile(b) {
  tiles[b].body.setAttribute('aria-label', `${boardName(b)}, ${isLive(round, b) ? 'live' : 'dead'}`);
}

function addKillLines(b) {
  const { by, lines } = round.dead[b];
  return lines.map((line) => svgEl('path', {
    class: `kill-line line-${by.toLowerCase()}`, d: lineThrough(line.map(cellCenter), 26),
  }, tiles[b].fx));
}

/**
 * Stamps "dead" across the middle of a board, in the loser's colour on the
 * board that ended the round. Returns the part that animates.
 */
function addStamp(b) {
  const [lastBoard] = round.moves.at(-1) ?? [];
  const fatal = round.loser && lastBoard === b ? ` stamp-${round.loser.toLowerCase()}` : '';
  const holder = svgEl('g', { class: `stamp${fatal}`, transform: `translate(${TILE / 2} ${TILE / 2})` }, tiles[b].fx);
  const stamp = svgEl('g', { class: 'stamp-inner' }, holder);
  svgEl('rect', { x: -66, y: -25, width: 132, height: 50, rx: 25 }, stamp);
  svgEl('text', {}, stamp).textContent = 'Dead';
  return stamp;
}

/** Makes the boards match `round` exactly, without animating. */
function sync() {
  utils.remove(board.querySelectorAll('*'));
  fxLayer.replaceChildren();
  tiles.forEach((t, b) => {
    t.fx.replaceChildren();
    clearInline([t.body, t.grid, t.cellsLayer], 'opacity', 'transform');
    t.el.classList.toggle('dead', !isLive(round, b));
    for (let c = 0; c < 9; c++) {
      clearInline([t.cells[c].querySelector('.slot')], 'transform');
      setCell(b, c);
    }
    if (!isLive(round, b)) {
      addKillLines(b);
      addStamp(b);
    }
    labelTile(b);
  });
  updateTabStops();
}

// ---------------------------------------------------------------- keyboard

/** The same cell on the nearest live board, or where we are if none is left. */
function nearestLive(b, c) {
  const from = Math.min(b, tiles.length - 1);
  const live = liveBoards(round);
  if (!live.length) return [from, c];
  const [x, y] = tileCenter(from);
  const dist = (k) => Math.hypot(tileCenter(k)[0] - x, tileCenter(k)[1] - y);
  return [live.reduce((best, k) => (dist(k) < dist(best) ? k : best)), c];
}

/** Cells of live boards share one tab stop; dead boards drop out of the keyboard order. */
function updateTabStops() {
  let [fb, fc] = ui.focus;
  if (fb >= tiles.length || !isLive(round, fb)) [fb, fc] = nearestLive(fb, fc);
  ui.focus = [fb, fc];
  tiles.forEach((t, b) => {
    const live = isLive(round, b);
    t.cells.forEach((cell, c) => {
      if (live) {
        cell.setAttribute('tabindex', b === fb && c === fc ? 0 : -1);
        cell.removeAttribute('aria-disabled');
      } else {
        cell.removeAttribute('tabindex');
        cell.setAttribute('aria-disabled', 'true');
      }
    });
  });
}

const STEPS = {
  ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1],
};

/**
 * Where an arrow key leads: the next cell on this board, or else the closest
 * cell on the near edge of the next live board that way.
 */
function neighbour(b, c, [dx, dy]) {
  const col = (c % 3) + dx;
  const row = Math.floor(c / 3) + dy;
  if (col >= 0 && col < 3 && row >= 0 && row < 3) return [b, row * 3 + col];
  const { spots } = ui.layout;
  const here = cellPoint(b, c);
  let best = null;
  for (const k of liveBoards(round)) {
    const ahead = (spots[k][0] - spots[b][0]) * dx + (spots[k][1] - spots[b][1]) * dy;
    const across = Math.abs((spots[k][0] - spots[b][0]) * dy) + Math.abs((spots[k][1] - spots[b][1]) * dx);
    // Only boards that lie that way and overlap this one sideways.
    if (k === b || ahead <= 0 || across >= TILE) continue;
    for (const i of [0, 1, 2]) {
      const cell = dx ? i * 3 + (dx > 0 ? 0 : 2) : i + (dy > 0 ? 0 : 6);
      const [px, py] = cellPoint(k, cell);
      const off = Math.abs((px - here[0]) * dy) + Math.abs((py - here[1]) * dx);
      if (!best || ahead < best.ahead || (ahead === best.ahead && off < best.off)) {
        best = { k, cell, ahead, off };
      }
    }
  }
  return best && [best.k, best.cell];
}

const focusCell = (b, c) => tiles[b]?.cells[c]?.focus();

// ------------------------------------------------------------------ status

const tag = (p) => `<strong class="${p.toLowerCase()}">${NAMES[p]}</strong>`;

function hintFor() {
  const net = vsRemote() && online.hint();
  if (net) return net;
  if (vsRemote() && !round.moves.length) {
    return `Round ${match.roundNo}: you’re ${tag(online.mine)}. ${round.turn === online.mine ? 'You go first.' : 'Your friend goes first.'}`;
  }
  const n = match.roundNo;
  const many = round.boardCount > 1;
  const line = many ? 'the last line' : 'a line';
  if (round.winner) return `${tag(round.loser)} completed ${line}, so ${tag(round.winner)} wins round ${n}!`;
  const p = tag(round.turn);
  if (friendsTurn()) return `${tag(round.turn)} (your friend) is thinking…`;
  if (botsTurn()) return `${tag(BOT)} (bot) is thinking…`;
  if (!round.moves.length) {
    return `Round ${n}: ${p} goes first. Don’t complete a line${many ? ' on the last live board' : ''}.`;
  }
  if (mustLose(round)) return `${p} has no safe square left. Any move completes ${line}.`;
  const left = liveBoards(round).length;
  const [b] = round.moves.at(-1);
  if (!isLive(round, b)) {
    return `That board is dead, so ${left === 1 ? 'one board is' : 'two boards are'} left. ${p} to move.`;
  }
  if (many && left === 1) return `${p} to move. Only one live board is left.`;
  return `${p} to move.`;
}

/** Turn colours, player pills, scores and hint. */
function showStatus() {
  const over = Boolean(round.winner);
  const active = over ? round.winner : round.turn;
  document.body.classList.toggle('turn-o', active === O);
  document.body.classList.toggle('turn-x', active === X);

  labelPlayers(vsBot() ? BOT : vsRemote() && online.theirs, vsRemote() ? 'Friend' : 'Bot');
  for (const pill of document.querySelectorAll('.player')) {
    const on = pill.dataset.player === active;
    pill.classList.toggle('active', on);
    pill.classList.toggle('winner', on && over);
    if (on && over && !ui.shown.over) {
      animate(pill, {
        scale: [1, 1.14, 0.97, 1], rotate: [0, -3, 2, 0], duration: ms(800), ease: 'inOutSine',
      });
    } else if (on && ui.shown.active !== active) {
      animate(pill, { scale: [0.92, 1], duration: ms(500), ease: 'outBack(2.2)' });
    }
  }
  ui.shown.active = active;
  ui.shown.over = over;

  for (const p of [X, O]) {
    const n = match.scores[p];
    const node = document.querySelector(`[data-score="${p}"]`);
    node.textContent = n;
    if (n > ui.shown.scores[p]) pop(node.parentElement, 1.6);
    ui.shown.scores[p] = n;
  }

  const hint = hintFor();
  if (hint !== ui.shown.hint) {
    const node = $('#hint');
    node.innerHTML = hint;
    animate(node, { opacity: [0, 1], x: [8, 0], duration: ms(350), ease: 'outQuad' });
    ui.shown.hint = hint;
  }
}

/** Brings all non-board UI in line with the current state. `hold` leaves the status as it was. */
function refresh({ hold = false } = {}) {
  if (!hold) showStatus();
  const over = Boolean(round.winner);
  const count = round.boardCount;
  $('#round-note').textContent = `Round ${match.roundNo} · ${count} ${count === 1 ? 'board' : 'boards'}`;
  $('#btn-undo').disabled = ui.busy || !undoSteps();
  const next = $('#btn-round');
  next.disabled = ui.busy || !round.moves.length || (vsRemote() && !online.host);
  next.classList.toggle('quiet', !over);
  board.classList.toggle('live', !over && !ui.busy && !waiting());
}

// -------------------------------------------------------------- animations

function stampIn(stamps) {
  return animate(stamps, {
    opacity: [0, 1], scale: [1.7, 1], rotate: [-24, -8], duration: ms(450), ease: 'outBack(1.6)',
    onComplete: () => clearInline(stamps, 'opacity', 'transform'),
  });
}

async function intro() {
  const marks = [...board.querySelectorAll('.cell .mark')];
  const lines = [...board.querySelectorAll('.kill-line')];
  const stamps = [...board.querySelectorAll('.stamp-inner')];
  const bodies = tiles.map((t) => t.body);
  for (const n of [...bodies, ...marks, ...lines, ...stamps]) n.style.opacity = '0';
  await Promise.all(tiles.map(async (t, b) => {
    await wait(b * 110);
    const grid = drawStrokes([...t.grid.children], 280);
    await animate(t.body, { opacity: [0, 1], scale: [0.85, 1], duration: ms(520), ease: 'outBack(1.5)' });
    await grid;
  }));
  clearInline(bodies, 'opacity', 'transform');
  if (marks.length) {
    await animate(marks, {
      opacity: [0, 1], scale: [0.5, 1], duration: ms(420), delay: stag(45), ease: 'outBack(1.8)',
    });
  }
  clearInline(marks, 'opacity', 'transform');
  if (lines.length) {
    const drawing = drawStrokes(lines, 320);
    clearInline(lines, 'opacity');
    await drawing;
  }
  if (stamps.length) await stampIn(stamps);
}

async function drawMark(b, c) {
  const mark = markOf(b, c);
  drawStrokes([...mark.querySelectorAll('path')], 220);
  await animate(mark, { scale: [1.4, 1], duration: ms(520), ease: 'outElastic(1, .55)' });
  clearInline([mark], 'transform');
}

/** A board that dies steps back and gets its stamp. */
async function dim(b) {
  const t = tiles[b];
  const stamp = addStamp(b);
  stamp.style.opacity = '0';
  await Promise.all([
    fadeIntoClass(t.el, 'dead', [t.grid, t.cellsLayer], 450),
    wait(120).then(() => stampIn([stamp])),
  ]);
  labelTile(b);
}

/** The losing move: the board wobbles, the fatal line throbs and an "Oops!" floats up. */
async function oops(b, c) {
  const t = tiles[b];
  const [left] = ui.layout.spots[b];
  const [x, y] = cellPoint(b, c);
  // SVG text grows with the boards; past about 46px on screen it stops.
  const size = Math.min(54, 46 / (board.clientWidth / ui.layout.w));
  // Kept over the board, so the word never runs off the edge of the screen.
  const middle = Math.min(Math.max(x, left + 85), left + TILE - 85);
  const word = svgEl('text', { class: `oops oops-${round.loser.toLowerCase()}`, x: middle, y }, fxLayer);
  word.style.fontSize = `${size}px`;
  word.textContent = 'Oops!';
  const fatal = [...new Set(round.dead[b].lines.flat())].map((i) => markOf(b, i));
  await Promise.all([
    animate(t.body, { rotate: [0, -4, 3.5, -2.5, 1.2, 0], duration: ms(800), ease: 'inOutSine' }),
    animate(fatal, { scale: [1, 1.3, 1], duration: ms(520), delay: stag(70), ease: 'inOutQuad' }),
    // translateY, because `y` on an SVG <text> would animate its y attribute.
    animate(word, {
      opacity: [0, 1, 1, 1, 0],
      translateY: [0, -1.3 * size],
      scale: [0.4, 1.15, 1, 1, 1],
      duration: ms(1400),
      ease: 'outQuad',
    }),
  ]);
  word.remove();
  clearInline([t.body, ...fatal], 'transform');
}

/** Takes the dimming off a board with a fade. */
function brighten(b) {
  const t = tiles[b];
  const nodes = [t.grid, t.cellsLayer];
  const from = nodes.map((n) => parseFloat(getComputedStyle(n).opacity));
  t.el.classList.remove('dead');
  return Promise.all(nodes.map((n, i) => animate(n, {
    opacity: [from[i], 1], duration: ms(320), ease: 'outQuad',
  }))).then(() => clearInline(nodes, 'opacity'));
}

/** Clears the boards with a quick scatter and wakes the dead ones. */
async function sweep() {
  if (motion.reduced) return;
  const marks = [...board.querySelectorAll('.cell .mark')];
  const extras = tiles.flatMap((t) => [...t.fx.children]);
  utils.remove([...marks, ...extras]);
  await Promise.all([
    marks.length && animate(marks, {
      opacity: 0, scale: 0.3, duration: 260, delay: stagger(25, { from: 'random' }), ease: 'inBack(1.6)',
    }),
    extras.length && animate(extras, { opacity: 0, duration: 220, ease: 'outQuad' }),
    ...tiles.map((t, b) => !isLive(round, b) && brighten(b)),
  ]);
}

/** Fresh boards bounce back in. */
function bounce() {
  const bodies = tiles.map((t) => t.body);
  return animate(bodies, {
    scale: [0.94, 1], duration: ms(450), delay: stag(70), ease: 'outBack(2)',
    onComplete: () => clearInline(bodies, 'transform'),
  });
}

// -------------------------------------------------------------------- flow

async function place(b, c, how) {
  const remote = how === 'bot' || how === 'remote';
  if (ui.busy || (!remote && waiting())) return;
  if (round.winner) {
    // The round is over: point at the way forward.
    shake($('#hint'));
    pop($('#btn-round'), 1.08);
    return;
  }
  if (!isLive(round, b)) {
    shake(tiles[b].body, 6);
    return;
  }
  if (c === null) return;
  if (!isLegal(round, b, c)) {
    shake(tiles[b].cells[c].querySelector('.slot'), 6);
    return;
  }
  ui.busy = true;
  round = play(round, b, c);
  if (vsRemote() && !remote) online.send([b, c]);
  const killed = !isLive(round, b);
  if (round.winner) match.scores[round.winner] += 1;
  save();
  // After a kill the status waits until the board has visibly died.
  refresh({ hold: killed });

  setCell(b, c);
  await drawMark(b, c);
  if (killed) {
    await drawStrokes(addKillLines(b), 380);
    if (round.winner) await oops(b, c);
    await dim(b);
    if (round.winner) confetti($('.board-area .confetti'));
  }
  ui.busy = false;
  updateTabStops();
  refresh();
  botTurn();
  if (how !== 'keyboard') return;
  if (round.winner) $('#btn-round').focus();
  else if (killed) focusCell(...ui.focus);
}

/** Plays the bot's move if it is the bot's turn. */
async function botTurn() {
  if (ui.busy || !botsTurn()) return;
  ui.busy = true;
  refresh();
  await think();
  ui.busy = false;
  if (botsTurn()) place(...pickMove(round, bot, BOT, match.opponent), 'bot');
  else refresh();
}

async function undoMove() {
  const steps = undoSteps();
  if (ui.busy || !steps) return;
  ui.busy = true;
  refresh();
  for (let i = 0; i < steps; i += 1) {
    const [b, c] = round.moves.at(-1);
    const result = round.winner;
    const killed = !isLive(round, b);
    const extras = killed ? [...tiles[b].fx.children] : [];
    await Promise.all([
      animate(markOf(b, c), { opacity: 0, scale: 0.4, duration: ms(240), ease: 'inBack(1.5)' }),
      extras.length && animate(extras, { opacity: 0, duration: ms(220), ease: 'outQuad' }),
    ]);
    round = undoRound(round);
    if (result) match.scores[result] = Math.max(0, match.scores[result] - 1);
    save();
    if (killed) await brighten(b);
    sync();
  }
  ui.busy = false;
  refresh();
}

async function newRound() {
  if (ui.busy || !round.moves.length || (vsRemote() && !online.host)) return;
  ui.busy = true;
  refresh();
  await sweep();
  match.roundNo += 1;
  match.starter = other(match.starter);
  round = createRound(roundSettings());
  save();
  sync();
  await bounce();
  ui.busy = false;
  refresh();
  if (vsRemote()) online.sync();
  botTurn();
}

async function newMatch(boardCount, opponent) {
  if (ui.busy) return;
  if (opponent !== 'remote') online.leave();
  ui.busy = true;
  refresh();
  await sweep();
  match = freshMatch(boardCount, opponent);
  round = createRound(roundSettings());
  save();
  if (boardCount === tiles.length) {
    sync();
    await bounce();
  } else {
    const bodies = tiles.map((t) => t.body);
    await animate(bodies, {
      opacity: 0, scale: 0.85, duration: ms(240), delay: stag(50), ease: 'inQuad',
    });
    buildTiles(boardCount);
    sync();
    await intro();
  }
  ui.busy = false;
  refresh();
  if (vsRemote()) online.sync();
  botTurn();
}

// ------------------------------------------------------------------ online

const online = createOnline({
  game: 'notakto',
  marks: [X, O],
  begin: async () => { await idle(); await newMatch(Number(matchForm.boards.value), 'remote'); },
  end: async (opponent) => { await idle(); await newMatch(match.boardCount, opponent); },
  snapshot: () => ({ ...match, moves: round.moves }),
  async onSync(state) {
    await idle();
    const loaded = loadMatch(state);
    if (loaded.match.roundNo !== match.roundNo) await sweep();
    match = { ...loaded.match, opponent: 'remote' };
    round = replayRound(roundSettings(), loaded.moves);
    if (tiles.length !== match.boardCount) buildTiles(match.boardCount);
    save();
    sync();
    refresh();
  },
  async onMove(m) {
    await idle();
    if (!Array.isArray(m)) return;
    const [b, c] = m;
    if (friendsTurn() && isLegal(round, b, c)) place(b, c, 'remote');
  },
  onChange: () => refresh(),
});

// ------------------------------------------------------------------- input

board.addEventListener('click', (e) => {
  const tile = e.target.closest('.tile');
  if (!tile) return;
  const cell = e.target.closest('.cell');
  place(+tile.dataset.board, cell ? +cell.dataset.cell : null, 'pointer');
});

// On the wrapper: Chrome makes an <svg> with a focus listener a tab stop of its own.
area.addEventListener('focusin', (e) => {
  const cell = e.target.closest?.('.cell');
  if (!cell || !isLive(round, +cell.dataset.board)) return;
  ui.focus = [+cell.dataset.board, +cell.dataset.cell];
  updateTabStops();
});

board.addEventListener('keydown', (e) => {
  const cell = e.target.closest?.('.cell');
  if (!cell) return;
  const b = +cell.dataset.board;
  const c = +cell.dataset.cell;
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    place(b, c, 'keyboard');
    return;
  }
  const step = STEPS[e.key];
  if (!step) return;
  e.preventDefault();
  const next = isLive(round, b) ? neighbour(b, c, step) : nearestLive(b, c);
  if (next) focusCell(...next);
});

$('#btn-undo').addEventListener('click', undoMove);
$('#btn-round').addEventListener('click', newRound);
$('#btn-rules').addEventListener('click', () => openDialog($('#dlg-rules')));

const matchDialog = $('#dlg-match');
const matchForm = matchDialog.querySelector('form');
setupWizard(matchForm, 'Player 1');
function fillMatchForm() {
  matchForm.boards.value = String(match.boardCount);
  matchForm.elements.opponent.value = match.opponent;
}
const startFromForm = () => {
  const opponent = matchForm.elements.opponent.value;
  if (opponent === 'remote') online.start(matchForm.elements.room.value);
  else newMatch(Number(matchForm.boards.value), opponent);
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
    round = createRound(roundSettings());
    save();
  }
  buildTiles(round.boardCount);
  new ResizeObserver(applyLayout).observe(area);
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
