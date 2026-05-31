# Changelog

All notable changes to this project are documented here.

---

## [Unreleased] — 2026-05-31

### Added — Phase 1 MVP

#### Core scripts

- **`scripts/fetcher.js`** — GitHub Releases API client using Node.js built-in `https`. Fetches the latest release per project with slug validation, redirect rejection, 1 MB response cap, and 15-second timeout.
- **`scripts/feed-builder.js`** — RSS 2.0 document serialiser. Implements `escapeXml()` for XML injection defence and `cdata()` with `]]>` split for safe CDATA wrapping of release body text.
- **`scripts/update.js`** — Main orchestration entry point (`npm run update`). Reads `watchlist.yml`, diffs against `state.json`, fetches new releases, rebuilds `feed.xml`, and persists updated state.

#### Configuration

- **`watchlist.yml`** — Initial watchlist with six projects: Astro, Hono, Zed Editor, Bun, Vite, Biome, and Apache Kafka (test project).
- **`state.json`** — Initial empty state file (`{ "projects": {}, "feed_items": [] }`).
- **`package.json`** — Node.js ESM project manifest. Single runtime dependency: `js-yaml ^4.1.0`.
- **`package-lock.json`** — Locked dependency tree for reproducible installs.

#### CI/CD

- **`.github/workflows/update-feed.yml`** — GitHub Actions workflow. Runs every Monday at 08:00 UTC (+ manual `workflow_dispatch`). Installs deps via `npm ci`, runs the updater, and commits `feed.xml` + `state.json` only when they change.

#### GitHub Pages

- **`feed.xml`** — Initial empty RSS 2.0 feed (populated on first workflow run).
- **`.nojekyll`** — Disables Jekyll processing so GitHub Pages serves `feed.xml` as a raw file.

#### Documentation

- **`exploits.md`** — Security catalogue covering 9 attack vectors: XML injection, CDATA injection, SSRF, open redirect, DoS via oversized response, DoS via feed accumulation, XSS, credential leakage, and supply-chain compromise. Each entry documents the threat and the implemented fix.
- **`architecture.md`** — Full technical reference: component roles, data-flow diagram, security boundaries, and file map.
- **`changelog.md`** — This file.
- **`agent-contract.md`** — Boilerplate agent development contract defining scope, security obligations, documentation standards, and branching requirements.
