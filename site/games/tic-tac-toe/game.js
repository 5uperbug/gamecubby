// Rules for one round of classic tic-tac-toe. Pure functions, no DOM.

import {
  X, O, DRAW, findLine, isFull, other,
} from '../../shared/js/tictactoe.js';

export { X, O, DRAW } from '../../shared/js/tictactoe.js';

/**
 * @typedef {Object} Round
 * @property {'X'|'O'} starter       who moved first
 * @property {Array<null|'X'|'O'>} cells
 * @property {'X'|'O'} turn
 * @property {null|'X'|'O'|'D'} winner  'D' for a draw
 * @property {null|number[]} line    the winning line
 * @property {number[]} moves        cells in the order they were played
 */

/** @returns {Round} */
export function createRound(starter = X) {
  const first = starter === O ? O : X;
  return {
    starter: first,
    cells: Array(9).fill(null),
    turn: first,
    winner: null,
    line: null,
    moves: [],
  };
}

export function isLegal(round, cell) {
  return !round.winner && Number.isInteger(cell) && cell >= 0 && cell < 9 && round.cells[cell] === null;
}

/** Plays the current player's mark in `cell`. Returns a new round; throws on an illegal move. */
export function play(round, cell) {
  if (!isLegal(round, cell)) throw new Error(`Illegal move: cell ${cell}`);
  const player = round.turn;
  const cells = round.cells.slice();
  cells[cell] = player;
  const line = findLine(cells, player);
  let winner = null;
  if (line) winner = player;
  else if (isFull(cells)) winner = DRAW;
  return {
    ...round,
    cells,
    turn: other(player),
    winner,
    line,
    moves: [...round.moves, cell],
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
