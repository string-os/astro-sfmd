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

export interface ParseSfmdOptions {
  contentDir?: string;
  mapOutputPath?: (relPath: string) => string;
}

/**
 * Parse a raw SFMD file into an SfmdPage ready for HTML rendering.
 */
export function parseSfmdFile(filePath: string, options: ParseSfmdOptions = {}): SfmdPage {
  const raw = fs.readFileSync(filePath, 'utf-8');
  return parseSfmd(raw, filePath, options);
}

export function parseSfmd(raw: string, filePath: string, options: ParseSfmdOptions = {}): SfmdPage {
  const contentDir = resolveContentDir(options.contentDir);
  const mapOutputPath = options.mapOutputPath ?? defaultOutputPath;

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
          resolvedHref = href.startsWith('/')
            ? stripMarkdownExtension(href)
            : markdownFileToHtmlRoute(path.resolve(path.dirname(resolved), href), contentDir, mapOutputPath) ?? href;
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

  // Convert markdown .md links to HTML routes for the human view.
  // Use raw HTML anchors when a page intentionally links to a raw .md twin.
  clean = rewriteMarkdownLinksForHtml(clean, filePath, contentDir, mapOutputPath);

  // 4. Render markdown → HTML
  const htmlBody = marked.parse(clean, { async: false }) as string;

  return { title, htmlBody, nav, rawMarkdown: raw };
}

/**
 * List all content .md files (excluding nav files).
 */
export function listContentFiles(): { filePath: string; slug: string }[] {
  const contentDir = resolveContentDir();
  const results: { filePath: string; slug: string }[] = [];

  function walk(dir: string) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (entry.name === 'nav') continue; // skip nav directory
        walk(path.join(dir, entry.name));
      } else if (entry.name.endsWith('.md')) {
        const filePath = path.join(dir, entry.name);
        let slug = path.relative(contentDir, filePath).replace(/\.md$/, '');
        if (slug === 'index') slug = '';
        if (slug.endsWith('/index')) slug = slug.replace(/\/index$/, '');
        results.push({ filePath, slug });
      }
    }
  }

  walk(contentDir);
  return results;
}

function resolveContentDir(contentDir = process.env.ASTRO_SFMD_CONTENT_DIR || 'content'): string {
  return path.resolve(process.cwd(), contentDir);
}

function rewriteMarkdownLinksForHtml(
  markdown: string,
  filePath: string,
  contentDir: string,
  mapOutputPath: (relPath: string) => string,
): string {
  return markdown.replace(/\]\(([^)\s]+)\)/g, (match, href) => {
    const { pathPart, hashPart } = splitHash(href);
    if (!isMarkdownHref(pathPart)) return match;
    const route = pathPart.startsWith('/')
      ? stripMarkdownExtension(pathPart)
      : markdownFileToHtmlRoute(path.resolve(path.dirname(filePath), pathPart), contentDir, mapOutputPath);
    return route ? `](${route}${hashPart})` : match;
  });
}

function isMarkdownHref(href: string): boolean {
  if (!href.endsWith('.md') && !href.endsWith('.mdx')) return false;
  if (href.startsWith('#') || href.startsWith('//')) return false;
  return !/^[a-z][a-z0-9+.-]*:/i.test(href);
}

function markdownFileToHtmlRoute(
  absTarget: string,
  contentDir: string,
  mapOutputPath: (relPath: string) => string,
): string | null {
  const rel = path.relative(contentDir, absTarget).split(path.sep).join('/');
  if (rel.startsWith('../') || rel === '..') return null;
  const out = normalizeOutputPath(mapOutputPath(rel));
  let route = '/' + out.replace(/\.(md|mdx)$/, '');
  route = route.replace(/\/index$/, '/');
  if (route === '/index') route = '/';
  return route;
}

function defaultOutputPath(relPath: string): string {
  return relPath.replace(/\/index\.(md|mdx)$/, '.$1');
}

function normalizeOutputPath(outPath: string): string {
  return outPath.replace(/\\/g, '/').replace(/^\/+/, '');
}

function stripMarkdownExtension(href: string): string {
  const stripped = href.replace(/\.(md|mdx)$/, '');
  return stripped === '/index' ? '/' : stripped;
}

function splitHash(url: string): { pathPart: string; hashPart: string } {
  const hashIdx = url.indexOf('#');
  if (hashIdx === -1) return { pathPart: url, hashPart: '' };
  return { pathPart: url.slice(0, hashIdx), hashPart: url.slice(hashIdx) };
}
