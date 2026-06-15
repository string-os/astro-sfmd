# Changelog

All notable changes to `@string-os/astro-sfmd` are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.0] - 2026-06-15

### Added

- `astro-sfmd validate [dir] [--build]` — a pure-Node command (no String
  dependency) that checks a site before build or deploy: every
  `content/**/*.md` has frontmatter with at least a `title` (and a `date` on
  blog posts), `content/index.md` exists, and every internal `.md` link —
  including `[!nav:…]` targets and `[@id Label](…)` nav shortcuts — resolves to a
  real file. With `--build`, it also runs the build and verifies every page
  emits both `dist/<page>/index.html` and the `dist/<page>.md` twin. Exits
  non-zero with an itemized report on failure; prints a one-line summary on
  success.

### Fixed

- Scaffolded `content/nav/main.md` linked pages as `./index.md` from inside
  `content/nav/`, which resolves to non-existent `content/nav/*.md` and produced
  incorrect rendered nav hrefs (e.g. `/nav/index` instead of `/`). Nav links are
  resolved relative to the nav file, so they are now generated with `../`
  (`../index.md`, `../about.md`, …). A freshly scaffolded site now passes
  `astro-sfmd validate` out of the box.

## [0.2.0] - 2026-06-14

### Added

- `astro-sfmd new <dir> [--github-pages|--vercel] [--blog] [--docs] [--force]` —
  one-command scaffold for a complete, buildable starter site: `astro.config.mjs`
  wired with the integration, a `content/` tree (landing, about, optional blog +
  docs, nav), `src/pages/index.astro` + `[...slug].astro`, `package.json`,
  `.gitignore`, and a generated `README.md`. GitHub Pages is the default host.
- `astro-sfmd init --github-pages [--force]` — generates
  `.github/workflows/deploy.yml` (Astro → GitHub Pages: checkout → setup-node →
  `npm ci && npm run build` → `upload-pages-artifact` → `deploy-pages`).

### Changed

- `init --vercel` (Vercel Accept-negotiation middleware) is unchanged and now
  sits alongside the new `--github-pages` target; `init` requires exactly one
  target and errors clearly otherwise.
- README restructured around three usage paths (scaffold, add-to-existing,
  fully-custom) plus a deployment section.

## [0.1.x] - 2026-04-17 → 2026-06-04

Baseline releases that established the dual-output engine: from one `content/`
tree, emit styled HTML for browsers and a mirrored raw `.md` twin for agents.

- **0.1.3** (2026-06-04) — normalized package metadata for release.
- **0.1.2** (2026-05-07) — agent nav: generate `/nav/main.md` from a sidebar and
  inject `[!nav:main]` into mirrored `.md` pages.
- **0.1.1** (2026-05-07) — version bump.
- **0.1.0** (initial, 2026-04-17) — the SFMD static-site engine: the Astro
  integration (remark plugin that strips `.md` from HTML link URLs + post-build
  source mirror so each page is reachable as `/path.md`), Accept-header
  content-negotiation middleware, an auto-generated blog index `.md` with post
  listings, and the `dual-output for any Astro site` integration export.

[0.3.0]: https://github.com/string-os/astro-sfmd/releases/tag/v0.3.0
[0.2.0]: https://github.com/string-os/astro-sfmd/releases/tag/v0.2.0
[0.1.x]: https://github.com/string-os/astro-sfmd/releases
