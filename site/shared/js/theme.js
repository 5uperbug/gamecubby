// Light/dark theme toggle. theme-boot.js has already applied the saved or
// system theme before first paint; this wires up the button.

import { animate, ms } from './motion.js';

/** Must match the key in theme-boot.js. */
export const THEME_KEY = 'gamecubby:theme';

function savedTheme() {
  try {
    const theme = localStorage.getItem(THEME_KEY);
    return theme === 'light' || theme === 'dark' ? theme : null;
  } catch {
    return null;
  }
}

export function initThemeToggle(button) {
  const root = document.documentElement;

  const apply = (theme, { persist = false, spin = false } = {}) => {
    root.dataset.theme = theme;
    if (persist) {
      try { localStorage.setItem(THEME_KEY, theme); } catch { /* ignore */ }
    }
    const bg = getComputedStyle(root).getPropertyValue('--bg').trim();
    document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute('content', bg));
    const label = theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme';
    button.setAttribute('aria-label', label);
    button.title = label;
    if (spin) {
      animate(button.querySelector('svg'), { rotate: [-120, 0], scale: [0.4, 1], duration: ms(600), ease: 'outBack(2)' });
    }
  };

  apply(root.dataset.theme === 'dark' ? 'dark' : 'light');
  button.addEventListener('click', () => {
    apply(root.dataset.theme === 'dark' ? 'light' : 'dark', { persist: true, spin: true });
  });
  // Follow the system setting until the player picks a theme themselves.
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', (e) => {
    if (!savedTheme()) apply(e.matches ? 'dark' : 'light');
  });
}
