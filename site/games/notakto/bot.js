// Bot adapter for Notakto. No position score: it searches as deep as the
// remaining moves allow, which is exact once a few boards have filled up.
// ponytail: no misère-quotient theory, so early 3-board play is guesswork;
// add Plambeck's quotient if Hard needs to be perfect from move one.

import { isLegal, liveBoards, play } from './game.js';
import { outcomeOf } from '../../shared/js/bot.js';

/** Legal moves, safe ones (that don't complete a line) first. */
function moves(r) {
  if (r.winner) return [];
  const safe = [];
  const killing = [];
  for (const b of liveBoards(r)) {
    for (let c = 0; c < 9; c += 1) {
      if (!isLegal(r, b, c)) continue;
      const after = play(r, b, c);
      (after.dead[b] ? killing : safe).push([b, c]);
    }
  }
  return [...safe, ...killing];
}

export default {
  depth: (r) => {
    const n = moves(r).length;
    if (n <= 12) return n;
    return n <= 18 ? 7 : 5;
  },
  moves,
  play: (r, [b, c]) => play(r, b, c),
  turn: (r) => r.turn,
  outcome: (r, me) => outcomeOf(r.winner, me),
  score: () => 0,
};
