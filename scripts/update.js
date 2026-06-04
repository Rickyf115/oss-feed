import { readFileSync, writeFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import yaml from 'js-yaml';
import { fetchLatestRelease } from './fetcher.js';
import { fetchDirectFeed } from './direct-feed-fetcher.js';
import { buildFeed, buildDigestDescription, sortItemsByTag, markdownToHtml } from './feed-builder.js';
import { sendNotifications } from './notifier.js';
import { buildHtml } from './html-builder.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const PATHS = {
  watchlist: resolve(ROOT, 'watchlist.yml'),
  state: resolve(ROOT, 'state.json'),
  feed: resolve(ROOT, 'feed.xml'),
  html: resolve(ROOT, 'index.html'),
};

const FEED_CONFIG = {
  title: 'OSS Feed — Weekly Release Digest',
  link: 'https://rickyf115.github.io/oss-feed/',
  description: 'Weekly digest of new releases from tracked open source projects',
  feedUrl: 'https://rickyf115.github.io/oss-feed/feed.xml',
};

// Hard cap on stored feed items to keep feed.xml and state.json bounded in size.
const MAX_FEED_ITEMS = 100;

function loadState() {
  if (!existsSync(PATHS.state)) return { projects: {}, feed_items: [] };
  try {
    const raw = JSON.parse(readFileSync(PATHS.state, 'utf8'));
    return {
      projects: raw.projects ?? {},
      feed_items: Array.isArray(raw.feed_items) ? raw.feed_items : [],
    };
  } catch {
    console.warn('[WARN] Could not parse state.json, starting fresh.');
    return { projects: {}, feed_items: [] };
  }
}

/**
 * Build a normalized feed item object, attaching tags and a [Beta] label
 * when the release is a pre-release.
 */
function makeItem({ name, tagTitle, link, guid, pubDate, description, tags = [], isPrerelease = false }) {
  const label = isPrerelease ? '[Beta] ' : '';
  return {
    title: `${label}${name} ${tagTitle}`,
    link,
    guid,
    pubDate,
    description,
    tags,
  };
}

/**
 * Process a project that uses a direct RSS/Atom feed URL.
 *
 * Note: feed_url sources cannot distinguish pre-releases from stable releases
 * because RSS/Atom feeds carry no standard pre-release flag. The
 * include_prereleases field is ignored for feed_url projects; all entries
 * are treated as stable. See exploits.md §11 for context.
 */
async function processDirectFeed(project, state, newItems) {
  const { name, feed_url: feedUrl, tags = [] } = project;
  const stateKey = feedUrl;

  let entry;
  try {
    entry = await fetchDirectFeed(feedUrl);
  } catch (err) {
    console.error(`[ERROR] ${feedUrl}: ${err.message}`);
    return;
  }

  if (!entry) {
    console.log(`[SKIP] ${feedUrl}: no entries found`);
    return;
  }

  const lastSeen = state.projects[stateKey]?.last_seen;

  if (lastSeen !== entry.guid) {
    console.log(`[NEW]  ${name} — ${entry.title}`);
    newItems.push(
      makeItem({
        name,
        tagTitle: `— ${entry.title}`,
        link: entry.link,
        guid: entry.guid,
        pubDate: entry.pubDate,
        description: entry.description,
        tags,
      })
    );
  } else {
    console.log(`[OK]   ${name} — ${entry.title} (already in feed)`);
  }

  state.projects[stateKey] = {
    last_seen: entry.guid,
    checked_at: new Date().toISOString(),
  };
}

/**
 * Process a project that uses a GitHub owner/repo slug via the GitHub Releases API.
 */
async function processGithubSlug(project, state, newItems, token) {
  const { name, github: slug, include_prereleases: includePrerelease = false, tags = [] } = project;

  let release;
  try {
    release = await fetchLatestRelease(slug, token);
  } catch (err) {
    console.error(`[ERROR] ${slug}: ${err.message}`);
    return;
  }

  if (!release) {
    console.log(`[SKIP] ${slug}: no releases found`);
    return;
  }

  const isPrerelease = release.prerelease || release.draft;

  if (!includePrerelease && isPrerelease) {
    console.log(`[SKIP] ${slug}: latest (${release.tag_name}) is pre-release or draft`);
    return;
  }

  const lastSeen = state.projects[slug]?.last_seen;

  if (lastSeen !== release.tag_name) {
    console.log(`[NEW]  ${slug} — ${release.tag_name}${isPrerelease ? ' [Beta]' : ''}`);
    newItems.push(
      makeItem({
        name,
        tagTitle: release.tag_name,
        link: release.html_url,
        guid: release.html_url,
        pubDate: new Date(release.published_at).toUTCString(),
        description: markdownToHtml(release.body) || '<p>No release notes provided.</p>',
        tags,
        isPrerelease,
      })
    );
  } else {
    console.log(`[OK]   ${slug} — ${release.tag_name} (already in feed)`);
  }

  state.projects[slug] = {
    last_seen: release.tag_name,
    checked_at: new Date().toISOString(),
  };
}

/**
 * Build a weekly digest item that summarises all new releases grouped by tag.
 * Inserted at position 0 so it appears first in the feed.
 */
function buildDigestItem(newItems) {
  const dateStr = new Date().toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC',
  });
  const isoDate = new Date().toISOString().slice(0, 10);

  return {
    title: `Weekly Digest — ${dateStr}`,
    link: FEED_CONFIG.link,
    guid: `${FEED_CONFIG.link}digest/${isoDate}`,
    guidIsPermalink: false,
    pubDate: new Date().toUTCString(),
    description: buildDigestDescription(newItems),
    tags: [],
  };
}

async function main() {
  const token = process.env.GH_TOKEN ?? '';
  if (!token) {
    console.log('[INFO] GH_TOKEN not set — using unauthenticated GitHub API (60 req/hr limit)');
  }

  const watchlist = yaml.load(readFileSync(PATHS.watchlist, 'utf8'));
  const projects = Array.isArray(watchlist?.projects) ? watchlist.projects : [];
  if (projects.length === 0) {
    console.log('No projects in watchlist.yml, nothing to do.');
    return;
  }

  const state = loadState();
  const newItems = [];

  for (const project of projects) {
    const { name, github: slug, feed_url: feedUrl } = project;

    if (feedUrl) {
      await processDirectFeed(project, state, newItems);
    } else if (slug) {
      await processGithubSlug(project, state, newItems, token);
    } else {
      console.warn(`[WARN] "${name}" has neither 'github' nor 'feed_url' — skipping`);
    }
  }

  // Build the output item list:
  // 1. If there are new releases this run, prepend a weekly digest summary.
  // 2. Sort new items by primary tag so same-tag entries cluster together.
  // 3. Prepend sorted new items ahead of existing historical items.
  // 4. Enforce the size cap.
  const sortedNew = sortItemsByTag(newItems);
  const digestItems = newItems.length > 0 ? [buildDigestItem(newItems)] : [];
  state.feed_items = [...digestItems, ...sortedNew, ...state.feed_items].slice(0, MAX_FEED_ITEMS);

  const feedXml = buildFeed({ ...FEED_CONFIG, items: state.feed_items });
  writeFileSync(PATHS.feed, feedXml, 'utf8');
  writeFileSync(PATHS.state, JSON.stringify(state, null, 2) + '\n', 'utf8');

  // Regenerate the HTML page on every run so it always reflects current state.
  const lastBuildDate = new Date().toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC',
  });
  const html = buildHtml(state.feed_items, FEED_CONFIG.feedUrl, lastBuildDate);
  writeFileSync(PATHS.html, html, 'utf8');

  console.log(
    `\nDone. ${newItems.length} new release(s). Feed total: ${state.feed_items.length} item(s).`
  );

  // Send webhook notifications last — failures here must not abort the feed update.
  await sendNotifications(newItems, FEED_CONFIG.feedUrl);
}

main().catch((err) => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
