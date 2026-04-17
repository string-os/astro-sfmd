/**
 * SFMD content-negotiation — core logic.
 *
 * Pure function, no framework dependency. Returns the .md path to serve
 * when the request prefers markdown, or null to pass through to HTML.
 *
 * Usage in any HTTP middleware:
 *
 *   const md = negotiateSfmd(url.pathname, request.headers.get('Accept'));
 *   if (md) return serve(md);  // serve the .md file
 *   else return next();        // fall through to HTML
 */
export function negotiateSfmd(pathname: string, accept: string): string | null {
  if (!accept || !accept.includes('text/markdown')) return null;

  // Already a .md request — pass through (the file exists in dist/)
  if (pathname.endsWith('.md')) return null;

  // Map the HTML path to the corresponding .md file path:
  //   /                 → /index.md
  //   /docs/quickstart  → /docs/quickstart.md
  //   /docs/quickstart/ → /docs/quickstart/index.md (unlikely but safe)
  if (pathname === '/' || pathname.endsWith('/')) {
    return pathname + 'index.md';
  }
  return pathname + '.md';
}
