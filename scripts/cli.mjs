#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

const args = process.argv.slice(2);
const cmd = args[0];

if (!cmd || cmd === '--help' || cmd === '-h') {
  printHelp();
  process.exit(0);
}

if (cmd === 'init') {
  init(args.slice(1));
} else {
  console.error(`astro-sfmd: unknown command: ${cmd}`);
  printHelp();
  process.exit(1);
}

function init(args) {
  const vercel = args.includes('--vercel');
  const force = args.includes('--force');

  if (!vercel) {
    console.error('astro-sfmd init currently supports --vercel.');
    console.error('Usage: astro-sfmd init --vercel [--force]');
    process.exit(1);
  }

  const target = path.resolve(process.cwd(), 'middleware.ts');
  if (fs.existsSync(target) && !force) {
    console.error(`middleware.ts already exists. Re-run with --force to overwrite: ${target}`);
    process.exit(1);
  }

  fs.writeFileSync(target, vercelMiddlewareTemplate());
  console.log(`Wrote ${target}`);
}

function printHelp() {
  console.log(`astro-sfmd

Usage:
  astro-sfmd init --vercel [--force]

Commands:
  init --vercel    Create Vercel Routing Middleware for Accept negotiation.

Static hosts do not need middleware: agents can request /path.md directly.
`);
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
