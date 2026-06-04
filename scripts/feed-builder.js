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

// ── Internal HTML helpers ─────────────────────────────────────────────────────

/** Escape text content for HTML (& < > only — not needed for text nodes). */
function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Escape a value for use in an HTML attribute (& < > "). */
function escAttr(str) {
  return esc(str).replace(/"/g, '&quot;');
}

/**
 * Convert inline Markdown to HTML using a placeholder tokeniser.
 *
 * Works on RAW (unescaped) input. Processing order:
 *   1. Protect fenced code spans (content is HTML-escaped)
 *   2. Protect Markdown links [text](url)
 *   3. Auto-link bare https?:// URLs
 *   4. Apply bold, strikethrough, italic in that order
 *   5. HTML-escape the remaining plain text (placeholders survive esc())
 *   6. Restore all placeholders
 *
 * This ordering avoids double-escaping (URLs with & don't become &amp;amp;)
 * and prevents pattern leakage into already-processed tokens.
 */
function inline(rawText) {
  const slots = [];
  const hold = (html) => {
    const id = slots.length;
    slots.push(html);
    return `\x01${id}\x01`; // \x01 is not touched by esc()
  };

  let t = String(rawText ?? '');

  // 1. Inline code — escape content so <tags> inside backticks render literally
  t = t.replace(/`([^`]+)`/g, (_, code) => hold(`<code>${esc(code)}</code>`));

  // 2. Markdown links [label](url) — only http/https pass through
  t = t.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, url) => {
    const safe = /^https?:\/\//i.test(url) ? escAttr(url) : '#';
    return hold(`<a href="${safe}">${esc(label)}</a>`);
  });

  // 3. Bare URLs — auto-link, strip trailing sentence punctuation
  t = t.replace(/https?:\/\/[^\s<>"']+/g, (url) => {
    const stripped = url.replace(/[.,;:!?)\]]+$/, '');
    return hold(`<a href="${escAttr(stripped)}">${esc(stripped)}</a>`);
  });

  // 4. Bold, strikethrough, italic (in that order — bold before italic
  //    prevents ** matching as two singles)
  t = t.replace(/\*\*(.+?)\*\*/g, (_, s) => hold(`<strong>${esc(s)}</strong>`));
  t = t.replace(/__(.+?)__/g,     (_, s) => hold(`<strong>${esc(s)}</strong>`));
  t = t.replace(/~~(.+?)~~/g,     (_, s) => hold(`<del>${esc(s)}</del>`));
  t = t.replace(/\*(.+?)\*/g,     (_, s) => hold(`<em>${esc(s)}</em>`));
  t = t.replace(/_([^_]+)_/g,     (_, s) => hold(`<em>${esc(s)}</em>`));

  // 5. HTML-escape everything that remains (placeholders are unaffected)
  t = esc(t);

  // 6. Restore placeholders
  t = t.replace(/\x01(\d+)\x01/g, (_, i) => slots[Number(i)]);

  return t;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Convert a GitHub-flavoured Markdown string to safe HTML.
 *
 * Handles the patterns most common in GitHub release notes:
 *   Fenced code blocks  (``` ... ```)
 *   Headings            (# h1 / ## h2 / ### h3)
 *   Blockquotes         (> text)
 *   Bullet lists        (-, *, +)
 *   Ordered lists       (1.)
 *   Horizontal rules    (--- / ***)
 *   Bold, italic, strikethrough, inline code, links, bare URLs
 *   Plain paragraphs
 *
 * All user content is HTML-escaped; javascript: links are blocked.
 */
export function markdownToHtml(md) {
  if (!md) return '';

  let text = String(md).replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // Extract fenced code blocks before line-by-line processing.
  const codeBlocks = [];
  text = text.replace(/^```[^\n]*\n([\s\S]*?)^```\s*$/gm, (_, code) => {
    const i = codeBlocks.length;
    codeBlocks.push(`<pre><code>${esc(code.trimEnd())}</code></pre>`);
    return `\x00BLOCK${i}\x00`;
  });

  const lines = text.split('\n');
  const out = [];
  let listType = null;

  const closeList = () => {
    if (listType) { out.push(`</${listType}>`); listType = null; }
  };

  for (const raw of lines) {
    const line = raw.trimEnd();

    // Restore code block placeholders
    const blockRef = line.match(/^\x00BLOCK(\d+)\x00$/);
    if (blockRef) {
      closeList();
      out.push(codeBlocks[Number(blockRef[1])]);
      continue;
    }

    // Horizontal rule
    if (/^(\*{3,}|-{3,}|_{3,})$/.test(line.trim())) {
      closeList();
      out.push('<hr>');
      continue;
    }

    // Headings (h1–h3)
    const hm = line.match(/^(#{1,3})\s+(.+)/);
    if (hm) {
      closeList();
      out.push(`<h${hm[1].length}>${inline(hm[2])}</h${hm[1].length}>`);
      continue;
    }

    // Blockquote
    const bq = line.match(/^>\s?(.*)/);
    if (bq) {
      closeList();
      out.push(`<blockquote><p>${inline(bq[1])}</p></blockquote>`);
      continue;
    }

    // Bullet list item
    const bl = line.match(/^[-*+]\s+(.+)/);
    if (bl) {
      if (listType !== 'ul') { closeList(); out.push('<ul>'); listType = 'ul'; }
      out.push(`<li>${inline(bl[1])}</li>`);
      continue;
    }

    // Ordered list item
    const ol = line.match(/^\d+\.\s+(.+)/);
    if (ol) {
      if (listType !== 'ol') { closeList(); out.push('<ol>'); listType = 'ol'; }
      out.push(`<li>${inline(ol[1])}</li>`);
      continue;
    }

    // Blank line — close any open list, emit nothing
    if (line.trim() === '') {
      closeList();
      continue;
    }

    // Plain paragraph
    closeList();
    out.push(`<p>${inline(line)}</p>`);
  }

  closeList();
  return out.join('\n');
}

/**
 * Build the weekly digest description as HTML, grouping new releases by
 * their primary tag with linked list items.
 *
 * Returns HTML (not Markdown) suitable for use inside a CDATA description.
 *
 * @param {object[]} newItems  Items added in this run, each with a `tags` array
 * @returns {string}           HTML string
 */
export function buildDigestDescription(newItems) {
  const groups = {};
  for (const item of newItems) {
    const tag = item.tags?.[0] ?? 'uncategorized';
    (groups[tag] ??= []).push(item);
  }

  return Object.entries(groups)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([tag, items]) => {
      const listItems = items
        .map((i) => `  <li><a href="${escAttr(i.link)}">${esc(i.title)}</a></li>`)
        .join('\n');
      return `<h3>${esc(tag)}</h3>\n<ul>\n${listItems}\n</ul>`;
    })
    .join('\n\n');
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
