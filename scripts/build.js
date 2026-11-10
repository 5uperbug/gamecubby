// Builds the deployable site into dist/: a copy of site/ with every page's
// module graph bundled, tree-shaken and minified, and the CSS minified.
// HTML is untouched, since each entry file is rewritten at its original path.
// Development needs none of this: `npm start` serves site/ as-is.

import { build } from 'esbuild';
import { cpSync, globSync, rmSync } from 'node:fs';

const SITE = 'site';
const OUT = 'dist';

rmSync(OUT, { recursive: true, force: true });
cpSync(SITE, OUT, { recursive: true });

// site/ imports the pre-minified vendor copy so it runs without a build; that
// file barely tree-shakes, so bundles take anime.js from npm (same version,
// checked by tests/site.test.js) instead.
const animeFromNpm = {
  name: 'anime-from-npm',
  setup(b) {
    b.onResolve({ filter: /vendor\/animejs\/anime\.esm\.min\.js$/ }, () => b.resolve('animejs', { kind: 'import-statement', resolveDir: '.' }));
  },
};

const common = { outbase: SITE, outdir: OUT, minify: true, allowOverwrite: true, logLevel: 'info' };

await build({
  ...common,
  entryPoints: [`${SITE}/home.js`, ...globSync(`${SITE}/games/*/app.js`)],
  bundle: true,
  splitting: true,
  format: 'esm',
  chunkNames: 'chunks/[name]-[hash]',
  plugins: [animeFromNpm],
});

// theme-boot.js is a classic blocking script, so it is only minified.
await build({
  ...common,
  entryPoints: [`${SITE}/shared/js/theme-boot.js`, ...globSync(`${SITE}/**/*.css`)],
});

// Everything else that was JS is now inside the bundles.
for (const file of globSync(`${OUT}/**/*.js`)) {
  if (!/(\/home|\/app|\/theme-boot|\/chunks\/.*)\.js$/.test(file)) rmSync(file);
}
rmSync(`${OUT}/vendor/animejs/anime.esm.min.js`, { force: true });
