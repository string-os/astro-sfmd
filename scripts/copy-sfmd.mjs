/**
 * Post-build: mirror raw SFMD .md files from content/ to dist/.
 *
 * Also generates blog index files with post listings so agents browsing
 * the blog see the same list that humans see in the HTML version.
 *
 *   content/index.md           → dist/index.md
 *   content/docs/quickstart.md → dist/docs/quickstart.md
 *   content/nav/main.md        → dist/nav/main.md
 *   content/en/blog/*.md       → dist/en/blog/*.md + generated index.md with listing
 */

import fs from 'fs';
import path from 'path';

const CONTENT_DIR = 'content';
const DIST_DIR = 'dist';

/** Extract title and date from a markdown file's frontmatter. */
function extractMeta(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (!fmMatch) return { title: path.basename(filePath, '.md'), date: '' };
  const fm = fmMatch[1];
  const titleMatch = fm.match(/title:\s*"?([^\n"]*)"?/);
  const dateMatch = fm.match(/date:\s*(\d{4}-\d{2}-\d{2})/);
  const tagsMatch = fm.match(/tags:\s*\[([^\]]*)\]/);
  return {
    title: titleMatch ? titleMatch[1].trim() : path.basename(filePath, '.md'),
    date: dateMatch ? dateMatch[1] : '',
    tags: tagsMatch
      ? tagsMatch[1].split(',').map(t => t.trim().replace(/^["']|["']$/g, '')).filter(Boolean)
      : [],
  };
}

/** Check if a directory contains blog posts (non-index .md files). */
function isBlogDir(dir) {
  if (!fs.existsSync(dir)) return false;
  return fs.readdirSync(dir).some(f => f.endsWith('.md') && f !== 'index.md');
}

/** Generate a blog index .md with post listings. */
function generateBlogIndex(blogDir, destDir) {
  const posts = fs.readdirSync(blogDir)
    .filter(f => f.endsWith('.md') && f !== 'index.md')
    .map(f => ({ file: f, ...extractMeta(path.join(blogDir, f)) }))
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  if (posts.length === 0) return;

  // Read existing index.md for frontmatter and intro
  const indexPath = path.join(blogDir, 'index.md');
  let frontmatter = '---\ntitle: Blog\n---';
  let intro = '';
  if (fs.existsSync(indexPath)) {
    const raw = fs.readFileSync(indexPath, 'utf-8');
    const fmMatch = raw.match(/^(---\n[\s\S]*?\n---)/);
    if (fmMatch) frontmatter = fmMatch[1];
    // Keep everything after frontmatter up to end as intro
    const body = raw.replace(/^---\n[\s\S]*?\n---\n*/, '');
    // Take only lines before any auto-generated section
    const lines = body.split('\n');
    const introLines = [];
    for (const line of lines) {
      if (line.startsWith('## Posts') || line.startsWith('## 글 목록')) break;
      introLines.push(line);
    }
    intro = introLines.join('\n').trim();
  }

  // Generate post listing with links
  const listing = posts.map(p => {
    const tags = p.tags.length > 0 ? ` [${p.tags.join(', ')}]` : '';
    return `- [${p.title}](./${p.file}) — ${p.date}${tags}`;
  }).join('\n');

  const content = `${frontmatter}\n\n${intro}\n\n## Posts\n\n${listing}\n`;

  const destFile = path.join(destDir, 'index.md');
  fs.writeFileSync(destFile, content);
  console.log(`  [generated] ${destFile} (${posts.length} posts)`);
}

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

// Generate blog indexes for any directory named 'blog' that has posts
console.log('Generating blog indexes...');
function findBlogDirs(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'blog' && isBlogDir(full)) {
        const relDir = path.relative(CONTENT_DIR, full);
        const destDir = path.join(DIST_DIR, relDir);
        fs.mkdirSync(destDir, { recursive: true });
        generateBlogIndex(full, destDir);
      }
      findBlogDirs(full);
    }
  }
}
findBlogDirs(CONTENT_DIR);

console.log('Done.');
