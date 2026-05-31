import https from 'https';

const GITHUB_API_HOSTNAME = 'api.github.com';
const USER_AGENT = 'oss-feed/1.0.0 (+https://github.com/rickyf115/oss-feed)';
const REQUEST_TIMEOUT_MS = 15_000;
const MAX_RESPONSE_BYTES = 1_048_576; // 1 MB cap — prevents DoS via enormous release bodies

/**
 * Only allow canonical GitHub slug format: owner/repo.
 * Rejects path traversal attempts (../../etc), query strings, absolute URLs,
 * or any other shape that could be abused as an SSRF vector.
 */
const SLUG_RE = /^[a-zA-Z0-9]([a-zA-Z0-9._-]*[a-zA-Z0-9])?\/[a-zA-Z0-9]([a-zA-Z0-9._-]*[a-zA-Z0-9])?$/;

function validateSlug(slug) {
  if (typeof slug !== 'string' || !SLUG_RE.test(slug)) {
    throw new Error(`Invalid GitHub slug "${slug}" — must be "owner/repo"`);
  }
}

/**
 * Fetch the latest published release for a GitHub repository.
 *
 * Returns the parsed release object or null when no releases exist (HTTP 404).
 * Throws on network errors, rate-limit responses, or malformed JSON.
 */
export function fetchLatestRelease(slug, token = '') {
  validateSlug(slug);

  const path = `/repos/${slug}/releases/latest`;
  const headers = {
    'User-Agent': USER_AGENT,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  return new Promise((resolve, reject) => {
    const req = https.get(
      { hostname: GITHUB_API_HOSTNAME, path, headers },
      (res) => {
        // GitHub API should never redirect; bail if it does to avoid open redirects.
        if (res.statusCode >= 300 && res.statusCode < 400) {
          res.resume();
          return reject(new Error(`Unexpected redirect (HTTP ${res.statusCode}) for ${slug}`));
        }

        // No releases exist for this repository.
        if (res.statusCode === 404) {
          res.resume();
          return resolve(null);
        }

        if (res.statusCode === 403) {
          res.resume();
          return reject(new Error(`Rate limit or forbidden (HTTP 403) for ${slug}`));
        }

        if (res.statusCode !== 200) {
          res.resume();
          return reject(new Error(`Unexpected status HTTP ${res.statusCode} for ${slug}`));
        }

        let bytes = 0;
        const chunks = [];

        res.on('data', (chunk) => {
          bytes += chunk.length;
          if (bytes > MAX_RESPONSE_BYTES) {
            req.destroy(new Error(`Response too large for ${slug} (>${MAX_RESPONSE_BYTES} bytes)`));
            return;
          }
          chunks.push(chunk);
        });

        res.on('end', () => {
          try {
            resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
          } catch (e) {
            reject(new Error(`Failed to parse JSON for ${slug}: ${e.message}`));
          }
        });
      }
    );

    req.setTimeout(REQUEST_TIMEOUT_MS, () => {
      req.destroy(new Error(`Request timed out for ${slug}`));
    });

    req.on('error', reject);
  });
}
