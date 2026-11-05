// Rules for Gomoku: five in a row on a 15×15 grid. Pure functions, no DOM,
// so `node --test` can exercise them directly.
//
// Cells are indexed 0..224, row-major: cell = row * SIZE + col.

import { X, O, DRAW, other } from '../../shared/js/tictactoe.js';

export { X, O, DRAW, other } from '../../shared/js/tictactoe.js';

export const SIZE = 15;
export const CELLS = SIZE * SIZE;
export const CENTER = (CELLS - 1) / 2;
export const FIVE = 5;

/** Row and column steps for the four directions: across, down and both diagonals. */
export const DIRECTIONS = [[0, 1], [1, 0], [1, 1], [1, -1]];

export const rowOf = (cell) => Math.floor(cell / SIZE);
export const colOf = (cell) => cell % SIZE;
export const cellAt = (row, col) => row * SIZE + col;
export const onBoard = (row, col) => row >= 0 && row < SIZE && col >= 0 && col < SIZE;

/**
 * @typedef {Object} Rules
 * @property {boolean} exactFive  Only a line of exactly five wins: six or more
 *   in a row (an overline) does not. Off is freestyle: five or more wins.
 */

/**
 * @typedef {Object} Game
 * @property {Rules} rules
 * @property {'X'|'O'} starter          who moved first
 * @property {Array<null|'X'|'O'>} cells
 * @property {'X'|'O'} turn
 * @property {null|'X'|'O'|'D'} winner  'D' for a draw (the board is full)
 * @property {number[][]} lines         winning lines, each listed end to end
 * @property {number[]} moves           cells in the order they were played
 */

/** @param {Partial<Rules>} [rules] @returns {Game} */
export function createGame(rules = {}, starter = X) {
  const first = starter === O ? O : X;
  return {
    rules: { exactFive: Boolean(rules?.exactFive) },
    starter: first,
    cells: Array(CELLS).fill(null),
    turn: first,
    winner: null,
    lines: [],
    moves: [],
  };
}

export function isLegal(game, cell) {
  return !game.winner && Number.isInteger(cell) && cell >= 0 && cell < CELLS && game.cells[cell] === null;
}

/**
 * The unbroken run of the mark in `cell` along one direction, listed end to
 * end and including `cell`. Empty when `cell` is empty.
 */
export function runThrough(cells, cell, [dr, dc]) {
  const player = cells[cell];
  if (!player) return [];
  const walk = (sign) => {
    const found = [];
    let r = rowOf(cell) + dr * sign;
    let c = colOf(cell) + dc * sign;
    while (onBoard(r, c) && cells[cellAt(r, c)] === player) {
      found.push(cellAt(r, c));
      r += dr * sign;
      c += dc * sign;
    }
    return found;
  };
  return [...walk(-1).reverse(), cell, ...walk(1)];
}

/** The four runs through `cell`: across, down and both diagonals. */
export const runsThrough = (cells, cell) => DIRECTIONS.map((d) => runThrough(cells, cell, d));

export const isWinningRun = (run, rules) => (
  rules.exactFive ? run.length === FIVE : run.length >= FIVE
);

/** Plays the current player's mark in `cell`. Returns a new game; throws on an illegal move. */
export function play(game, cell) {
  if (!isLegal(game, cell)) throw new Error(`Illegal move: cell ${cell}`);
  const player = game.turn;
  const cells = game.cells.slice();
  cells[cell] = player;
  const moves = [...game.moves, cell];
  // Only lines through the new mark can have changed.
  const lines = runsThrough(cells, cell).filter((run) => isWinningRun(run, game.rules));
  let winner = null;
  if (lines.length) winner = player;
  else if (moves.length === CELLS) winner = DRAW;
  return {
    ...game,
    cells,
    turn: other(player),
    winner,
    lines,
    moves,
  };
}

/** Rebuilds a game from its moves, stopping at the first illegal one. */
export function replay(rules, starter, moves = []) {
  let game = createGame(rules, starter);
  for (const cell of moves) {
    if (!isLegal(game, cell)) break;
    game = play(game, cell);
  }
  return game;
}

export function undo(game) {
  return replay(game.rules, game.starter, game.moves.slice(0, -1));
}

/** Lines longer than five through the last move. Under the exactly-five rule they don't win. */
export function overlines(game) {
  const last = game.moves.at(-1);
  if (last === undefined) return [];
  return runsThrough(game.cells, last).filter((run) => run.length > FIVE);
}
