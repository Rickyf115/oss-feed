/**
 * Escape XML special characters for use in element text and attribute values.
 * Prevents XML injection / feed poisoning via malicious project names or tags.
 */
export function escapeXml(value) {
  if (value == null) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Wrap arbitrary content in a CDATA section.
 *
 * Any embedded CDATA end-sequences (]]>) are split across adjacent sections
 * to prevent injection from untrusted release body text.
 *
 * Safe transformation: "foo ]]> bar" → "<![CDATA[foo ]]]]><![CDATA[> bar]]>"
 */
export function cdata(value) {
  const safe = String(value ?? '').replace(/]]>/g, ']]]]><![CDATA[>');
  return `<![CDATA[${safe}]]>`;
}

/**
 * Build the weekly digest description: a Markdown summary of new releases
 * grouped by their primary tag. Rendered in CDATA so RSS readers that
 * display plain text still get readable output.
 *
 * @param {object[]} newItems  Items added in this run, each with a `tags` array
 * @returns {string}           Markdown string
 */
export function buildDigestDescription(newItems) {
  // Group by primary tag (first tag), falling back to "uncategorized".
  const groups = {};
  for (const item of newItems) {
    const tag = (item.tags?.[0]) ?? 'uncategorized';
    (groups[tag] ??= []).push(item);
  }

  const sections = Object.entries(groups)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([tag, items]) => {
      const lines = items.map((i) => `- [${i.title}](${i.link})`).join('\n');
      return `## ${tag}\n${lines}`;
    });

  return sections.join('\n\n');
}

/**
 * Sort a list of feed items by their primary tag alphabetically,
 * so items sharing a tag cluster together in the feed.
 * Items without tags sort to the end.
 *
 * @param {object[]} items
 * @returns {object[]}  New sorted array (input is not mutated)
 */
export function sortItemsByTag(items) {
  return [...items].sort((a, b) => {
    const ta = a.tags?.[0] ?? '\xff'; // \xff sorts after all printable ASCII
    const tb = b.tags?.[0] ?? '\xff';
    return ta.localeCompare(tb);
  });
}

/**
 * Build a complete RSS 2.0 feed document string.
 *
 * Each item may carry an optional `tags` array; when present, a
 * `<category>` element is emitted per tag so RSS readers can filter by tag.
 *
 * @param {object}   opts
 * @param {string}   opts.title       Channel title
 * @param {string}   opts.link        Channel website URL
 * @param {string}   opts.description Channel description
 * @param {string}   opts.feedUrl     Canonical feed URL (atom:link self)
 * @param {object[]} opts.items       Feed items
 */
export function buildFeed({ title, link, description, feedUrl, items = [] }) {
  const lastBuildDate = new Date().toUTCString();

  const itemsXml = items
    .map((item) => {
      const categories = (item.tags ?? [])
        .map((t) => `    <category>${escapeXml(t)}</category>`)
        .join('\n');

      return `
  <item>
    <title>${escapeXml(item.title)}</title>
    <link>${escapeXml(item.link)}</link>
    <guid isPermaLink="${item.guidIsPermalink === false ? 'false' : 'true'}">${escapeXml(item.guid ?? item.link)}</guid>
    <pubDate>${escapeXml(item.pubDate)}</pubDate>
${categories ? categories + '\n' : ''}    <description>${cdata(item.description)}</description>
  </item>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(title)}</title>
    <link>${escapeXml(link)}</link>
    <description>${escapeXml(description)}</description>
    <language>en-us</language>
    <lastBuildDate>${lastBuildDate}</lastBuildDate>
    <atom:link href="${escapeXml(feedUrl)}" rel="self" type="application/rss+xml" />
${itemsXml}
  </channel>
</rss>
`;
}
