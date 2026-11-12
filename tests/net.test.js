import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  CODE_ALPHABET, CODE_LENGTH, cleanCode, isCode, makeCode, parseMessage,
} from '../site/shared/js/net.js';

test('room codes use only the unambiguous alphabet, at the fixed length', () => {
  for (let i = 0; i < 200; i += 1) {
    const code = makeCode();
    assert.equal(code.length, CODE_LENGTH);
    assert.ok(isCode(code), code);
  }
  assert.equal(makeCode(() => 0), CODE_ALPHABET[0].repeat(CODE_LENGTH));
  assert.equal(makeCode(() => 0.9999), CODE_ALPHABET.at(-1).repeat(CODE_LENGTH));
});

test('typed codes are cleaned and checked', () => {
  assert.equal(cleanCode(' k7q2 '), 'K7Q2');
  assert.equal(cleanCode('k7-q2'), 'K7Q2');
  assert.ok(isCode('K7Q2'));
  assert.ok(!isCode('K7Q'));
  assert.ok(!isCode('K7Q22'));
  assert.ok(!isCode('O1I0'), 'look-alike characters are never in a code');
});

test('only the two message shapes get through', () => {
  assert.deepEqual(parseMessage({ t: 'move', m: 4 }), { t: 'move', m: 4 });
  assert.deepEqual(parseMessage({ t: 'move', m: [1, 2], extra: 1 }), { t: 'move', m: [1, 2] });
  const state = { scores: { X: 1 }, moves: [] };
  assert.deepEqual(parseMessage({ t: 'sync', hostMark: 'X', state }), { t: 'sync', hostMark: 'X', state });
  for (const bad of [null, 4, 'move', [], {}, { t: 'move' }, { t: 'sync', hostMark: 'X' },
    { t: 'sync', hostMark: 1, state }, { t: 'sync', hostMark: 'X', state: 'x' }, { t: 'chat', m: 1 }]) {
    assert.equal(parseMessage(bad), null, JSON.stringify(bad));
  }
});
