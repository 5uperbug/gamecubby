// Pure game logic for Ultimate (mega) tic-tac-toe. No DOM access here, so it
// can be unit-tested with `node --test`.
//
// Boards and cells are both indexed 0..8, row-major (see shared/js/tictactoe.js).

import {
  X, O, DRAW, LINES, findLine, isFull, other,
} from '../../shared/js/tictactoe.js';

export {
  X, O, DRAW, LINES, POSITION_NAMES, findLine, other,
} from '../../shared/js/tictactoe.js';

/**
 * @typedef {Object} Rules
 * @property {boolean} openBoards  Variant: boards that are already won stay
 *   playable while they still have empty cells. Being sent to one means you
 *   must play there. Moves in a won board never change who won it.
 */

/**
 * @typedef {Object} GameState
 * @property {Rules} rules
 * @property {Array<Array<null|'X'|'O'>>} cells  cells[board][cell]
 * @property {Array<null|'X'|'O'|'D'>} boards     outcome of each local board
 * @property {Array<null|number[]>} boardLines   winning line of each local board
 * @property {'X'|'O'} turn
 * @property {null|number} target                board the next move is sent to
 * @property {null|'X'|'O'|'D'} winner
 * @property {null|number[]} winLine             winning line on the big board
 * @property {Array<{board:number, cell:number, player:'X'|'O'}>} history
 */

/** @param {Partial<Rules>} [rules] @returns {GameState} */
export function createGame(rules = {}) {
  return {
    rules: { openBoards: Boolean(rules.openBoards) },
    cells: Array.from({ length: 9 }, () => Array(9).fill(null)),
    boards: Array(9).fill(null),
    boardLines: Array(9).fill(null),
    turn: X,
    target: null,
    winner: null,
    winLine: null,
    history: [],
  };
}

export function boardHasEmptyCell(state, board) {
  return state.cells[board].some((c) => c === null);
}

/** Whether a move could ever be made in `board` under the current rules. */
export function isBoardOpen(state, board) {
  if (!boardHasEmptyCell(state, board)) return false;
  return state.rules.openBoards || state.boards[board] === null;
}

/** Boards the player to move may choose from. Empty once the game is over. */
export function playableBoards(state) {
  if (state.winner) return [];
  if (state.target !== null && isBoardOpen(state, state.target)) return [state.target];
  const open = [];
  for (let b = 0; b < 9; b++) if (isBoardOpen(state, b)) open.push(b);
  return open;
}

export function isLegalMove(state, board, cell) {
  return (
    Number.isInteger(board) && Number.isInteger(cell) &&
    board >= 0 && board < 9 && cell >= 0 && cell < 9 &&
    state.cells[board][cell] === null &&
    playableBoards(state).includes(board)
  );
}

/**
 * True when some line on the big board can still be completed by someone:
 * the line has no drawn board and is not split between X and O.
 */
export function isGlobalWinStillPossible(state) {
  return LINES.some((line) => {
    const owners = new Set(line.map((b) => state.boards[b]));
    if (owners.has(DRAW)) return false;
    return !(owners.has(X) && owners.has(O));
  });
}

/**
 * Applies a move and returns `{ state, events }`. The input state is not
 * mutated. Throws on an illegal move.
 */
export function applyMove(state, board, cell) {
  if (!isLegalMove(state, board, cell)) {
    throw new Error(`Illegal move: board ${board}, cell ${cell}`);
  }
  const player = state.turn;
  const cells = state.cells.map((b) => b.slice());
  const boards = state.boards.slice();
  const boardLines = state.boardLines.slice();
  cells[board][cell] = player;

  const events = {
    player, board, cell,
    boardWon: false, boardLine: null, boardDrawn: false,
    gameWon: false, gameLine: null, gameDrawn: false,
  };

  // A local board's outcome is fixed the first time it is decided.
  if (boards[board] === null) {
    const line = findLine(cells[board], player);
    if (line) {
      boards[board] = player;
      boardLines[board] = line;
      events.boardWon = true;
      events.boardLine = line;
    } else if (isFull(cells[board])) {
      boards[board] = DRAW;
      events.boardDrawn = true;
    }
  }

  const next = {
    ...state,
    cells,
    boards,
    boardLines,
    turn: other(player),
    target: cell,
    winner: null,
    winLine: null,
    history: [...state.history, { board, cell, player }],
  };

  const gameLine = findLine(boards, player);
  if (gameLine) {
    next.winner = player;
    next.winLine = gameLine;
    next.target = null;
    events.gameWon = true;
    events.gameLine = gameLine;
  } else if (playableBoards(next).length === 0 || !isGlobalWinStillPossible(next)) {
    // Nothing left to play, or nobody can complete a line any more.
    next.winner = DRAW;
    next.target = null;
    events.gameDrawn = true;
  }

  return { state: next, events };
}

/** Rebuilds a game from a move list. Stops at the first illegal move. */
export function replay(rules, moves) {
  let state = createGame(rules);
  for (const m of moves) {
    if (!isLegalMove(state, m.board, m.cell)) break;
    state = applyMove(state, m.board, m.cell).state;
  }
  return state;
}

export function undo(state) {
  return replay(state.rules, state.history.slice(0, -1));
}

export function boardsWon(state, player) {
  return state.boards.filter((b) => b === player).length;
}
