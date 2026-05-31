# OSS News Aggregator — Project Spec

**Version:** 0.3 (Draft)  
**Last Updated:** 2026-05-30  
**Status:** Planning

-----

## Overview

A weekly automated digest that monitors a user-defined list of open source projects and publishes release notes and changelogs as an RSS feed — readable in any RSS reader (Feedly, NetNewsWire, Reeder, etc.).

No paid services. No API keys beyond a free GitHub personal access token.

-----

## Goals

- Track releases and changelogs for a curated list of OSS projects
- Publish a weekly RSS feed that updates automatically
- Keep the watchlist simple to configure (a single YAML file)
- No paid services, no email provider, no external API keys required

-----

## Delivery Channel — RSS Feed

A static `feed.xml` file hosted on **GitHub Pages** (free). Updated weekly by a GitHub Actions cron job.

- Subscribe once in any RSS reader using the feed URL
- Old digests stay permanently browsable
- No spam filters, no inbox clutter, no deliverability issues
- Compatible with: Feedly, NetNewsWire, Reeder, Miniflux, and any other RSS reader

**Feed URL pattern:**

```
https://{your-github-username}.github.io/{repo-name}/feed.xml
```

-----

## Project Watchlist Configuration

Projects are defined in a single YAML file committed to the repo:

```yaml
# watchlist.yml
projects:
  - name: "Astro"
    github: "withastro/astro"
    tags: ["frontend", "framework"]

  - name: "Hono"
    github: "honojs/hono"
    tags: ["backend", "api"]

  - name: "Zed Editor"
    github: "zed-industries/zed"
    tags: ["tooling", "editor"]
```

**Fields:**

|Field                |Required|Description                                   |
|---------------------|--------|----------------------------------------------|
|`name`               |Yes     |Human-readable display name                   |
|`github`             |Yes     |`owner/repo` slug on GitHub                   |
|`tags`               |No      |User-defined labels for grouping              |
|`include_prereleases`|No      |Default: `false`                              |
|`notes`              |No      |Free-text reminder of why you’re watching this|

-----

## Data Source

|Source             |What it provides                  |Method                                     |
|-------------------|----------------------------------|-------------------------------------------|
|GitHub Releases API|Version tags, release notes, dates|`GET /repos/{owner}/{repo}/releases/latest`|

No authentication required. Optionally, a GitHub personal access token (PAT) can be added as a repository secret to raise the rate limit from 60 → 5,000 requests/hour — useful if your watchlist grows large or you run the workflow manually during testing.

-----

## RSS Feed Format

Each weekly feed update contains one entry per project with a new release:

```xml
<item>
  <title>Astro v5.8.0</title>
  <link>https://github.com/withastro/astro/releases/tag/astro%405.8.0</link>
  <pubDate>Tue, 27 May 2026 00:00:00 GMT</pubDate>
  <description>
    Release notes for Astro v5.8.0 appear here, pulled directly
    from the GitHub release.
  </description>
</item>
```

-----

## Architecture

```
[watchlist.yml]
      │
      ▼
[GitHub Actions — weekly cron, every Monday 8am]
      │
      ▼
[Fetcher script — GitHub Releases API per project]
      │
      ▼
[RSS Builder — generates feed.xml in RSS 2.0 format]
      │
      ▼
[GitHub Pages — hosts feed.xml at a public URL]
      │
      ▼
[Your RSS Reader — pulls the feed on its own schedule]
```

-----

## Scheduler

**GitHub Actions free cron** — runs inside the repo itself, no extra infrastructure.

```yaml
# .github/workflows/update-feed.yml
on:
  schedule:
    - cron: '0 8 * * 1'  # Every Monday at 8am UTC
  workflow_dispatch:       # Also allows manual trigger

env:
  # Optional: add a PAT as a GitHub repo secret named GH_TOKEN
  # to raise the API rate limit from 60 to 5,000 requests/hour.
  # If not set, the workflow runs unauthenticated (fine for most watchlists).
  GH_TOKEN: ${{ secrets.GH_TOKEN }}
```

Zero cost. Config lives in the repo alongside the watchlist.

-----

## State Tracking

A `state.json` file committed to the repo tracks the last-seen release per project, so the feed only adds new entries and doesn’t re-report old releases.

```json
{
  "withastro/astro": { "last_seen": "astro@5.8.0", "checked_at": "2026-05-30T08:00:00Z" },
  "honojs/hono":     { "last_seen": "v4.4.1",      "checked_at": "2026-05-30T08:00:00Z" }
}
```

-----

## Phased Roadmap

### Phase 1 — MVP

- [ ] `watchlist.yml` with initial project list
- [ ] Fetcher script (Node.js) — GitHub Releases API per project
- [ ] RSS 2.0 feed builder — writes `feed.xml`
- [ ] GitHub Actions cron workflow
- [ ] GitHub Pages enabled on the repo
- [ ] State tracking via `state.json`

### Phase 2 — Polish

- [ ] Group feed entries by tag
- [ ] Pre-release / beta toggle per project
- [ ] README with setup instructions and feed URL

### Phase 3 — Optional Extras

- [ ] Webhook support (post to Slack or Discord on new release)
- [ ] Simple web page rendering the feed as HTML (via GitHub Pages)

-----

## Open Questions

1. **Watchlist contents:** Which projects do you want to track first?
1. **GitHub token:** Do you have one, or should setup instructions include creating one?
1. **Repo name:** `oss-aggregator`? Something else?
1. **Cron timing:** Monday 8am UTC — does that work, or a different day/time?

-----

## Next Steps

1. Confirm watchlist (which projects to track)
1. Create the GitHub repo
1. Build Phase 1 scripts and workflow
1. Enable GitHub Pages on the repo
1. Subscribe to the feed URL in your RSS reader