/**
 * Renders a structured e-mail (subject, heading, body, optional highlight
 * box and button, footer) into one branded, e-mail-client-safe layout plus
 * a plain-text version. Staff edit wording, never HTML, so a template can't
 * break the layout or inject markup.
 *
 * Text supports:
 *  - {{variable}} placeholders (HTML-escaped when inserted)
 *  - blank line = new paragraph, single line break = <br>
 *  - **bold** and [link text](https://…)
 */

export interface MailFields {
  subject: string;
  preheader?: string;
  heading: string;
  body: string;
  highlight?: string;
  buttonLabel?: string;
  buttonUrl?: string;
  footer?: string;
}

export interface RenderedMail {
  subject: string;
  html: string;
  text: string;
  /** Placeholders used in the template that had no value. */
  missing: string[];
}

export type MailVars = Record<string, string | number | null | undefined>;

const VAR = /\{\{\s*([a-zA-Z][a-zA-Z0-9_]*)\s*\}\}/g;

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** Every {{name}} used across the fields, in order of first use. */
export function variablesIn(fields: Partial<MailFields>): string[] {
  const seen = new Set<string>();
  for (const v of Object.values(fields)) {
    if (typeof v !== 'string') continue;
    for (const m of v.matchAll(VAR)) seen.add(m[1]);
  }
  return [...seen];
}

function fill(text: string, vars: MailVars, missing: Set<string>): string {
  return text.replace(VAR, (_, name: string) => {
    const v = vars[name];
    if (v === undefined || v === null || v === '') {
      missing.add(name);
      return '';
    }
    return String(v);
  });
}

const SAFE_URL = /^(https?:\/\/|mailto:)/i;

/** Escaped text → HTML with paragraphs, line breaks, bold and safe links. */
function richText(text: string, style: string): string {
  const inline = (s: string) =>
    escapeHtml(s)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, label: string, url: string) => {
        const raw = url.replace(/&amp;/g, '&');
        return SAFE_URL.test(raw) ? `<a href="${escapeHtml(raw)}" style="color:#7c3aed;text-decoration:underline">${label}</a>` : m;
      })
      .replace(/\n/g, '<br>');
  return text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p style="${style}">${inline(p)}</p>`)
    .join('\n');
}

const plain = (s: string) => s.replace(/\*\*(.+?)\*\*/g, '$1').replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '$1 ($2)');

export function renderMail(fields: MailFields, vars: MailVars, opts: { unsubscribeUrl?: string } = {}): RenderedMail {
  const missing = new Set<string>();
  const all: MailVars = { appName: 'Vibe', year: new Date().getFullYear(), ...vars, ...(opts.unsubscribeUrl ? { unsubscribeUrl: opts.unsubscribeUrl } : {}) };
  const f = (s: string | undefined) => fill(s ?? '', all, missing);

  const subject = f(fields.subject).replace(/\s+/g, ' ').trim();
  const preheader = f(fields.preheader);
  const heading = f(fields.heading);
  const body = f(fields.body);
  const highlight = f(fields.highlight).trim();
  const buttonLabel = f(fields.buttonLabel).trim();
  const buttonUrl = f(fields.buttonUrl).trim();
  const footer = f(fields.footer);
  const button = buttonLabel && SAFE_URL.test(buttonUrl) ? { label: buttonLabel, url: buttonUrl } : null;

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <meta name="color-scheme" content="light">
    <title>${escapeHtml(subject)}</title>
  </head>
  <body style="margin:0;padding:0;background:#f4f3f7;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#16151c">
    ${preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(preheader)}</div>` : ''}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px">
      <tr><td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:16px;padding:32px">
          <tr><td>
            <div style="width:40px;height:40px;border-radius:12px;background:#7c3aed;background-image:linear-gradient(135deg,#ec4899,#7c3aed);color:#ffffff;font-weight:700;font-size:20px;line-height:40px;text-align:center">V</div>
            ${heading ? `<h1 style="font-size:22px;line-height:1.3;margin:24px 0 12px;color:#16151c">${escapeHtml(heading)}</h1>` : '<div style="height:16px"></div>'}
            ${richText(body, 'font-size:15px;line-height:1.6;color:#4a4857;margin:0 0 16px')}
            ${highlight ? `<div style="font-size:${highlight.length <= 8 ? 36 : 22}px;font-weight:700;letter-spacing:${highlight.length <= 8 ? 12 : 1}px;text-align:center;background:#f1ebfe;color:#5b21b6;border-radius:12px;padding:18px 12px;margin:8px 0 16px">${escapeHtml(highlight)}</div>` : ''}
            ${button ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 16px"><tr><td style="border-radius:10px;background:#7c3aed"><a href="${escapeHtml(button.url)}" style="display:inline-block;padding:12px 22px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none">${escapeHtml(button.label)}</a></td></tr></table>` : ''}
            ${footer.trim() ? richText(footer, 'font-size:13px;line-height:1.5;color:#74727f;margin:16px 0 0') : ''}
          </td></tr>
        </table>
        <p style="font-size:12px;line-height:1.5;color:#9a98a6;margin:16px 0 0;max-width:480px">
          ${all.email ? `Sent to ${escapeHtml(String(all.email))} by Vibe.` : 'Sent by Vibe.'}
          ${opts.unsubscribeUrl ? `<br><a href="${escapeHtml(opts.unsubscribeUrl)}" style="color:#9a98a6">Stop e-mail updates</a>` : ''}
        </p>
      </td></tr>
    </table>
  </body>
</html>`;

  const text = [
    heading,
    '',
    plain(body).trim(),
    highlight ? `\n${highlight}\n` : '',
    button ? `${button.label}: ${button.url}\n` : '',
    plain(footer).trim(),
    opts.unsubscribeUrl ? `\nStop e-mail updates: ${opts.unsubscribeUrl}` : '',
  ]
    .filter((l, i, a) => !(l === '' && a[i - 1] === ''))
    .join('\n')
    .trim();

  return { subject, html, text, missing: [...missing] };
}
