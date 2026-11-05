// Structural checks for the static site. There is no build step, so a moved
// file or a mistyped relative path would only show up as a 404 in the
// browser. These tests catch that before deploy.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  existsSync, readFileSync, readdirSync, statSync,
} from 'node:fs';
import {
  dirname, join, relative, resolve, sep,
} from 'node:path';
import { fileURLToPath } from 'node:url';

const SITE = resolve(dirname(fileURLToPath(import.meta.url)), '../site');
const rel = (p) => relative(SITE, p) || '.';

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

const files = walk(SITE);
const htmlFiles = files.filter((f) => f.endsWith('.html'));
const ownJsFiles = files.filter((f) => f.endsWith('.js') && !f.includes(`${sep}vendor${sep}`));
const gameDirs = readdirSync(join(SITE, 'games'))
  .filter((name) => statSync(join(SITE, 'games', name)).isDirectory());

/** Relative references only: skip URLs with a scheme, protocol-relative URLs and fragments. */
const isLocal = (ref) => !/^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(ref);

/** Resolves a reference the way a browser would, mapping folders to their index.html. */
function target(fromFile, ref) {
  const clean = ref.split(/[?#]/)[0];
  const path = resolve(dirname(fromFile), clean);
  return clean === '' || clean.endsWith('/') ? join(path, 'index.html') : path;
}

function assertResolves(fromFile, ref) {
  const path = target(fromFile, ref);
  assert.ok(
    path === SITE || path.startsWith(SITE + sep),
    `${rel(fromFile)}: "${ref}" points outside site/`,
  );
  assert.ok(existsSync(path), `${rel(fromFile)}: "${ref}" not found (expected ${rel(path)})`);
}

test('every href and src in the pages resolves to a file', () => {
  assert.ok(htmlFiles.length >= 3);
  for (const file of htmlFiles) {
    const html = readFileSync(file, 'utf8');
    for (const [, ref] of html.matchAll(/\s(?:href|src)="([^"]+)"/g)) {
      if (isLocal(ref)) assertResolves(file, ref);
    }
  }
});

test('every module import resolves to a file', () => {
  const importRe = /(?:^|[\s;])(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)|^\s*import\s+['"]([^'"]+)['"]/gm;
  for (const file of ownJsFiles) {
    const js = readFileSync(file, 'utf8');
    for (const match of js.matchAll(importRe)) {
      const spec = match[1] || match[2] || match[3];
      assert.ok(spec.startsWith('.'), `${rel(file)}: bare import "${spec}" cannot load without a bundler`);
      assertResolves(file, spec);
    }
  }
});

test('every game is linked from the home page and links back to it', () => {
  assert.ok(gameDirs.length >= 2);
  const home = readFileSync(join(SITE, 'index.html'), 'utf8');
  for (const game of gameDirs) {
    const page = join(SITE, 'games', game, 'index.html');
    assert.ok(existsSync(page), `games/${game}/ has no index.html`);
    assert.ok(home.includes(`href="games/${game}/"`), `home page has no card for games/${game}/`);
    assert.ok(readFileSync(page, 'utf8').includes('href="../../"'), `games/${game}/ has no link back home`);
  }
});

test('every game has a home page preview, and every card names a real game', () => {
  const home = readFileSync(join(SITE, 'index.html'), 'utf8');
  const named = [...home.matchAll(/data-game="([^"]+)"/g)].map((m) => m[1]);
  for (const slug of named) {
    assert.ok(gameDirs.includes(slug), `card data-game="${slug}" has no games/${slug}/ folder`);
  }
  for (const game of gameDirs) {
    assert.ok(named.includes(game), `no card with data-game="${game}" on the home page`);
    const preview = join(SITE, 'games', game, 'preview.js');
    assert.ok(existsSync(preview), `games/${game}/ has no preview.js`);
    assert.match(readFileSync(preview, 'utf8'), /export function buildPreview\(/, `games/${game}/preview.js must export buildPreview(svg)`);
  }
});

test('every page loads the theme script before its stylesheets', () => {
  for (const file of htmlFiles) {
    const html = readFileSync(file, 'utf8');
    const boot = html.indexOf('shared/js/theme-boot.js');
    const css = html.indexOf('rel="stylesheet"');
    assert.ok(boot !== -1, `${rel(file)} does not load theme-boot.js`);
    assert.ok(boot < css, `${rel(file)} loads theme-boot.js after its CSS`);
  }
});
