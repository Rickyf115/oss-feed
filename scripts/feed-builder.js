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
 * Build a complete RSS 2.0 feed document string.
 *
 * @param {object} opts
 * @param {string}   opts.title       Channel title
 * @param {string}   opts.link        Channel website URL
 * @param {string}   opts.description Channel description
 * @param {string}   opts.feedUrl     Canonical feed URL (atom:link self)
 * @param {object[]} opts.items       Feed items
 */
export function buildFeed({ title, link, description, feedUrl, items = [] }) {
  const lastBuildDate = new Date().toUTCString();

  const itemsXml = items
    .map(
      (item) => `
  <item>
    <title>${escapeXml(item.title)}</title>
    <link>${escapeXml(item.link)}</link>
    <guid isPermaLink="true">${escapeXml(item.guid ?? item.link)}</guid>
    <pubDate>${escapeXml(item.pubDate)}</pubDate>
    <description>${cdata(item.description)}</description>
  </item>`
    )
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
