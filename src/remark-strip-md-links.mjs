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

function visit(node, type, fn) {
  if (node && node.type === type) fn(node);
  if (node && node.children) for (const child of node.children) visit(child, type, fn);
}

const PROTOCOL_RE = /^[a-z][a-z0-9+.-]*:/i;

export default function remarkStripMdLinks() {
  return (tree) => {
    visit(tree, 'link', (node) => {
      const url = node.url;
      if (!url) return;
      if (PROTOCOL_RE.test(url)) return;          // http://, mailto:, etc.
      if (url.startsWith('#')) return;            // pure hash
      if (url.startsWith('//')) return;           // protocol-relative

      const hashIdx = url.indexOf('#');
      const pathPart = hashIdx === -1 ? url : url.slice(0, hashIdx);
      const hashPart = hashIdx === -1 ? '' : url.slice(hashIdx);

      if (!pathPart.endsWith('.md')) return;

      const stripped = pathPart.slice(0, -'.md'.length);
      const withSlash = stripped.endsWith('/') ? stripped : stripped + '/';
      node.url = withSlash + hashPart;
    });
  };
}
