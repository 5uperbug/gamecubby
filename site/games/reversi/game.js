// Rules for one round of Reversi on an 8×8 board. Pure functions, no DOM.
//
// Cells are indexed row-major from the top left: cell = row * SIZE + col.
// A move is a cell. It must trap at least one straight line of opponent discs
// between the new disc and another of the mover's; every trapped disc flips.
// A player with no legal move passes, and the round ends when neither can move.

import { X, O, DRAW, other } from '../../shared/js/tictactoe.js';

export { X, O, DRAW, other } from '../../shared/js/tictactoe.js';

export const SIZE = 8;
export const CELLS = SIZE * SIZE;

/** Row and column steps for all eight directions. */
const DIRECTIONS = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];

export const cellAt = (row, col) => row * SIZE + col;
export const rowOf = (cell) => Math.floor(cell / SIZE);
export const colOf = (cell) => cell % SIZE;
const onBoard = (row, col) => row >= 0 && row < SIZE && col >= 0 && col < SIZE;

/**
 * @typedef {Object} Round
 * @property {'X'|'O'} starter        who moved first
 * @property {Array<null|'X'|'O'>} cells
 * @property {'X'|'O'} turn
 * @property {null|'X'|'O'|'D'} winner  'D' for a draw
 * @property {number[]} moves         cells in the order they were played
 * @property {number[]} flipped       discs the last move turned over
 * @property {null|'X'|'O'} passed    who had to pass after the last move
 */

/** @returns {Round} */
export function createRound(starter = X) {
  const first = starter === O ? O : X;
  const cells = Array(CELLS).fill(null);
  // Four discs in the centre, two each on the diagonals.
  cells[cellAt(3, 3)] = O;
  cells[cellAt(4, 4)] = O;
  cells[cellAt(3, 4)] = X;
  cells[cellAt(4, 3)] = X;
  return {
    starter: first, cells, turn: first, winner: null, moves: [], flipped: [], passed: null,
  };
}

/** The opponent discs `player` would flip by playing `cell`. Empty if the move is illegal. */
export function flipsFor(cells, cell, player) {
  if (!Number.isInteger(cell) || cell < 0 || cell >= CELLS || cells[cell] !== null) return [];
  const flips = [];
  for (const [dr, dc] of DIRECTIONS) {
    const line = [];
    let r = rowOf(cell) + dr;
    let c = colOf(cell) + dc;
    while (onBoard(r, c) && cells[cellAt(r, c)] === other(player)) {
      line.push(cellAt(r, c));
      r += dr;
      c += dc;
    }
    if (line.length && onBoard(r, c) && cells[cellAt(r, c)] === player) flips.push(...line);
  }
  return flips;
}

/** Every cell where `player` could play. */
export function movesFor(cells, player) {
  return cells.flatMap((_, cell) => (flipsFor(cells, cell, player).length ? [cell] : []));
}

/** Cells the player to move may choose. Empty once the round is over. */
export const legalMoves = (round) => (round.winner ? [] : movesFor(round.cells, round.turn));

export const isLegal = (round, cell) => !round.winner && flipsFor(round.cells, cell, round.turn).length > 0;

export function countDiscs(cells) {
  const counts = { [X]: 0, [O]: 0 };
  for (const p of cells) if (p) counts[p] += 1;
  return counts;
}

/** Plays the current player's disc in `cell`. Returns a new round; throws on an illegal move. */
export function play(round, cell) {
  if (!isLegal(round, cell)) throw new Error(`Illegal move: cell ${cell}`);
  const player = round.turn;
  const flipped = flipsFor(round.cells, cell, player);
  const cells = round.cells.slice();
  cells[cell] = player;
  for (const c of flipped) cells[c] = player;

  let turn = other(player);
  let passed = null;
  let winner = null;
  if (!movesFor(cells, turn).length) {
    if (movesFor(cells, player).length) {
      passed = turn;
      turn = player;
    } else {
      const counts = countDiscs(cells);
      if (counts[X] === counts[O]) winner = DRAW;
      else winner = counts[X] > counts[O] ? X : O;
    }
  }
  return {
    ...round, cells, turn, winner, moves: [...round.moves, cell], flipped, passed,
  };
}

/** Rebuilds a round from its moves, stopping at the first illegal one. */
export function replayRound(starter, moves = []) {
  let round = createRound(starter);
  for (const cell of moves) {
    if (!isLegal(round, cell)) break;
    round = play(round, cell);
  }
  return round;
}

export function undo(round) {
  return replayRound(round.starter, round.moves.slice(0, -1));
}
