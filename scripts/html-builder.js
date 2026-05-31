/**
 * Escape HTML special characters.
 * Applied to all user-supplied content (release titles, descriptions, tag names,
 * project links) before insertion into the page to prevent XSS.
 */
function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

/**
 * Validate that a URL is safe to use in an href attribute.
 * Only http: and https: schemes are allowed — javascript: and data: are blocked.
 */
function safeHref(url) {
  try {
    const u = new URL(String(url ?? ''));
    if (u.protocol === 'https:' || u.protocol === 'http:') return escapeHtml(url);
  } catch {
    // fall through
  }
  return '#';
}

/** Format a pubDate string as a short human-readable date. */
function formatDate(pubDate) {
  try {
    return new Date(pubDate).toLocaleDateString('en-US', {
      year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC',
    });
  } catch {
    return pubDate ?? '';
  }
}

/** Truncate a string to maxLen characters, appending "…" if cut. */
function truncate(str, maxLen = 200) {
  const s = String(str ?? '').replace(/\s+/g, ' ').trim();
  return s.length > maxLen ? s.slice(0, maxLen) + '…' : s;
}

function renderTagBadge(tag, isBeta = false) {
  const cls = isBeta ? 'badge badge-beta' : 'badge';
  return `<span class="${cls}">${escapeHtml(tag)}</span>`;
}

function renderItem(item) {
  const isBeta = item.title?.startsWith('[Beta]');
  const tags = (item.tags ?? []).map((t) => renderTagBadge(t)).join('');
  const betaBadge = isBeta ? renderTagBadge('beta', true) : '';
  const date = formatDate(item.pubDate);
  const excerpt = truncate(item.description, 220);

  return `
      <article class="card${isBeta ? ' card-beta' : ''}">
        <div class="card-header">
          <a class="card-title" href="${safeHref(item.link)}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.title)}</a>
          <time class="card-date" datetime="${escapeHtml(item.pubDate)}">${escapeHtml(date)}</time>
        </div>
        <div class="card-tags">${betaBadge}${tags}</div>
        ${excerpt ? `<p class="card-desc">${escapeHtml(excerpt)}</p>` : ''}
      </article>`;
}

const CSS = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --bg:           #0d1117;
    --surface:      #161b22;
    --surface-2:    #1c2128;
    --border:       #30363d;
    --text:         #e6edf3;
    --muted:        #8b949e;
    --accent:       #58a6ff;
    --accent-muted: #1f4070;
    --badge-bg:     #21262d;
    --badge-text:   #58a6ff;
    --beta-bg:      #3d1f00;
    --beta-text:    #ffa657;
    --radius:       8px;
    --font: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
    --mono: 'SFMono-Regular', Consolas, 'Liberation Mono', monospace;
  }

  @media (prefers-color-scheme: light) {
    :root {
      --bg:           #f6f8fa;
      --surface:      #ffffff;
      --surface-2:    #f0f3f6;
      --border:       #d0d7de;
      --text:         #1f2328;
      --muted:        #636c76;
      --accent:       #0969da;
      --accent-muted: #ddf4ff;
      --badge-bg:     #ddf4ff;
      --badge-text:   #0550ae;
      --beta-bg:      #fff1e5;
      --beta-text:    #953800;
    }
  }

  html { font-size: 16px; }

  body {
    background: var(--bg);
    color: var(--text);
    font-family: var(--font);
    line-height: 1.6;
    min-height: 100vh;
  }

  a { color: var(--accent); text-decoration: none; }
  a:hover { text-decoration: underline; }

  /* ── Layout ─────────────────────────────────────────── */
  .container { max-width: 860px; margin: 0 auto; padding: 0 1rem; }

  /* ── Header ─────────────────────────────────────────── */
  .site-header {
    border-bottom: 1px solid var(--border);
    padding: 2rem 0 1.5rem;
    margin-bottom: 2rem;
  }
  .site-header .container {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 1rem;
  }
  .site-header h1 {
    font-size: 1.5rem;
    font-weight: 600;
    letter-spacing: -0.02em;
  }
  .site-header .subtitle {
    color: var(--muted);
    font-size: 0.875rem;
    margin-top: 0.25rem;
  }
  .subscribe-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    background: var(--accent-muted);
    color: var(--accent);
    border: 1px solid var(--accent);
    border-radius: var(--radius);
    padding: 0.4rem 0.85rem;
    font-size: 0.875rem;
    font-weight: 500;
    white-space: nowrap;
    transition: opacity 0.15s;
  }
  .subscribe-btn:hover { opacity: 0.8; text-decoration: none; }

  /* ── Section heading ────────────────────────────────── */
  .section-heading {
    font-size: 0.8125rem;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--muted);
    margin-bottom: 0.75rem;
    padding-bottom: 0.5rem;
    border-bottom: 1px solid var(--border);
  }

  /* ── Cards ──────────────────────────────────────────── */
  .card-list { display: flex; flex-direction: column; gap: 0.75rem; margin-bottom: 2.5rem; }

  .card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 1rem 1.25rem;
    transition: border-color 0.15s;
  }
  .card:hover { border-color: var(--accent); }
  .card-beta { border-left: 3px solid var(--beta-text); }

  .card-header {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin-bottom: 0.4rem;
  }
  .card-title {
    font-weight: 600;
    font-size: 0.9375rem;
    color: var(--text);
  }
  .card-title:hover { color: var(--accent); text-decoration: none; }
  .card-date {
    font-size: 0.75rem;
    color: var(--muted);
    white-space: nowrap;
  }
  .card-tags { display: flex; flex-wrap: wrap; gap: 0.3rem; margin-bottom: 0.5rem; }
  .card-desc { font-size: 0.8125rem; color: var(--muted); line-height: 1.5; }

  /* ── Badges ─────────────────────────────────────────── */
  .badge {
    display: inline-block;
    background: var(--badge-bg);
    color: var(--badge-text);
    border-radius: 2em;
    padding: 0.1em 0.6em;
    font-size: 0.7rem;
    font-weight: 500;
    letter-spacing: 0.02em;
  }
  .badge-beta {
    background: var(--beta-bg);
    color: var(--beta-text);
  }

  /* ── Footer ─────────────────────────────────────────── */
  .site-footer {
    border-top: 1px solid var(--border);
    padding: 1.5rem 0;
    margin-top: 1rem;
    font-size: 0.8125rem;
    color: var(--muted);
    text-align: center;
  }

  /* ── Empty state ────────────────────────────────────── */
  .empty {
    text-align: center;
    color: var(--muted);
    padding: 3rem 0;
    font-size: 0.9375rem;
  }
`;

/**
 * Build a complete static HTML page from the feed item list.
 *
 * All user-supplied content is HTML-escaped. URLs are validated before use
 * in href attributes to block javascript: and data: schemes.
 *
 * @param {object[]} feedItems   Items from state.json feed_items
 * @param {string}   feedUrl     Canonical RSS feed URL
 * @param {string}   lastBuildDate  Human-readable build timestamp
 * @returns {string}             Complete HTML document
 */
export function buildHtml(feedItems, feedUrl, lastBuildDate) {
  // Skip digest summary items (no tags, synthetic GUID) for display
  const releases = feedItems.filter(
    (item) => item.tags !== undefined && !item.title?.startsWith('Weekly Digest')
  );

  // Group by primary tag, sort groups alphabetically
  const groups = {};
  for (const item of releases) {
    const tag = item.tags?.[0] ?? 'other';
    (groups[tag] ??= []).push(item);
  }

  let bodyContent;
  if (releases.length === 0) {
    bodyContent = '<p class="empty">No releases yet — check back after the next Monday run.</p>';
  } else {
    bodyContent = Object.entries(groups)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(
        ([tag, items]) => `
    <section>
      <h2 class="section-heading">${escapeHtml(tag)}</h2>
      <div class="card-list">${items.map(renderItem).join('')}
      </div>
    </section>`
      )
      .join('\n');
  }

  const count = releases.length;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>OSS Feed — Weekly Release Digest</title>
  <meta name="description" content="Weekly digest of new releases from tracked open source projects.">
  <link rel="alternate" type="application/rss+xml" title="OSS Feed" href="${safeHref(feedUrl)}">
  <style>${CSS}</style>
</head>
<body>
  <header class="site-header">
    <div class="container">
      <div>
        <h1>OSS Feed</h1>
        <p class="subtitle">Weekly release digest &mdash; ${escapeHtml(String(count))} release${count === 1 ? '' : 's'} tracked &bull; Updated ${escapeHtml(lastBuildDate)}</p>
      </div>
      <a class="subscribe-btn" href="${safeHref(feedUrl)}">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6.18 15.64a2.18 2.18 0 0 1 2.18 2.18C8.36 19.01 7.38 20 6.18 20C4.98 20 4 19.01 4 17.82a2.18 2.18 0 0 1 2.18-2.18M4 4.44A15.56 15.56 0 0 1 19.56 20h-2.83A12.73 12.73 0 0 0 4 7.27V4.44m0 5.66a9.9 9.9 0 0 1 9.9 9.9h-2.83A7.07 7.07 0 0 0 4 12.93V10.1z"/></svg>
        Subscribe via RSS
      </a>
    </div>
  </header>

  <main class="container">
${bodyContent}
  </main>

  <footer class="site-footer">
    <div class="container">
      Generated by <a href="https://github.com/rickyf115/oss-feed" rel="noopener noreferrer">oss-feed</a>
      &bull; <a href="${safeHref(feedUrl)}">RSS feed</a>
    </div>
  </footer>
</body>
</html>
`;
}
