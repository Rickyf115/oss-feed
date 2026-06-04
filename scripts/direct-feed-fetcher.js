import https from 'https';
import { URL } from 'url';

const USER_AGENT = 'oss-feed/1.0.0 (+https://github.com/rickyf115/oss-feed)';
const REQUEST_TIMEOUT_MS = 15_000;
const MAX_RESPONSE_BYTES = 2_097_152; // 2 MB — feeds can be larger than single-release API responses

/**
 * Validate that a feed URL is safe to fetch.
 *
 * Security controls:
 * - HTTPS only — plaintext HTTP is rejected (prevents MITM on feed content)
 * - Loopback and link-local hosts are blocked to prevent SSRF
 * - Private RFC-1918 IP ranges are blocked
 */
function validateFeedUrl(rawUrl) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error(`Invalid feed URL: ${rawUrl}`);
  }

  if (url.protocol !== 'https:') {
    throw new Error(`Feed URL must use HTTPS, got "${url.protocol}" in ${rawUrl}`);
  }

  const host = url.hostname.toLowerCase();

  const blockedHosts = [
    'localhost', '127.0.0.1', '::1', '0.0.0.0',
    '169.254.169.254', // AWS/GCP instance metadata
    '100.100.100.200', // Alibaba Cloud metadata
  ];
  if (blockedHosts.includes(host)) {
    throw new Error(`Feed URL hostname "${host}" is blocked`);
  }

  if (/^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.)/.test(host)) {
    throw new Error(`Feed URL points to a private IP range: ${host}`);
  }

  return url;
}

/**
 * Extract inner text from the first matching XML tag, stripping CDATA wrappers
 * and decoding XML character entities so callers receive decoded text/HTML.
 */
function extractText(xml, tag) {
  const m = xml.match(new RegExp(`<${tag}(?:[^>]*)>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  if (!m) return null;
  return m[1]
    .replace(/<!\[CDATA\[([\s\S]*?)]]>/g, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, '&') // must be last — avoids double-decoding &amp;lt; → <
    .trim();
}

/**
 * Extract the primary link URL from an XML entry or item block.
 *
 * Handles:
 * - Atom: <link href="URL" /> or <link rel="alternate" href="URL" />
 * - RSS:  <link>URL</link>
 */
function extractLink(block) {
  // Atom-style href attribute (self-closing or not)
  const href = block.match(/<link[^>]+href=["']([^"']+)["'][^>]*\/?>/i);
  if (href) return href[1].trim();

  // RSS-style text content
  const text = block.match(/<link>([^<]+)<\/link>/i);
  if (text) return text[1].trim();

  return null;
}

/**
 * Parse Atom <entry> elements and return normalised item objects.
 */
function parseAtomEntries(xml) {
  const entries = [];
  const re = /<entry\b[\s\S]*?<\/entry>/gi;
  let m;
  while ((m = re.exec(xml)) !== null) {
    const block = m[0];
    const title = extractText(block, 'title');
    const link = extractLink(block);
    const date = extractText(block, 'updated') || extractText(block, 'published');
    const description = extractText(block, 'content') || extractText(block, 'summary') || '';
    const guid = extractText(block, 'id') || link;

    if (title && link) {
      entries.push({
        title,
        link,
        guid: guid ?? link,
        pubDate: date ? new Date(date).toUTCString() : new Date().toUTCString(),
        description,
      });
    }
  }
  return entries;
}

/**
 * Parse RSS <item> elements and return normalised item objects.
 */
function parseRssItems(xml) {
  const items = [];
  const re = /<item\b[\s\S]*?<\/item>/gi;
  let m;
  while ((m = re.exec(xml)) !== null) {
    const block = m[0];
    const title = extractText(block, 'title');
    const link = extractLink(block) || extractText(block, 'link');
    const date = extractText(block, 'pubDate') || extractText(block, 'dc:date');
    const description = extractText(block, 'description') || '';
    const guid = extractText(block, 'guid') || link;

    if (title && link) {
      items.push({
        title,
        link,
        guid: guid ?? link,
        pubDate: date ? new Date(date).toUTCString() : new Date().toUTCString(),
        description,
      });
    }
  }
  return items;
}

/**
 * Detect Atom vs RSS and dispatch to the appropriate parser.
 */
function parseFeed(xml) {
  // Atom feeds declare a <feed> root element; RSS feeds use <rss> or <channel>
  if (/<feed\b/i.test(xml)) return parseAtomEntries(xml);
  return parseRssItems(xml);
}

/**
 * Fetch the latest entry from a direct RSS or Atom feed URL.
 *
 * Returns the first (most recent) entry as a normalised object, or null if the
 * feed contains no entries. Throws on network errors or invalid feed URLs.
 */
export function fetchDirectFeed(rawUrl) {
  const url = validateFeedUrl(rawUrl);

  return new Promise((resolve, reject) => {
    const req = https.get(
      {
        hostname: url.hostname,
        port: url.port || 443,
        path: url.pathname + url.search,
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'application/atom+xml, application/rss+xml, application/xml;q=0.9, text/xml;q=0.8',
        },
      },
      (res) => {
        // Do not follow redirects — surface them so the watchlist can be corrected.
        if (res.statusCode >= 300 && res.statusCode < 400) {
          res.resume();
          return reject(new Error(`Unexpected redirect (HTTP ${res.statusCode}) from ${rawUrl}`));
        }

        if (res.statusCode !== 200) {
          res.resume();
          return reject(new Error(`HTTP ${res.statusCode} fetching ${rawUrl}`));
        }

        let bytes = 0;
        const chunks = [];

        res.on('data', (chunk) => {
          bytes += chunk.length;
          if (bytes > MAX_RESPONSE_BYTES) {
            req.destroy(new Error(`Feed too large (>${MAX_RESPONSE_BYTES} bytes): ${rawUrl}`));
            return;
          }
          chunks.push(chunk);
        });

        res.on('end', () => {
          try {
            const xml = Buffer.concat(chunks).toString('utf8');
            const entries = parseFeed(xml);
            resolve(entries.length > 0 ? entries[0] : null);
          } catch (e) {
            reject(new Error(`Failed to parse feed ${rawUrl}: ${e.message}`));
          }
        });
      }
    );

    req.setTimeout(REQUEST_TIMEOUT_MS, () => {
      req.destroy(new Error(`Request timed out: ${rawUrl}`));
    });

    req.on('error', reject);
  });
}
