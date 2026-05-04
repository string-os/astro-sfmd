/**
 * Recursively copy `.md` (and `.mdx`) files from a source directory to a
 * destination directory, preserving relative paths. Used by the SFMD
 * integration to mirror authoring sources into the build output so each
 * page is reachable as both `/<path>/` (HTML) and `/<path>.md` (raw).
 */

import fs from 'fs';
import path from 'path';

export function mirrorMarkdown(srcDir, destDir) {
  let count = 0;

  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const srcPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(srcPath);
      } else if (entry.name.endsWith('.md') || entry.name.endsWith('.mdx')) {
        const relPath = path.relative(srcDir, srcPath);
        const destPath = path.join(destDir, relPath);
        fs.mkdirSync(path.dirname(destPath), { recursive: true });
        fs.copyFileSync(srcPath, destPath);
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
