/**
 * Post-build: mirror raw SFMD .md files from content/ to dist/.
 *
 * Copies every .md file preserving the directory structure as-is.
 * Astro HTML output uses directory format (docs/quickstart/index.html),
 * but SFMD copies keep the flat path (docs/quickstart.md) so relative
 * shortcut hrefs resolve correctly when string fetches them.
 *
 *   content/index.md           → dist/index.md
 *   content/docs/quickstart.md → dist/docs/quickstart.md
 *   content/spec.md            → dist/spec.md
 *   content/nav/main.md        → dist/nav/main.md
 *
 * Content-negotiation middleware routes:
 *   Accept: text/html      →  /docs/quickstart/index.html (Astro output)
 *   Accept: text/markdown  →  /docs/quickstart.md (this copy)
 */

import fs from 'fs';
import path from 'path';

const CONTENT_DIR = 'content';
const DIST_DIR = 'dist';

function mirror(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const srcPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      mirror(srcPath);
    } else if (entry.name.endsWith('.md')) {
      const relPath = path.relative(CONTENT_DIR, srcPath);
      const destPath = path.join(DIST_DIR, relPath);
      fs.mkdirSync(path.dirname(destPath), { recursive: true });
      fs.copyFileSync(srcPath, destPath);
      console.log(`  ${srcPath} → ${destPath}`);
    }
  }
}

console.log('Mirroring SFMD source files to dist/...');
mirror(CONTENT_DIR);
console.log('Done.');
