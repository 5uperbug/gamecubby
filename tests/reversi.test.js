import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  X, O, DRAW, SIZE, CELLS, cellAt, rowOf, colOf, createRound, flipsFor, movesFor, legalMoves,
  isLegal, countDiscs, play, replayRound, undo,
} from '../site/games/reversi/game.js';

const at = cellAt;
const sorted = (list) => [...list].sort((a, b) => a - b);

/** A round with X to move on a board drawn as eight strings ('X', 'O' or '.'). */
function position(rows, turn = X) {
  const cells = rows.join('').split('').map((ch) => (ch === '.' ? null : ch));
  assert.equal(cells.length, CELLS);
  return { ...createRound(turn), cells };
}

function deepFreeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

test('cell helpers agree with each other', () => {
  assert.equal(SIZE, 8);
  assert.equal(CELLS, 64);
  for (let cell = 0; cell < CELLS; cell++) assert.equal(at(rowOf(cell), colOf(cell)), cell);
  assert.equal(at(7, 7), 63);
});

test('a round starts with two discs each, diagonally, in the centre', () => {
  const r = createRound();
  assert.equal(r.cells[at(3, 3)], O);
  assert.equal(r.cells[at(4, 4)], O);
  assert.equal(r.cells[at(3, 4)], X);
  assert.equal(r.cells[at(4, 3)], X);
  assert.deepEqual(countDiscs(r.cells), { X: 2, O: 2 });
  assert.equal(r.turn, X);
  assert.equal(r.winner, null);
  assert.deepEqual(r.moves, []);
  assert.equal(createRound(O).turn, O);
  assert.equal(createRound(O).starter, O);
  assert.equal(createRound('nonsense').starter, X);
});

test('each player has the four classic opening moves', () => {
  assert.deepEqual(sorted(legalMoves(createRound(X))), [at(2, 3), at(3, 2), at(4, 5), at(5, 4)]);
  assert.deepEqual(sorted(legalMoves(createRound(O))), [at(2, 4), at(3, 5), at(4, 2), at(5, 3)]);
});

test('a move flips the trapped disc and passes the turn', () => {
  const r = play(createRound(), at(2, 3));
  assert.deepEqual(r.flipped, [at(3, 3)]);
  assert.equal(r.cells[at(2, 3)], X);
  assert.equal(r.cells[at(3, 3)], X);
  assert.deepEqual(countDiscs(r.cells), { X: 4, O: 1 });
  assert.equal(r.turn, O);
  assert.equal(r.passed, null);
  assert.deepEqual(r.moves, [at(2, 3)]);
});

test('one move flips lines in several directions, and only trapped discs', () => {
  const r = position([
    'X.X.X...',
    '.OOO....',
    'XO.OOOX.',
    '.OOO....',
    'X.O.O...',
    '..X..O..',
    '........',
    '........',
  ]);
  // From (2,2): all eight neighbours are O. Trapped: up-left, up, up-right,
  // left, right (three), down-left, down (two). Down-right runs into an empty square.
  const flips = flipsFor(r.cells, at(2, 2), X);
  assert.deepEqual(sorted(flips), sorted([
    at(1, 1), at(1, 2), at(1, 3), at(2, 1), at(2, 3), at(2, 4), at(2, 5),
    at(3, 1), at(3, 2), at(4, 2),
  ]));
  assert.ok(!flips.includes(at(3, 3)));
  const next = play(r, at(2, 2));
  for (const c of flips) assert.equal(next.cells[c], X);
  assert.equal(next.cells[at(3, 3)], O);
  assert.equal(next.cells[at(4, 4)], O);
});

test('illegal moves are rejected', () => {
  const r = createRound();
  assert.equal(isLegal(r, at(0, 0)), false, 'traps nothing');
  assert.equal(isLegal(r, at(3, 3)), false, 'occupied');
  assert.equal(isLegal(r, at(2, 2)), false, 'the diagonal line has no X beyond it');
  for (const bad of [-1, 64, 1.5, '19', null]) assert.equal(isLegal(r, bad), false);
  assert.throws(() => play(r, at(0, 0)), /Illegal move/);
  assert.deepEqual(flipsFor(r.cells, at(3, 3), X), []);
});

test('a player with no move passes, and the round ends when neither can move', () => {
  const r = position([
    'XO......',
    '........',
    '........',
    '........',
    '........',
    '........',
    '........',
    'XXXXXXO.',
  ]);
  const afterPass = play(r, at(0, 2));
  assert.deepEqual(movesFor(afterPass.cells, O), []);
  assert.equal(afterPass.passed, O);
  assert.equal(afterPass.turn, X, 'X plays again');
  assert.equal(afterPass.winner, null);
  assert.deepEqual(legalMoves(afterPass), [at(7, 7)]);

  const end = play(afterPass, at(7, 7));
  assert.equal(end.winner, X);
  assert.equal(end.passed, null);
  assert.deepEqual(countDiscs(end.cells), { X: 11, O: 0 });
  assert.deepEqual(legalMoves(end), []);
  assert.throws(() => play(end, at(6, 0)));
});

test('the round can end before the board is full, with the most discs winning', () => {
  const r = position([
    'XO......',
    '........',
    '........',
    '........',
    '........',
    '........',
    '.O......',
    '........',
  ]);
  const end = play(r, at(0, 2));
  assert.equal(end.winner, X, '3 discs to 1');
  assert.ok(end.cells.includes(null));
});

test('equal disc counts at the end make a draw', () => {
  const r = position([
    'XO.XXXXX',
    'XXXXXXXX',
    'XXXXXXXX',
    'XXXXXXXX',
    'OOOOOOOO',
    'OOOOOOOO',
    'OOOOOOOO',
    'OOOOOOOO',
  ]);
  const end = play(r, at(0, 2));
  assert.deepEqual(end.flipped, [at(0, 1)]);
  assert.deepEqual(countDiscs(end.cells), { X: 32, O: 32 });
  assert.equal(end.winner, DRAW);
});

test('play never changes the round it was given', () => {
  const r = deepFreeze(createRound());
  const next = play(r, at(2, 3));
  assert.notEqual(next.cells, r.cells);
  assert.equal(r.cells[at(2, 3)], null);
});

test('replay rebuilds a round, stops at an illegal move, and undo steps back', () => {
  const moves = [at(2, 3), at(2, 2), at(3, 2), at(2, 4)];
  const r = moves.reduce(play, createRound());
  assert.deepEqual(replayRound(X, moves), r);
  assert.deepEqual(replayRound(X, [...moves, at(0, 0), at(5, 5)]).moves, moves);
  assert.deepEqual(replayRound(X, ['junk']), createRound());
  assert.deepEqual(undo(r), moves.slice(0, -1).reduce(play, createRound()));
  assert.deepEqual(undo(createRound(O)), createRound(O));
});

test('random games keep every invariant and always finish', () => {
  let seed = 12345;
  const random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let game = 0; game < 60; game++) {
    let r = createRound(game % 2 ? O : X);
    while (!r.winner) {
      const options = legalMoves(r);
      assert.ok(options.length, 'a round that is not over always has a move');
      const mover = r.turn;
      const cell = options[Math.floor(random() * options.length)];
      const next = play(r, cell);
      const before = countDiscs(r.cells);
      const after = countDiscs(next.cells);
      assert.ok(next.flipped.length > 0);
      assert.equal(after[mover], before[mover] + 1 + next.flipped.length);
      assert.equal(after.X + after.O, next.moves.length + 4);
      if (next.passed) assert.equal(next.turn, mover);
      r = next;
    }
    const { X: x, O: o } = countDiscs(r.cells);
    assert.equal(r.winner, x === o ? DRAW : (x > o ? X : O));
    assert.deepEqual(movesFor(r.cells, X), []);
    assert.deepEqual(movesFor(r.cells, O), []);
    assert.deepEqual(replayRound(r.starter, r.moves), r);
  }
});
