# Changelog

All notable changes to this project are documented here.

---

## [Unreleased] — 2026-06-04 (feed description fix)

### Fixed — raw Markdown appearing as literal text in RSS readers

RSS readers displayed release notes as raw Markdown characters (`##`, `- `, `**`, backticks) instead of formatted text, because `<description>` CDATA sections contained unprocessed Markdown strings.

**Root cause:** `release.body` from the GitHub API and the output of `buildDigestDescription()` were both raw Markdown strings. Feed readers treat CDATA content as HTML, not Markdown, so they rendered the syntax characters literally.

**Changes:**

- **`scripts/feed-builder.js`** — Added `markdownToHtml(md)`: a dependency-free Markdown-to-HTML converter using a placeholder tokeniser. Handles fenced code blocks, headings (h1–h3), blockquotes, bullet/ordered lists, horizontal rules, bold, italic, strikethrough, inline code, `[text](url)` Markdown links, and bare URL auto-linking. Non-http(s) link hrefs are replaced with `#` to block `javascript:` injection (see exploits.md §16). `buildDigestDescription()` updated to emit HTML (`<h3>`, `<ul>`, `<li>`, `<a>`) instead of Markdown.

- **`scripts/update.js`** — GitHub release bodies are now converted via `markdownToHtml(release.body)` before being stored as feed item descriptions. Items with no release notes get `<p>No release notes provided.</p>`.

- **`scripts/html-builder.js`** — Added `stripHtml()` to remove HTML tags and decode entities before `truncate()` generates the card excerpt. Without this, HTML descriptions (e.g. `<p>...</p>`) would be HTML-escaped by `escapeHtml()` and render as literal `&lt;p&gt;` text in the card.

### Updated — documentation (per agent contract)

- **`exploits.md`** — Added §16 (`javascript:` scheme injection via Markdown links); updated summary table.
- **`architecture.md`** — Updated `feed-builder.js` component description to document `markdownToHtml()` and the placeholder tokeniser approach.
- **`changelog.md`** — This entry.

---

## [Unreleased] — 2026-06-04 (watchlist update)

### Changed — watchlist refocused on Kafka / Kubernetes / observability stack

Replaced the initial sample watchlist with a curated production-focused list.

**Removed:** Astro, Hono, Zed Editor, Bun, Vite, Biome (sample projects)

**Kept:** Apache Kafka (feed_url — kafka.apache.org blocks automated access)

**Added (13 projects total):**

| Project | Slug | Tags |
|---|---|---|
| Kafka Minion | `redpanda-data/kminion` | streaming, observability |
| Kubernetes | `kubernetes/kubernetes` | kubernetes, core |
| Helm | `helm/helm` | kubernetes, packaging |
| ArgoCD | `argoproj/argo-cd` | kubernetes, gitops |
| cert-manager | `cert-manager/cert-manager` | kubernetes, security |
| external-dns | `kubernetes-sigs/external-dns` | kubernetes, networking |
| Prometheus | `prometheus/prometheus` | observability, metrics |
| Prometheus Operator | `prometheus-operator/prometheus-operator` | observability, kubernetes |
| kube-state-metrics | `kubernetes/kube-state-metrics` | observability, kubernetes |
| Thanos | `thanos-io/thanos` | observability, metrics |
| Grafana Mimir | `grafana/mimir` | observability, metrics |
| Grafana | `grafana/grafana` | observability, dashboards |

**Considered but excluded:**
- HAProxy / VPA — removed per user request
- Twistlock — closed-source commercial product (Palo Alto Prisma Cloud); no public GitHub releases to track

---

## [Unreleased] — 2026-05-31 (Phase 3)

### Added — webhooks and HTML page

- **`scripts/notifier.js`** — sends a grouped Slack and/or Discord notification after each run that finds new releases. Reads `SLACK_WEBHOOK_URL` / `DISCORD_WEBHOOK_URL` from environment; validates HTTPS + allowlisted hostname before any request; escapes platform-specific formatting characters; never logs webhook URLs; failures are warnings, not errors.
- **`scripts/html-builder.js`** — generates `index.html`: a self-contained static page with inline CSS, `prefers-color-scheme` dark/light theme, releases grouped by tag with `[Beta]` accents, and an RSS `<link>` in `<head>` for browser discovery. All user content HTML-escaped; links validated via `safeHref()`.
- **`scripts/update.js`** — imports and calls `sendNotifications()` and `buildHtml()` at the end of each run; `PATHS.html` added; HTML regenerated on every run.
- **`.github/workflows/update-feed.yml`** — `SLACK_WEBHOOK_URL` and `DISCORD_WEBHOOK_URL` injected from repo secrets; `index.html` added to the `git add` step.
- **`index.html`** — initial generated HTML page committed to repo.
- **`README.md`** — added Webhook notifications section (setup instructions, payload preview) and HTML feed page section.

### Updated — documentation (per agent contract)

- **`exploits.md`** — added §12 (XSS via HTML page), §13 (webhook URL leakage), §14 (SSRF via webhook URLs), §15 (notification content injection). Updated summary table.
- **`architecture.md`** — added `notifier.js` and `html-builder.js` component descriptions; updated workflow step list and file map.
- **`changelog.md`** — this entry.

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
