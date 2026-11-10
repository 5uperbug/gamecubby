import { test } from 'node:test';
import assert from 'node:assert/strict';

import { pickMove } from '../site/shared/js/bot.js';
import * as ttt from '../site/games/tic-tac-toe/game.js';
import tttBot from '../site/games/tic-tac-toe/bot.js';

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
