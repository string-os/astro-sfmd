/**
 * Recursively copy `.md` (and `.mdx`) files from a source directory to a
 * destination directory, preserving relative paths. Used by the SFMD
 * integration to mirror authoring sources into the build output so each
 * page is reachable as both `/<path>/` (HTML) and `/<path>.md` (raw).
 *
 * An optional `transform` callback can rewrite each file's contents on
 * the way out — used by the nav-injection feature to prepend a
 * `[!nav:main](/nav/main.md)` directive into every mirrored page.
 */

import fs from 'fs';
import path from 'path';

/**
 * @param {string} srcDir - Absolute path to source content root.
 * @param {string} destDir - Absolute path to build output root.
 * @param {object} [options]
 * @param {(source: string, relPath: string) => string} [options.transform]
 *   Optional callback to rewrite the file body. Called with the raw source
 *   and the path relative to srcDir (using `/` separators on all platforms).
 *   Return the body to write. If omitted, files are copied byte-for-byte.
 * @param {(relPath: string) => string} [options.mapOutputPath]
 *   Optional callback to change where a mirrored file is written inside
 *   dist/. The callback receives the source-relative path, e.g.
 *   `en/blog/index.md`, and returns the dist-relative path, e.g.
 *   `blog.md`. Return paths should use `/`; absolute paths are rejected.
 * @returns {number} Count of files mirrored.
 */
export function mirrorMarkdown(srcDir, destDir, options = {}) {
  const { transform, mapOutputPath } = options;
  let count = 0;

  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const srcPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(srcPath);
      } else if (entry.name.endsWith('.md') || entry.name.endsWith('.mdx')) {
        const relPath = path.relative(srcDir, srcPath).split(path.sep).join('/');
        const outRelPath = mapOutputPath ? normalizeOutPath(mapOutputPath(relPath), relPath) : relPath;
        const destPath = path.join(destDir, outRelPath);
        fs.mkdirSync(path.dirname(destPath), { recursive: true });
        if (transform) {
          const source = fs.readFileSync(srcPath, 'utf8');
          fs.writeFileSync(destPath, transform(source, relPath));
        } else {
          fs.copyFileSync(srcPath, destPath);
        }
        count++;
      }
    }
  }

  if (!fs.existsSync(srcDir)) {
    throw new Error(`mirrorMarkdown: source directory does not exist: ${srcDir}`);
  }

  walk(srcDir);
  return count;
}

function normalizeOutPath(outPath, relPath) {
  if (typeof outPath !== 'string' || outPath.trim() === '') {
    throw new Error(`mapOutputPath returned an empty path for ${relPath}`);
  }
  const normalized = outPath.replace(/\\/g, '/').replace(/^\/+/, '');
  if (normalized.startsWith('../') || normalized.includes('/../')) {
    throw new Error(`mapOutputPath must stay inside dist/: ${outPath}`);
  }
  return normalized;
}
