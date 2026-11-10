// Bot adapter for Hex. A position is worth how many fewer stones I still need
// to join my edges than you need to join yours (shortest path where my stones
// cost 0, empty cells 1 and yours can't be crossed). Moves are ranked by that
// and only the best few are searched.
// ponytail: plain shortest path, not two-distance or resistance, so Hard
// misses bridge and ladder tactics; switch to two-distance if it's too easy.

import {
  X, SWAP, canSwap, colOf, neighbours, other, play, rowOf, swap,
} from './game.js';
import { outcomeOf } from '../../shared/js/bot.js';

const KEEP = 12; // candidate moves searched at each step
const NEAR = new Map(); // size → neighbour lists, built once per board size

function around(size) {
  if (!NEAR.has(size)) NEAR.set(size, Array.from({ length: size * size }, (_, c) => neighbours(size, c)));
  return NEAR.get(size);
}

/** Fewest empty cells `p` must still fill to join its edges (Infinity if it can't). */
function distance(g, p) {
  const { size, cells } = g;
  const near = around(size);
  const along = (c) => (p === X ? rowOf(size, c) : colOf(size, c));
  const dist = new Array(cells.length).fill(Infinity);
  const deque = [];
  for (let i = 0; i < size; i += 1) {
    const c = p === X ? i : i * size; // first edge: top row for Red, left column for Blue
    if (cells[c] === other(p)) continue;
    dist[c] = cells[c] === p ? 0 : 1;
    deque.push(c);
  }
  // 0-1 BFS: moving onto my stone is free, onto an empty cell costs one.
  for (let head = 0; head < deque.length; head += 1) {
    const c = deque[head];
    if (along(c) === size - 1) continue;
    for (const n of near[c]) {
      if (cells[n] === other(p)) continue;
      const d = dist[c] + (cells[n] === p ? 0 : 1);
      if (d < dist[n]) {
        dist[n] = d;
        deque.push(n);
      }
    }
  }
  let best = Infinity;
  for (let i = 0; i < size; i += 1) {
    const c = p === X ? (size - 1) * size + i : i * size + size - 1;
    best = Math.min(best, dist[c]);
  }
  return best;
}

const doMove = (g, m) => (m === SWAP ? swap(g) : play(g, m));

function value(g, me) {
  const mine = distance(g, me);
  const theirs = distance(g, other(me));
  if (theirs === Infinity) return 1000;
  if (mine === Infinity) return -1000;
  return theirs - mine;
}

/** Small nudge towards the middle, to break the many ties shortest paths give. */
function central(size, c) {
  const mid = (size - 1) / 2;
  return -(Math.abs(rowOf(size, c) - mid) + Math.abs(colOf(size, c) - mid)) / (4 * size);
}

function moves(g) {
  if (g.winner) return [];
  const empty = g.cells.flatMap((s, c) => (s === null ? [c] : []));
  const ranked = empty
    .map((c) => [c, value(play(g, c), g.turn) + central(g.size, c)])
    .sort((a, b) => b[1] - a[1])
    .slice(0, KEEP)
    .map(([c]) => c);
  return canSwap(g) ? [SWAP, ...ranked] : ranked;
}

export default {
  depth: (g) => (g.size <= 9 ? 3 : 2),
  moves,
  play: doMove,
  turn: (g) => g.turn,
  outcome: (g, me) => outcomeOf(g.winner, me),
  score: (g, me) => value(g, me),
};
