import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  X, O, DRAW, POINTS, PIECES, QUIET_LIMIT, GRID, ADJACENT, MILLS,
  createRound, phaseOf, piecesLeft, canFly, removable, targets, movable,
  isLegal, play, replayRound, undo,
} from '../site/games/nine-mens-morris/game.js';

const playAll = (round, ...actions) => actions.reduce(play, round);
const place = (...points) => points.map((to) => ({ to }));

/** A round set up directly, `turn` to move, with `hand` pieces each still to place. */
function position(xs, os, turn = X, hand = 0) {
  const round = createRound(turn);
  const cells = round.cells.slice();
  for (const p of xs) cells[p] = X;
  for (const p of os) cells[p] = O;
  return { ...round, cells, hand: { X: hand, O: hand } };
}

test('the board tables agree with each other', () => {
  assert.equal(GRID.length, POINTS);
  assert.equal(ADJACENT.length, POINTS);
  assert.equal(MILLS.length, 16);
  // Adjacency is symmetric.
  ADJACENT.forEach((list, p) => list.forEach((q) => assert.ok(ADJACENT[q].includes(p), `${p}-${q}`)));
  // Neighbours are exactly the consecutive points of the mills.
  const fromMills = Array.from({ length: POINTS }, () => new Set());
  for (const [a, b, c] of MILLS) {
    fromMills[a].add(b); fromMills[b].add(a).add(c); fromMills[c].add(b);
  }
  ADJACENT.forEach((list, p) => assert.deepEqual([...list].sort((a, b) => a - b), [...fromMills[p]].sort((a, b) => a - b)));
  // Every mill is a straight line of three on the grid.
  for (const [a, b, c] of MILLS) {
    const [[ax, ay], [bx, by], [cx, cy]] = [GRID[a], GRID[b], GRID[c]];
    assert.ok((ax === bx && bx === cx) || (ay === by && by === cy), `mill ${a} ${b} ${c}`);
    assert.equal(bx * 2, ax + cx);
    assert.equal(by * 2, ay + cy);
  }
  // Each point sits in exactly two mills.
  for (let p = 0; p < POINTS; p++) assert.equal(MILLS.filter((m) => m.includes(p)).length, 2);
});

test('a new round starts in the placing phase with nine pieces each', () => {
  const round = createRound(O);
  assert.equal(round.turn, O);
  assert.equal(phaseOf(round), 'place');
  assert.deepEqual(round.hand, { X: PIECES, O: PIECES });
  assert.equal(createRound('nonsense').starter, X);
});

test('placing fills empty points and alternates turns', () => {
  const round = playAll(createRound(), ...place(0, 1));
  assert.equal(round.cells[0], X);
  assert.equal(round.cells[1], O);
  assert.deepEqual(round.hand, { X: 8, O: 8 });
  assert.equal(round.turn, X);
  assert.equal(isLegal(round, { to: 0 }), false, 'occupied');
  assert.equal(isLegal(round, { to: 24 }), false, 'off the board');
  assert.equal(isLegal(round, { from: 0, to: 9 }), false, 'no moving while placing');
  assert.throws(() => play(round, { to: 1 }));
});

test('a mill lets the player take a piece that is not in a mill', () => {
  // O has a mill on 9 10 11 and a loose piece on 21.
  let round = position([0, 1, 3], [9, 10, 11, 21], X, 5);
  round = play(round, { to: 2 }); // X closes 0 1 2
  assert.equal(phaseOf(round), 'remove');
  assert.equal(round.turn, X, 'the mill maker acts again');
  assert.deepEqual(round.mills, [[0, 1, 2]]);
  assert.deepEqual(removable(round), [21], 'O pieces in a mill are protected');
  assert.equal(isLegal(round, { take: 9 }), false);
  assert.equal(isLegal(round, { to: 5 }), false, 'must remove first');
  round = play(round, { take: 21 });
  assert.equal(round.cells[21], null);
  assert.equal(round.turn, O);
  assert.equal(round.removing, false);
});

test('if every opposing piece is in a mill, any of them may be taken', () => {
  const round = play(position([0, 1], [9, 10, 11], X, 5), { to: 2 });
  assert.deepEqual(removable(round), [9, 10, 11]);
});

test('closing two mills at once still takes one piece', () => {
  // X: 1 2 and 9 21; placing 0 closes 0 1 2 and 0 9 21.
  let round = playAll(createRound(), ...place(1, 4, 2, 5, 9, 13, 21, 19));
  round = play(round, { to: 0 });
  assert.equal(round.mills.length, 2);
  round = play(round, { take: 13 });
  assert.equal(round.turn, O);
});

test('after placing, pieces move along lines to adjacent empty points', () => {
  const round = position([0, 4], [1, 23]);
  assert.equal(phaseOf(round), 'move');
  assert.deepEqual(targets(round, 0), [9]);
  assert.deepEqual(targets(round, 4).sort((a, b) => a - b), [3, 5, 7]);
  assert.deepEqual(targets(round, 1), [], 'not your piece');
  assert.equal(isLegal(round, { from: 0, to: 2 }), false, 'not adjacent');
  assert.equal(isLegal(round, { to: 9 }), false, 'nothing left to place');
  const next = play(round, { from: 0, to: 9 });
  assert.equal(next.cells[0], null);
  assert.equal(next.cells[9], X);
  assert.equal(next.turn, O);
});

test('the phase is per player while hands run out', () => {
  // 17 placements alternating from X: X has placed 9, O still has one.
  const pts = [0, 1, 2, 3, 5, 4, 6, 7, 8, 9, 11, 10, 12, 13, 15, 14, 16];
  let round = createRound();
  for (const to of pts) {
    round = play(round, { to });
    if (round.removing) round = play(round, { take: removable(round)[0] });
  }
  assert.equal(round.turn, O);
  assert.equal(round.hand.X, 0);
  assert.ok(round.hand.O > 0);
  assert.equal(phaseOf(round), 'place');
});

test('with three pieces left a player flies to any empty point', () => {
  const round = position([0, 4, 22], [9, 10, 11, 12], X);
  assert.ok(canFly(round, X));
  assert.equal(canFly(round, O), false);
  assert.ok(isLegal(round, { from: 0, to: 17 }));
  assert.equal(targets(round, 0).length, POINTS - 7);
});

test('dropping to two pieces loses the round', () => {
  // O has three; X moves 14 -> 2 to close 0 1 2, then takes one.
  let round = position([0, 1, 14, 4], [9, 10, 22], X);
  round = play(round, { from: 14, to: 2 });
  assert.equal(phaseOf(round), 'remove');
  round = play(round, { take: 22 });
  assert.equal(round.winner, X);
  assert.equal(round.reason, 'pieces');
  assert.equal(phaseOf(round), 'over');
  assert.equal(piecesLeft(round, O), 2);
  assert.equal(isLegal(round, { from: 9, to: 21 }), false, 'no moves after the end');
});

test('a player with no legal move loses', () => {
  // X moves 10 -> 11 and every O piece is hemmed in: 0 by 1 and 9, 21 by 9
  // and 22, 22 by 19, 21 and 23, 2 by 1 and 14.
  const before = position([1, 9, 10, 19, 23, 14], [0, 21, 22, 2], X);
  const round = play(before, { from: 10, to: 11 });
  assert.deepEqual(movable(round), []);
  assert.equal(round.winner, X);
  assert.equal(round.reason, 'blocked');
  // The same squeeze on three pieces does not count: they can fly.
  const flying = play(position([1, 9, 10, 19, 23, 14], [0, 21, 22], X), { from: 10, to: 11 });
  assert.equal(flying.winner, null);
});

test(`${QUIET_LIMIT} moves without a mill end the round in a draw`, () => {
  // Shuffle two pieces back and forth without ever lining up three.
  let round = position([0, 23, 6], [2, 21, 8], X);
  const shuffle = [{ from: 0, to: 9 }, { from: 2, to: 14 }, { from: 9, to: 0 }, { from: 14, to: 2 }];
  for (let i = 0; i < QUIET_LIMIT; i++) {
    assert.equal(round.winner, null, `still playing at move ${i}`);
    round = play(round, shuffle[i % 4]);
  }
  assert.equal(round.winner, DRAW);
  assert.equal(round.reason, 'quiet');
});

test('a mill resets the quiet count', () => {
  let round = playAll(createRound(), ...place(0, 9, 1, 10));
  assert.equal(round.quiet, 4);
  round = play(round, { to: 2 });
  assert.equal(round.quiet, 0);
});

test('replay stops at the first illegal action, and undo steps back one action', () => {
  const actions = [...place(0, 9, 1, 10, 2), { take: 9 }];
  const round = replayRound(X, actions);
  assert.equal(round.moves.length, 6);
  assert.equal(round.cells[9], null);
  const back = undo(round);
  assert.equal(phaseOf(back), 'remove');
  assert.equal(back.cells[9], O);
  assert.equal(undo(back).cells[2], null);
  assert.equal(replayRound(X, [...place(0, 0, 5)]).moves.length, 1);
  assert.equal(replayRound(X, [null, 'x']).moves.length, 0);
  assert.equal(replayRound(O, 'junk').turn, O);
});

test('play never mutates its input', () => {
  const round = createRound();
  const before = JSON.stringify(round);
  play(round, { to: 4 });
  assert.equal(JSON.stringify(round), before);
});
