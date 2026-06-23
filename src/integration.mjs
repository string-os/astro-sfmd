/**
 * Astro integration: dual-output for SFMD-aware sites.
 *
 * One build, two surfaces:
 *
 *   1. Astro core renders the human-facing HTML site to `dist/<page>/`.
 *   2. This integration takes the source `.md` tree + Astro's sidebar
 *      info and produces the AI-facing surface alongside it:
 *        - mirrors source `.md` files to `dist/<path>.md`
 *        - generates `dist/nav/main.md` from the sidebar (when enabled)
 *        - injects a `[!nav:main](/nav/main.md)` directive into each
 *          mirrored `.md` so an agent landing on any page can traverse
 *          the whole site
 *      Plus a remark plugin that strips `.md` from local link URLs in
 *      the HTML output, so humans land on pretty `/path/` URLs while
 *      the mirrored sources keep their `.md` links for raw traversal.
 *
 * Usage:
 *
 *   import { defineConfig } from 'astro/config';
 *   import starlight from '@astrojs/starlight';
 *   import sfmd from '@string-os/astro-sfmd/integration';
 *
 *   const sidebar = [
 *     { label: 'Getting Started', items: [{ slug: 'start/quickstart' }] },
 *     // …
 *   ];
 *
 *   export default defineConfig({
 *     integrations: [
 *       starlight({ sidebar }),
 *       sfmd({ contentDir: 'src/content/docs', sidebar }),
 *     ],
 *   });
 *
 * Or omit `sidebar` (defaults to `'auto'`) to walk the contentDir
 * filesystem alphabetically — same shape as Starlight's auto sidebar.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import remarkStripMdLinks from './remark-strip-md-links.mjs';
import { mirrorMarkdown } from './mirror.mjs';
import { buildNav, renderNavFile, injectNavDirective } from './sidebar.mjs';

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
 * @param {'auto' | object[] | false} [options.sidebar='auto'] - Source for
 *   the agent-facing nav file. Pass the same Starlight-format sidebar array
 *   you give to `starlight({ sidebar })`, or `'auto'` to derive it from the
 *   filesystem (top-level dirs as groups, alphabetical, frontmatter `title`
 *   used as label when present). Pass `false` to skip nav generation.
 * @param {string} [options.navName='main'] - The nav directive name
 *   (`[!nav:<name>](...)`). Default `main`.
 * @param {(relPath: string) => string} [options.mapOutputPath] - Optional
 *   source-relative `.md` path mapper for the mirrored SFMD output. By
 *   default, nested `index.md` files collapse to route twins
 *   (`blog/index.md` -> `blog.md`). Use a custom mapper when Astro routes
 *   differ from the content tree, e.g. default-language i18n.
 * @returns {import('astro').AstroIntegration}
 */
export default function sfmd(options = {}) {
  const {
    contentDir,
    stripMdLinksInHtml = true,
    mirror = true,
    sidebar = 'auto',
    navName = 'main',
    mapOutputPath,
  } = options;

  if (!contentDir) {
    throw new Error(
      `[@string-os/astro-sfmd] 'contentDir' option is required. ` +
      `Pass the path to your source .md files relative to the project root, ` +
      `e.g. sfmd({ contentDir: 'src/content/docs' }).`
    );
  }

  const navPath = `/nav/${navName}.md`;
  const outputPathMapper = mapOutputPath ?? defaultOutputPath;

  return {
    name: '@string-os/astro-sfmd',
    hooks: {
      'astro:config:setup': ({ updateConfig }) => {
        if (stripMdLinksInHtml) {
          updateConfig({
            markdown: {
              remarkPlugins: [[remarkStripMdLinks, { contentDir, mapOutputPath: outputPathMapper }]],
            },
          });
        }
      },
      'astro:build:done': ({ dir, logger }) => {
        if (!mirror) return;
        const srcAbs = path.resolve(process.cwd(), contentDir);
        const destAbs = fileURLToPath(dir);

        // Build nav entries (or null if disabled / empty).
        let navEntries = null;
        if (sidebar !== false) {
          try {
            const entries = buildNav({ contentDir: srcAbs, sidebar, mapOutputPath: outputPathMapper });
            if (entries && entries.length > 0) navEntries = entries;
          } catch (err) {
            logger.warn(`Could not build nav: ${err.message}. Continuing without nav.`);
          }
        }

        try {
          // Mirror sources, optionally injecting the [!nav:...] directive.
          // The nav file itself (mirrored from a source if it exists) is
          // skipped — directive on a nav file would be self-referential.
          const transform = navEntries
            ? (source, relPath) => {
                if (relPath.startsWith('nav/')) return source;
                return injectNavDirective(source, { name: navName, navPath });
              }
            : undefined;

          const n = mirrorMarkdown(srcAbs, destAbs, { transform, mapOutputPath: outputPathMapper });
          logger.info(`Mirrored ${n} .md file(s) from ${contentDir} to dist/`);

          // Write generated nav file. Overwrites any nav/main.md that may
          // have come from sources — this is intentional: the integration
          // owns the nav surface.
          if (navEntries) {
            const navOutPath = path.join(destAbs, 'nav', `${navName}.md`);
            fs.mkdirSync(path.dirname(navOutPath), { recursive: true });
            fs.writeFileSync(navOutPath, renderNavFile(navEntries));
            logger.info(`Generated ${navPath} with ${navEntries.length} entries`);
          }
        } catch (err) {
          logger.error(`Failed to mirror .md files: ${err.message}`);
          throw err;
        }
      },
    },
  };
}

function defaultOutputPath(relPath) {
  return relPath.replace(/\/index\.(md|mdx)$/, '.$1');
}
