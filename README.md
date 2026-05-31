# OSS Feed

A self-hosted weekly RSS digest that tracks releases from your curated list of open source projects and publishes them as a static feed you can subscribe to in any RSS reader.

**Your feed URL:**
```
https://rickyf115.github.io/oss-feed/feed.xml
```

> Subscribe once in Feedly, NetNewsWire, Reeder, Miniflux, or any other RSS reader. The feed updates automatically every Monday at 08:00 UTC.

---

## How it works

```
watchlist.yml  →  GitHub Actions (weekly cron)  →  feed.xml  →  GitHub Pages  →  your RSS reader
```

- A cron job fetches the latest release for each watched project via the GitHub Releases API or a direct RSS/Atom feed URL.
- New releases are written to `feed.xml` (RSS 2.0) and committed back to the repo.
- GitHub Pages serves `feed.xml` as a public URL at no cost.
- `state.json` tracks what has already been reported so the feed never re-announces old releases.

---

## Quick start (fork this repo)

### 1. Fork the repository

Click **Fork** on GitHub. The workflow, watchlist, and all scripts come with it.

### 2. Enable GitHub Pages

In your fork: **Settings → Pages → Source → Deploy from a branch → `main` / `/ (root)` → Save.**

Your feed will be live at:
```
https://{your-username}.github.io/oss-feed/feed.xml
```

### 3. (Optional) Add a GitHub token

Without a token the GitHub API allows 60 requests/hour — enough for most watchlists. If yours grows large, add a Personal Access Token:

1. Generate a [fine-grained PAT](https://github.com/settings/tokens) with **Public Repositories (read-only)** access.
2. Add it to your fork: **Settings → Secrets and variables → Actions → New repository secret**, named `GH_TOKEN`.

### 4. Edit the watchlist

Open `watchlist.yml` and add or remove projects. The workflow runs on the next Monday, or trigger it manually from **Actions → Update OSS Feed → Run workflow**.

### 5. Subscribe to your feed

Paste your feed URL into any RSS reader and subscribe.

---

## Watchlist format (`watchlist.yml`)

```yaml
projects:
  # Track via GitHub Releases API (recommended for GitHub-hosted projects)
  - name: "Vite"
    github: "vitejs/vite"
    tags: ["frontend", "tooling"]
    notes: "Next-gen frontend build tool"

  # Track via a direct RSS/Atom feed URL (for projects that publish one)
  - name: "Apache Kafka"
    feed_url: "https://github.com/apache/kafka/releases.atom"
    tags: ["backend", "streaming"]

  # Include pre-releases / betas (GitHub API only)
  - name: "My Experimental Tool"
    github: "owner/repo"
    tags: ["tooling"]
    include_prereleases: true
```

### Field reference

| Field                | Required | Description |
|----------------------|----------|-------------|
| `name`               | Yes      | Human-readable display name shown in feed titles |
| `github`             | One of   | `owner/repo` slug — uses the GitHub Releases API |
| `feed_url`           | One of   | Any HTTPS RSS 2.0 or Atom feed URL |
| `tags`               | No       | Labels for grouping entries in the weekly digest |
| `include_prereleases`| No       | Default `false`. Set `true` to include pre-releases and drafts. Adds a `[Beta]` prefix to the feed title. GitHub API projects only — direct feeds cannot distinguish pre-releases. |
| `notes`              | No       | Free-text reminder of why you're tracking this project |

---

## Feed output

Each weekly run produces two types of feed entries:

### Weekly digest (top of feed)

A summary item appears at the top whenever new releases are found. Releases are grouped by their primary tag:

```
Weekly Digest — Monday, June 2, 2026

## frontend
- Astro v5.8.0
- Vite v6.1.0

## backend
- Hono v4.4.2
- Apache Kafka — 4.2.1

## tooling
- Biome v2.1.0
```

### Individual release items

Each new release also gets its own feed item with the full release notes, a `<category>` element per tag (so your RSS reader can filter by tag), and a direct link to the GitHub release page.

```xml
<item>
  <title>Astro v5.8.0</title>
  <link>https://github.com/withastro/astro/releases/tag/astro%405.8.0</link>
  <pubDate>Tue, 27 May 2026 00:00:00 GMT</pubDate>
  <category>frontend</category>
  <category>framework</category>
  <description><![CDATA[Full release notes here…]]></description>
</item>
```

---

## Data sources

| Source | Field | Rate limit | Pre-release detection |
|--------|-------|------------|-----------------------|
| GitHub Releases API | `github` | 60 req/hr (5,000 with token) | Yes — `include_prereleases` works |
| Direct RSS/Atom feed | `feed_url` | None (public feeds) | No — all entries treated as stable |

---

## Running locally

```bash
# Install dependencies
npm install

# Run the updater (fetches releases and writes feed.xml + state.json)
GH_TOKEN=your_token npm run update

# Or without a token (subject to the 60 req/hr rate limit)
npm run update
```

---

## Project structure

```
oss-feed/
├── .github/
│   └── workflows/
│       └── update-feed.yml        # Weekly cron job
├── scripts/
│   ├── fetcher.js                 # GitHub Releases API client
│   ├── direct-feed-fetcher.js     # Direct RSS/Atom feed client
│   ├── feed-builder.js            # RSS 2.0 serialiser + digest builder
│   └── update.js                  # Entry point (npm run update)
├── feed.xml                       # Generated feed — do not edit by hand
├── state.json                     # Release state — do not edit by hand
├── watchlist.yml                  # Your project list — edit this
└── package.json
```

---

## Security

Release notes are fetched from external sources (GitHub API, third-party feeds) and embedded in the RSS feed. The following controls are in place:

- All external content is XML-escaped or CDATA-wrapped before being written to `feed.xml`.
- `feed_url` values are restricted to HTTPS; loopback addresses and cloud-metadata IPs are blocked.
- Response sizes are capped (1 MB for API, 2 MB for feeds) to prevent memory exhaustion.
- The GitHub token is never logged or included in feed output.

See [`exploits.md`](exploits.md) for the full security catalogue.

---

## Webhook notifications (Slack / Discord)

After each run that finds new releases, the updater posts a grouped summary to any configured webhooks.

**Setup:** Add one or both of the following as repository secrets:

| Secret name | Platform | Where to get the URL |
|---|---|---|
| `SLACK_WEBHOOK_URL` | Slack | [Create an Incoming Webhook](https://api.slack.com/messaging/webhooks) in your workspace |
| `DISCORD_WEBHOOK_URL` | Discord | Channel settings → Integrations → Webhooks → New Webhook |

The notification groups releases by tag — the same layout as the weekly digest item in the feed:

```
📦 Weekly OSS Digest — 3 new releases

frontend
• Astro v5.8.0
• Vite v6.1.0

backend
• Hono v4.4.2
```

Notifications are best-effort: a webhook failure never aborts the feed update or causes the workflow to fail.

---

## HTML feed page

An `index.html` is generated on every run alongside `feed.xml`. It renders the same releases as a browsable web page, grouped by tag, with direct links to each GitHub release.

**Page URL:** `https://rickyf115.github.io/oss-feed/`

The page is self-contained (no external fonts, no JavaScript, no CDN dependencies) and respects the user's `prefers-color-scheme` setting for dark/light mode.

---

## Roadmap

| Phase | Status | Items |
|-------|--------|-------|
| Phase 1 — MVP | ✅ Complete | Fetcher, RSS builder, GitHub Actions cron, state tracking |
| Phase 2 — Polish | ✅ Complete | Tag grouping, pre-release labels, this README |
| Phase 3 — Extras | ✅ Complete | Slack/Discord webhooks, HTML feed page |
