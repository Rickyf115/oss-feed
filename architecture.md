# Architecture

## Overview

OSS Feed is a zero-infrastructure RSS aggregator. A GitHub Actions cron job runs weekly, fetches the latest releases for a user-curated list of open source projects, and writes a static `feed.xml` to the repository. GitHub Pages serves the file at a public URL that any RSS reader can subscribe to.

```
watchlist.yml
     │
     ├─ projects with 'github' field ─────────────────────────────────────────────────────┐
     │                                                                                     │
     └─ projects with 'feed_url' field ──────────────────────────────────┐                │
                                                                          │                │
GitHub Actions (weekly cron — every Monday 08:00 UTC)                    │                │
     │                                                                    │                │
     ▼                                                                    ▼                ▼
scripts/update.js  ─────────────────►  scripts/direct-feed-fetcher.js   scripts/fetcher.js
                                              │ (Atom / RSS)                    │ (GitHub API)
                                              ▼                                 ▼
                                       {any HTTPS feed URL}            api.github.com/repos/
                                                                        {slug}/releases/latest
     │
     ▼
scripts/feed-builder.js  ──►  feed.xml (RSS 2.0)
     │
     ▼
state.json  (persisted back to repo via git commit)
     │
     ▼
GitHub Pages  ──►  https://rickyf115.github.io/oss-feed/feed.xml
     │
     ▼
RSS reader (Feedly, NetNewsWire, Reeder, Miniflux, …)
```

---

## Component Roles

### `watchlist.yml`

**Role:** User-editable configuration.  
**Reads from:** Repository root.  
**Consumed by:** `scripts/update.js`.

Defines the list of GitHub projects to track. Each entry specifies an `owner/repo` slug, a human-readable display name, optional tags, and optional per-project flags such as `include_prereleases`. This is the only file a user typically needs to edit.

---

### `state.json`

**Role:** Persistent state tracker.  
**Reads from / writes to:** Repository root (committed back to the repo by the workflow).  
**Consumed by:** `scripts/update.js`.

Stores two things:

1. `projects` — A map of `owner/repo → { last_seen, checked_at }` so the updater can detect genuinely new releases without re-reporting already-seen versions.
2. `feed_items` — The accumulated list of RSS items (capped at 100), used to rebuild `feed.xml` on every run without needing to parse the existing XML.

---

### `feed.xml`

**Role:** Static RSS 2.0 feed published to GitHub Pages.  
**Writes to:** Repository root (committed back to the repo by the workflow).  
**Consumed by:** Any RSS reader.

A standard RSS 2.0 document. Rebuilt from scratch on each run using the item list from `state.json`. Served as a raw file by GitHub Pages — no backend required.

---

### `scripts/fetcher.js`

**Role:** HTTP client for the GitHub Releases API.  
**Imports:** Node.js built-in `https` module only (no external HTTP library).

Exposes a single function:

```
fetchLatestRelease(slug: string, token?: string) → Promise<Release | null>
```

Responsibilities:
- Validates the `owner/repo` slug against a strict allowlist regex to prevent SSRF.
- Builds an HTTPS GET request to `api.github.com` with the correct Accept and API-version headers.
- Caps the response body at 1 MB and aborts slow requests after 15 seconds.
- Returns `null` for HTTP 404 (no releases exist) and throws on all other error conditions.

Used by projects that specify a `github` field in `watchlist.yml`.

---

### `scripts/direct-feed-fetcher.js`

**Role:** HTTP client and parser for arbitrary RSS 2.0 / Atom feeds.  
**Imports:** Node.js built-ins `https` and `url` only.

Exposes a single function:

```
fetchDirectFeed(feedUrl: string) → Promise<Entry | null>
```

Responsibilities:
- Validates the URL: HTTPS-only, no loopback, no cloud-metadata IPs, no RFC-1918 ranges.
- Fetches the feed with a 2 MB cap and 15-second timeout.
- Rejects 3xx redirects to prevent open-redirect-assisted SSRF.
- Detects Atom vs RSS by presence of a `<feed>` root element.
- Extracts the first (most recent) entry's title, link, date, description, and GUID.
- Returns `null` if the feed contains no entries.

Used by projects that specify a `feed_url` field in `watchlist.yml`.

**Why this exists:** Some projects (e.g. Apache Kafka) block GitHub API-style access or return HTTP 403 to automated clients targeting their project website. GitHub's own Atom feed for any public repository (`github.com/{owner}/{repo}/releases.atom`) is a reliable alternative that requires no authentication and contains identical release data.

---

### `scripts/feed-builder.js`

**Role:** RSS 2.0 document serialiser, Markdown-to-HTML converter, digest builder, and item sorter.  
**Imports:** Nothing (pure string manipulation).

Exposes six functions:

| Function                  | Purpose                                                                          |
|---------------------------|----------------------------------------------------------------------------------|
| `escapeXml()`             | Encode `& < > " '` as XML entities for element text / attributes                 |
| `cdata()`                 | Wrap a string in `<![CDATA[…]]>`, escaping embedded `]]>` sequences              |
| `markdownToHtml()`        | Convert GitHub-flavoured Markdown to safe HTML for RSS `<description>` fields   |
| `buildDigestDescription()`| Build an HTML digest grouping new items by primary tag (`<h3>` + `<ul>`)        |
| `sortItemsByTag()`        | Stable-sort an item array by primary tag (alphabetically); untagged items last   |
| `buildFeed()`             | Assemble a complete RSS 2.0 document; emits `<category>` per tag on each item   |

`markdownToHtml()` handles the patterns most common in GitHub release notes: fenced code blocks, headings (h1–h3), blockquotes, bullet and ordered lists, horizontal rules, bold, italic, strikethrough, inline code, `[text](url)` links, and bare URL auto-linking. It uses a placeholder tokeniser to avoid double-escaping: processed HTML tokens are stashed before plain-text HTML-escaping, then restored at the end. Non-http(s) link schemes are replaced with `#` to block `javascript:` injection.

The feed document includes an `atom:link` self-referential element for RSS reader compatibility. Items that carry a `tags` array receive one `<category>` element per tag, enabling tag-based filtering in RSS readers.

---

### `scripts/update.js`

**Role:** Main orchestration script — entry point for `npm run update`.

Execution flow:

1. Load `watchlist.yml` and `state.json`.
2. For each project, route to the appropriate fetcher based on which field is present:
   - `github` → `processGithubSlug()` → `fetchLatestRelease()`
   - `feed_url` → `processDirectFeed()` → `fetchDirectFeed()`
   - Neither → warn and skip.
3. Compare the returned release/entry against the stored `last_seen` value. Skip if unchanged.
4. Build a new feed item for each genuinely new release/entry and prepend it to the existing item list.
5. Write the updated `feed.xml` via `buildFeed()`.
6. Write the updated `state.json`.

**State key convention:**
- GitHub slug projects: state key = `owner/repo` slug; `last_seen` = tag name (e.g. `"v4.2.1"`).
- Feed URL projects: state key = the feed URL itself; `last_seen` = the entry's Atom `<id>` or RSS `<guid>` (guaranteed unique per entry by the feed spec).

**Phase 2 additions:**
- `makeItem()` — centralised item construction; attaches `tags` array and applies `[Beta]` prefix when `isPrerelease` is true.
- `sortItemsByTag()` — new items sorted by primary tag before prepending to history.
- `buildDigestItem()` — when new releases are found, a "Weekly Digest — {date}" item is inserted at position 0 summarising all new releases grouped by tag.
- `guidIsPermalink: false` on the digest item, since its GUID is a synthetic URL (`/digest/YYYY-MM-DD`) rather than a real page.

---

### `scripts/notifier.js`

**Role:** Webhook notification dispatcher for Slack and Discord.  
**Imports:** Node.js built-ins `https` and `url` only.

Exposes a single function:

```
sendNotifications(newItems: object[], feedUrl: string) → Promise<void>
```

Reads `SLACK_WEBHOOK_URL` and `DISCORD_WEBHOOK_URL` from the environment. If neither is set, logs an INFO message and returns immediately. For each configured webhook:

1. Validates the URL: HTTPS-only, hostname must be `hooks.slack.com`, `discord.com`, or `discordapp.com`.
2. Builds a platform-specific payload (`buildSlackPayload` / `buildDiscordPayload`) that groups new releases by primary tag. Release body text is never included — only title and URL to avoid formatting injection.
3. POSTs the JSON payload with a 10-second timeout.
4. Logs a warning on failure but never throws — notification errors must not abort the feed update.

The webhook URL is never included in any log or error message.

---

### `scripts/html-builder.js`

**Role:** Static HTML page generator.  
**Imports:** Nothing (pure string manipulation).

Exposes a single function:

```
buildHtml(feedItems: object[], feedUrl: string, lastBuildDate: string) → string
```

Produces a self-contained `index.html` with:
- Inline CSS only — no external fonts, no JavaScript, no CDN calls.
- `prefers-color-scheme` dark/light theme via CSS variables.
- Feed items grouped by primary tag, sorted alphabetically.
- Weekly Digest summary items filtered out (display only individual release cards).
- `[Beta]` items highlighted with a distinct left-border accent.
- `<link rel="alternate" type="application/rss+xml">` in `<head>` for browser RSS discovery.

All user-supplied values are processed through `escapeHtml()`. URL fields pass through `safeHref()` which blocks `javascript:` and `data:` schemes.

---

### `.github/workflows/update-feed.yml`

**Role:** Automation scheduler and CI runner.

Triggers:
- **Scheduled:** Every Monday at 08:00 UTC via `cron: '0 8 * * 1'`.
- **Manual:** `workflow_dispatch` allows one-click runs from the Actions tab.

Steps:
1. `actions/checkout@v4` — clone the repo.
2. `actions/setup-node@v4` — install Node.js 20.
3. `npm ci` — reproducible install from `package-lock.json`.
4. `npm run update` — run the updater; injects `GH_TOKEN`, `SLACK_WEBHOOK_URL`, and `DISCORD_WEBHOOK_URL` from repo secrets. All three are optional.
5. `git add feed.xml state.json index.html && git diff --staged --quiet || git commit … && git push` — commit and push only if files changed.

Permissions: `contents: write` only (no other GitHub permissions granted).

---

### `feed.xml` (GitHub Pages)

**Role:** Public RSS endpoint.

GitHub Pages serves the repository root as a static site. The `.nojekyll` file in the root disables Jekyll processing so the raw `feed.xml` is served without transformation.

**Feed URL:** `https://rickyf115.github.io/oss-feed/feed.xml`

---

## Data Flow

```
watchlist.yml   ──(yaml.load)──►  project list
state.json      ──(JSON.parse)─►  { projects, feed_items }
                                          │
                      ┌───────────────────┘
                      │  for each project
                      ▼
          ┌──── has 'github'? ────┐
          │ yes                   │ no — has 'feed_url'?
          ▼                       ▼
 fetchLatestRelease()      fetchDirectFeed()
 api.github.com            any HTTPS feed URL
          │                       │
          ▼                       ▼
 { tag_name, html_url,    { title, link, guid,
   published_at, body }     pubDate, description }
          │                       │
          └───────────┬───────────┘
                      │
            compare last_seen
                      │
            ┌─────────┴──────────┐
            │ new                │ seen before
            ▼                    ▼
      push to newItems         skip
            │
            ▼
  [...newItems, ...state.feed_items].slice(0, 100)
            │
            ▼
  buildFeed()  ──►  feed.xml
  JSON.stringify ──►  state.json
```

---

## Security Boundaries

| Boundary                  | Control                                                          |
|---------------------------|------------------------------------------------------------------|
| `github` slug input       | Strict `owner/repo` regex; hostname hardcoded to `api.github.com`|
| `feed_url` input          | HTTPS-only; loopback/metadata/private-range blocked              |
| GitHub API response       | 1 MB cap; 15 s timeout; redirect rejection                       |
| Direct feed response      | 2 MB cap; 15 s timeout; redirect rejection                       |
| Feed XML generation       | `escapeXml()` + CDATA with `]]>` split on all external content   |
| GitHub Actions token      | `GH_TOKEN` scoped to repo only; never logged                     |
| Dependency surface        | Single dep (`js-yaml`); locked in `package-lock.json`            |

---

## File Map

```
oss-feed/
├── .github/
│   └── workflows/
│       └── update-feed.yml        # CI/CD scheduler
├── scripts/
│   ├── fetcher.js                 # GitHub Releases API client
│   ├── direct-feed-fetcher.js     # Direct RSS/Atom feed client + parser
│   ├── feed-builder.js            # RSS 2.0 serialiser, digest builder, tag sorter
│   ├── html-builder.js            # Static HTML page generator
│   ├── notifier.js                # Slack + Discord webhook dispatcher
│   └── update.js                  # Orchestration entry point
├── .nojekyll                      # Disable Jekyll on GitHub Pages
├── agent-contract.md              # Agent development contract
├── architecture.md                # This file
├── changelog.md                   # Change log
├── exploits.md                    # Security vulnerability catalogue
├── feed.xml                       # Generated RSS feed (auto-updated)
├── index.html                     # Generated HTML page (auto-updated)
├── package.json                   # Node.js project manifest
├── package-lock.json              # Locked dependency tree
├── README.md                      # Setup guide and reference
├── state.json                     # Persistent state (auto-updated)
└── watchlist.yml                  # User watchlist configuration
```
