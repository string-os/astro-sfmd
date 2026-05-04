/**
 * Astro integration: dual-output for SFMD-aware sites.
 *
 * Adds two things to any Astro project (vanilla, Starlight, or otherwise):
 *
 *   1. A remark plugin that strips `.md` from local link URLs in the HTML
 *      output, so humans land on pretty `/path/` URLs.
 *   2. A post-build mirror that copies the source `.md` tree into `dist/`
 *      so each page is reachable as `/path.md` for AI agents reading raw.
 *
 * Usage:
 *
 *   import { defineConfig } from 'astro/config';
 *   import starlight from '@astrojs/starlight';
 *   import sfmd from '@string-os/astro-sfmd/integration';
 *
 *   export default defineConfig({
 *     integrations: [
 *       starlight({ ... }),
 *       sfmd({ contentDir: 'src/content/docs' }),
 *     ],
 *   });
 *
 * The integration is framework-agnostic — it works alongside Starlight,
 * a custom Astro project, or anything else that produces an HTML build
 * from `.md` sources.
 */

import path from 'path';
import { fileURLToPath } from 'url';
import remarkStripMdLinks from './remark-strip-md-links.mjs';
import { mirrorMarkdown } from './mirror.mjs';

/**
 * @param {object} [options]
 * @param {string} [options.contentDir] - Directory of source `.md` files,
 *   relative to the project root (e.g. `'src/content/docs'` for Starlight,
 *   `'content'` for vanilla setups). Required.
 * @param {boolean} [options.stripMdLinksInHtml=true] - Transform local `.md`
 *   link URLs to no-extension trailing-slash form in the HTML output.
 *   Source files mirrored to `dist/` keep their `.md` links.
 * @param {boolean} [options.mirror=true] - Mirror `.md` sources into `dist/`
 *   after build. Set false if you want to handle this yourself (e.g. SSR setups).
 * @returns {import('astro').AstroIntegration}
 */
export default function sfmd(options = {}) {
  const {
    contentDir,
    stripMdLinksInHtml = true,
    mirror = true,
  } = options;

  if (!contentDir) {
    throw new Error(
      `[@string-os/astro-sfmd] 'contentDir' option is required. ` +
      `Pass the path to your source .md files relative to the project root, ` +
      `e.g. sfmd({ contentDir: 'src/content/docs' }).`
    );
  }

  return {
    name: '@string-os/astro-sfmd',
    hooks: {
      'astro:config:setup': ({ updateConfig }) => {
        if (stripMdLinksInHtml) {
          updateConfig({
            markdown: {
              remarkPlugins: [remarkStripMdLinks],
            },
          });
        }
      },
      'astro:build:done': ({ dir, logger }) => {
        if (!mirror) return;
        const srcAbs = path.resolve(process.cwd(), contentDir);
        const destAbs = fileURLToPath(dir);
        try {
          const n = mirrorMarkdown(srcAbs, destAbs);
          logger.info(`Mirrored ${n} .md file(s) from ${contentDir} to dist/`);
        } catch (err) {
          logger.error(`Failed to mirror .md files: ${err.message}`);
          throw err;
        }
      },
    },
  };
}
