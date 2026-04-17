# @string-os/astro-sfmd

Build SFMD-native sites with Astro. Write markdown, get two outputs:
styled HTML for browsers, raw SFMD for AI agents. Same URL, same content.

## Quick Start

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

**Vercel/Cloudflare** — add Accept-header middleware for clean URLs.

**GitHub Pages** — no middleware. Browser opens `/path`, agent opens `/path.md`.

Both work out of the box.

## What it does

1. **Reads SFMD** from `content/*.md`
2. **Strips directives** (`[!nav:]`, `[!include:]`, action blocks, block markers)
3. **Resolves shortcuts** (`[@id Label](url)` → `[Label](url)`)
4. **Builds nav** from `[!nav:name](path)` directives → sidebar
5. **Renders HTML** with minimal responsive layout + dark mode
6. **Copies raw .md** to dist/ for agent access

## License

MIT
