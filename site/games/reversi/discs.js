// Discs on a Reversi board, shared by the game and the home page preview.
// The discs themselves (Red with a cross, Blue with a ring) come from Four in
// a Row. A flip squeezes the disc to an edge, swaps it, and opens it again,
// so its colour and its mark change together.

import { animate, motion, ms, clearInline } from '../../shared/js/motion.js';
import { createDisc } from '../../shared/js/disc.js';
import { rowOf, colOf } from './game.js';

/** Puts `player`'s disc of radius `r` in `slot`, or empties it. */
export function setDisc(slot, player, r) {
  slot.replaceChildren();
  if (player) slot.appendChild(createDisc(player, r));
}

async function flip(slot, player, r, delay) {
  await animate(slot.firstChild, { scaleX: [1, 0], duration: 130, delay, ease: 'inSine' });
  setDisc(slot, player, r);
  await animate(slot.firstChild, { scaleX: [0, 1], duration: 130, ease: 'outSine' });
  clearInline([slot.firstChild], 'transform');
}

async function appear(slot, player, r) {
  setDisc(slot, player, r);
  await animate(slot.firstChild, { scale: [0, 1], duration: ms(320), ease: 'outBack(2)' });
  clearInline([slot.firstChild], 'transform');
}

async function vanish(slot) {
  await animate(slot.firstChild, { scale: 0, duration: ms(220), ease: 'inBack(1.5)' });
  slot.replaceChildren();
}

/**
 * Animates `slots` from the `before` cells to the `after` cells: new discs pop
 * in, removed ones shrink away, and changed ones flip in a wave out from
 * `origin`. With reduced motion on, the board just changes.
 */
export function morph(slots, before, after, origin, r) {
  return Promise.all(after.map((player, cell) => {
    const was = before[cell];
    if (was === player) return null;
    if (motion.reduced) return setDisc(slots[cell], player, r);
    if (!was) return appear(slots[cell], player, r);
    if (!player) return vanish(slots[cell]);
    const steps = Math.max(Math.abs(rowOf(cell) - rowOf(origin)), Math.abs(colOf(cell) - colOf(origin)));
    return flip(slots[cell], player, r, 60 + (steps - 1) * 70);
  }));
}
