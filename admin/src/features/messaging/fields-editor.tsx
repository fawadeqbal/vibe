"use client";

import { Braces } from "lucide-react";
import * as React from "react";

import { Tooltip } from "@/components/ui/controls";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import type { MailFields, TemplateVariable } from "@/lib/api/types";

type Key = keyof MailFields;

const LABELS: Record<
  Key,
  {
    label: string;
    hint?: string;
    long?: boolean;
    max: number;
    placeholder?: string;
  }
> = {
  subject: {
    label: "Subject",
    max: 200,
    placeholder: "What people see in their inbox",
  },
  preheader: {
    label: "Preview text",
    hint: "Grey line after the subject in most inboxes.",
    max: 200,
  },
  heading: { label: "Heading", max: 200, placeholder: "Hi {{name}}," },
  body: {
    label: "Message",
    hint: "Blank line = new paragraph · **bold** · [link text](https://…)",
    long: true,
    max: 5000,
  },
  highlight: {
    label: "Highlight box",
    hint: "Big centred text, e.g. a code.",
    max: 100,
  },
  buttonLabel: {
    label: "Button text",
    hint: "Leave empty for no button.",
    max: 60,
  },
  buttonUrl: { label: "Button link", max: 500, placeholder: "https://" },
  footer: { label: "Small print", max: 500, long: true },
};

/**
 * Edits the structured parts of an e-mail. Placeholder chips insert
 * {{variables}} at the cursor of whichever field was last focused.
 * Used by the template editor and the message composer.
 */
export function MailFieldsEditor({
  value,
  onChange,
  variables,
  fields = ["subject", "preheader", "heading", "body", "highlight", "buttonLabel", "buttonUrl", "footer"],
  required = [],
  disabled,
}: {
  value: MailFields;
  onChange: (v: MailFields) => void;
  variables: TemplateVariable[];
  fields?: Key[];
  required?: string[];
  disabled?: boolean;
}) {
  const refs = React.useRef<Partial<Record<Key, HTMLInputElement | HTMLTextAreaElement | null>>>({});
  const [focused, setFocused] = React.useState<Key>("body");
  const valueRef = React.useRef(value);
  React.useEffect(() => {
    valueRef.current = value;
  }, [value]);

  const insert = (name: string) => {
    const el = refs.current[focused];
    const token = `{{${name}}}`;
    const current = valueRef.current[focused] ?? "";
    const start = el?.selectionStart ?? current.length;
    const end = el?.selectionEnd ?? current.length;
    onChange({
      ...valueRef.current,
      [focused]: current.slice(0, start) + token + current.slice(end),
    });
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + token.length, start + token.length);
    });
  };

  const used = new Set(Object.values(value).flatMap((v) => [...String(v).matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((m) => m[1])));

  return (
    <div className="space-y-4">
      {variables.length > 0 && (
        <div className="rounded-lg border border-line bg-surface-2/60 px-3 py-2.5">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted">
            <Braces className="size-3.5" /> Insert into <span className="text-text">{LABELS[focused].label.toLowerCase()}</span>
          </p>
          <div className="flex flex-wrap gap-1.5">
            {variables.map((v) => (
              <Tooltip key={v.name} content={`${v.description} — e.g. “${v.sample}”`}>
                <button
                  type="button"
                  disabled={disabled}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => insert(v.name)}
                  className="rounded-md border border-line bg-surface px-1.5 py-0.5 font-mono text-xs text-text-2 hover:border-primary/50 hover:text-primary disabled:opacity-50"
                >
                  {`{{${v.name}}}`}
                  {required.includes(v.name) && !used.has(v.name) && <span className="ml-1 text-bad">required</span>}
                </button>
              </Tooltip>
            ))}
          </div>
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        {fields.map((k) => {
          const meta = LABELS[k];
          const common = {
            value: value[k],
            disabled,
            maxLength: meta.max,
            placeholder: meta.placeholder,
            onFocus: () => setFocused(k),
            onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange({ ...value, [k]: e.target.value }),
          };
          const wide = meta.long || k === "subject" || k === "heading" || k === "preheader";
          return (
            <Field key={k} label={meta.label} hint={meta.hint} className={wide ? "sm:col-span-2" : undefined} optional={!["subject", "body"].includes(k)}>
              {meta.long ? <Textarea ref={(el) => void (refs.current[k] = el)} rows={k === "body" ? 7 : 2} {...common} /> : <Input ref={(el) => void (refs.current[k] = el)} {...common} />}
            </Field>
          );
        })}
      </div>
    </div>
  );
}
