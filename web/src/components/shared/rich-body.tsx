import { Fragment, type ReactNode } from "react";

const TOKEN = /\*\*(.+?)\*\*|\[([^\]]+)\]\(((?:https:\/\/|mailto:)[^)\s]+)\)/g;

/**
 * Message text with the same light formatting the e-mail uses: blank line =
 * paragraph, **bold**, [label](https://…) links.
 */
export function RichBody({ text }: { text: string }) {
  const parts: ReactNode[] = [];
  const t = text.trim();
  let at = 0;
  for (const m of t.matchAll(TOKEN)) {
    const i = m.index ?? 0;
    if (i > at) parts.push(t.slice(at, i));
    if (m[1] != null) parts.push(<strong key={i} className="font-semibold text-text">{m[1]}</strong>);
    else
      parts.push(
        <a key={i} href={m[3]} target="_blank" rel="noopener noreferrer" className="text-pink-soft underline decoration-pink-soft">
          {m[2]}
        </a>,
      );
    at = i + m[0].length;
  }
  if (at < t.length) parts.push(t.slice(at));
  return (
    <p className="type-body text-[14.5px] leading-[1.45] whitespace-pre-wrap text-text2">
      {parts.map((p, i) => (
        <Fragment key={i}>{p}</Fragment>
      ))}
    </p>
  );
}
