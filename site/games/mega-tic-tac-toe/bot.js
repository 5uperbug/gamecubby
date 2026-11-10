// Bot adapter for Mega Tic-Tac-Toe: boards won (the centre and corners count
// more), lines of boards still open, and two-in-a-rows on undecided boards.

import {
  X, O, LINES, applyMove, other, playableBoards,
} from './game.js';
import { outcomeOf } from '../../shared/js/bot.js';

const BOARD_WEIGHT = [3, 2, 3, 2, 4, 2, 3, 2, 3];

/** Lines of three where `me` has two and the other side none. */
function twos(cells, me) {
  const them = other(me);
  let n = 0;
  for (const line of LINES) {
    let mine = 0;
    let blocked = false;
    for (const i of line) {
      if (cells[i] === me) mine += 1;
      else if (cells[i] !== null) blocked = true;
    }
    if (!blocked && mine === 2) n += 1;
  }
  return n;
}

function side(s, me) {
  let v = 0;
  s.boards.forEach((owner, b) => {
    if (owner === me) v += 25 * BOARD_WEIGHT[b];
    else if (owner === null) v += 3 * twos(s.cells[b], me);
  });
  // Lines of boards `me` could still complete, weighted by boards already held.
  for (const line of LINES) {
    const owners = line.map((b) => s.boards[b]);
    if (owners.every((o) => o === null || o === me)) v += 4 * owners.filter((o) => o === me).length ** 2;
  }
  return v;
}

export default {
  depth: (s) => {
    const n = playableBoards(s).reduce((sum, b) => sum + s.cells[b].filter((c) => c === null).length, 0);
    return n > 20 ? 4 : 6;
  },
  moves: (s) => playableBoards(s).flatMap((b) => s.cells[b].flatMap((c, i) => (c === null ? [[b, i]] : []))),
  play: (s, [b, c]) => applyMove(s, b, c).state,
  turn: (s) => s.turn,
  outcome: (s, me) => outcomeOf(s.winner, me),
  score: (s, me) => side(s, me) - side(s, me === X ? O : X),
};
