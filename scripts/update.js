import { readFileSync, writeFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import yaml from 'js-yaml';
import { fetchLatestRelease } from './fetcher.js';
import { buildFeed } from './feed-builder.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const PATHS = {
  watchlist: resolve(ROOT, 'watchlist.yml'),
  state: resolve(ROOT, 'state.json'),
  feed: resolve(ROOT, 'feed.xml'),
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

async function main() {
  const token = process.env.GH_TOKEN ?? '';
  if (!token) {
    console.log('[INFO] GH_TOKEN not set — using unauthenticated API (60 req/hr limit)');
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
    const { name, github: slug, include_prereleases: includePrerelease = false } = project;

    if (!slug) {
      console.warn(`[WARN] Project "${name}" is missing a 'github' field — skipping`);
      continue;
    }

    let release;
    try {
      release = await fetchLatestRelease(slug, token);
    } catch (err) {
      console.error(`[ERROR] ${slug}: ${err.message}`);
      continue;
    }

    if (!release) {
      console.log(`[SKIP] ${slug}: no releases found`);
      continue;
    }

    if (!includePrerelease && (release.prerelease || release.draft)) {
      console.log(`[SKIP] ${slug}: latest (${release.tag_name}) is pre-release or draft`);
      continue;
    }

    const lastSeen = state.projects[slug]?.last_seen;

    if (lastSeen !== release.tag_name) {
      console.log(`[NEW]  ${slug} — ${release.tag_name}`);
      newItems.push({
        title: `${name} ${release.tag_name}`,
        link: release.html_url,
        guid: release.html_url,
        pubDate: new Date(release.published_at).toUTCString(),
        description: release.body || 'No release notes provided.',
      });
    } else {
      console.log(`[OK]   ${slug} — ${release.tag_name} (already in feed)`);
    }

    state.projects[slug] = {
      last_seen: release.tag_name,
      checked_at: new Date().toISOString(),
    };
  }

  // Prepend new items to the front and enforce the size cap.
  state.feed_items = [...newItems, ...state.feed_items].slice(0, MAX_FEED_ITEMS);

  const feedXml = buildFeed({ ...FEED_CONFIG, items: state.feed_items });
  writeFileSync(PATHS.feed, feedXml, 'utf8');
  writeFileSync(PATHS.state, JSON.stringify(state, null, 2) + '\n', 'utf8');

  console.log(
    `\nDone. ${newItems.length} new release(s). Feed total: ${state.feed_items.length} item(s).`
  );
}

main().catch((err) => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
