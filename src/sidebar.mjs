/**
 * Build, render, and inject a sidebar-derived nav for the AI-facing raw
 * `.md` mirror surface.
 *
 * Why: Astro/Starlight gives humans a sidebar in the rendered HTML. Agents
 * fetching the raw `.md` mirror have no equivalent — every page is an
 * isolated document. This module produces the SFMD nav file (`/nav/main.md`)
 * + injects a `[!nav:main](/nav/main.md)` directive into each mirrored
 * `.md` so an agent landing on any page can traverse the whole site.
 *
 * Two modes (1:1 with Starlight):
 *   - explicit: caller passes the same Starlight-format sidebar array
 *               (groups + items + slugs) used by the human-side integration
 *   - 'auto':   walk contentDir filesystem (alphabetical, top-level dirs as
 *               groups), mirroring Starlight's own auto-sidebar behavior
 */

import fs from 'fs';
import path from 'path';

/**
 * Build a flat list of nav entries.
 *
 * @param {object} opts
 * @param {string} opts.contentDir - Absolute path to `.md` content root.
 * @param {'auto' | object[] | false} [opts.sidebar='auto']
 * @param {(relPath: string) => string} [opts.mapOutputPath]
 * @returns {Array<{id: string, label: string, url: string}> | null}
 */
export function buildNav({ contentDir, sidebar = 'auto', mapOutputPath }) {
  if (sidebar === false) return null;
  if (Array.isArray(sidebar)) {
    return flattenExplicit(sidebar, contentDir, mapOutputPath);
  }
  return autoWalk(contentDir, mapOutputPath);
}

/**
 * Render a nav entries list as an SFMD nav file body.
 * Format: one `[@id Label](url)` shortcut per line.
 */
export function renderNavFile(entries) {
  return entries.map(e => `[@${e.id} ${e.label}](${e.url})`).join('\n') + '\n';
}

/**
 * Inject a `[!nav:<name>](<navPath>)` directive into a mirrored `.md`
 * source so agents fetching the raw page get site-wide navigation.
 *
 * - Inserted right after the frontmatter block (or at the very top if none).
 * - Skipped if the source already declares a `[!nav:...]` directive.
 *
 * Uses an absolute root-relative URL by default (e.g. `/nav/main.md`),
 * which resolves against the page's own URL per WHATWG / RFC 3986 §5
 * to the same site-root nav file regardless of page depth.
 */
export function injectNavDirective(source, { name = 'main', navPath = '/nav/main.md' } = {}) {
  if (/^\[!nav:[a-zA-Z0-9_-]+\]\(/m.test(source)) return source;

  const directive = `[!nav:${name}](${navPath})`;
  const fmMatch = source.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n/);

  if (fmMatch) {
    const fmEnd = fmMatch[0].length;
    return source.slice(0, fmEnd) + '\n' + directive + '\n' + source.slice(fmEnd);
  }
  return directive + '\n\n' + source;
}

// ─── Explicit Starlight-format sidebar → flat entries ────────────────────────

function flattenExplicit(items, contentDir, mapOutputPath) {
  const out = [];
  for (const item of items) {
    if (item == null) continue;

    // Group: { label, items: [...] } — drill in. The label is for human
    // display in the Starlight sidebar; for nav-file ids we rely on the
    // item slug (which already encodes the path), since SFMD shortcut
    // definitions do not allow dots in ids per the spec.
    if (Array.isArray(item.items)) {
      out.push(...flattenExplicit(item.items, contentDir, mapOutputPath));
      continue;
    }

    // Slug entry: { slug: 'start/quickstart', label?: '...' }
    if (typeof item.slug === 'string') {
      const leaf = item.slug.split('/').pop();
      const id = item.slug.replace(/\//g, '-');
      const label = item.label ?? readTitleFromSlug(contentDir, item.slug) ?? humanize(leaf);
      out.push({ id, label, url: urlForSourceRel(`${item.slug}.md`, mapOutputPath) });
      continue;
    }

    // External link: { label, link: 'https://...' }
    if (typeof item.link === 'string' && typeof item.label === 'string') {
      out.push({ id: slugify(item.label), label: item.label, url: item.link });
      continue;
    }
  }
  return out;
}

// ─── Auto: walk contentDir to derive a sidebar ───────────────────────────────

function autoWalk(contentDir, mapOutputPath) {
  if (!fs.existsSync(contentDir)) return [];
  const entries = [];

  // Top-level files (e.g. index.md) come first, in alpha order
  const topFiles = fs.readdirSync(contentDir, { withFileTypes: true })
    .filter(d => d.isFile() && isMd(d.name))
    .map(d => d.name)
    .sort();
  for (const file of topFiles) {
    const slug = stripExt(file);
    const filePath = path.join(contentDir, file);
    entries.push({
      id: slug,
      label: readTitleFromFile(filePath) ?? humanize(slug),
      url: urlForSourceRel(file, mapOutputPath),
    });
  }

  // Subdirectories as groups, alpha. Recurse.
  const groups = fs.readdirSync(contentDir, { withFileTypes: true })
    .filter(d => d.isDirectory() && includeDir(d.name))
    .map(d => d.name)
    .sort();

  for (const group of groups) {
    const groupDir = path.join(contentDir, group);
    const files = walkMd(groupDir).sort();
    for (const filePath of files) {
      const rel = path.relative(contentDir, filePath).split(path.sep).join('/');
      const slug = stripExt(rel);
      const id = slug.replace(/\//g, '-');
      const leaf = slug.split('/').pop();
      entries.push({
        id,
        label: readTitleFromFile(filePath) ?? humanize(leaf),
        url: urlForSourceRel(rel, mapOutputPath),
      });
    }
  }

  return entries;
}

function urlForSourceRel(relPath, mapOutputPath) {
  const outPath = mapOutputPath ? mapOutputPath(relPath) : relPath;
  return '/' + String(outPath).replace(/\\/g, '/').replace(/^\/+/, '');
}

function walkMd(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!includeDir(e.name) && e.isDirectory()) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walkMd(p));
    else if (e.isFile() && isMd(e.name)) out.push(p);
  }
  return out;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isMd(name) {
  return name.endsWith('.md') || name.endsWith('.mdx');
}

function stripExt(name) {
  return name.replace(/\.(md|mdx)$/, '');
}

// Skip dotfiles, underscore-prefixed (Astro convention for "ignore"), and
// `nav/` (reserved for the generated nav file).
function includeDir(name) {
  return !name.startsWith('.') && !name.startsWith('_') && name !== 'nav';
}

function readTitleFromSlug(contentDir, slug) {
  for (const ext of ['.md', '.mdx']) {
    const p = path.join(contentDir, slug + ext);
    if (fs.existsSync(p)) return readTitleFromFile(p);
  }
  return null;
}

function readTitleFromFile(filePath) {
  try {
    const head = fs.readFileSync(filePath, 'utf8').slice(0, 1024);
    const fm = head.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!fm) return null;
    const m = fm[1].match(/^title:\s*(.+?)\s*$/m);
    if (!m) return null;
    return m[1].replace(/^["']|["']$/g, '').trim() || null;
  } catch {
    return null;
  }
}

function humanize(s) {
  return s
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

function slugify(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
