// JSON values in localStorage, namespaced per game. Every project page on
// 5uperbug.github.io shares one origin, so keys carry a site prefix:
//   gamecubby:<namespace>:<key>

const PREFIX = 'gamecubby';

export function createStore(namespace) {
  const full = (key) => `${PREFIX}:${namespace}:${key}`;
  return {
    get(key) {
      try { return JSON.parse(localStorage.getItem(full(key))); } catch { return null; }
    },
    set(key, value) {
      try { localStorage.setItem(full(key), JSON.stringify(value)); } catch { /* private mode */ }
    },
  };
}
