// Bot adapter for Nine Men's Morris: pieces left count most, then mills
// one piece short of closing, then room to move.

import {
  ADJACENT, MILLS, POINTS, X, O, canFly, other, phaseOf, piecesLeft, removable, targets, play,
} from './game.js';
import { outcomeOf } from '../../shared/js/bot.js';

/** Every legal action for the player to move, in the shape game.play takes. */
function moves(r) {
  switch (phaseOf(r)) {
    case 'place':
      return r.cells.flatMap((c, p) => (c === null ? [{ to: p }] : []));
    case 'remove':
      return removable(r).map((p) => ({ take: p }));
    case 'move':
      return r.cells.flatMap((c, from) => (c === r.turn ? targets(r, from).map((to) => ({ from, to })) : []));
    default:
      return [];
  }
}

/** Mills `p` could close with one more piece. */
function openMills(cells, p) {
  return MILLS.filter((m) => {
    const mine = m.filter((q) => cells[q] === p).length;
    return mine === 2 && m.some((q) => cells[q] === null);
  }).length;
}

/** Empty neighbours of `p`'s pieces: a cheap stand-in for how many moves it has. */
function room(cells, p) {
  let n = 0;
  for (let q = 0; q < POINTS; q += 1) {
    if (cells[q] === p) n += ADJACENT[q].filter((a) => cells[a] === null).length;
  }
  return n;
}

export default {
  // Flying opens up every empty point, so look less far once anyone can fly.
  depth: (r) => (phaseOf(r) === 'place' || canFly(r, X) || canFly(r, O) ? 3 : 4),
  moves,
  play,
  turn: (r) => r.turn,
  outcome: (r, me) => outcomeOf(r.winner, me),
  score: (r, me) => {
    const them = other(me);
    let s = 100 * (piecesLeft(r, me) - piecesLeft(r, them));
    s += 12 * (openMills(r.cells, me) - openMills(r.cells, them));
    s += room(r.cells, me) - room(r.cells, them);
    // A mill just made, waiting to take: worth nearly a piece.
    if (r.removing) s += r.turn === me ? 80 : -80;
    return s;
  },
};
