// Bot adapter for Reversi: square weights (corners good, the squares next to
// them bad) plus mobility, switching to plain disc count near the end.

import {
  CELLS, countDiscs, legalMoves, movesFor, other, play,
} from './game.js';
import { outcomeOf } from '../../shared/js/bot.js';

const WEIGHTS = [
  100, -20, 10, 5, 5, 10, -20, 100,
  -20, -50, -2, -2, -2, -2, -50, -20,
  10, -2, 1, 1, 1, 1, -2, 10,
  5, -2, 1, 0, 0, 1, -2, 5,
  5, -2, 1, 0, 0, 1, -2, 5,
  10, -2, 1, 1, 1, 1, -2, 10,
  -20, -50, -2, -2, -2, -2, -50, -20,
  100, -20, 10, 5, 5, 10, -20, 100,
];

export default {
  depth: 4,
  moves: legalMoves,
  play,
  turn: (r) => r.turn,
  outcome: (r, me) => outcomeOf(r.winner, me),
  score: (r, me) => {
    const them = other(me);
    const counts = countDiscs(r.cells);
    if (counts[me] + counts[them] > CELLS - 10) return counts[me] - counts[them];
    let s = 0;
    r.cells.forEach((p, c) => {
      if (p) s += p === me ? WEIGHTS[c] : -WEIGHTS[c];
    });
    return s + 5 * (movesFor(r.cells, me).length - movesFor(r.cells, them).length);
  },
};
