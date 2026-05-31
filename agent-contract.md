# Agent Development Contract

**Version:** 1.0  
**Project:** OSS Feed (`rickyf115/oss-feed`)  
**Effective date:** 2026-05-31

This contract defines the obligations, standards, and guardrails for any AI agent (or human contributor acting under agent-like autonomy) working on this repository.

---

## 1. Scope of Work

An agent operating on this repository is authorised to:

- Implement features described in the active phase of the roadmap (see `README.md`).
- Fix bugs in existing code.
- Update documentation files (`architecture.md`, `changelog.md`, `exploits.md`, `agent-contract.md`).
- Modify `watchlist.yml` when explicitly instructed by the repository owner.
- Open pull requests against `main` for review.

An agent is **not** authorised to:

- Merge pull requests without explicit owner approval.
- Push directly to `main`.
- Add, remove, or modify GitHub Actions secrets or repository settings.
- Add new external dependencies without explicit approval.
- Change the feed URL, GitHub Pages configuration, or workflow cron schedule without explicit instruction.

---

## 2. Branching & Pull Request Requirements

- All development happens on a feature branch following the naming convention `claude/phase-{n}-{description}-{id}`.
- Every task concludes with a pull request opened against `main` for owner review.
- Pull request descriptions must include: summary of changes, test plan, and a link to the session.
- Commits must have clear, imperative-mood messages (e.g. `feat: add fetcher script`, `fix: escape CDATA end sequences`).
- No force-pushing to shared branches. No `--no-verify` bypasses.

---

## 3. Security Obligations

The agent must proactively identify and mitigate security vulnerabilities. The following requirements are non-negotiable:

### 3.1 Input Validation

- All `github` slug values from `watchlist.yml` must be validated against the strict `owner/repo` regex before being used in any network request.
- All `feed_url` values must be validated: HTTPS protocol only; loopback addresses, cloud metadata IPs, and RFC-1918 private ranges are blocked before any connection attempt.
- No user-supplied value may be interpolated into a hostname, port, or URL path without validation.

### 3.2 Output Encoding

- All values from external sources (GitHub API responses) inserted into XML must be either XML-entity-escaped via `escapeXml()` or wrapped in a CDATA section.
- CDATA sections must split embedded `]]>` sequences to prevent injection.

### 3.3 Network Safety

- HTTP redirects from the GitHub API must be rejected (not followed).
- All outbound requests must have an explicit timeout (`REQUEST_TIMEOUT_MS`).
- Response bodies must be capped at a reasonable size (`MAX_RESPONSE_BYTES`) to prevent memory exhaustion.

### 3.4 Secrets & Credentials

- Tokens (`GH_TOKEN`) must only be passed as HTTP headers, never logged, never embedded in feed output, and never hardcoded.

### 3.5 Exploit Documentation

- Every security consideration, known vulnerability, or trade-off must be documented in `exploits.md` with a description of the threat and the mitigation applied.
- When a new vulnerability is identified or a new fix is implemented, `exploits.md` must be updated in the same commit.

---

## 4. Documentation Requirements

After each task the agent must update:

| File               | What to update                                                          |
|--------------------|-------------------------------------------------------------------------|
| `changelog.md`     | Add an entry under `[Unreleased]` describing every change made         |
| `architecture.md`  | Update component descriptions or file map if the architecture changed  |
| `exploits.md`      | Add or update entries for any security concern introduced or resolved  |
| `agent-contract.md`| Update this file if scope or obligations change (with owner approval)  |

Documentation updates must be included in the same PR as the code changes they describe.

---

## 5. Code Quality Standards

- Default to writing no comments. Add a comment only when the **why** is non-obvious (hidden constraint, subtle invariant, security rationale, workaround for a known bug).
- Do not add error handling for impossible cases. Do not add abstractions beyond what the current task requires.
- Do not import or install new packages without explicit owner approval. Prefer Node.js built-in modules.
- All code targeting Node.js ≥ 18; ESM (`"type": "module"`) throughout.
- No TypeScript, no transpilation, no build step — keep the toolchain flat.

---

## 6. Testing & Verification

- Before opening a PR, the agent must confirm that `npm run update` executes without fatal errors.
- The agent must verify that generated `feed.xml` is valid XML (well-formed, parses without error).
- For UI or feed-consumer changes, the agent must test the golden path and note any untested edge cases explicitly in the PR description.

---

## 7. Dependency Policy

- Runtime dependencies must be kept to an absolute minimum.
- Every new dependency requires owner approval before installation.
- `package-lock.json` must always be committed alongside `package.json` changes.
- `npm audit` must report zero high- or critical-severity vulnerabilities at the time of the PR.

---

## 8. Agent Behaviour Expectations

- The agent must communicate progress clearly: what it is building, what it found, and when it is blocked.
- When a decision falls outside the authorised scope or has irreversible consequences (e.g. deleting files, modifying the workflow schedule), the agent must ask the owner before proceeding.
- The agent must not silently skip failures. Network errors, parse errors, and unexpected API responses must be logged and surfaced.
- The agent must never take actions that persist beyond the repository (posting to external services, sending messages, modifying infrastructure) unless explicitly instructed.

---

## 9. Acceptance Criteria

### Phase 1

A Phase 1 implementation is considered complete when:

- [ ] `watchlist.yml` contains at least one tracked project.
- [ ] `npm run update` successfully fetches releases and writes a valid `feed.xml`.
- [ ] `state.json` is populated with `last_seen` entries after the first run.
- [ ] The GitHub Actions workflow is present and syntactically valid.
- [ ] `feed.xml` is valid RSS 2.0.
- [ ] `exploits.md` documents all implemented security controls.
- [ ] `architecture.md` accurately describes all components.
- [ ] `changelog.md` records all changes made in the session.
- [ ] A pull request is open against `main` for owner review.

### Phase 2

- [ ] Feed items carry `<category>` elements matching watchlist tags.
- [ ] A "Weekly Digest" summary item is prepended whenever new releases are found.
- [ ] New items are sorted by primary tag within each run.
- [ ] Pre-releases include a `[Beta]` prefix in the feed title.
- [ ] `README.md` contains a complete user-facing setup guide.

### Phase 3

- [ ] `npm run update` generates a valid `index.html` alongside `feed.xml`.
- [ ] `index.html` is self-contained (no external JS, fonts, or CDN).
- [ ] `index.html` groups releases by tag with `[Beta]` accented cards.
- [ ] Webhook notifications fire when `SLACK_WEBHOOK_URL` or `DISCORD_WEBHOOK_URL` are set.
- [ ] Webhook failures log a warning and do not abort the feed update.
- [ ] `exploits.md` covers XSS (HTML page), webhook URL leakage, SSRF via webhooks, and notification content injection.
- [ ] All Phase 3 docs updated in the same PR as the code.
