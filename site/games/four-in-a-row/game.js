// Rules for one round of four in a row: discs drop into a 7×6 grid and the
// first player to line up four wins. Pure functions, no DOM.
//
// Cells are indexed row-major from the top: cell = row * COLS + col, so row 0
// is the top row and row ROWS - 1 the bottom one, where every column starts
// filling. A move is just a column.

import { X, O, DRAW, other } from '../../shared/js/tictactoe.js';

export { X, O, DRAW, other } from '../../shared/js/tictactoe.js';

export const COLS = 7;
export const ROWS = 6;
/** Discs in a line needed to win. */
export const CONNECT = 4;

/** Line directions as [dcol, drow]: across, down and the two diagonals. */
const DIRECTIONS = [[1, 0], [0, 1], [1, 1], [1, -1]];

export const cellAt = (col, row) => row * COLS + col;
export const colOf = (cell) => cell % COLS;
export const rowOf = (cell) => Math.floor(cell / COLS);

const isColumn = (col) => Number.isInteger(col) && col >= 0 && col < COLS;
const onBoard = (col, row) => col >= 0 && col < COLS && row >= 0 && row < ROWS;

/**
 * @typedef {Object} Round
 * @property {'X'|'O'} starter        who moved first
 * @property {Array<null|'X'|'O'>} cells
 * @property {'X'|'O'} turn
 * @property {null|'X'|'O'|'D'} winner  'D' for a draw
 * @property {number[][]} lines       lines of four or more made by the winning
 *   disc (one move can complete two), each listed end to end
 * @property {number[]} moves         columns in the order they were played
 */

/** @returns {Round} */
export function createRound(starter = X) {
  const first = starter === O ? O : X;
  return {
    starter: first,
    cells: Array(COLS * ROWS).fill(null),
    turn: first,
    winner: null,
    lines: [],
    moves: [],
  };
}

/** The row a disc dropped into `col` lands in, or -1 if it cannot go there. */
export function landingRow(round, col) {
  if (!isColumn(col)) return -1;
  let row = -1;
  while (row + 1 < ROWS && round.cells[cellAt(col, row + 1)] === null) row += 1;
  return row;
}

export function isLegal(round, col) {
  return !round.winner && landingRow(round, col) !== -1;
}

/** Columns the player to move may choose. Empty once the round is over. */
export function legalColumns(round) {
  return Array.from({ length: COLS }, (_, col) => col).filter((col) => isLegal(round, col));
}

/**
 * Every line of CONNECT or more of `player`'s discs that runs through `cell`,
 * each listed from one end to the other.
 */
export function linesThrough(cells, cell, player) {
  const col = colOf(cell);
  const row = rowOf(cell);
  const lines = [];
  for (const [dc, dr] of DIRECTIONS) {
    const before = [];
    const after = [];
    for (let c = col - dc, r = row - dr; onBoard(c, r) && cells[cellAt(c, r)] === player; c -= dc, r -= dr) {
      before.unshift(cellAt(c, r));
    }
    for (let c = col + dc, r = row + dr; onBoard(c, r) && cells[cellAt(c, r)] === player; c += dc, r += dr) {
      after.push(cellAt(c, r));
    }
    const line = [...before, cell, ...after];
    if (line.length >= CONNECT) lines.push(line);
  }
  return lines;
}

/** How a line runs: 'across', 'down' or 'diagonal'. */
export function lineKind(line) {
  const [a, b] = line;
  if (rowOf(a) === rowOf(b)) return 'across';
  if (colOf(a) === colOf(b)) return 'down';
  return 'diagonal';
}

/** Drops the current player's disc into `col`. Returns a new round; throws on an illegal move. */
export function play(round, col) {
  if (!isLegal(round, col)) throw new Error(`Illegal move: column ${col}`);
  const player = round.turn;
  const cell = cellAt(col, landingRow(round, col));
  const cells = round.cells.slice();
  cells[cell] = player;
  const lines = linesThrough(cells, cell, player);
  let winner = null;
  if (lines.length) winner = player;
  else if (!cells.includes(null)) winner = DRAW;
  return {
    ...round,
    cells,
    turn: other(player),
    winner,
    lines,
    moves: [...round.moves, col],
  };
}

/** Rebuilds a round from its moves, stopping at the first illegal one. */
export function replayRound(starter, moves = []) {
  let round = createRound(starter);
  for (const col of moves) {
    if (!isLegal(round, col)) break;
    round = play(round, col);
  }
  return round;
}

export function undo(round) {
  return replayRound(round.starter, round.moves.slice(0, -1));
}

/** The cell of the most recent disc (the top one of the last column played), or null. */
export function lastCell(round) {
  if (!round.moves.length) return null;
  const col = round.moves.at(-1);
  return cellAt(col, landingRow(round, col) + 1);
}
