import { Fragment, type ReactNode } from "react";

import { Cta } from "@/components/cta";
import { Icon } from "@/components/icon";
import type { Block } from "@/content/types";
import { isExternal, site } from "@/lib/site";

/** `[text](href)` and `**bold**` → React nodes. */
export function Inline({ text }: { text: string }) {
  const out: ReactNode[] = [];
  const re = /\[([^\]]+)\]\(([^)]+)\)|\*\*([^*]+)\*\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[1] !== undefined) {
      const href = m[2];
      out.push(
        <a key={k++} href={href} {...(isExternal(href) ? { target: "_blank", rel: "noopener" } : {})}>
          {m[1]}
        </a>,
      );
    } else {
      out.push(<strong key={k++}>{m[3]}</strong>);
    }
    last = re.lastIndex;
  }
  if (last < text.length) out.push(text.slice(last));
  return <>{out}</>;
}

/** "How it works" → "how-it-works", for heading anchors. */
export const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/\*\*|\[|\]\([^)]*\)/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

export function Prose({ blocks }: { blocks: Block[] }) {
  return (
    <div className="prose-site">
      {blocks.map((b, i) => (
        <Fragment key={i}>{renderBlock(b)}</Fragment>
      ))}
    </div>
  );
}

function renderBlock(b: Block) {
  if ("p" in b) return <p><Inline text={b.p} /></p>;
  if ("h2" in b) return <h2 id={slugify(b.h2)}><Inline text={b.h2} /></h2>;
  if ("h3" in b) return <h3><Inline text={b.h3} /></h3>;
  if ("ul" in b)
    return (
      <ul>
        {b.ul.map((li, i) => <li key={i}><Inline text={li} /></li>)}
      </ul>
    );
  if ("ol" in b)
    return (
      <ol>
        {b.ol.map((li, i) => <li key={i}><Inline text={li} /></li>)}
      </ol>
    );
  if ("table" in b)
    return (
      <div className="table-wrap">
        <table>
          {b.table.caption && <caption>{b.table.caption}</caption>}
          <thead>
            <tr>{b.table.head.map((h) => <th key={h} scope="col">{h}</th>)}</tr>
          </thead>
          <tbody>
            {b.table.rows.map((r, i) => (
              <tr key={i}>{r.map((c, j) => (j === 0 ? <th key={j} scope="row"><Inline text={c} /></th> : <td key={j}><Inline text={c} /></td>))}</tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  if ("note" in b)
    return (
      <aside className="note">
        <Icon name="verified_user" size={20} className="mt-0.5 shrink-0 text-trust" />
        <p><Inline text={b.note} /></p>
      </aside>
    );
  return (
    <aside className="not-prose my-10 rounded-[28px] border border-pink/22 bg-[linear-gradient(170deg,#1a1222_0%,#12101a_70%)] p-7">
      <p className="text-lg font-semibold tracking-[-0.3px]">{b.cta.title}</p>
      <p className="mt-2 text-sm leading-[1.6] text-text2">{b.cta.body}</p>
      <div className="mt-5 flex flex-wrap gap-3">
        <Cta href={site.links.webApp} size="md">
          <Icon name="videocam" size={18} />
          Start video chat — free
        </Cta>
        <Cta href={site.links.android} variant="outline" size="md">
          <Icon name="android" size={17} />
          Get the Android app
        </Cta>
      </div>
    </aside>
  );
}

/** Number of words in the article body. */
export function wordCount(blocks: Block[]) {
  const text = blocks
    .map((b) => ("p" in b ? b.p : "h2" in b ? b.h2 : "h3" in b ? b.h3 : "ul" in b ? b.ul.join(" ") : "ol" in b ? b.ol.join(" ") : "note" in b ? b.note : "table" in b ? b.table.rows.flat().join(" ") : `${b.cta.title} ${b.cta.body}`))
    .join(" ")
    .replace(/\]\([^)]*\)/g, " ");
  return text.split(/\s+/).filter(Boolean).length;
}

/** Rough reading time: 220 words a minute, min 1. */
export const readingMinutes = (blocks: Block[]) => Math.max(1, Math.round(wordCount(blocks) / 220));
