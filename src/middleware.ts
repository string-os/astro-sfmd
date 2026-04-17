/**
 * Astro middleware for SFMD content-negotiation.
 *
 * When the request's Accept header includes text/markdown, serves the
 * raw .md source file directly instead of the rendered HTML page.
 * Works in `astro dev` and in hybrid/SSR deployments.
 *
 * For purely static deployments (GitHub Pages), this middleware is not
 * used — agents request .md URLs directly and the static host serves them.
 *
 * Consumer wires it in one line:
 *
 *   // src/middleware.ts
 *   export { onRequest } from '@string-os/astro-sfmd/middleware';
 */
import { defineMiddleware } from 'astro/middleware';
import { negotiateSfmd } from './negotiate.ts';
import fs from 'fs';
import path from 'path';

export const onRequest = defineMiddleware(async (context, next) => {
  const accept = context.request.headers.get('Accept') || '';
  const url = new URL(context.request.url);

  const mdPath = negotiateSfmd(url.pathname, accept);
  if (!mdPath) return next();

  // Map the URL .md path back to the content file on disk.
  // In dev: read from content/ directory.
  // In SSR: read from the built dist/ or content/ depending on setup.
  const contentFile = path.join(process.cwd(), 'content', mdPath.replace(/^\//, ''));
  const distFile = path.join(process.cwd(), 'dist', mdPath.replace(/^\//, ''));

  const filePath = fs.existsSync(contentFile) ? contentFile :
                   fs.existsSync(distFile) ? distFile : null;

  if (!filePath) return next();

  const content = fs.readFileSync(filePath, 'utf-8');
  return new Response(content, {
    status: 200,
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
});
