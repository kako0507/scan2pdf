import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteStaticCopy } from 'vite-plugin-static-copy';

// Files that Tesseract.js loads at runtime by URL (worker, WASM core, language data). They are copied from
// node_modules at fixed paths (served directly in dev), so their versions always match package.json.
const flat = { stripBase: true };
const tesseractRuntime = viteStaticCopy({
  targets: [
    { src: 'node_modules/tesseract.js/dist/worker.min.js', dest: 'vendor/tesseract', rename: flat },
    { src: 'node_modules/tesseract.js-core/tesseract-core-*lstm.wasm.js', dest: 'vendor/tesseract/core', rename: flat },
    { src: 'node_modules/@tesseract.js-data/chi_tra/4.0.0_best_int/chi_tra.traineddata.gz', dest: 'vendor/tesseract/lang', rename: flat },
    { src: 'node_modules/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz', dest: 'vendor/tesseract/lang', rename: flat },
    // Licences of the redistributed files (not precached).
    { src: 'node_modules/tesseract.js/LICENSE.md', dest: 'vendor/tesseract', rename: flat },
    { src: 'node_modules/tesseract.js-core/LICENSE', dest: 'vendor/tesseract/core', rename: flat },
  ],
});

/** After the build, write dist/sw.js with the list of all output files and a content-hash cache version. */
function precacheServiceWorker() {
  let outDir;
  return {
    name: 'precache-service-worker',
    apply: 'build',
    configResolved(cfg) { outDir = cfg.build.outDir; },
    closeBundle() {
      const walk = (d) => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));
      const files = walk(outDir).filter((f) => !f.endsWith('sw.js') && !f.endsWith('LICENSE') && !f.endsWith('.md'));
      const hash = createHash('sha256');
      const list = files.map((f) => {
        hash.update(readFileSync(f));
        const rel = relative(outDir, f).split(sep).join('/');
        return rel === 'index.html' ? './' : rel;
      }).sort();
      const sw = readFileSync('src/sw-template.js', 'utf8')
        .replace('__VERSION__', hash.digest('hex').slice(0, 12))
        .replace('__FILES__', JSON.stringify(list, null, 2));
      writeFileSync(join(outDir, 'sw.js'), sw);
    },
  };
}

export default defineConfig({
  base: './', // relative paths work at https://<user>.github.io/<repo>/ under any repo name
  plugins: [react(), tesseractRuntime, precacheServiceWorker()],
  test: { environment: 'node', include: ['src/**/*.test.js'] },
});
