/**
 * SFMD processing utilities for the HTML view.
 *
 * Takes raw SFMD markdown and produces:
 *   1. Clean HTML (directives and action blocks stripped, shortcuts resolved)
 *   2. Metadata (title from frontmatter, nav entries from menu files)
 *
 * Phase 1: manual parsing (regex-based). Phase 2: use @string-os/core parser.
 */

import { marked } from 'marked';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

export interface NavEntry {
  id: string;
  label: string;
  href: string;
}

export interface SfmdPage {
  title: string;
  htmlBody: string;
  nav: NavEntry[];
  rawMarkdown: string;
}

// Astro's build runs getStaticPaths() from a bundled chunk in dist/,
// but process.cwd() stays at the project root in both dev and build.
const CONTENT_DIR = path.join(process.cwd(), 'content');

/**
 * Parse a raw SFMD file into an SfmdPage ready for HTML rendering.
 */
export function parseSfmdFile(filePath: string): SfmdPage {
  const raw = fs.readFileSync(filePath, 'utf-8');
  return parseSfmd(raw, filePath);
}

export function parseSfmd(raw: string, filePath: string): SfmdPage {
  // 1. Extract frontmatter
  let body = raw;
  let title = '';
  const fmMatch = raw.match(/^---\n([\s\S]*?)\n---\n/);
  if (fmMatch) {
    body = raw.slice(fmMatch[0].length);
    const titleMatch = fmMatch[1].match(/title:\s*(.+)/);
    if (titleMatch) title = titleMatch[1].trim();
  }

  // 2. Extract nav entries from [!nav:name](path) directives
  const nav: NavEntry[] = [];
  const navDirRe = /^\[!nav:\w+\]\(([^)]+)\)\s*$/gm;
  let navMatch;
  while ((navMatch = navDirRe.exec(body)) !== null) {
    const navPath = navMatch[1];
    const resolved = path.resolve(path.dirname(filePath), navPath);
    if (fs.existsSync(resolved)) {
      const navContent = fs.readFileSync(resolved, 'utf-8');
      // Parse shortcut lines: [@id Label](href)
      const shortcutRe = /\[@(\S+)\s+([^\]]+)\]\(([^)]+)\)/g;
      let sm;
      while ((sm = shortcutRe.exec(navContent)) !== null) {
        const href = sm[3];
        // Convert .md hrefs to site-relative paths
        let resolvedHref = href;
        if (href.endsWith('.md') && !href.startsWith('http')) {
          const absTarget = path.resolve(path.dirname(resolved), href);
          const relToContent = path.relative(CONTENT_DIR, absTarget);
          resolvedHref = '/' + relToContent.replace(/\.md$/, '').replace(/\/index$/, '/');
          if (resolvedHref === '/index') resolvedHref = '/';
        }
        nav.push({ id: sm[1], label: sm[2], href: resolvedHref });
      }
    }
  }

  // 3. Strip SFMD-specific syntax from the markdown body
  let clean = body;

  // Strip [!nav:...] and [!include:...] directive lines
  clean = clean.replace(/^\[!(nav|include):[^\]]+\]\([^)]*\)\s*$/gm, '');

  // Strip action code blocks (```act.xxx ... ```)
  clean = clean.replace(/^```act\.\S+[\s\S]*?^```\s*$/gm, '');

  // Strip response template blocks (```act.xxx.response ... ```)
  clean = clean.replace(/^```act\.\S+\.response[\s\S]*?^```\s*$/gm, '');

  // Strip block markers (<!-- #id --> and <!-- /id -->)
  clean = clean.replace(/^<!--\s*[#/][a-zA-Z0-9_-]+\s*-->\s*$/gm, '');

  // Convert shortcuts: [@id Label](url) → [Label](url)
  clean = clean.replace(/\[@\S+\s+([^\]]+)\]\(([^)]+)\)/g, '[$1]($2)');

  // Convert .md links to site paths for HTML view
  clean = clean.replace(/\]\((\.[^)]*?)\.md\)/g, (_, p) => {
    return '](' + p.replace(/\/index$/, '/') + ')';
  });

  // 4. Render markdown → HTML
  const htmlBody = marked.parse(clean, { async: false }) as string;

  return { title, htmlBody, nav, rawMarkdown: raw };
}

/**
 * List all content .md files (excluding nav files).
 */
export function listContentFiles(): { filePath: string; slug: string }[] {
  const results: { filePath: string; slug: string }[] = [];

  function walk(dir: string) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (entry.name === 'nav') continue; // skip nav directory
        walk(path.join(dir, entry.name));
      } else if (entry.name.endsWith('.md')) {
        const filePath = path.join(dir, entry.name);
        let slug = path.relative(CONTENT_DIR, filePath).replace(/\.md$/, '');
        if (slug === 'index') slug = '';
        if (slug.endsWith('/index')) slug = slug.replace(/\/index$/, '');
        results.push({ filePath, slug });
      }
    }
  }

  walk(CONTENT_DIR);
  return results;
}
