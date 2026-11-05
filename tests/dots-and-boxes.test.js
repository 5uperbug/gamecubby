import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  X, O, DRAW, SIZES, DEFAULT_SIZE, lineCount, boxCount, hLine, vLine, lineAt, lineEnds,
  boxesOf, sidesOf, createGame, isLegal, play, scores, replay, undo,
} from '../site/games/dots-and-boxes/game.js';

const playAll = (game, ...lines) => lines.reduce(play, game);

/** Small seeded generator (mulberry32), so a failing random game can be replayed. */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Every horizontal line first (no box gets more than two sides), then the
 * vertical lines row by row. Each row's first vertical line hands the whole
 * row to the other player, who then has to open the next row.
 */
function rowByRow(size) {
  const lines = [];
  for (let r = 0; r <= size; r++) for (let c = 0; c < size; c++) lines.push(hLine(size, r, c));
  for (let r = 0; r < size; r++) for (let c = 0; c <= size; c++) lines.push(vLine(size, r, c));
  return lines;
}

const isComplete = (game, box) => sidesOf(game.size, box).every((l) => game.lines[l] !== null);

// ---------------------------------------------------------------- geometry

test('line and box counts for every size', () => {
  assert.deepEqual(SIZES, [3, 4, 5]);
  assert.equal(DEFAULT_SIZE, 4);
  assert.deepEqual(SIZES.map(lineCount), [24, 40, 60]);
  assert.deepEqual(SIZES.map(boxCount), [9, 16, 25]);
});

test('line ids round-trip and every line joins two neighbouring dots', () => {
  for (const size of SIZES) {
    const seen = new Set();
    for (let r = 0; r <= size; r++) {
      for (let c = 0; c < size; c++) {
        const line = hLine(size, r, c);
        assert.deepEqual(lineAt(size, line), { dir: 'h', r, c });
        assert.deepEqual(lineEnds(size, line), [[r, c], [r, c + 1]]);
        seen.add(line);
      }
    }
    for (let r = 0; r < size; r++) {
      for (let c = 0; c <= size; c++) {
        const line = vLine(size, r, c);
        assert.deepEqual(lineAt(size, line), { dir: 'v', r, c });
        assert.deepEqual(lineEnds(size, line), [[r, c], [r + 1, c]]);
        seen.add(line);
      }
    }
    // Every id from 0 to lineCount - 1 is used exactly once.
    assert.equal(seen.size, lineCount(size));
    assert.deepEqual([...seen].sort((a, b) => a - b), [...Array(lineCount(size)).keys()]);
  }
});

test('edge lines border one box, inner lines two, and each box has four sides', () => {
  for (const size of SIZES) {
    let edges = 0;
    for (let line = 0; line < lineCount(size); line++) {
      const boxes = boxesOf(size, line);
      const { dir, r, c } = lineAt(size, line);
      const outer = dir === 'h' ? r === 0 || r === size : c === 0 || c === size;
      assert.equal(boxes.length, outer ? 1 : 2, `line ${line} on ${size}×${size}`);
      for (const b of boxes) assert.ok(sidesOf(size, b).includes(line));
      if (outer) edges += 1;
    }
    assert.equal(edges, 4 * size);
    for (let b = 0; b < boxCount(size); b++) {
      const sides = sidesOf(size, b);
      assert.equal(new Set(sides).size, 4);
      for (const line of sides) assert.ok(boxesOf(size, line).includes(b));
    }
  }
});

// ------------------------------------------------------------- new games

test('a new game is empty and the starter moves first', () => {
  const g = createGame();
  assert.equal(g.size, 4);
  assert.equal(g.lines.length, 40);
  assert.ok(g.lines.every((l) => l === null));
  assert.equal(g.boxes.length, 16);
  assert.ok(g.boxes.every((b) => b === null));
  assert.equal(g.turn, X);
  assert.equal(g.winner, null);
  assert.equal(g.last, null);
  assert.deepEqual(g.moves, []);
  assert.deepEqual(scores(g), { X: 0, O: 0 });

  const small = createGame(3, O);
  assert.equal(small.size, 3);
  assert.equal(small.lines.length, 24);
  assert.equal(small.turn, O);
  assert.equal(createGame(5).boxes.length, 25);
});

test('unknown sizes and starters fall back to the defaults', () => {
  assert.equal(createGame(7).size, DEFAULT_SIZE);
  assert.equal(createGame('5').size, DEFAULT_SIZE);
  assert.equal(createGame(undefined, O).size, DEFAULT_SIZE);
  assert.equal(createGame(3, 'nonsense').starter, X);
  assert.equal(createGame(3, 'nonsense').turn, X);
});

// ----------------------------------------------------------------- moves

test('a line that closes no box passes the turn', () => {
  const g = play(createGame(3), hLine(3, 0, 0));
  assert.equal(g.lines[hLine(3, 0, 0)], X);
  assert.equal(g.turn, O);
  assert.deepEqual(g.last, { line: hLine(3, 0, 0), player: X, boxes: [] });
  const g2 = play(g, vLine(3, 1, 1));
  assert.equal(g2.lines[vLine(3, 1, 1)], O);
  assert.equal(g2.turn, X);
  assert.deepEqual(g2.moves, [hLine(3, 0, 0), vLine(3, 1, 1)]);
});

test('drawn, out-of-range and malformed lines are illegal', () => {
  const g = play(createGame(3), 5);
  for (const bad of [5, -1, 24, 1.5, '3', null, undefined, NaN]) {
    assert.equal(isLegal(g, bad), false, `line ${bad}`);
    assert.throws(() => play(g, bad));
  }
  assert.equal(isLegal(g, 0), true);
  assert.equal(isLegal(g, 23), true);
  // Ids that exist on 5×5 do not exist on 3×3.
  assert.equal(isLegal(createGame(3), 40), false);
  assert.equal(isLegal(createGame(5), 59), true);
});

test('closing a box claims it and the same player goes again', () => {
  // Box 0 on 3×3: top, left and bottom by X, O, X; then O closes it.
  const g = playAll(createGame(3), hLine(3, 0, 0), vLine(3, 0, 0), hLine(3, 1, 0));
  assert.equal(g.turn, O);
  assert.deepEqual(g.boxes, Array(9).fill(null), 'three sides claim nothing');
  const closed = play(g, vLine(3, 0, 1));
  assert.equal(closed.boxes[0], O);
  assert.deepEqual(closed.last, { line: vLine(3, 0, 1), player: O, boxes: [0] });
  assert.equal(closed.turn, O, 'O must draw again');
  assert.deepEqual(scores(closed), { X: 0, O: 1 });
  assert.equal(closed.winner, null);
});

test('one line can close two boxes at once', () => {
  // Boxes 0 and 1 on 3×3 get three sides each; the shared side is left open.
  const setup = [
    hLine(3, 0, 0), hLine(3, 1, 0), vLine(3, 0, 0),
    hLine(3, 0, 1), hLine(3, 1, 1), vLine(3, 0, 2),
  ];
  const g = playAll(createGame(3), ...setup);
  assert.deepEqual(g.boxes, Array(9).fill(null));
  assert.equal(g.turn, X);
  const double = play(g, vLine(3, 0, 1));
  assert.deepEqual(double.last.boxes, [0, 1]);
  assert.equal(double.boxes[0], X);
  assert.equal(double.boxes[1], X);
  assert.equal(double.turn, X, 'still one extra turn');
  assert.deepEqual(scores(double), { X: 2, O: 0 });
});

test('after an extra turn, a line that closes nothing hands the turn over', () => {
  const g = playAll(createGame(3), hLine(3, 0, 0), vLine(3, 0, 0), hLine(3, 1, 0), vLine(3, 0, 1));
  assert.equal(g.turn, O);
  const next = play(g, hLine(3, 3, 2));
  assert.equal(next.lines[hLine(3, 3, 2)], O);
  assert.deepEqual(next.last.boxes, []);
  assert.equal(next.turn, X);
});

test('a claimed box keeps its owner', () => {
  const g = playAll(createGame(3), hLine(3, 0, 0), vLine(3, 0, 0), hLine(3, 1, 0), vLine(3, 0, 1));
  // O closed box 0. More lines around it never change that.
  const later = playAll(g, hLine(3, 1, 1), vLine(3, 1, 0), hLine(3, 2, 0));
  assert.equal(later.boxes[0], O);
});

// ----------------------------------------------------------- end of game

test('the game ends when every line is drawn and most boxes wins', () => {
  const lines = rowByRow(3);
  let g = createGame(3);
  for (const [i, line] of lines.entries()) {
    assert.equal(g.winner, null, `still playing before line ${i + 1}`);
    g = play(g, line);
  }
  // X opened row 0, O took it and opened row 1, X took it and opened row 2.
  assert.deepEqual(g.boxes, [O, O, O, X, X, X, O, O, O]);
  assert.deepEqual(scores(g), { X: 3, O: 6 });
  assert.equal(g.winner, O);
  assert.ok(g.lines.every((l) => l !== null));
  for (let line = 0; line < lineCount(3); line++) assert.equal(isLegal(g, line), false);
  assert.throws(() => play(g, 0));
});

test('the same game started by O is a win for X', () => {
  const g = replay(3, O, rowByRow(3));
  assert.deepEqual(scores(g), { X: 6, O: 3 });
  assert.equal(g.winner, X);
});

test('8 boxes each on 4×4 is a draw', () => {
  const g = replay(4, X, rowByRow(4));
  assert.equal(g.moves.length, 40);
  assert.deepEqual(scores(g), { X: 8, O: 8 });
  assert.equal(g.winner, DRAW);
  // Rows alternate owners: O, X, O, X.
  assert.deepEqual(g.boxes, [O, O, O, O, X, X, X, X, O, O, O, O, X, X, X, X]);
});

test('a full 5×5 game', () => {
  const g = replay(5, X, rowByRow(5));
  assert.equal(g.moves.length, 60);
  assert.deepEqual(scores(g), { X: 10, O: 15 });
  assert.equal(g.winner, O);
});

test('the turn follows the extra-turn rule through a whole game', () => {
  let g = createGame(4);
  for (const line of rowByRow(4)) {
    const player = g.turn;
    g = play(g, line);
    assert.equal(g.last.player, player);
    assert.equal(g.turn, g.last.boxes.length ? player : (player === X ? O : X));
  }
});

// ---------------------------------------------------------- replay, undo

test('replay rebuilds the same game', () => {
  const g = playAll(createGame(5, O), 0, 30, 7, hLine(5, 2, 2), vLine(5, 4, 5));
  assert.deepEqual(replay(5, O, g.moves), g);
  const finished = replay(4, X, rowByRow(4));
  assert.deepEqual(replay(4, X, finished.moves), finished);
});

test('undo removes the last line and gives the turn back', () => {
  const g = playAll(createGame(3), hLine(3, 0, 0), vLine(3, 1, 1));
  const u = undo(g);
  assert.deepEqual(u.moves, [hLine(3, 0, 0)]);
  assert.equal(u.lines[vLine(3, 1, 1)], null);
  assert.equal(u.turn, O);
  assert.deepEqual(u.last, { line: hLine(3, 0, 0), player: X, boxes: [] });
  assert.deepEqual(undo(u), createGame(3));
  assert.deepEqual(undo(createGame(3)), createGame(3), 'undo with no moves is harmless');
});

test('undo unclaims boxes and steps back across an extra turn', () => {
  const setup = [
    hLine(3, 0, 0), hLine(3, 1, 0), vLine(3, 0, 0),
    hLine(3, 0, 1), hLine(3, 1, 1), vLine(3, 0, 2),
  ];
  const double = playAll(createGame(3), ...setup, vLine(3, 0, 1));
  const after = play(double, hLine(3, 3, 2)); // X's extra line closes nothing
  assert.equal(after.turn, O);

  const back1 = undo(after);
  assert.equal(back1.turn, X, 'X still owes the extra line');
  assert.deepEqual(back1, double);

  const back2 = undo(back1);
  assert.equal(back2.turn, X, 'X drew the line that closed both boxes');
  assert.equal(back2.boxes[0], null);
  assert.equal(back2.boxes[1], null);
  assert.equal(back2.lines[vLine(3, 0, 1)], null);
  assert.deepEqual(scores(back2), { X: 0, O: 0 });
});

test('undoing the final line reopens the game', () => {
  const g = replay(4, X, rowByRow(4));
  const u = undo(g);
  assert.equal(u.winner, null);
  const last = g.moves.at(-1);
  assert.equal(isLegal(u, last), true);
  assert.equal(u.turn, X, 'X was taking row 3 and draws its last line again');
  assert.equal(u.boxes[15], null);
  assert.deepEqual(play(u, last), g);
});

test('replay stops at the first illegal line', () => {
  assert.deepEqual(replay(3, X, [4, 4, 0]).moves, [4]);
  assert.deepEqual(replay(3, X, [1, 'x', 2]).moves, [1]);
  assert.deepEqual(replay(3, X, [1, 99, 2]).moves, [1]);
  assert.deepEqual(replay(4, X, [-1]).moves, []);
  // Nothing can be drawn after the game is over.
  const lines = rowByRow(3);
  assert.equal(replay(3, X, [...lines, lines[0]]).moves.length, lines.length);
});

test('play does not mutate the game it is given', () => {
  const g = playAll(createGame(3), hLine(3, 0, 0), vLine(3, 0, 0), hLine(3, 1, 0));
  const snapshot = JSON.stringify(g);
  const next = play(g, vLine(3, 0, 1));
  assert.equal(JSON.stringify(g), snapshot);
  assert.notEqual(next.lines, g.lines);
  assert.notEqual(next.boxes, g.boxes);
  assert.notEqual(next.moves, g.moves);
  undo(next);
  replay(3, X, next.moves);
  assert.equal(JSON.stringify(g), snapshot);
});

// ---------------------------------------------------------------- random

test('random games always end legally with every box claimed', () => {
  const random = rng(20261105);
  for (const size of SIZES) {
    for (let n = 0; n < 150; n++) {
      const starter = n % 2 ? O : X;
      let g = createGame(size, starter);
      while (!g.winner) {
        const open = g.lines.flatMap((owner, line) => (owner === null ? [line] : []));
        assert.ok(open.length > 0, 'a live game always has a line left');
        const line = open[Math.floor(random() * open.length)];
        assert.ok(isLegal(g, line));
        const player = g.turn;
        const before = g;
        g = play(g, line);

        assert.equal(g.lines[line], player);
        assert.equal(g.moves.length, before.moves.length + 1);
        assert.ok(g.last.boxes.length <= 2);
        assert.equal(g.turn, g.last.boxes.length ? player : (player === X ? O : X));
        // A box is claimed exactly when its fourth side is drawn, by whoever drew it.
        for (let b = 0; b < g.boxes.length; b++) {
          assert.equal(g.boxes[b] !== null, isComplete(g, b), `box ${b}`);
          if (g.last.boxes.includes(b)) assert.equal(g.boxes[b], player);
          else assert.equal(g.boxes[b], before.boxes[b]);
        }
        if (!g.winner) assert.ok(g.moves.length < lineCount(size));
      }

      assert.equal(g.moves.length, lineCount(size));
      assert.ok(g.boxes.every((b) => b === X || b === O));
      assert.ok(g.last.boxes.length > 0, 'the last line always closes a box');
      const { X: x, O: o } = scores(g);
      assert.equal(x + o, boxCount(size));
      let expected = DRAW;
      if (x > o) expected = X;
      else if (o > x) expected = O;
      assert.equal(g.winner, expected);
      if (boxCount(size) % 2) assert.notEqual(g.winner, DRAW, 'odd boards cannot tie');
      for (let line = 0; line < lineCount(size); line++) assert.equal(isLegal(g, line), false);
      assert.deepEqual(replay(size, starter, g.moves), g);
    }
  }
});
