// Bot adapter for tic-tac-toe: the whole tree is small, so Hard plays perfectly.

import { play } from './game.js';
import { outcomeOf } from '../../shared/js/bot.js';

export default {
  depth: 9,
  moves: (r) => (r.winner ? [] : r.cells.flatMap((c, i) => (c === null ? [i] : []))),
  play,
  turn: (r) => r.turn,
  outcome: (r, me) => outcomeOf(r.winner, me),
  score: () => 0,
};
