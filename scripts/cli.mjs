#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

const args = process.argv.slice(2);
const cmd = args[0];

if (!cmd || cmd === '--help' || cmd === '-h') {
  printHelp();
  process.exit(0);
}

switch (cmd) {
  case 'new':
    cmdNew(args.slice(1));
    break;
  case 'init':
    cmdInit(args.slice(1));
    break;
  default:
    console.error(`astro-sfmd: unknown command: ${cmd}`);
    printHelp();
    process.exit(1);
}

// ---------------------------------------------------------------------------
// `new` — scaffold a complete starter site
// ---------------------------------------------------------------------------

function cmdNew(argv) {
  const positionals = argv.filter((a) => !a.startsWith('--'));
  const dir = positionals[0];
  if (!dir) {
    console.error('Usage: astro-sfmd new <dir> [--github-pages|--vercel] [--blog] [--docs] [--force]');
    process.exit(1);
  }

  const vercel = argv.includes('--vercel'); // GitHub Pages is the default host
  const blog = argv.includes('--blog');
  const docs = argv.includes('--docs');
  const force = argv.includes('--force');

  const root = path.resolve(process.cwd(), dir);
  const name = path.basename(root).toLowerCase().replace(/[^a-z0-9-]/g, '-');

  if (fs.existsSync(root) && fs.readdirSync(root).length > 0 && !force) {
    console.error(`Target directory is not empty: ${root}`);
    console.error('Re-run with --force to scaffold into it anyway.');
    process.exit(1);
  }

  const host = vercel ? 'vercel' : 'github-pages';
  const written = [];
  const write = (rel, contents) => {
    const abs = path.join(root, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, contents);
    written.push(rel);
  };

  write('package.json', tplPackageJson(name, blog));
  write('astro.config.mjs', tplAstroConfig({ host, name }));
  write('.gitignore', tplGitignore());
  write('src/pages/index.astro', tplIndexAstro());
  write('src/pages/[...slug].astro', tplSlugAstro());
  write('content/index.md', tplContentIndex({ name, blog, docs }));
  write('content/about.md', tplContentAbout());
  write('content/nav/main.md', tplNavMain({ blog, docs }));

  if (blog) {
    const today = isoDate();
    write('content/blog/index.md', tplBlogIndex());
    write(`content/blog/${today}-hello-world.md`, tplBlogPost(today));
  }
  if (docs) {
    write('content/docs/index.md', tplDocsIndex());
    write('content/docs/getting-started.md', tplDocsGettingStarted());
  }

  write('README.md', tplSiteReadme({ name, host, blog, docs }));

  if (host === 'github-pages') {
    write('.github/workflows/deploy.yml', tplGitHubPagesWorkflow());
  }

  console.log(`Scaffolded ${host} site at ${root}`);
  for (const f of written) console.log(`  + ${f}`);
  console.log('');
  console.log('Next steps:');
  console.log(`  cd ${dir}`);
  console.log('  npm install');
  console.log('  npm run dev      # local preview');
  console.log('  npm run build    # dist/ with HTML + .md twins');
  if (host === 'github-pages') {
    console.log('');
    console.log('To go live on GitHub Pages:');
    console.log('  1. Push to a GitHub repo.');
    console.log('  2. Repo Settings -> Pages -> Source = "GitHub Actions".');
    console.log(`  3. For a project page, set base: '/<repo>/' in astro.config.mjs (see TODO).`);
  } else {
    console.log('');
    console.log('For Vercel Accept-negotiation middleware: astro-sfmd init --vercel');
  }
}

// ---------------------------------------------------------------------------
// `init` — generate host wiring (Vercel middleware or GitHub Pages workflow)
// ---------------------------------------------------------------------------

function cmdInit(argv) {
  const vercel = argv.includes('--vercel');
  const githubPages = argv.includes('--github-pages');
  const force = argv.includes('--force');

  if (vercel === githubPages) {
    console.error('astro-sfmd init: choose exactly one target.');
    console.error('Usage: astro-sfmd init --vercel [--force]');
    console.error('       astro-sfmd init --github-pages [--force]');
    process.exit(1);
  }

  if (vercel) return initVercel(force);
  return initGitHubPages(force);
}

function initVercel(force) {
  const target = path.resolve(process.cwd(), 'middleware.ts');
  if (fs.existsSync(target) && !force) {
    console.error(`middleware.ts already exists. Re-run with --force to overwrite: ${target}`);
    process.exit(1);
  }
  fs.writeFileSync(target, vercelMiddlewareTemplate());
  console.log(`Wrote ${target}`);
}

function initGitHubPages(force) {
  const target = path.resolve(process.cwd(), '.github/workflows/deploy.yml');
  if (fs.existsSync(target) && !force) {
    console.error(`.github/workflows/deploy.yml already exists. Re-run with --force to overwrite: ${target}`);
    process.exit(1);
  }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, tplGitHubPagesWorkflow());
  console.log(`Wrote ${target}`);
  console.log('');
  console.log('One-time manual step to go live:');
  console.log('  Repo Settings -> Pages -> Source = "GitHub Actions".');
  console.log(`  For a project page (user.github.io/<repo>/), set base: '/<repo>/' in astro.config.mjs.`);
}

// ---------------------------------------------------------------------------
// Help
// ---------------------------------------------------------------------------

function printHelp() {
  console.log(`astro-sfmd — scaffold and deploy human+AI (SFMD) sites.

Usage:
  astro-sfmd new <dir> [--github-pages|--vercel] [--blog] [--docs] [--force]
  astro-sfmd init --github-pages [--force]
  astro-sfmd init --vercel [--force]

Commands:
  new              Scaffold a complete starter site (landing + about, optional
                   blog/docs), wired with the astro-sfmd integration. Emits
                   styled HTML for people and mirrored .md for agents.
                   Host defaults to --github-pages.
  init --github-pages   Add .github/workflows/deploy.yml (Astro -> GitHub Pages).
  init --vercel         Add middleware.ts for Vercel Accept-negotiation.

Flags:
  --github-pages   Target static GitHub Pages (no server; .md twins served directly).
  --vercel         Target Vercel (middleware does runtime Accept negotiation).
  --blog           Include a sample dated blog post with auto-generated index.
  --docs           Include a sample docs section.
  --force          Overwrite existing files / scaffold into a non-empty dir.

On a static host like GitHub Pages there is no middleware, but the build-time
.md mirror means the AI view still works: agents fetch /path.md directly.
`);
}

// ---------------------------------------------------------------------------
// Templates — generated site files
// ---------------------------------------------------------------------------

function tplPackageJson(name, blog) {
  const pkg = {
    name: name || 'sfmd-site',
    private: true,
    type: 'module',
    version: '0.0.1',
    scripts: {
      dev: 'astro dev',
      build: 'astro build && node node_modules/@string-os/astro-sfmd/scripts/copy-sfmd.mjs',
      preview: 'astro preview',
    },
    dependencies: {
      '@string-os/astro-sfmd': '^0.2.0',
      astro: '^6.0.0',
    },
  };
  return JSON.stringify(pkg, null, 2) + '\n';
}

function tplAstroConfig({ host, name }) {
  if (host === 'github-pages') {
    return `// @ts-check
import { defineConfig } from 'astro/config';
import sfmd from '@string-os/astro-sfmd/integration';

// GitHub Pages config.
// TODO: set \`site\` to your Pages URL.
//   - User/org page:  https://<user>.github.io
//   - Project page:   https://<user>.github.io/<repo>/  (also set \`base\` below)
// TODO: for a PROJECT page, uncomment \`base\` and set it to '/<repo>/'.
export default defineConfig({
  site: 'https://your-username.github.io',
  // base: '/${name || 'your-repo'}/',
  build: {
    format: 'directory',
  },
  integrations: [
    sfmd({ contentDir: 'content', sidebar: false }),
  ],
});
`;
  }
  // vercel
  return `// @ts-check
import { defineConfig } from 'astro/config';
import sfmd from '@string-os/astro-sfmd/integration';

// TODO: set \`site\` to your deployed Vercel URL.
// Run \`astro-sfmd init --vercel\` to add middleware.ts for Accept-negotiation.
export default defineConfig({
  site: 'https://example.vercel.app',
  build: {
    format: 'directory',
  },
  integrations: [
    sfmd({ contentDir: 'content', sidebar: false }),
  ],
});
`;
}

function tplGitignore() {
  return `node_modules/
dist/
.astro/
.DS_Store
`;
}

function tplIndexAstro() {
  // Landing page: render content/index.md through the shared Base layout, so
  // the homepage content lives in markdown (and gets a .md twin) while still
  // getting the styled HTML treatment.
  return `---
import Base from '@string-os/astro-sfmd/layouts/Base.astro';
import { parseSfmdFile } from '@string-os/astro-sfmd';
import path from 'node:path';

const page = parseSfmdFile(path.join(process.cwd(), 'content/index.md'));
---

<Base title={page.title} nav={page.nav}>
  <Fragment set:html={page.htmlBody} />
</Base>
`;
}

function tplSlugAstro() {
  // Catch-all for every content page except the root (index.astro owns '/').
  return `---
import Base from '@string-os/astro-sfmd/layouts/Base.astro';
import { listContentFiles, parseSfmdFile } from '@string-os/astro-sfmd';

export function getStaticPaths() {
  return listContentFiles()
    .filter(({ slug }) => slug !== '')
    .map(({ filePath, slug }) => ({
      params: { slug },
      props: { page: parseSfmdFile(filePath) },
    }));
}

const { page } = Astro.props;
---

<Base title={page.title} nav={page.nav}>
  <Fragment set:html={page.htmlBody} />
</Base>
`;
}

function tplContentIndex({ name, blog, docs }) {
  const links = ['- [About](./about.md)'];
  if (blog) links.push('- [Blog](./blog/index.md)');
  if (docs) links.push('- [Docs](./docs/index.md)');
  return `---
title: ${name || 'My SFMD Site'}
---

# ${name || 'My SFMD Site'}

A human + AI website. People get styled HTML; agents get the raw \`.md\` twin
of every page (just append \`.md\` to any URL).

[!nav:main](./nav/main.md)

## Pages

${links.join('\n')}

## How the dual output works

This site is built with [\`@string-os/astro-sfmd\`](https://github.com/string-os/astro-sfmd).
At build time it emits two surfaces from one \`content/\` tree:

- **For people** — Astro renders styled HTML to \`dist/<page>/index.html\`.
- **For agents** — the same source \`.md\` is mirrored to \`dist/<page>.md\`.

On a static host (GitHub Pages) there is no server, but the \`.md\` twins are
real files, so an agent just fetches \`/about.md\` directly.
`;
}

function tplContentAbout() {
  return `---
title: About
---

# About

This is a sample content page. Edit \`content/about.md\` or add your own
\`.md\` files under \`content/\` — each becomes both an HTML page and a
\`.md\` twin.

[Back home](./index.md)
`;
}

function tplNavMain({ blog, docs }) {
  const lines = [
    '[@home Home](./index.md)',
    '[@about About](./about.md)',
  ];
  if (blog) lines.push('[@blog Blog](./blog/index.md)');
  if (docs) lines.push('[@docs Docs](./docs/index.md)');
  return `---
title: Navigation
---

# Navigation

${lines.join('\n')}
`;
}

function tplBlogIndex() {
  return `---
title: Blog
---

# Blog

Notes and updates. The post list below is generated at build time by
\`copy-sfmd.mjs\` from the dated \`.md\` files in this folder.
`;
}

function tplBlogPost(date) {
  return `---
title: Hello, world
date: ${date}
tags: [intro]
---

# Hello, world

This is a sample blog post dated ${date}. Add more \`.md\` files next to it —
the blog index regenerates its listing on every build.

[Back to blog](./index.md)
`;
}

function tplDocsIndex() {
  return `---
title: Docs
---

# Docs

Documentation for your project.

- [Getting started](./getting-started.md)
`;
}

function tplDocsGettingStarted() {
  return `---
title: Getting started
---

# Getting started

Write your docs as \`.md\` files under \`content/docs/\`. Each one is served as
styled HTML and as a raw \`.md\` twin for agents.

[Back to docs](./index.md)
`;
}

function tplSiteReadme({ name, host, blog, docs }) {
  const hostLine =
    host === 'github-pages'
      ? 'This site is configured for **GitHub Pages** (static; no server needed).'
      : 'This site is configured for **Vercel** (middleware does Accept-negotiation).';
  const deploy =
    host === 'github-pages'
      ? `## Deploy (GitHub Pages)

1. Push this repo to GitHub.
2. **Settings -> Pages -> Source = "GitHub Actions"**.
3. For a project page served at \`https://<user>.github.io/<repo>/\`, set
   \`base: '/<repo>/'\` in \`astro.config.mjs\` (see the TODO there) and \`site\`
   to your Pages URL.
4. Push to the default branch — \`.github/workflows/deploy.yml\` builds and
   publishes automatically.`
      : `## Deploy (Vercel)

1. Run \`npx astro-sfmd init --vercel\` to add \`middleware.ts\`.
2. Import the repo in Vercel and deploy. The middleware rewrites
   \`Accept: text/markdown\` requests to the \`.md\` twin at runtime.`;

  return `# ${name || 'SFMD Site'}

A **human + AI** website built with [\`@string-os/astro-sfmd\`](https://github.com/string-os/astro-sfmd).
People get styled HTML; agents get the raw \`.md\` twin of every page.

${hostLine}

## Run it

\`\`\`bash
npm install
npm run dev      # http://localhost:4321
npm run build    # outputs dist/
npm run preview  # serve the production build
\`\`\`

## Where content lives

All pages are markdown under \`content/\`:

\`\`\`
content/
  index.md         # landing (also rendered by src/pages/index.astro)
  about.md         # sample page${blog ? `\n  blog/            # dated posts + auto-generated index` : ''}${docs ? `\n  docs/            # documentation pages` : ''}
  nav/main.md      # site navigation (shortcut links)
\`\`\`

Add a page by dropping a new \`.md\` file under \`content/\`. It becomes both an
HTML route and a \`.md\` twin.

## The dual output

\`npm run build\` produces, for every page, both:

- \`dist/<page>/index.html\` — styled HTML for browsers.
- \`dist/<page>.md\` — the raw markdown twin for agents.

Append \`.md\` to any URL to read the agent view. On GitHub Pages there is no
server, so these \`.md\` files are simply fetched directly — full human+AI
duality with zero server logic.

${deploy}
`;
}

// ---------------------------------------------------------------------------
// Templates — host wiring
// ---------------------------------------------------------------------------

function tplGitHubPagesWorkflow() {
  return `# Build the Astro + astro-sfmd site and deploy it to GitHub Pages.
# One-time setup: repo Settings -> Pages -> Source = "GitHub Actions".
name: Deploy to GitHub Pages

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

# Allow one concurrent deployment; cancel in-progress runs for the same ref.
concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4
      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - name: Install
        run: npm ci
      - name: Build
        run: npm run build
      - name: Upload Pages artifact
        uses: actions/upload-pages-artifact@v3
        with:
          path: dist

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: \${{ steps.deployment.outputs.page_url }}
    steps:
      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v4
`;
}

function vercelMiddlewareTemplate() {
  return `/**
 * Vercel Routing Middleware for astro-sfmd.
 *
 * Browsers get Astro's static HTML. Requests with Accept: text/markdown are
 * rewritten to the parallel .md file emitted by @string-os/astro-sfmd.
 */
import { rewrite, next } from '@vercel/functions';

export const config = {
  // Skip Astro assets, Starlight/Pagefind assets, and direct file requests
  // including *.md, favicon.*, images, CSS, and JS.
  matcher: ['/((?!_astro/|pagefind/|.*\\\\.).*)'],
};

function mdTwin(pathname: string): string {
  if (pathname === '/') return '/index.md';
  return pathname.replace(/\\/+$/, '') + '.md';
}

export default function middleware(request: Request) {
  const accept = request.headers.get('accept') || '';
  if (!accept.includes('text/markdown')) {
    return next({ headers: { Vary: 'Accept' } });
  }

  const url = new URL(request.url);
  const target = new URL(mdTwin(url.pathname), url);
  return rewrite(target, { headers: { Vary: 'Accept' } });
}
`;
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function isoDate(d = new Date()) {
  return d.toISOString().slice(0, 10);
}
