import { test } from 'node:test';
import assert from 'node:assert/strict';

import { pickMove } from '../site/shared/js/bot.js';
import * as ttt from '../site/games/tic-tac-toe/game.js';
import tttBot from '../site/games/tic-tac-toe/bot.js';
import * as four from '../site/games/four-in-a-row/game.js';
import fourBot from '../site/games/four-in-a-row/bot.js';
import * as rev from '../site/games/reversi/game.js';
import revBot from '../site/games/reversi/bot.js';
import * as nk from '../site/games/notakto/game.js';
import nkBot from '../site/games/notakto/bot.js';

/** Plays random legal moves from `state` until `stop(state)` or the game ends. */
function randomPlay(state, adapter, plies, rng = Math.random) {
  let s = state;
  for (let i = 0; i < plies && adapter.outcome(s, 'X') === null; i += 1) {
    const moves = adapter.moves(s);
    if (!moves.length) break;
    s = adapter.play(s, moves[Math.floor(rng() * moves.length)]);
  }
  return s;
}

/** Every level returns a move the rules accept, from fresh and mid-game states. */
function legalFrom(name, fresh, adapter, isLegal, plies = [0, 3, 8]) {
  test(`${name}: bot moves are legal`, () => {
    for (const n of plies) {
      for (let k = 0; k < 4; k += 1) {
        const s = randomPlay(fresh(), adapter, n);
        if (adapter.outcome(s, 'X') !== null) continue;
        for (const level of ['easy', 'hard']) {
          const m = pickMove(s, adapter, adapter.turn(s), level);
          assert.ok(isLegal(s, m), `${level} picked ${JSON.stringify(m)}`);
        }
      }
    }
  });
}

legalFrom('tic-tac-toe', () => ttt.createRound(), tttBot, ttt.isLegal);

test('tic-tac-toe: hard takes a win and blocks a loss', () => {
  // X X .      X to move wins at 2
  // O O .
  let r = ttt.replayRound(ttt.X, [0, 3, 1, 4]);
  assert.equal(pickMove(r, tttBot, ttt.X, 'hard'), 2);
  // O must block at 2 after X X .
  r = ttt.replayRound(ttt.X, [0, 4, 1]);
  assert.equal(pickMove(r, tttBot, ttt.O, 'hard'), 2);
});

test('tic-tac-toe: hard never loses to random play', () => {
  for (let g = 0; g < 50; g += 1) {
    const botSide = g % 2 ? ttt.X : ttt.O;
    let r = ttt.createRound(g % 3 ? ttt.X : ttt.O);
    while (!r.winner) {
      const moves = tttBot.moves(r);
      const m = r.turn === botSide
        ? pickMove(r, tttBot, botSide, 'hard')
        : moves[Math.floor(Math.random() * moves.length)];
      r = ttt.play(r, m);
    }
    assert.notEqual(tttBot.outcome(r, botSide), -1);
  }
});

legalFrom('four-in-a-row', () => four.createRound(), fourBot, four.isLegal);
legalFrom('reversi', () => rev.createRound(), revBot, rev.isLegal);
for (const boardCount of nk.BOARD_COUNTS) {
  legalFrom(`notakto (${boardCount} boards)`, () => nk.createRound({ boardCount }), nkBot, (r, [b, c]) => nk.isLegal(r, b, c));
}

test('four-in-a-row: hard takes a win and blocks a loss', () => {
  // X has three across the bottom (cols 0-2); X to move wins at 3.
  let r = four.replayRound(four.X, [0, 0, 1, 1, 2, 6]);
  assert.equal(pickMove(r, fourBot, four.X, 'hard'), 3);
  // Same threat with O to move: O must block at 3.
  r = four.replayRound(four.X, [0, 0, 1, 1, 2]);
  assert.equal(pickMove(r, fourBot, four.O, 'hard'), 3);
});

test('notakto: hard avoids killing the last board when it can', () => {
  // One board, X at 0 and 1: playing 2 loses, anything else doesn't.
  const r = nk.replayRound({ boardCount: 1 }, [[0, 0], [0, 1]]);
  for (let k = 0; k < 10; k += 1) assert.notDeepEqual(pickMove(r, nkBot, r.turn, 'hard'), [0, 2]);
});

/** Hard's first reply on an empty board, timed. */
function timed(name, fresh, adapter, limit = 1000) {
  test(`${name}: hard thinks in under ${limit} ms`, () => {
    const s = fresh();
    const t = performance.now();
    pickMove(s, adapter, adapter.turn(s), 'hard');
    const took = performance.now() - t;
    assert.ok(took < limit, `took ${Math.round(took)} ms`);
  });
}

timed('four-in-a-row', () => four.createRound(), fourBot);
timed('reversi', () => rev.createRound(), revBot);
timed('notakto', () => nk.createRound({ boardCount: 3 }), nkBot);
