// Rules for Hex: a rhombus of hexagons. Red (X) joins the top and bottom
// edges, Blue (O) the left and right ones. Pure functions, no DOM.
//
// Cells are indexed row-major: cell = row * size + col. Row 0 is the top edge
// and column 0 the left one. Each row sits half a cell to the right of the one
// above, so a cell touches (r, c±1), (r-1, c), (r-1, c+1), (r+1, c-1) and
// (r+1, c). The board can never fill up without a winner, so there are no draws.
//
// Swap rule (optional): right after the first stone, the second player may
// take it over instead of placing a stone. It becomes theirs, mirrored across
// the long diagonal so it serves their edges, and the first player moves next.
// This keeps the first player from opening in the strongest spot.

import { X, O, other } from '../../shared/js/tictactoe.js';

export { X, O, other } from '../../shared/js/tictactoe.js';

export const SIZES = [7, 9, 11];
export const DEFAULT_SIZE = 11;
/** Recorded in `moves` when the second player swaps. */
export const SWAP = 'swap';

const STEPS = [[0, -1], [0, 1], [-1, 0], [-1, 1], [1, -1], [1, 0]];

export const cellAt = (size, row, col) => row * size + col;
export const rowOf = (size, cell) => Math.floor(cell / size);
export const colOf = (size, cell) => cell % size;

export function neighbours(size, cell) {
  const r = rowOf(size, cell);
  const c = colOf(size, cell);
  return STEPS
    .map(([dr, dc]) => [r + dr, c + dc])
    .filter(([nr, nc]) => nr >= 0 && nr < size && nc >= 0 && nc < size)
    .map(([nr, nc]) => cellAt(size, nr, nc));
}

/** Red's edges are the top and bottom rows, Blue's the left and right columns. */
const position = (player, size, cell) => (player === X ? rowOf(size, cell) : colOf(size, cell));

/**
 * The shortest chain of `player`'s stones from one of their edges to the
 * other, listed from the first edge (top or left), or null. Breadth-first
 * search from every stone on the first edge.
 */
export function winningChain(size, cells, player) {
  const from = new Map(); // cell -> the cell it was reached from (null on the first edge)
  const queue = [];
  for (let i = 0; i < size; i++) {
    const cell = player === X ? cellAt(size, 0, i) : cellAt(size, i, 0);
    if (cells[cell] === player) {
      from.set(cell, null);
      queue.push(cell);
    }
  }
  for (let head = 0; head < queue.length; head++) {
    const cell = queue[head];
    if (position(player, size, cell) === size - 1) {
      const chain = [];
      for (let c = cell; c !== null; c = from.get(c)) chain.unshift(c);
      return chain;
    }
    for (const next of neighbours(size, cell)) {
      if (cells[next] === player && !from.has(next)) {
        from.set(next, cell);
        queue.push(next);
      }
    }
  }
  return null;
}

/**
 * @typedef {Object} Game
 * @property {number} size
 * @property {'X'|'O'} starter
 * @property {Array<null|'X'|'O'>} cells
 * @property {'X'|'O'} turn
 * @property {null|'X'|'O'} winner
 * @property {number[]} chain    the winning chain, edge to edge, once someone has won
 * @property {boolean} swapRule the second player may take over the first stone
 * @property {Array<number|'swap'>} moves  cells in the order they were played, or SWAP
 */

/** @returns {Game} */
export function createGame(size = DEFAULT_SIZE, starter = X, swapRule = true) {
  const n = SIZES.includes(size) ? size : DEFAULT_SIZE;
  const first = starter === O ? O : X;
  return {
    size: n,
    starter: first,
    swapRule: Boolean(swapRule),
    cells: Array(n * n).fill(null),
    turn: first,
    winner: null,
    chain: [],
    moves: [],
  };
}

export function isLegal(game, cell) {
  return !game.winner && Number.isInteger(cell) && cell >= 0
    && cell < game.cells.length && game.cells[cell] === null;
}

/** Places the current player's stone. Returns a new game; throws on an illegal move. */
export function play(game, cell) {
  if (!isLegal(game, cell)) throw new Error(`Illegal move: cell ${cell}`);
  const player = game.turn;
  const cells = game.cells.slice();
  cells[cell] = player;
  const chain = winningChain(game.size, cells, player);
  return {
    ...game,
    cells,
    turn: other(player),
    winner: chain ? player : null,
    chain: chain ?? [],
    moves: [...game.moves, cell],
  };
}

/** The cell (r, c) mirrored to (c, r): a stone there serves the other player's edges. */
export const mirror = (size, cell) => cellAt(size, colOf(size, cell), rowOf(size, cell));

export function canSwap(game) {
  return game.swapRule && !game.winner && game.moves.length === 1;
}

/** The second player takes over the first stone. Returns a new game; throws when not allowed. */
export function swap(game) {
  if (!canSwap(game)) throw new Error('Swap is only allowed as the second move');
  const cells = game.cells.slice();
  cells[game.moves[0]] = null;
  cells[mirror(game.size, game.moves[0])] = game.turn;
  return { ...game, cells, turn: other(game.turn), moves: [...game.moves, SWAP] };
}

/** The cell the latest move filled, or undefined before the first move. */
export function lastCell(game) {
  const last = game.moves.at(-1);
  return last === SWAP ? mirror(game.size, game.moves[0]) : last;
}

/** Rebuilds a game from its moves, stopping at the first illegal one. */
export function replay(size, starter, moves = [], swapRule = true) {
  let game = createGame(size, starter, swapRule);
  for (const move of moves) {
    if (move === SWAP ? !canSwap(game) : !isLegal(game, move)) break;
    game = move === SWAP ? swap(game) : play(game, move);
  }
  return game;
}

export function undo(game) {
  return replay(game.size, game.starter, game.moves.slice(0, -1), game.swapRule);
}
