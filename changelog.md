# Changelog

All notable changes to this project are documented here.

---

## [Unreleased] — 2026-05-31 (Phase 2)

### Added — tag grouping, pre-release labels, setup README

- **`scripts/feed-builder.js`** — added `buildDigestDescription()` (groups new items by primary tag into a Markdown summary), `sortItemsByTag()` (stable sort by first tag, untagged items last), and `<category>` element output per tag in `buildFeed()`. Added `guidIsPermalink` flag to support non-URL GUIDs for digest items.
- **`scripts/update.js`** — weekly digest summary item (title: "Weekly Digest — {date}") prepended to the feed whenever new releases are found; individual new items sorted by primary tag; `makeItem()` helper centralises item construction and applies `[Beta]` prefix for pre-releases; tags are stored on each state feed item.
- **`README.md`** — replaced spec document with a proper user-facing README: feed URL, quick-start guide (fork → Pages → optional token → edit watchlist → subscribe), full watchlist field reference, feed output examples, data source comparison table, local run instructions, project structure, security summary, and roadmap table.

### Changed

- `processDirectFeed()` in `update.js` now documents explicitly that `include_prereleases` is ignored for `feed_url` projects (feeds carry no standard pre-release flag) — see exploits.md §11 for context.

---

## [Unreleased] — 2026-05-31 (patch 2)

### Added — direct `feed_url` data source

- **`scripts/direct-feed-fetcher.js`** — fetches and parses arbitrary HTTPS RSS 2.0 or Atom feeds. Implements `validateFeedUrl()` (HTTPS-only, loopback/metadata/private-range block), 2 MB response cap, 15 s timeout, redirect rejection, and a lightweight Atom + RSS regex parser.
- **`watchlist.yml`** — replaced failing `apache/kafka` GitHub slug with `feed_url: "https://github.com/apache/kafka/releases.atom"`. Root cause: kafka.apache.org returns HTTP 403 to automated clients; GitHub's Atom feed for the same repo is confirmed working and contains identical release data.
- **`scripts/update.js`** — routes each project to the right fetcher (`processGithubSlug` vs `processDirectFeed`) based on which field is present in the watchlist entry. State key for feed-URL projects is the URL itself; `last_seen` stores the Atom `<id>` / RSS `<guid>` to detect new entries.

### Updated — documentation (per agent contract)

- **`exploits.md`** — added §10 (SSRF via `feed_url`) and §11 (regex XML parsing of untrusted content) with threats, mitigations, and residual risks. Updated summary table.
- **`architecture.md`** — added `direct-feed-fetcher.js` component description, updated data-flow diagram to show dual-source routing, updated security boundaries table and file map.
- **`changelog.md`** — this entry.

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
