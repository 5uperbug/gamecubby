// Reusable anime.js effects: page entrance, dialogs, feedback and confetti.

import {
  animate, stagger, utils, motion, ms, stag, clearInline,
} from './motion.js';

/**
 * Entrance animation for elements marked `data-reveal`. CSS keeps them hidden
 * (with a timed fallback in case scripts fail), so they never flash before
 * animating in.
 */
export function reveal(nodes, { y = 12, delay = 80 } = {}) {
  const list = [...nodes];
  if (!list.length) return Promise.resolve();
  for (const n of list) {
    n.style.animation = 'none';
    n.style.opacity = '0';
  }
  return animate(list, {
    opacity: [0, 1],
    y: [y, 0],
    duration: ms(520),
    delay: stag(delay),
    ease: 'outQuad',
    onComplete: () => clearInline(list, 'opacity', 'transform'),
  });
}

export function openDialog(dialog) {
  dialog.showModal();
  animate(dialog, { opacity: [0, 1], y: [28, 0], scale: [0.96, 1], duration: ms(420), ease: 'outBack(1.4)' });
}

/** Side-to-side shake for "not allowed" feedback. */
export function shake(node, amplitude = 5) {
  utils.remove(node);
  const a = amplitude;
  return animate(node, {
    x: [0, -a, a, -a * 0.6, a * 0.6, 0],
    duration: ms(400),
    ease: 'linear',
    onComplete: () => clearInline([node], 'transform'),
  });
}

/** Springy scale pop, e.g. for a score that just changed. */
export function pop(node, from = 1.5) {
  return animate(node, { scale: [from, 1], duration: ms(700), ease: 'outElastic(1, .5)' });
}

/**
 * Adds `classes` to `host`, then fades `nodes` from their old opacity to the
 * one CSS now gives them, so the stylesheet stays the source of truth.
 */
export async function fadeIntoClass(host, classes, nodes, duration) {
  const from = nodes.map((n) => parseFloat(getComputedStyle(n).opacity));
  host.classList.add(...classes.split(' '));
  const to = nodes.map((n) => parseFloat(getComputedStyle(n).opacity));
  await Promise.all(nodes.map((n, i) => animate(n, {
    opacity: [from[i], to[i]], duration: ms(duration), ease: 'outQuad',
  })));
  clearInline(nodes, 'opacity');
}

/** Bursts confetti from `host`, a zero-size positioned element. */
export function confetti(host, { count = 44 } = {}) {
  if (motion.reduced) return;
  host.replaceChildren();
  const css = getComputedStyle(document.documentElement);
  const colours = ['--x', '--o', '--focus'].map((v) => css.getPropertyValue(v).trim()).concat('#f5b82e');
  const pieces = Array.from({ length: count }, (_, i) => {
    const piece = document.createElement('i');
    piece.style.background = colours[i % colours.length];
    host.appendChild(piece);
    return piece;
  });
  animate(pieces, {
    x: () => utils.random(-190, 190),
    y: [
      { to: () => utils.random(-230, -90), duration: 600, ease: 'outCubic' },
      { to: () => utils.random(140, 300), duration: 1100, ease: 'inQuad' },
    ],
    rotate: () => utils.random(-720, 720),
    scale: [{ from: 0, to: () => utils.random(6, 12) / 10, duration: 250 }],
    opacity: [{ to: 1, duration: 100 }, { to: 0, delay: 1200, duration: 400 }],
    duration: 1700,
    delay: stagger(12),
    ease: 'outQuad',
    onComplete: () => host.replaceChildren(),
  });
}
