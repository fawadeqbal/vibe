/**
 * The small Markdown the legal pages use, to HTML. Everything is escaped
 * first, so whatever staff type in admin can never inject markup or script;
 * only these become tags:
 *
 *   # / ## / ###  headings (## and ### get an id for #anchors)
 *   - item        bullet list        1. item  numbered list
 *   **bold**      [text](https://… | mailto:… | /path | #anchor)
 *   blank line    new paragraph      > note   a highlighted note
 */
export function renderLegalMarkdown(md: string): string {
  const out: string[] = [];
  let para: string[] = [];
  let list: { tag: 'ul' | 'ol'; items: string[] } | null = null;
  let quote: string[] = [];

  const flushPara = () => {
    if (para.length) out.push(`<p>${inline(para.join(' '))}</p>`);
    para = [];
  };
  const flushList = () => {
    if (list) out.push(`<${list.tag}>${list.items.map((i) => `<li>${inline(i)}</li>`).join('')}</${list.tag}>`);
    list = null;
  };
  const flushQuote = () => {
    if (quote.length) out.push(`<blockquote><p>${inline(quote.join(' '))}</p></blockquote>`);
    quote = [];
  };
  const flush = () => {
    flushPara();
    flushList();
    flushQuote();
  };

  for (const raw of md.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trim();
    if (!line) {
      flush();
      continue;
    }
    const h = /^(#{1,3})\s+(.+)$/.exec(line);
    if (h) {
      flush();
      const level = h[1].length;
      const text = h[2].trim();
      out.push(level === 1 ? `<h1>${inline(text)}</h1>` : `<h${level} id="${slug(text)}">${inline(text)}</h${level}>`);
      continue;
    }
    const bullet = /^[-*]\s+(.+)$/.exec(line);
    const numbered = /^\d+[.)]\s+(.+)$/.exec(line);
    if (bullet || numbered) {
      flushPara();
      flushQuote();
      const tag = bullet ? 'ul' : 'ol';
      if (!list || list.tag !== tag) {
        flushList();
        list = { tag, items: [] };
      }
      list.items.push((bullet ?? numbered)![1]);
      continue;
    }
    const q = /^>\s?(.*)$/.exec(line);
    if (q) {
      flushPara();
      flushList();
      quote.push(q[1]);
      continue;
    }
    if (list) {
      // A wrapped line continues the last item.
      list.items[list.items.length - 1] += ` ${line}`;
      continue;
    }
    flushQuote();
    para.push(line);
  }
  flush();
  return out.join('\n');
}

/** "3. Coins & VIP" → "coins-vip" (anchor ids). */
export function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/\*\*|\[|\]\([^)]*\)/g, '')
    .replace(/^\d+[.)]?\s*/, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/** The first `# Heading`, or the first line, for a page title. */
export function firstHeading(md: string): string | null {
  const m = /^#\s+(.+)$/m.exec(md);
  return m ? m[1].trim() : null;
}

function escape(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

const SAFE_HREF = /^(https?:\/\/|mailto:|\/|#)/i;

function inline(text: string): string {
  let html = '';
  const re = /\[([^\]]+)\]\(([^)\s]+)\)|\*\*([^*]+)\*\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    html += escape(text.slice(last, m.index));
    if (m[1] !== undefined) {
      const href = m[2];
      if (SAFE_HREF.test(href)) {
        const external = /^https?:\/\//i.test(href);
        html += `<a href="${escape(href)}"${external ? ' target="_blank" rel="noopener"' : ''}>${escape(m[1])}</a>`;
      } else {
        html += escape(m[1]);
      }
    } else {
      html += `<strong>${escape(m[3])}</strong>`;
    }
    last = re.lastIndex;
  }
  return html + escape(text.slice(last));
}
