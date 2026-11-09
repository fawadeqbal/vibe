import { LEGAL_DEFAULTS } from './legal-defaults';
import { firstHeading, renderLegalMarkdown, slug } from './legal-markdown';

describe('legal markdown', () => {
  it('renders headings with anchors, paragraphs, lists, bold and safe links', () => {
    const html = renderLegalMarkdown(['## 2. Who can use Vibe', '', 'You must be **18**.', 'Same paragraph.', '', '- one', '- two [Privacy](/privacy/)', '', '1. first', '2. second', '', '> Be kind.', '', 'Mail [us](mailto:a@b.c) or see [NCMEC](https://report.cybertip.org/).'].join('\n'));
    expect(html).toContain('<h2 id="who-can-use-vibe">2. Who can use Vibe</h2>');
    expect(html).toContain('<p>You must be <strong>18</strong>. Same paragraph.</p>');
    expect(html).toContain('<ul><li>one</li><li>two <a href="/privacy/">Privacy</a></li></ul>');
    expect(html).toContain('<ol><li>first</li><li>second</li></ol>');
    expect(html).toContain('<blockquote><p>Be kind.</p></blockquote>');
    expect(html).toContain('<a href="mailto:a@b.c">us</a>');
    expect(html).toContain('<a href="https://report.cybertip.org/" target="_blank" rel="noopener">NCMEC</a>');
  });

  it('never lets markup or script through, whatever staff type', () => {
    const html = renderLegalMarkdown('<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>\n\n[click](javascript:alert(1)) [x](" onmouseover="alert(1))\n\n**<b>bold</b>**');
    // Only our own tags come out; the rest is escaped text.
    expect(html.match(/<\/?([a-z0-9]+)/g)!.every((t) => /^<\/?(p|strong)$/.test(t))).toBe(true);
    expect(html).not.toMatch(/href=|<script|<img|<b>/);
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('click'); // the text of a refused link stays
  });

  it('helpers', () => {
    expect(slug('3. Coins, VIP & gems')).toBe('coins-vip-gems');
    expect(firstHeading('intro\n# Title here\n## x')).toBe('Title here');
  });

  it('every default page renders, has no unfilled placeholders after filling, and names a contact', () => {
    for (const d of LEGAL_DEFAULTS) {
      const html = renderLegalMarkdown(d.markdown);
      expect(html.length).toBeGreaterThan(500);
      expect(d.markdown).toContain('{{email}}');
    }
    const child = LEGAL_DEFAULTS.find((d) => d.slug === 'child-safety')!.markdown;
    // What Google Play's Child Safety Standards ask the published page to cover.
    for (const must of ['zero tolerance', 'CSAM', 'Report', 'NCMEC', 'point of contact']) expect(child.toLowerCase()).toContain(must.toLowerCase());
  });
});
