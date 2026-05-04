# @string-os/astro-sfmd

Build SFMD-native sites with Astro. Every page ships in two formats from the same source: styled HTML for browsers, raw markdown for AI agents — at predictable parallel URLs.

```
/start/quickstart/    → HTML  (humans)
/start/quickstart.md  → raw   (AI agents)
```

Two ways to use it.

## A. Add to an existing Astro site (Starlight, vanilla, anything)

This is the lightweight path: keep your existing site (e.g. Starlight) and bolt SFMD's dual-output behavior on top.

```bash
npm install @string-os/astro-sfmd
```

```js
// astro.config.mjs
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import sfmd from '@string-os/astro-sfmd/integration';

export default defineConfig({
  integrations: [
    starlight({ title: 'My Docs' /* ... */ }),
    sfmd({ contentDir: 'src/content/docs' }),
  ],
});
```

What the integration adds:

1. **Remark plugin** that strips `.md` from local link URLs in the HTML output, so humans land on `/start/quickstart/` instead of being served the raw markdown.
2. **Post-build mirror** that copies your `.md` source tree into `dist/` so each page is also reachable as `/start/quickstart.md`. The mirrored files keep their `.md` links intact, so agent-driven traversal chains (raw → raw) still work.

Options:

| Option | Default | Use |
|---|---|---|
| `contentDir` | (required) | Path to source `.md` files relative to project root |
| `stripMdLinksInHtml` | `true` | Set `false` to leave `.md` in HTML link URLs |
| `mirror` | `true` | Set `false` to skip the source-mirror (e.g. SSR) |

## B. Build a fully custom SFMD site (no Starlight)

This path is for sites where you want astro-sfmd to do the rendering itself — minimal layout, your own styling, content in `content/*.md`.

```bash
mkdir my-site && cd my-site
npm init -y
npm install astro marked @string-os/astro-sfmd
```

Create `content/index.md`:

```markdown
---
title: My Site
---

# My Site

Welcome. This page is readable by humans and AI agents.
```

Create `src/pages/[...slug].astro`:

```astro
---
import Base from '@string-os/astro-sfmd/layouts/Base.astro';
import { listContentFiles, parseSfmdFile } from '@string-os/astro-sfmd';

export function getStaticPaths() {
  return listContentFiles().map(({ filePath, slug }) => ({
    params: { slug: slug || undefined },
    props: { page: parseSfmdFile(filePath) },
  }));
}

const { page } = Astro.props;
---

<Base title={page.title} nav={page.nav}>
  <Fragment set:html={page.htmlBody} />
</Base>
```

Add to `package.json`:

```json
{
  "scripts": {
    "dev": "astro dev",
    "build": "astro build && node node_modules/@string-os/astro-sfmd/scripts/copy-sfmd.mjs"
  }
}
```

```bash
npm run build
```

Output:

```
dist/
├── index.html    ← browser
└── index.md      ← agent
```

## Deployment

**Vercel / Cloudflare / static hosts** — both URL forms (`/path/` and `/path.md`) are served as static files. `.md` is auto-detected as `text/markdown`.

**With Accept-header negotiation** (optional, SSR setups) — add the middleware:

```js
// src/middleware.ts
export { onRequest } from '@string-os/astro-sfmd/middleware';
```

This serves the `.md` source when a request includes `Accept: text/markdown`, even at the bare `/path` URL. Useful when you don't want to teach agents the `.md` suffix convention.

## What it does (full feature list)

- **Source mirror** — copies `*.md` from your content directory into the build output preserving paths.
- **HTML link rewriting** — strips `.md` from local link URLs in HTML so humans get pretty URLs while raw `.md` files keep traversable links.
- **SFMD parser** (option B only) — reads SFMD, strips directives (`[!nav:]`, `[!include:]`, action blocks, block markers), resolves shortcuts (`[@id Label](url)` → `[Label](url)`), and renders HTML.
- **Auto-built nav** (option B only) — `[!nav:name](path)` in your markdown becomes a sidebar.
- **Optional middleware** — Accept-header content negotiation.
- **Optional blog index generator** — `copy-sfmd.mjs` script also auto-generates an index `.md` for any `blog/` directory containing posts.

## Choosing a path

- **Use Starlight + integration (option A)** if you want polished docs UI (search, dark mode, sidebars, breadcrumbs) and just need to add agent-readable `.md` URLs.
- **Use astro-sfmd standalone (option B)** if you want a minimal SFMD-native site without Starlight's surface, and direct control over rendering.

Both paths produce the same dual-output URL convention.

## License

MIT
