import https from 'https';
import { URL } from 'url';

const USER_AGENT = 'oss-feed/1.0.0 (+https://github.com/rickyf115/oss-feed)';
const REQUEST_TIMEOUT_MS = 10_000;
const MAX_ITEMS_IN_NOTIFICATION = 20; // cap to avoid oversized payloads

// Allowed webhook hostnames — prevents arbitrary SSRF via webhook env vars.
const ALLOWED_WEBHOOK_HOSTS = new Set([
  'hooks.slack.com',
  'discord.com',
  'discordapp.com',
]);

/**
 * Validate that a webhook URL is HTTPS and points to a known webhook host.
 * The URL is never logged; only its hostname is used in error messages.
 */
function validateWebhookUrl(rawUrl, label) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error(`${label}: invalid URL`);
  }
  if (url.protocol !== 'https:') {
    throw new Error(`${label}: webhook URL must use HTTPS`);
  }
  if (!ALLOWED_WEBHOOK_HOSTS.has(url.hostname)) {
    throw new Error(`${label}: hostname "${url.hostname}" is not an allowed webhook host`);
  }
  return url;
}

/**
 * POST a JSON payload to a validated webhook URL.
 * The URL is never included in logs or error messages.
 */
function postJson(parsedUrl, payload, label) {
  const body = JSON.stringify(payload);

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || 443,
        path: parsedUrl.pathname + parsedUrl.search,
        method: 'POST',
        headers: {
          'User-Agent': USER_AGENT,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
      },
      (res) => {
        res.resume(); // drain response — we only care about the status code
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve();
        } else {
          reject(new Error(`${label}: webhook returned HTTP ${res.statusCode}`));
        }
      }
    );

    req.setTimeout(REQUEST_TIMEOUT_MS, () => {
      req.destroy(new Error(`${label}: webhook request timed out`));
    });

    req.on('error', (err) => reject(new Error(`${label}: ${err.message}`)));
    req.write(body);
    req.end();
  });
}

/**
 * Escape Slack mrkdwn / HTML special characters in plain text.
 * Slack interprets &, <, and > as formatting tokens.
 */
function escapeSlack(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Build a Slack Incoming Webhook payload.
 * Groups new releases by primary tag using mrkdwn bullet lists.
 */
function buildSlackPayload(newItems, feedUrl) {
  const capped = newItems.slice(0, MAX_ITEMS_IN_NOTIFICATION);

  // Group by primary tag
  const groups = {};
  for (const item of capped) {
    const tag = item.tags?.[0] ?? 'other';
    (groups[tag] ??= []).push(item);
  }

  const sections = Object.entries(groups)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([tag, items]) => {
      const lines = items
        .map((i) => `• <${escapeSlack(i.link)}|${escapeSlack(i.title)}>`)
        .join('\n');
      return `*${escapeSlack(tag)}*\n${lines}`;
    })
    .join('\n\n');

  const total = newItems.length;
  const truncated = total > MAX_ITEMS_IN_NOTIFICATION
    ? `\n_…and ${total - MAX_ITEMS_IN_NOTIFICATION} more. <${escapeSlack(feedUrl)}|View full feed>_`
    : '';

  return {
    blocks: [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: `📦 Weekly OSS Digest — ${total} new release${total === 1 ? '' : 's'}`,
          emoji: true,
        },
      },
      {
        type: 'section',
        text: { type: 'mrkdwn', text: sections + truncated },
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `<${escapeSlack(feedUrl)}|Subscribe to RSS feed>`,
          },
        ],
      },
    ],
  };
}

/**
 * Build a Discord Webhook payload.
 * Groups new releases by primary tag using Discord markdown.
 */
function escapeDiscordMarkdown(str) {
  // Escape characters that have special meaning in Discord markdown.
  return String(str ?? '').replace(/([*_~`|\\])/g, '\\$1');
}

function buildDiscordPayload(newItems, feedUrl) {
  const capped = newItems.slice(0, MAX_ITEMS_IN_NOTIFICATION);

  const groups = {};
  for (const item of capped) {
    const tag = item.tags?.[0] ?? 'other';
    (groups[tag] ??= []).push(item);
  }

  const description = Object.entries(groups)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([tag, items]) => {
      const lines = items
        .map((i) => `• [${escapeDiscordMarkdown(i.title)}](${i.link})`)
        .join('\n');
      return `**${escapeDiscordMarkdown(tag)}**\n${lines}`;
    })
    .join('\n\n');

  const total = newItems.length;
  const extra = total > MAX_ITEMS_IN_NOTIFICATION
    ? `\n_…and ${total - MAX_ITEMS_IN_NOTIFICATION} more._`
    : '';

  return {
    username: 'OSS Feed',
    embeds: [
      {
        title: `📦 Weekly OSS Digest — ${total} new release${total === 1 ? '' : 's'}`,
        description: description + extra,
        color: 0x58a6ff, // GitHub blue
        footer: { text: feedUrl },
        timestamp: new Date().toISOString(),
      },
    ],
  };
}

/**
 * Send notifications to any configured webhooks.
 *
 * Reads SLACK_WEBHOOK_URL and DISCORD_WEBHOOK_URL from the environment.
 * Errors are logged as warnings — a notification failure never aborts the
 * feed update.
 */
export async function sendNotifications(newItems, feedUrl) {
  if (newItems.length === 0) return;

  const tasks = [];

  const slackUrl = process.env.SLACK_WEBHOOK_URL;
  if (slackUrl) {
    tasks.push(
      (async () => {
        try {
          const url = validateWebhookUrl(slackUrl, 'Slack');
          await postJson(url, buildSlackPayload(newItems, feedUrl), 'Slack');
          console.log('[NOTIFY] Slack notification sent');
        } catch (err) {
          console.warn(`[WARN] Slack notification failed: ${err.message}`);
        }
      })()
    );
  }

  const discordUrl = process.env.DISCORD_WEBHOOK_URL;
  if (discordUrl) {
    tasks.push(
      (async () => {
        try {
          const url = validateWebhookUrl(discordUrl, 'Discord');
          await postJson(url, buildDiscordPayload(newItems, feedUrl), 'Discord');
          console.log('[NOTIFY] Discord notification sent');
        } catch (err) {
          console.warn(`[WARN] Discord notification failed: ${err.message}`);
        }
      })()
    );
  }

  if (tasks.length === 0) {
    console.log('[INFO] No webhook URLs configured — skipping notifications');
    return;
  }

  await Promise.all(tasks);
}
