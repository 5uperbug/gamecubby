// Bot adapter for Dots and Boxes. A position is scored after the player to
// move greedily takes every box on offer, so chains count without searching
// them line by line. Moves are tried captures first, then lines that don't
// hand over a box, then the rest.
// ponytail: no double-dealing / long-chain parity rule, so a strong human
// can out-play Hard in the endgame; add chain counting if that matters.

import {
  boxesOf, other, play, scores, sidesOf,
} from './game.js';
import { outcomeOf } from '../../shared/js/bot.js';

const drawn = (g, box) => sidesOf(g.size, box).filter((l) => g.lines[l] !== null).length;

/** Sorts the empty lines into ones that close a box, are safe, or give one away. */
function sortLines(g) {
  const closing = [];
  const safe = [];
  const giving = [];
  g.lines.forEach((owner, line) => {
    if (owner !== null) return;
    const sides = boxesOf(g.size, line).map((b) => drawn(g, b));
    if (sides.includes(3)) closing.push(line);
    else if (sides.includes(2)) giving.push(line);
    else safe.push(line);
  });
  return { closing, safe, giving };
}

/** Lets the player to move take every box they can. */
function grab(g) {
  let s = g;
  for (;;) {
    const [line] = sortLines(s).closing;
    if (line === undefined || s.winner) return s;
    s = play(s, line);
  }
}

export default {
  depth: (g) => {
    const left = g.lines.filter((l) => l === null).length;
    if (left <= 10) return left;
    return left <= 20 ? 4 : 3;
  },
  moves: (g) => {
    if (g.winner) return [];
    const { closing, safe, giving } = sortLines(g);
    return [...closing, ...safe, ...giving];
  },
  play,
  turn: (g) => g.turn,
  outcome: (g, me) => outcomeOf(g.winner, me),
  score: (g, me) => {
    const after = grab(g);
    const n = scores(after);
    return n[me] - n[other(me)];
  },
};
