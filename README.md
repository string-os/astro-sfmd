# @string-os/astro-sfmd

Build SFMD-native sites with Astro. Astro keeps building the human HTML site; `astro-sfmd` adds the matching agent surface beside it.

```
/start/quickstart/    → HTML  (humans)
/start/quickstart.md  → raw   (AI agents)
```

Three ways to use it.

## 0. Scaffold a brand-new site in one command (`astro-sfmd new`)

The fastest path — generate a complete, buildable starter site (landing + about page, optional blog and docs), already wired with the integration and a deploy workflow:

```bash
npx astro-sfmd new my-site --github-pages --blog --docs
cd my-site
npm install
npm run build      # dist/ with HTML + .md twins
```

```
astro-sfmd new <dir> [--github-pages|--vercel] [--blog] [--docs] [--force]
```

| Flag | Effect |
|---|---|
| `--github-pages` | Target static GitHub Pages (default host). Also writes `.github/workflows/deploy.yml`. |
| `--vercel` | Target Vercel (runtime Accept-negotiation; run `init --vercel` for middleware). |
| `--blog` | Add a dated sample post with an auto-generated index. |
| `--docs` | Add a sample docs section. |
| `--force` | Scaffold into a non-empty directory / overwrite. |

The generated site keeps all content as markdown under `content/`, reuses the exported `Base.astro` layout, and renders through the package's `parseSfmdFile`/`listContentFiles` helpers — so every page ships as both styled HTML and a raw `.md` twin.

### Validate a site (`astro-sfmd validate`)

Before you build or deploy, check that the content tree is coherent — pure Node, no build required:

```bash
npx astro-sfmd validate my-site         # structural + content checks
npx astro-sfmd validate my-site --build # also build and verify HTML + .md twins
```

```
astro-sfmd validate [dir] [--build]
```

It checks that:

- every `content/**/*.md` has frontmatter with at least a `title` (and a `date` on blog posts),
- the landing page `content/index.md` exists and `content/` is non-empty,
- every internal `.md` link — including `[!nav:…]` targets and `[@id Label](…)` shortcuts — resolves to a real file.

With `--build` it then runs `npm run build` and confirms every page ships **both** `dist/<page>/index.html` and the `dist/<page>.md` twin. It exits non-zero with a clear list of problems on failure, and prints a one-line summary on success — so it drops cleanly into CI or an agent's scaffold→validate→build loop.

To add a GitHub Pages deploy workflow to an **existing** site:

```bash
npx astro-sfmd init --github-pages
```

This writes `.github/workflows/deploy.yml` (Astro → GitHub Pages: `checkout` → setup node → `npm ci && npm run build` → `upload-pages-artifact` → `deploy-pages`). One-time manual step: repo **Settings → Pages → Source = "GitHub Actions"**. For a project page served at `https://<user>.github.io/<repo>/`, set `base: '/<repo>/'` in `astro.config.mjs`.

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

**Static hosts (GitHub Pages, S3, simple CDNs)** — both URL forms (`/path/` and `/path.md`) are served as static files. Agents should request `.md` URLs directly. No middleware is required or possible. For GitHub Pages specifically, scaffold the deploy workflow with `astro-sfmd init --github-pages` (or get it for free via `astro-sfmd new --github-pages`), then set **Settings → Pages → Source = "GitHub Actions"**.

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
- **One-command site scaffold** — `astro-sfmd new <dir>` generates a complete starter (landing, about, optional blog/docs) wired for GitHub Pages or Vercel.
- **Site validator** — `astro-sfmd validate [dir]` checks frontmatter, required files, and internal `.md` link integrity (pure Node); `--build` also verifies HTML + `.md` twins in `dist/`.
- **GitHub Pages workflow scaffold** — `astro-sfmd init --github-pages` writes `.github/workflows/deploy.yml`.
- **Vercel middleware scaffold** — `astro-sfmd init --vercel`.
- **Optional Astro middleware** — dev/SSR Accept-header content negotiation.
- **Optional blog index generator** — `copy-sfmd.mjs` script also auto-generates an index `.md` for any `blog/` directory containing posts.

## Choosing a path

- **Use Starlight + integration (option A)** if you want polished docs UI (search, dark mode, sidebars, breadcrumbs) and just need to add agent-readable `.md` URLs.
- **Use astro-sfmd standalone (option B)** if you want a minimal SFMD-native site without Starlight's surface, and direct control over rendering.

Both paths produce the same dual-output URL convention.

## License

MIT
