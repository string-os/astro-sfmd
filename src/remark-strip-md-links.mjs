/**
 * Remark plugin: strip `.md` from local link URLs during HTML build.
 *
 * Source authoring keeps `.md` in links so they navigate correctly in
 * GitHub, VS Code, Obsidian, and when an agent reads the raw .md file.
 * The HTML build needs them stripped so humans land on the framework's
 * pretty URLs (e.g. /start/quickstart/) instead of being served the
 * raw markdown source.
 *
 * Transformations:
 *   ./quickstart.md          → ./quickstart/
 *   ../runtime/actions.md    → ../runtime/actions/
 *   ./guide.md#install       → ./guide/#install
 *
 * Skipped:
 *   - Absolute URLs (http://, https://, mailto:, etc.)
 *   - Hash-only links (#section)
 *   - Already-stripped local links
 */

import path from 'node:path';

function visit(node, type, fn) {
  if (node && node.type === type) fn(node);
  if (node && node.children) for (const child of node.children) visit(child, type, fn);
}

const PROTOCOL_RE = /^[a-z][a-z0-9+.-]*:/i;

export default function remarkStripMdLinks(options = {}) {
  const contentDir = path.resolve(process.cwd(), options.contentDir || process.env.ASTRO_SFMD_CONTENT_DIR || 'content');
  const mapOutputPath = options.mapOutputPath || defaultOutputPath;

  return (tree, file) => {
    visit(tree, 'link', (node) => {
      const url = node.url;
      if (!url) return;
      if (PROTOCOL_RE.test(url)) return;          // http://, mailto:, etc.
      if (url.startsWith('#')) return;            // pure hash
      if (url.startsWith('//')) return;           // protocol-relative
      const { pathPart, hashPart } = splitHash(url);

      if (!pathPart.endsWith('.md') && !pathPart.endsWith('.mdx')) return;

      const route = markdownHrefToHtmlRoute(pathPart, file?.path, contentDir, mapOutputPath);
      if (route) {
        node.url = route + hashPart;
        return;
      }

      const stripped = pathPart.replace(/\.(md|mdx)$/, '');
      node.url = (stripped.endsWith('/') ? stripped : stripped + '/') + hashPart;
    });
  };
}

function markdownHrefToHtmlRoute(href, fromFile, contentDir, mapOutputPath) {
  if (href.startsWith('/')) return stripMarkdownExtension(href);
  if (!fromFile) return null;
  const absTarget = path.resolve(path.dirname(fromFile), href);
  const rel = path.relative(contentDir, absTarget).split(path.sep).join('/');
  if (rel.startsWith('../') || rel === '..') return null;
  const out = normalizeOutputPath(mapOutputPath(rel));
  let route = '/' + out.replace(/\.(md|mdx)$/, '');
  route = route.replace(/\/index$/, '/');
  if (route === '/index') route = '/';
  return route;
}

function stripMarkdownExtension(href) {
  const stripped = href.replace(/\.(md|mdx)$/, '');
  return stripped === '/index' ? '/' : stripped;
}

function splitHash(url) {
  const hashIdx = url.indexOf('#');
  if (hashIdx === -1) return { pathPart: url, hashPart: '' };
  return { pathPart: url.slice(0, hashIdx), hashPart: url.slice(hashIdx) };
}

function defaultOutputPath(relPath) {
  return relPath.replace(/\/index\.(md|mdx)$/, '.$1');
}

function normalizeOutputPath(outPath) {
  return String(outPath).replace(/\\/g, '/').replace(/^\/+/, '');
}
