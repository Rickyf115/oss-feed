# Architecture

## Overview

OSS Feed is a zero-infrastructure RSS aggregator. A GitHub Actions cron job runs weekly, fetches the latest releases for a user-curated list of open source projects, and writes a static `feed.xml` to the repository. GitHub Pages serves the file at a public URL that any RSS reader can subscribe to.

```
watchlist.yml
     │
     ▼
GitHub Actions (weekly cron — every Monday 08:00 UTC)
     │
     ▼
scripts/update.js  ──►  scripts/fetcher.js  ──►  api.github.com/repos/{slug}/releases/latest
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

---

### `scripts/feed-builder.js`

**Role:** RSS 2.0 document serialiser.  
**Imports:** Nothing (pure string manipulation).

Exposes three functions:

| Function      | Purpose                                                              |
|---------------|----------------------------------------------------------------------|
| `escapeXml()` | Encode `& < > " '` as XML entities for element text / attributes    |
| `cdata()`     | Wrap a string in `<![CDATA[…]]>`, escaping embedded `]]>` sequences |
| `buildFeed()` | Assemble a complete RSS 2.0 document string from channel metadata and items |

The feed document includes an `atom:link` self-referential element for RSS reader compatibility.

---

### `scripts/update.js`

**Role:** Main orchestration script — entry point for `npm run update`.

Execution flow:

1. Load `watchlist.yml` and `state.json`.
2. For each project in the watchlist, call `fetchLatestRelease()`.
3. Compare the returned tag against `state.projects[slug].last_seen`. Skip projects with no new release.
4. Build a new feed item for each genuinely new release and prepend it to the existing item list.
5. Write the updated `feed.xml` via `buildFeed()`.
6. Write the updated `state.json`.

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
4. `npm run update` — run the updater (token injected via `secrets.GH_TOKEN`).
5. `git add feed.xml state.json && git diff --staged --quiet || git commit … && git push` — commit and push only if files changed.

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
               fetchLatestRelease(slug, token)
                      │
               api.github.com  (HTTPS, TLS 1.2+)
                      │
               release object { tag_name, html_url,
                                published_at, body, … }
                      │
               compare tag_name vs state.projects[slug].last_seen
                      │
             ┌────────┴────────┐
             │ new             │ seen before
             ▼                 ▼
       push to newItems      skip
             │
             ▼
       [...newItems, ...state.feed_items].slice(0, 100)
             │
             ▼
       buildFeed()  ──►  feed.xml
       JSON.stringify  ──►  state.json
```

---

## Security Boundaries

| Boundary                  | Control                                              |
|---------------------------|------------------------------------------------------|
| Watchlist input           | Slug regex validation; hostname hardcoded            |
| GitHub API response       | 1 MB size cap; 15 s timeout; redirect rejection      |
| Feed XML generation       | `escapeXml()` + CDATA with `]]>` split               |
| GitHub Actions token      | `GH_TOKEN` scoped to repo only; never logged         |
| Dependency surface        | Single dep (`js-yaml`); locked in `package-lock.json`|

---

## File Map

```
oss-feed/
├── .github/
│   └── workflows/
│       └── update-feed.yml   # CI/CD scheduler
├── scripts/
│   ├── fetcher.js            # GitHub API client
│   ├── feed-builder.js       # RSS 2.0 serialiser
│   └── update.js             # Orchestration entry point
├── .nojekyll                 # Disable Jekyll on GitHub Pages
├── agent-contract.md         # Agent development contract
├── architecture.md           # This file
├── changelog.md              # Change log
├── exploits.md               # Security vulnerability catalogue
├── feed.xml                  # Generated RSS feed (auto-updated)
├── package.json              # Node.js project manifest
├── package-lock.json         # Locked dependency tree
├── README.md                 # Project spec and roadmap
├── state.json                # Persistent state (auto-updated)
└── watchlist.yml             # User watchlist configuration
```
