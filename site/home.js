// Home page: entrance animation and live board previews on the game cards.
//
// Each card names its game with data-game="<slug>". The preview comes from
// games/<slug>/preview.js, which must export:
//
//   buildPreview(svg) → {
//     hide(),   // hide whatever intro() animates in (called right after building)
//     intro(),  // async: animate the art in (called once, when the card scrolls into view)
//     enter(),  // pointer or focus entered the card
//     leave(),  // pointer or focus left the card
//   }
//
// The SVG fills the card's 16:10 art area. Give it a square viewBox and the
// board appears centred. With reduced motion on, only buildPreview() runs.

import { animate, motion, ms, stag, clearInline } from './shared/js/motion.js';
import { drawStrokes } from './shared/js/marks.js';
import { reveal } from './shared/js/effects.js';
import { initThemeToggle } from './shared/js/theme.js';

async function animateLogo() {
  const logo = document.querySelector('.logo');
  const cells = [...logo.querySelectorAll('.logo-cell')];
  const strokes = [...logo.querySelectorAll('.logo-x, .logo-o')];
  for (const s of strokes) s.style.opacity = '0';
  await animate(cells, { scale: [0.3, 1], duration: ms(450), delay: stag(70), ease: 'outBack(2.4)' });
  clearInline(cells, 'transform');
  const drawing = drawStrokes(strokes, 260);
  clearInline(strokes, 'opacity');
  await drawing;
}

async function loadPreview(card) {
  const slug = card.dataset.game;
  const svg = card.querySelector('.preview');
  if (!slug || !svg) return null;
  try {
    const { buildPreview } = await import(`./games/${slug}/preview.js`);
    svg.classList.add(`preview-${slug}`);
    const preview = buildPreview(svg);
    if (!motion.reduced) preview.hide();
    return preview;
  } catch (error) {
    console.warn(`No preview for ${slug}:`, error);
    return null;
  }
}

/** Plays a card's intro the first time it is mostly on screen, then enables hover effects. */
function wireCard(card, preview) {
  let ready = motion.reduced;
  const enter = () => { if (ready && !motion.reduced) preview.enter(); };
  const leave = () => { if (ready && !motion.reduced) preview.leave(); };
  card.addEventListener('pointerenter', enter);
  card.addEventListener('pointerleave', leave);
  card.addEventListener('focus', enter);
  card.addEventListener('blur', leave);
  if (ready) return;

  const start = async () => {
    await preview.intro();
    ready = true;
  };
  if (!('IntersectionObserver' in window)) {
    start();
    return;
  }
  const observer = new IntersectionObserver((entries) => {
    if (!entries.some((e) => e.isIntersecting)) return;
    observer.disconnect();
    start();
  }, { threshold: 0.35 });
  observer.observe(card);
}

async function boot() {
  initThemeToggle(document.querySelector('#btn-theme'));
  const cards = [...document.querySelectorAll('.game-card')];
  const previews = Promise.all(cards.map(loadPreview));
  reveal(document.querySelectorAll('[data-reveal]'));
  animateLogo();
  const built = await previews;
  // Let the cards start fading in before their art draws.
  setTimeout(() => {
    cards.forEach((card, i) => { if (built[i]) wireCard(card, built[i]); });
  }, ms(250));
}

boot();
