// Rules for one round of Notakto: tic-tac-toe on one to three boards where
// both players place X's. Three in a row kills a board, and whoever kills the
// last live board loses. Pure functions, no DOM.
//
// Cells are indexed 0..8 per board, row-major (see shared/js/tictactoe.js).

import {
  X, O, LINES, other,
} from '../../shared/js/tictactoe.js';

export {
  X, O, POSITION_NAMES, other,
} from '../../shared/js/tictactoe.js';

export const BOARD_COUNTS = [1, 2, 3];
export const DEFAULT_BOARD_COUNT = 3;

/**
 * @typedef {Object} Death
 * @property {'X'|'O'} by        who completed the line
 * @property {number[][]} lines  every line the killing move completed (one X can complete two or three)
 */

/**
 * @typedef {Object} Round
 * @property {number} boardCount                 1, 2 or 3
 * @property {'X'|'O'} starter                   who moved first
 * @property {Array<Array<null|'X'|'O'>>} cells  cells[board][cell]: who put an X there
 * @property {Array<null|Death>} dead            null while a board is live
 * @property {'X'|'O'} turn
 * @property {null|'X'|'O'} loser                who killed the last live board
 * @property {null|'X'|'O'} winner
 * @property {Array<[number, number]>} moves      [board, cell] in the order they were played
 */

/** @returns {Round} */
export function createRound({ boardCount = DEFAULT_BOARD_COUNT, starter = X } = {}) {
  const count = BOARD_COUNTS.includes(boardCount) ? boardCount : DEFAULT_BOARD_COUNT;
  const first = starter === O ? O : X;
  return {
    boardCount: count,
    starter: first,
    cells: Array.from({ length: count }, () => Array(9).fill(null)),
    dead: Array(count).fill(null),
    turn: first,
    loser: null,
    winner: null,
    moves: [],
  };
}

/** Lines whose three cells all hold an X, whoever placed them. */
export function completedLines(cells) {
  return LINES.filter((line) => line.every((i) => cells[i] !== null)).map((line) => line.slice());
}

export const isLive = (round, board) => round.dead[board] === null;

export function liveBoards(round) {
  return round.dead.flatMap((death, board) => (death === null ? [board] : []));
}

export function isLegal(round, board, cell) {
  return (
    !round.winner &&
    Number.isInteger(board) && board >= 0 && board < round.boardCount &&
    Number.isInteger(cell) && cell >= 0 && cell < 9 &&
    isLive(round, board) &&
    round.cells[board][cell] === null
  );
}

/** Whether an X in this empty cell would complete a line. */
export function wouldKill(round, board, cell) {
  const cells = round.cells[board].slice();
  cells[cell] = round.turn;
  return completedLines(cells).length > 0;
}

/** True when every move left to the player to move kills the last live board. */
export function mustLose(round) {
  const live = liveBoards(round);
  if (round.winner || live.length !== 1) return false;
  const [board] = live;
  return round.cells[board].every((who, cell) => who !== null || wouldKill(round, board, cell));
}

/** Places the current player's X. Returns a new round; throws on an illegal move. */
export function play(round, board, cell) {
  if (!isLegal(round, board, cell)) throw new Error(`Illegal move: board ${board}, cell ${cell}`);
  const player = round.turn;
  const cells = round.cells.slice();
  cells[board] = cells[board].slice();
  cells[board][cell] = player;
  const dead = round.dead.slice();
  const lines = completedLines(cells[board]);
  if (lines.length) dead[board] = { by: player, lines };
  const over = dead.every((death) => death !== null);
  return {
    ...round,
    cells,
    dead,
    turn: other(player),
    loser: over ? player : null,
    winner: over ? other(player) : null,
    moves: [...round.moves, [board, cell]],
  };
}

/** Rebuilds a round from its moves, stopping at the first illegal or malformed one. */
export function replayRound(options, moves = []) {
  let round = createRound(options);
  for (const move of moves) {
    if (!Array.isArray(move) || !isLegal(round, move[0], move[1])) break;
    round = play(round, move[0], move[1]);
  }
  return round;
}

export function undo(round) {
  const { boardCount, starter } = round;
  return replayRound({ boardCount, starter }, round.moves.slice(0, -1));
}
