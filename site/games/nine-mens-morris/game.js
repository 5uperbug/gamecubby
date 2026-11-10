// Rules for one round of Nine Men's Morris. Pure functions, no DOM.
//
// The 24 points sit on three concentric squares joined at their midpoints,
// numbered row by row from the top left:
//
//    0 ----------- 1 ----------- 2
//    |   3 ------- 4 ------- 5   |
//    |   |   6 --- 7 --- 8   |   |
//    9 - 10 - 11       12 - 13 - 14
//    |   |  15 -- 16 -- 17   |   |
//    |  18 ------ 19 ------ 20   |
//   21 ---------- 22 ---------- 23
//
// A round is a list of actions, each one of:
//   { to }         place a piece from the hand on an empty point
//   { from, to }   move a piece (along a line, or anywhere when flying)
//   { take }       remove an opponent's piece after closing a mill

import { X, O, DRAW, other } from '../../shared/js/tictactoe.js';

export { X, O, DRAW, other } from '../../shared/js/tictactoe.js';

export const POINTS = 24;
export const PIECES = 9;
/** Moves in a row without a mill that end the round in a draw. */
export const QUIET_LIMIT = 50;

/** [column, row] of each point on a 7×7 grid, for drawing and arrow keys. */
export const GRID = [
  [0, 0], [3, 0], [6, 0],
  [1, 1], [3, 1], [5, 1],
  [2, 2], [3, 2], [4, 2],
  [0, 3], [1, 3], [2, 3], [4, 3], [5, 3], [6, 3],
  [2, 4], [3, 4], [4, 4],
  [1, 5], [3, 5], [5, 5],
  [0, 6], [3, 6], [6, 6],
];

export const ADJACENT = [
  [1, 9], [0, 2, 4], [1, 14],
  [4, 10], [1, 3, 5, 7], [4, 13],
  [7, 11], [4, 6, 8], [7, 12],
  [0, 10, 21], [3, 9, 11, 18], [6, 10, 15], [8, 13, 17], [5, 12, 14, 20], [2, 13, 23],
  [11, 16], [15, 17, 19], [12, 16],
  [10, 19], [16, 18, 20, 22], [13, 19],
  [9, 22], [19, 21, 23], [14, 22],
];

/** Every line of three, each listed end to end. */
export const MILLS = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8], [9, 10, 11], [12, 13, 14], [15, 16, 17], [18, 19, 20], [21, 22, 23],
  [0, 9, 21], [3, 10, 18], [6, 11, 15], [1, 4, 7], [16, 19, 22], [8, 12, 17], [5, 13, 20], [2, 14, 23],
];

const isPoint = (p) => Number.isInteger(p) && p >= 0 && p < POINTS;

/**
 * @typedef {Object} Round
 * @property {'X'|'O'} starter
 * @property {Array<null|'X'|'O'>} cells
 * @property {'X'|'O'} turn              who acts next (the mill maker while removing)
 * @property {{X: number, O: number}} hand  pieces still to place
 * @property {boolean} removing          the player to move just closed a mill and must take a piece
 * @property {number[][]} mills          mills closed by the latest move or placement
 * @property {number} quiet              moves since the last mill
 * @property {null|'X'|'O'|'D'} winner
 * @property {null|'pieces'|'blocked'|'quiet'} reason
 * @property {Object[]} moves            actions in the order they were played
 */

/** @returns {Round} */
export function createRound(starter = X) {
  const first = starter === O ? O : X;
  return {
    starter: first,
    cells: Array(POINTS).fill(null),
    turn: first,
    hand: { X: PIECES, O: PIECES },
    removing: false,
    mills: [],
    quiet: 0,
    winner: null,
    reason: null,
    moves: [],
  };
}

export const onBoard = (round, player) => round.cells.filter((c) => c === player).length;

/** Pieces a player still has, on the board and in hand. */
export const piecesLeft = (round, player) => onBoard(round, player) + round.hand[player];

/** Down to three pieces with none left to place: free to jump to any empty point. */
export const canFly = (round, player) => round.hand[player] === 0 && onBoard(round, player) === 3;

/** 'place', 'move', 'remove', or 'over'. */
export function phaseOf(round) {
  if (round.winner) return 'over';
  if (round.removing) return 'remove';
  return round.hand[round.turn] > 0 ? 'place' : 'move';
}

export const millsThrough = (cells, p) => MILLS.filter((m) => m.includes(p) && m.every((q) => cells[q] === cells[p]));

const inMill = (cells, p) => millsThrough(cells, p).length > 0;

/** Pieces the mill maker may take: any not in a mill, or any at all if every one is. */
export function removable(round) {
  if (!round.removing) return [];
  const theirs = round.cells.flatMap((c, p) => (c === other(round.turn) ? [p] : []));
  const loose = theirs.filter((p) => !inMill(round.cells, p));
  return loose.length ? loose : theirs;
}

/** Empty points the piece on `from` can reach this turn. */
export function targets(round, from) {
  if (phaseOf(round) !== 'move' || round.cells[from] !== round.turn) return [];
  const reach = canFly(round, round.turn) ? round.cells.map((_, p) => p) : ADJACENT[from];
  return reach.filter((p) => round.cells[p] === null);
}

/** The player's pieces that have somewhere to go. */
export const movable = (round) => round.cells
  .map((_, p) => p)
  .filter((p) => targets(round, p).length);

export function isLegal(round, action) {
  if (!action || typeof action !== 'object') return false;
  const phase = phaseOf(round);
  if ('take' in action) return phase === 'remove' && removable(round).includes(action.take);
  if ('from' in action) return phase === 'move' && isPoint(action.from) && targets(round, action.from).includes(action.to);
  return phase === 'place' && isPoint(action.to) && round.cells[action.to] === null;
}

/** Hands the turn over and checks whether the round has ended. */
function passTurn(next) {
  const turn = other(next.turn);
  const done = { ...next, turn, removing: false };
  if (piecesLeft(done, turn) < 3) return { ...done, winner: next.turn, reason: 'pieces' };
  if (done.hand[turn] === 0 && !movable(done).length) return { ...done, winner: next.turn, reason: 'blocked' };
  if (done.quiet >= QUIET_LIMIT) return { ...done, winner: DRAW, reason: 'quiet' };
  return done;
}

/** Plays one action for the player to move. Returns a new round; throws on an illegal action. */
export function play(round, action) {
  if (!isLegal(round, action)) throw new Error(`Illegal action: ${JSON.stringify(action)}`);
  const player = round.turn;
  const cells = round.cells.slice();
  const moves = [...round.moves, action];

  if ('take' in action) {
    cells[action.take] = null;
    return passTurn({ ...round, cells, moves, mills: [] });
  }

  const hand = { ...round.hand };
  if ('from' in action) cells[action.from] = null;
  else hand[player] -= 1;
  cells[action.to] = player;
  const mills = millsThrough(cells, action.to);
  const next = {
    ...round, cells, hand, moves, mills, quiet: mills.length ? 0 : round.quiet + 1,
  };
  // A mill against an empty board has nothing to take.
  if (mills.length && cells.includes(other(player))) return { ...next, removing: true };
  return passTurn(next);
}

/** Rebuilds a round from its actions, stopping at the first illegal one. */
export function replayRound(starter, moves = []) {
  let round = createRound(starter);
  for (const action of Array.isArray(moves) ? moves : []) {
    if (!isLegal(round, action)) break;
    round = play(round, action);
  }
  return round;
}

/** Takes back the latest action (a removal and the mill before it are separate steps). */
export function undo(round) {
  return replayRound(round.starter, round.moves.slice(0, -1));
}
