// Rules for Dots and Boxes. Pure functions, no DOM.
//
// A board of size × size boxes has (size + 1) × (size + 1) dots. Lines are
// numbered horizontal ones first, then vertical ones, each row by row:
//   horizontal (r, c) joins dot (r, c) to dot (r, c + 1)   r 0..size, c 0..size-1
//   vertical   (r, c) joins dot (r, c) to dot (r + 1, c)   r 0..size-1, c 0..size
// Boxes are numbered row by row: box (r, c) is r * size + c.

import {
  X, O, DRAW, other,
} from '../../shared/js/tictactoe.js';

export {
  X, O, DRAW, other,
} from '../../shared/js/tictactoe.js';

export const SIZES = [3, 4, 5];
export const DEFAULT_SIZE = 4;

const horizontalCount = (size) => (size + 1) * size;

export const lineCount = (size) => 2 * size * (size + 1);
export const boxCount = (size) => size * size;

/** The horizontal line from dot (r, c) to dot (r, c + 1). */
export const hLine = (size, r, c) => r * size + c;

/** The vertical line from dot (r, c) to dot (r + 1, c). */
export const vLine = (size, r, c) => horizontalCount(size) + r * (size + 1) + c;

/** Direction and first dot of a line: `{ dir: 'h'|'v', r, c }`. */
export function lineAt(size, line) {
  const h = horizontalCount(size);
  if (line < h) return { dir: 'h', r: Math.floor(line / size), c: line % size };
  const k = line - h;
  return { dir: 'v', r: Math.floor(k / (size + 1)), c: k % (size + 1) };
}

/** The two dots a line joins, as [row, column] pairs. */
export function lineEnds(size, line) {
  const { dir, r, c } = lineAt(size, line);
  return dir === 'h' ? [[r, c], [r, c + 1]] : [[r, c], [r + 1, c]];
}

/** The one or two boxes a line borders, in ascending order. */
export function boxesOf(size, line) {
  const { dir, r, c } = lineAt(size, line);
  const boxes = [];
  if (dir === 'h') {
    if (r > 0) boxes.push((r - 1) * size + c);
    if (r < size) boxes.push(r * size + c);
  } else {
    if (c > 0) boxes.push(r * size + c - 1);
    if (c < size) boxes.push(r * size + c);
  }
  return boxes;
}

/** The four lines around a box: top, bottom, left, right. */
export function sidesOf(size, box) {
  const r = Math.floor(box / size);
  const c = box % size;
  return [hLine(size, r, c), hLine(size, r + 1, c), vLine(size, r, c), vLine(size, r, c + 1)];
}

/**
 * @typedef {Object} Game
 * @property {number} size                 boxes per side: 3, 4 or 5
 * @property {'X'|'O'} starter             who drew the first line
 * @property {Array<null|'X'|'O'>} lines   who drew each line
 * @property {Array<null|'X'|'O'>} boxes   who claimed each box
 * @property {'X'|'O'} turn
 * @property {null|'X'|'O'|'D'} winner     'D' for a draw
 * @property {number[]} moves              lines in the order they were drawn
 * @property {null|{line: number, player: 'X'|'O', boxes: number[]}} last
 *   the latest line and the boxes it claimed
 */

/** @returns {Game} */
export function createGame(size = DEFAULT_SIZE, starter = X) {
  const n = SIZES.includes(size) ? size : DEFAULT_SIZE;
  const first = starter === O ? O : X;
  return {
    size: n,
    starter: first,
    lines: Array(lineCount(n)).fill(null),
    boxes: Array(boxCount(n)).fill(null),
    turn: first,
    winner: null,
    moves: [],
    last: null,
  };
}

export function isLegal(game, line) {
  return !game.winner && Number.isInteger(line) && line >= 0 && line < game.lines.length
    && game.lines[line] === null;
}

/** Boxes claimed by each player so far. */
export function scores(game) {
  const count = (p) => game.boxes.filter((b) => b === p).length;
  return { X: count(X), O: count(O) };
}

function resultOf(game) {
  const { X: x, O: o } = scores(game);
  if (x === o) return DRAW;
  return x > o ? X : O;
}

/**
 * Draws `line` for the player to move. Returns a new game; throws on an
 * illegal line. Closing one or two boxes claims them and keeps the turn.
 */
export function play(game, line) {
  if (!isLegal(game, line)) throw new Error(`Illegal move: line ${line}`);
  const player = game.turn;
  const lines = game.lines.slice();
  lines[line] = player;
  // Only boxes next to the new line can have just been closed.
  const claimed = boxesOf(game.size, line)
    .filter((b) => sidesOf(game.size, b).every((l) => lines[l] !== null));
  const boxes = game.boxes.slice();
  for (const b of claimed) boxes[b] = player;
  const next = {
    ...game,
    lines,
    boxes,
    turn: claimed.length ? player : other(player),
    winner: null,
    moves: [...game.moves, line],
    last: { line, player, boxes: claimed },
  };
  // The last line always closes a box, so every box is claimed by now.
  if (next.moves.length === lines.length) next.winner = resultOf(next);
  return next;
}

/** Rebuilds a game from its lines, stopping at the first illegal one. */
export function replay(size, starter, moves = []) {
  let game = createGame(size, starter);
  for (const line of moves) {
    if (!isLegal(game, line)) break;
    game = play(game, line);
  }
  return game;
}

export function undo(game) {
  return replay(game.size, game.starter, game.moves.slice(0, -1));
}
