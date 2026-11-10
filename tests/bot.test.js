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
import * as dab from '../site/games/dots-and-boxes/game.js';
import dabBot from '../site/games/dots-and-boxes/bot.js';
import * as mega from '../site/games/mega-tic-tac-toe/game.js';
import megaBot from '../site/games/mega-tic-tac-toe/bot.js';
import * as gomoku from '../site/games/gomoku/game.js';
import gomokuBot from '../site/games/gomoku/bot.js';
import * as oc from '../site/games/order-and-chaos/game.js';
import ocBot from '../site/games/order-and-chaos/bot.js';
import * as nmm from '../site/games/nine-mens-morris/game.js';
import nmmBot from '../site/games/nine-mens-morris/bot.js';
import * as hex from '../site/games/hex/game.js';
import hexBot from '../site/games/hex/bot.js';

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

for (const size of dab.SIZES) {
  legalFrom(`dots-and-boxes (${size}×${size})`, () => dab.createGame(size), dabBot, dab.isLegal, [0, 10, 25]);
}
for (const openBoards of [false, true]) {
  legalFrom(`mega-tic-tac-toe (${openBoards ? 'open' : 'classic'})`, () => mega.createGame({ openBoards }), megaBot,
    (s, [b, c]) => mega.isLegalMove(s, b, c), [0, 10, 30]);
}

test('dots-and-boxes: hard takes a box on offer and does not give one away', () => {
  // 3×3: draw three sides of the top-left box (top, left, bottom), leaving its right side.
  const n = 3;
  const top = dab.hLine(n, 0, 0);
  const bottom = dab.hLine(n, 1, 0);
  const left = dab.vLine(n, 0, 0);
  const right = dab.vLine(n, 0, 1);
  let g = dab.replay(n, dab.X, [top, dab.hLine(n, 3, 2), left, dab.vLine(n, 2, 3), bottom]);
  assert.equal(pickMove(g, dabBot, g.turn, 'hard'), right);
  // Fresh board, one move in: no reply should give the opponent a 3-sided box.
  g = dab.replay(n, dab.X, [top]);
  for (let k = 0; k < 5; k += 1) {
    const after = dab.play(g, pickMove(g, dabBot, g.turn, 'hard'));
    const offered = after.boxes.some((owner, b) => owner === null
      && dab.sidesOf(n, b).filter((l) => after.lines[l] !== null).length === 3);
    assert.equal(offered, false);
  }
});

test('mega-tic-tac-toe: hard wins a small board when it can', () => {
  // X holds cells 0 and 1 of the centre board and is sent back there: cell 2 wins it.
  const s = mega.replay({}, [
    { board: 4, cell: 0 }, { board: 0, cell: 4 }, { board: 4, cell: 1 }, { board: 1, cell: 4 },
  ]);
  assert.deepEqual(mega.playableBoards(s), [4]);
  assert.deepEqual(pickMove(s, megaBot, s.turn, 'hard'), [4, 2]);
});

timed('dots-and-boxes', () => dab.createGame(5), dabBot);
timed('mega-tic-tac-toe', () => mega.createGame(), megaBot);

legalFrom('gomoku', () => gomoku.createGame(), gomokuBot, gomoku.isLegal, [0, 6, 20]);
legalFrom('order-and-chaos', () => oc.createRound(), ocBot, (r, m) => oc.isLegal(r, m.cell, m.symbol), [0, 8, 20, 30]);

test('gomoku: hard takes five and blocks an open three', () => {
  const at = gomoku.cellAt;
  // X on row 7, cols 3-6; O scattered. X to move completes five at col 2 or 7.
  let g = gomoku.replay({}, gomoku.X, [at(7, 3), at(0, 0), at(7, 4), at(0, 14), at(7, 5), at(14, 0), at(7, 6), at(14, 14)]);
  assert.ok([at(7, 2), at(7, 7)].includes(pickMove(g, gomokuBot, gomoku.X, 'hard')));
  // An open three (X at cols 3-5) with O to move: O blocks at or next to an end.
  g = gomoku.replay({}, gomoku.X, [at(7, 3), at(0, 0), at(7, 4), at(0, 14), at(7, 5)]);
  assert.equal(g.turn, gomoku.O);
  assert.ok([at(7, 1), at(7, 2), at(7, 6), at(7, 7)].includes(pickMove(g, gomokuBot, gomoku.O, 'hard')));
});

test('order-and-chaos: Chaos spoils four in a row', () => {
  // Order has X in row 0, cols 0-3; Chaos to move must put an O at col 4
  // (col 5 alone can't stop cols 0-4).
  const r = oc.replayRound([
    { cell: 0, symbol: 'X' }, { cell: 35, symbol: 'O' }, { cell: 1, symbol: 'X' }, { cell: 30, symbol: 'O' },
    { cell: 2, symbol: 'X' }, { cell: 24, symbol: 'X' }, { cell: 3, symbol: 'X' },
  ]);
  assert.equal(r.turn, oc.CHAOS);
  assert.deepEqual(pickMove(r, ocBot, oc.CHAOS, 'hard'), { cell: 4, symbol: 'O' });
});

test('order-and-chaos: Order completes five', () => {
  const r = oc.replayRound([
    { cell: 0, symbol: 'X' }, { cell: 35, symbol: 'O' }, { cell: 1, symbol: 'X' }, { cell: 30, symbol: 'O' },
    { cell: 2, symbol: 'X' }, { cell: 5, symbol: 'O' }, { cell: 3, symbol: 'X' }, { cell: 29, symbol: 'X' },
  ]);
  assert.equal(r.turn, oc.ORDER);
  assert.deepEqual(pickMove(r, ocBot, oc.ORDER, 'hard'), { cell: 4, symbol: 'X' });
});

timed('gomoku', () => gomoku.replay({}, gomoku.X, [112, 113, 97, 98]), gomokuBot);
timed('order-and-chaos', () => oc.createRound(), ocBot);

legalFrom('nine-mens-morris', () => nmm.createRound(), nmmBot, nmm.isLegal, [0, 10, 20, 40]);

test('nine-mens-morris: hard closes a mill, then blocks one', () => {
  // X holds 0 and 1 (mill 0-1-2 open); O elsewhere. X to place: 2 closes it.
  let r = nmm.replayRound(nmm.X, [{ to: 0 }, { to: 21 }, { to: 1 }, { to: 23 }]);
  assert.deepEqual(pickMove(r, nmmBot, nmm.X, 'hard'), { to: 2 });
  // Same, but O to place: it must block at 2.
  r = nmm.replayRound(nmm.X, [{ to: 0 }, { to: 21 }, { to: 1 }]);
  assert.deepEqual(pickMove(r, nmmBot, nmm.O, 'hard'), { to: 2 });
});

timed('nine-mens-morris', () => nmm.createRound(), nmmBot);

const hexLegal = (g, m) => (m === hex.SWAP ? hex.canSwap(g) : hex.isLegal(g, m));
for (const size of hex.SIZES) {
  legalFrom(`hex (${size}×${size})`, () => hex.createGame(size), hexBot, hexLegal, [0, 1, 6, 20]);
}

test('hex: hard completes its chain and blocks the last gap', () => {
  const n = 7;
  const at = (r, c) => hex.cellAt(n, r, c);
  // Red (X) holds column 3 from row 0 to row 5; Blue scattered on the left. Red to move wins at row 6.
  const red = [0, 1, 2, 3, 4, 5].map((r) => at(r, 3));
  const blue = [0, 1, 2, 3, 4, 5].map((r) => at(r, 0));
  const moves = red.flatMap((c, i) => [c, blue[i]]);
  let g = hex.replay(n, hex.X, moves, false);
  const wins = [at(6, 3), at(6, 2)]; // both touch (5, 3)
  assert.ok(wins.includes(pickMove(g, hexBot, hex.X, 'hard')));
  // Red holds rows 0-4 of column 3 plus (6, 3): the only gap is (5, 3). Blue to move must take it.
  const redGap = [0, 1, 2, 3, 4].map((r) => at(r, 3)).concat(at(6, 3));
  const blueFar = [0, 1, 2, 3, 4].map((r) => at(r, 0));
  g = hex.replay(n, hex.X, redGap.flatMap((c, i) => (i < blueFar.length ? [c, blueFar[i]] : [c])), false);
  assert.equal(g.turn, hex.O);
  assert.equal(pickMove(g, hexBot, hex.O, 'hard'), at(5, 3));
});

timed('hex 9×9', () => hex.replay(9, hex.X, [40]), hexBot);
timed('hex 11×11', () => hex.replay(11, hex.X, [60]), hexBot);
