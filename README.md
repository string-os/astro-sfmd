# @string-os/astro-sfmd

Build SFMD-native sites with Astro. Astro keeps building the human HTML site; `astro-sfmd` adds the matching agent surface beside it.

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
3. **Agent nav** that can generate `/nav/main.md` from a Starlight-style sidebar and inject `[!nav:main](/nav/main.md)` into mirrored pages.

Options:

| Option | Default | Use |
|---|---|---|
| `contentDir` | (required) | Path to source `.md` files relative to project root |
| `stripMdLinksInHtml` | `true` | Set `false` to leave `.md` in HTML link URLs |
| `mirror` | `true` | Set `false` to skip the source-mirror (e.g. SSR) |
| `sidebar` | `'auto'` | Pass a Starlight sidebar array, `'auto'`, or `false` |
| `navName` | `'main'` | Name for the generated SFMD nav |
| `mapOutputPath` | route twin | Rewrite mirrored SFMD paths when Astro routes differ from the content tree |

For default-language i18n sites, map the source tree to the public route tree:

```js
sfmd({
  contentDir: 'content',
  mapOutputPath(rel) {
    rel = rel.startsWith('en/') ? rel.slice('en/'.length) : rel;
    return rel.replace(/\/index\.md$/, '.md');
  },
});
```

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

Add the integration to `astro.config.mjs`:

```js
import sfmd from '@string-os/astro-sfmd/integration';

export default defineConfig({
  integrations: [
    sfmd({ contentDir: 'content' }),
  ],
});
```

```bash
astro build
```

Output:

```
dist/
├── index.html    ← browser
└── index.md      ← agent
```

## Deployment

**Static hosts (GitHub Pages, S3, simple CDNs)** — both URL forms (`/path/` and `/path.md`) are served as static files. Agents should request `.md` URLs directly. No middleware is required or possible.

**Vercel with Accept-header negotiation** — generate Routing Middleware:

```bash
npx astro-sfmd init --vercel
```

This writes `middleware.ts` at the project root. Browsers keep receiving Astro's static HTML; requests with `Accept: text/markdown` are rewritten to the parallel `.md` file. Use `--force` to overwrite an existing middleware file.

**Astro dev / SSR middleware** — for non-static Astro middleware use:

```js
// src/middleware.ts
export { onRequest } from '@string-os/astro-sfmd/middleware';
```

Cloudflare and other deploy presets can use the same `negotiateSfmd()` core later.

## What it does (full feature list)

- **Source mirror** — copies `*.md` from your content directory into the build output preserving paths.
- **HTML link rewriting** — strips `.md` from local link URLs in HTML so humans get pretty URLs while raw `.md` files keep traversable links.
- **SFMD parser** (option B only) — reads SFMD, strips directives (`[!nav:]`, `[!include:]`, action blocks, block markers), resolves shortcuts (`[@id Label](url)` → `[Label](url)`), and renders HTML.
- **Auto-built nav** (option B only) — `[!nav:name](path)` in your markdown becomes a sidebar.
- **Vercel middleware scaffold** — `astro-sfmd init --vercel`.
- **Optional Astro middleware** — dev/SSR Accept-header content negotiation.
- **Optional blog index generator** — `copy-sfmd.mjs` script also auto-generates an index `.md` for any `blog/` directory containing posts.

## Choosing a path

- **Use Starlight + integration (option A)** if you want polished docs UI (search, dark mode, sidebars, breadcrumbs) and just need to add agent-readable `.md` URLs.
- **Use astro-sfmd standalone (option B)** if you want a minimal SFMD-native site without Starlight's surface, and direct control over rendering.

Both paths produce the same dual-output URL convention.

## License

MIT
