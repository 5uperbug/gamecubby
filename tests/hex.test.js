import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  X, O, SIZES, DEFAULT_SIZE, cellAt, rowOf, colOf, neighbours, winningChain,
  createGame, isLegal, play, replay, undo, SWAP, canSwap, swap, mirror, lastCell,
} from '../site/games/hex/game.js';

const playAll = (game, ...cells) => cells.reduce(play, game);

/** Independent check: is every pair of consecutive cells adjacent? */
const adjacent = (size, a, b) => {
  const dr = rowOf(size, b) - rowOf(size, a);
  const dc = colOf(size, b) - colOf(size, a);
  return [[0, -1], [0, 1], [-1, 0], [-1, 1], [1, -1], [1, 0]].some(([r, c]) => r === dr && c === dc);
};

test('a new game is empty, sized and started by the starter', () => {
  const g = createGame();
  assert.equal(g.size, DEFAULT_SIZE);
  assert.equal(g.cells.length, 121);
  assert.equal(g.turn, X);
  assert.equal(g.winner, null);
  assert.deepEqual(SIZES, [7, 9, 11]);
  assert.equal(createGame(7, O).cells.length, 49);
  assert.equal(createGame(7, O).turn, O);
  assert.equal(createGame(8).size, DEFAULT_SIZE, 'unknown sizes fall back to the default');
  assert.equal(createGame(9, 'nonsense').starter, X);
});

test('cells have six neighbours inside, fewer on the edges', () => {
  const n = 7;
  assert.equal(neighbours(n, cellAt(n, 3, 3)).length, 6);
  assert.deepEqual(neighbours(n, cellAt(n, 0, 0)).sort((a, b) => a - b), [1, 7]);
  // The obtuse corners touch three cells, the acute ones two.
  assert.equal(neighbours(n, cellAt(n, 0, n - 1)).length, 3);
  assert.equal(neighbours(n, cellAt(n, n - 1, 0)).length, 3);
  assert.equal(neighbours(n, cellAt(n, n - 1, n - 1)).length, 2);
  // No wrapping from the end of one row to the start of the next.
  assert.ok(!neighbours(n, cellAt(n, 2, n - 1)).includes(cellAt(n, 3, 0)));
});

test('illegal moves throw and turns alternate', () => {
  const g = play(createGame(7), 10);
  assert.equal(g.cells[10], X);
  assert.equal(g.turn, O);
  for (const cell of [10, -1, 49, 1.5, '3', null]) {
    assert.equal(isLegal(g, cell), false, String(cell));
    assert.throws(() => play(g, cell), /Illegal move/);
  }
});

test('Red wins with a column from top to bottom', () => {
  const n = 7;
  const reds = Array.from({ length: n }, (_, r) => cellAt(n, r, 2));
  const blues = Array.from({ length: n - 1 }, (_, r) => cellAt(n, r, 5));
  const moves = reds.flatMap((cell, i) => (i < blues.length ? [cell, blues[i]] : [cell]));
  const g = replay(n, X, moves);
  assert.equal(g.winner, X);
  assert.deepEqual(g.chain, reds);
  assert.equal(isLegal(g, 0), false, 'no moves after a win');
  assert.equal(replay(n, X, moves.slice(0, -1)).winner, null);
});

test('Blue wins along a zig-zag from left to right; a straight row of Red does not win', () => {
  const n = 7;
  // Blue climbs from the bottom-left corner to the top-right one: (6,0), (5,1)…
  const blues = Array.from({ length: n }, (_, c) => cellAt(n, n - 1 - c, c));
  const reds = Array.from({ length: n }, (_, c) => cellAt(n, 0, c)).filter((c) => !blues.includes(c));
  const g = replay(n, O, blues.flatMap((b, i) => [b, reds[i]]).filter((c) => c !== undefined));
  assert.equal(g.winner, O);
  assert.deepEqual(g.chain, blues);
  // Red across a whole row touches only the top edge.
  const row = Array.from({ length: n }, (_, c) => cellAt(n, 3, c));
  const cells = Array(n * n).fill(null);
  row.forEach((c) => { cells[c] = X; });
  assert.equal(winningChain(n, cells, X), null);
  assert.deepEqual(winningChain(n, cells, O), null);
  row.forEach((c) => { cells[c] = O; });
  assert.deepEqual(winningChain(n, cells, O), row);
});

test('the chain is the shortest path and skips dead ends', () => {
  const n = 7;
  const cells = Array(n * n).fill(null);
  // A straight Red column plus a branch hanging off it.
  for (let r = 0; r < n; r++) cells[cellAt(n, r, 3)] = X;
  for (const c of [4, 5, 6]) cells[cellAt(n, 2, c)] = X;
  const chain = winningChain(n, cells, X);
  assert.equal(chain.length, n);
  assert.ok(chain.every((c) => colOf(n, c) === 3));
});

test('replay and undo rebuild the same game, and undo reopens a win', () => {
  const g = playAll(createGame(9, O), 40, 41, 30, 31);
  assert.deepEqual(replay(9, O, g.moves), g);
  assert.deepEqual(undo(g), playAll(createGame(9, O), 40, 41, 30));
  assert.deepEqual(undo(createGame(9)), createGame(9));
  assert.deepEqual(replay(9, X, [3, 3, 4]).moves, [3], 'replay stops at the first illegal move');
  const n = 7;
  const won = replay(n, X, [0, 1, 7, 8, 14, 15, 21, 22, 28, 29, 35, 36, 42]);
  assert.equal(won.winner, X);
  const u = undo(won);
  assert.equal(u.winner, null);
  assert.deepEqual(u.chain, []);
  assert.equal(isLegal(u, 42), true);
});

test('random games always end with exactly one winner and a valid chain', () => {
  for (let i = 0; i < 300; i++) {
    const size = SIZES[i % SIZES.length];
    let g = createGame(size, i % 2 ? O : X);
    while (!g.winner) {
      const free = g.cells.flatMap((p, c) => (p === null ? [c] : []));
      assert.ok(free.length, 'a full board always has a winner');
      const mover = g.turn;
      g = play(g, free[Math.floor(Math.random() * free.length)]);
      if (g.winner) assert.equal(g.winner, mover);
      assert.equal(winningChain(size, g.cells, g.turn), null, 'only the mover can connect');
    }
    const { chain, winner } = g;
    assert.ok(chain.every((c) => g.cells[c] === winner));
    for (let k = 1; k < chain.length; k++) assert.ok(adjacent(size, chain[k - 1], chain[k]));
    const ends = [chain[0], chain.at(-1)].map((c) => (winner === X ? rowOf(size, c) : colOf(size, c)));
    assert.deepEqual(ends, [0, size - 1]);
    assert.deepEqual(replay(size, g.starter, g.moves), g);
  }
});

test('swap rule: the second player takes over the first stone, mirrored', () => {
  const n = 7;
  const first = cellAt(n, 1, 4);
  const g = play(createGame(n, X), first);
  assert.ok(canSwap(g));
  const s = swap(g);
  assert.equal(s.cells[first], null);
  assert.equal(s.cells[cellAt(n, 4, 1)], O, 'mirrored to (c, r) in Blue');
  assert.equal(s.cells.filter(Boolean).length, 1);
  assert.equal(s.turn, X, 'the first player moves next');
  assert.deepEqual(s.moves, [first, SWAP]);
  assert.equal(lastCell(s), mirror(n, first));
  assert.ok(!canSwap(s), 'only once');
  assert.throws(() => swap(s));
  // A stone on the long diagonal stays put and changes colour.
  const d = swap(play(createGame(n, X), cellAt(n, 3, 3)));
  assert.equal(d.cells[cellAt(n, 3, 3)], O);
  // Replay and undo understand the swap.
  assert.deepEqual(replay(n, X, s.moves).cells, s.cells);
  assert.deepEqual(undo(s).cells, g.cells);
  // Not allowed with the rule off, before the first stone, or after the second.
  assert.ok(!canSwap(play(createGame(n, X, false), first)));
  assert.ok(!canSwap(createGame(n, X)));
  assert.ok(!canSwap(play(g, cellAt(n, 0, 0))));
  assert.deepEqual(replay(n, X, [first, SWAP], false).moves, [first], 'replay drops a swap the rule forbids');
});
