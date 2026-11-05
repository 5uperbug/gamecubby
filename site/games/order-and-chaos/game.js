// Rules for Order and Chaos on a 6×6 board. Pure functions, no DOM.
//
// Cells are indexed 0..35, row-major. On every turn the player to move puts
// an X or an O in any empty cell. Order wins as soon as five identical
// symbols line up, whoever placed them; six in a row counts too (house rule).
// Chaos wins if the board fills up first. Players swap roles every round.

import { X, O } from '../../shared/js/tictactoe.js';

export { X, O } from '../../shared/js/tictactoe.js';

export const SIDE = 6;
export const CELL_COUNT = SIDE * SIDE;
/** Identical symbols in a row that win for Order. */
export const RUN = 5;
export const SYMBOLS = [X, O];

export const ORDER = 'order';
export const CHAOS = 'chaos';
export const P1 = 'p1';
export const P2 = 'p2';

export const otherRole = (role) => (role === ORDER ? CHAOS : ORDER);
export const otherPlayer = (player) => (player === P1 ? P2 : P1);
export const rowOf = (cell) => Math.floor(cell / SIDE);
export const colOf = (cell) => cell % SIDE;

const DIRECTIONS = [[0, 1], [1, 0], [1, 1], [1, -1]]; // across, down, both diagonals

/** Every row, column and diagonal long enough to hold five, as cells in board order. */
export const LINES = (() => {
  const inside = (r, c) => r >= 0 && r < SIDE && c >= 0 && c < SIDE;
  const lines = [];
  for (const [dr, dc] of DIRECTIONS) {
    for (let r = 0; r < SIDE; r++) {
      for (let c = 0; c < SIDE; c++) {
        if (inside(r - dr, c - dc)) continue; // not where a line starts
        const line = [];
        for (let i = r, j = c; inside(i, j); i += dr, j += dc) line.push(i * SIDE + j);
        if (line.length >= RUN) lines.push(line);
      }
    }
  }
  return lines;
})();

/** The longest run of five or more identical symbols, as cells in board order, or null. */
export function findFive(cells) {
  let best = null;
  for (const line of LINES) {
    let run = [];
    for (const cell of line) {
      const symbol = cells[cell];
      if (!symbol) run = [];
      else if (run.length && cells[run[0]] === symbol) run = [...run, cell];
      else run = [cell];
      if (run.length >= RUN && run.length > (best?.length ?? 0)) best = run;
    }
  }
  return best;
}

/**
 * Empty cells where one more symbol would complete five in a row, with the
 * symbols that would do it: [{ cell, symbols }], sorted by cell.
 */
export function threats(cells) {
  const found = new Map();
  for (const line of LINES) {
    for (let i = 0; i + RUN <= line.length; i++) {
      const span = line.slice(i, i + RUN);
      const empty = span.filter((c) => cells[c] === null);
      if (empty.length !== 1) continue;
      const [gap] = empty;
      for (const symbol of SYMBOLS) {
        if (!span.every((c) => c === gap || cells[c] === symbol)) continue;
        if (!found.has(gap)) found.set(gap, new Set());
        found.get(gap).add(symbol);
      }
    }
  }
  return [...found]
    .sort(([a], [b]) => a - b)
    .map(([cell, set]) => ({ cell, symbols: SYMBOLS.filter((s) => set.has(s)) }));
}

// ------------------------------------------------------------------ rounds

/**
 * @typedef {Object} Move
 * @property {number} cell
 * @property {'X'|'O'} symbol
 */

/**
 * @typedef {Object} Round
 * @property {Array<null|'X'|'O'>} cells
 * @property {'order'|'chaos'} turn       the role to move
 * @property {null|'order'|'chaos'} winner
 * @property {null|number[]} line         the winning five (or six)
 * @property {Move[]} moves               in the order they were played
 */

/** @returns {Round} */
export function createRound() {
  return {
    cells: Array(CELL_COUNT).fill(null),
    turn: ORDER,
    winner: null,
    line: null,
    moves: [],
  };
}

export function isLegal(round, cell, symbol) {
  return (
    !round.winner &&
    SYMBOLS.includes(symbol) &&
    Number.isInteger(cell) && cell >= 0 && cell < CELL_COUNT &&
    round.cells[cell] === null
  );
}

/** Places `symbol` in `cell` for the role to move. Returns a new round; throws on an illegal move. */
export function play(round, cell, symbol) {
  if (!isLegal(round, cell, symbol)) throw new Error(`Illegal move: ${symbol} in cell ${cell}`);
  const cells = round.cells.slice();
  cells[cell] = symbol;
  const line = findFive(cells);
  let winner = null;
  if (line) winner = ORDER;
  else if (cells.every((s) => s !== null)) winner = CHAOS;
  return {
    ...round,
    cells,
    turn: otherRole(round.turn),
    winner,
    line,
    moves: [...round.moves, { cell, symbol }],
  };
}

/** Rebuilds a round from its moves, stopping at the first one that is malformed or illegal. */
export function replayRound(moves = []) {
  let round = createRound();
  for (const move of Array.isArray(moves) ? moves : []) {
    if (!move || !isLegal(round, move.cell, move.symbol)) break;
    round = play(round, move.cell, move.symbol);
  }
  return round;
}

export function undo(round) {
  return replayRound(round.moves.slice(0, -1));
}

// ----------------------------------------------------------------- players

/** Player 1 is Order in odd rounds and Player 2 in even rounds, so roles swap every round. */
export const orderPlayer = (roundNo) => (roundNo % 2 === 1 ? P1 : P2);

export const roleOf = (player, roundNo) => (player === orderPlayer(roundNo) ? ORDER : CHAOS);

export const playerFor = (role, roundNo) => (
  role === ORDER ? orderPlayer(roundNo) : otherPlayer(orderPlayer(roundNo))
);

/** The player who won the round (whichever role they held), or null while it is in play. */
export const roundWinner = (round, roundNo) => (round.winner ? playerFor(round.winner, roundNo) : null);
