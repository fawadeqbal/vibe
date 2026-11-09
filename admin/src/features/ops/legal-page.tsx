"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, RotateCcw } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import { Time } from "@/components/common/bits";
import { useConfirm } from "@/components/common/confirm";
import { ErrorState, PageHeader } from "@/components/common/page";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Skeleton, Tabs, TabsList, TabsTrigger } from "@/components/ui/controls";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { api } from "@/lib/api/client";

export interface LegalDoc {
  slug: "terms" | "privacy" | "guidelines" | "child-safety";
  title: string;
  summary: string;
  markdown: string;
  html: string;
  version: number;
  updatedAt: string;
  url: string;
}

const key = ["ops", "legal"] as const;
const SHORT: Record<LegalDoc["slug"], string> = { terms: "Terms", privacy: "Privacy", guidelines: "Guidelines", "child-safety": "Child safety" };

/**
 * Terms, Privacy Policy, Community Guidelines and Child Safety Standards:
 * the text the website shows at /terms/ … and the apps link to. Markdown,
 * previewed exactly as the site renders it; every save is a new version.
 */
export function LegalPage() {
  const q = useQuery({ queryKey: key, queryFn: ({ signal }) => api.get<LegalDoc[]>("admin/legal", undefined, signal) });
  const [tab, setTab] = React.useState<LegalDoc["slug"]>("terms");
  if (q.error) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  const doc = q.data?.find((d) => d.slug === tab);
  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <PageHeader
        title="Legal pages"
        description="What people agree to and read about safety and privacy. Changes go live on the website and in the apps right away. Have a lawyer review the text."
      />
      <Tabs value={tab} onValueChange={(v) => setTab(v as LegalDoc["slug"])}>
        <TabsList>
          {(q.data ?? []).map((d) => (
            <TabsTrigger key={d.slug} value={d.slug}>
              {SHORT[d.slug]}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      {q.isLoading || !doc ? <Skeleton className="h-[640px]" /> : <Editor key={`${doc.slug}:${doc.version}`} doc={doc} />}
    </div>
  );
}

function Editor({ doc }: { doc: LegalDoc }) {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [title, setTitle] = React.useState(doc.title);
  const [summary, setSummary] = React.useState(doc.summary);
  const [markdown, setMarkdown] = React.useState(doc.markdown);
  const [previewHtml, setPreviewHtml] = React.useState(doc.html);
  const html = markdown === doc.markdown ? doc.html : previewHtml;
  const [busy, setBusy] = React.useState(false);
  const dirty = title !== doc.title || summary !== doc.summary || markdown !== doc.markdown;

  // The preview is rendered by the server, exactly like the live page.
  React.useEffect(() => {
    if (markdown === doc.markdown) return;
    const t = setTimeout(() => {
      api
        .post<{ html: string }>("admin/legal/preview", { markdown })
        .then((r) => setPreviewHtml(r.html))
        .catch(() => {});
    }, 350);
    return () => clearTimeout(t);
  }, [markdown, doc.markdown]);

  const done = async (msg: string) => {
    toast.success(msg);
    await qc.invalidateQueries({ queryKey: key });
  };

  const save = async () => {
    const ok = await confirm({ title: `Publish ${doc.title}?`, description: "It goes live on the website and in the apps right away, as a new version.", confirmLabel: "Publish" });
    if (!ok) return;
    setBusy(true);
    try {
      await api.put(`admin/legal/${doc.slug}`, { title, summary, markdown });
      await done(`${title} published`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const reset = async () => {
    const ok = await confirm({ title: `Put back the original ${doc.title}?`, description: "Your edits are replaced by the text Vibe shipped with, as a new version.", confirmLabel: "Put back", tone: "danger" });
    if (!ok) return;
    setBusy(true);
    try {
      await api.post(`admin/legal/${doc.slug}/reset`, {});
      await done("Original text restored");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <Card>
        <CardHeader
          title={
            <span className="flex items-center gap-2">
              Edit <Badge tone="neutral">v{doc.version}</Badge>
              {dirty && <Badge tone="warn">Not published</Badge>}
            </span>
          }
          description={
            <>
              Last published <Time iso={doc.updatedAt} />
            </>
          }
          actions={
            <a href={doc.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
              Open live page <ExternalLink className="size-3" />
            </a>
          }
        />
        <CardBody className="space-y-4">
          <Field label="Title">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} />
          </Field>
          <Field label="One-line summary" hint="Shown under the title.">
            <Input value={summary} onChange={(e) => setSummary(e.target.value)} maxLength={300} />
          </Field>
          <Field label="Text" hint="## Heading · - bullet · 1. numbered · **bold** · [link](https://…) · > note · blank line = new paragraph">
            <Textarea value={markdown} onChange={(e) => setMarkdown(e.target.value)} className="h-[520px] font-mono text-xs leading-relaxed" spellCheck />
          </Field>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="primary" onClick={() => void save()} loading={busy} disabled={!dirty || markdown.trim().length < 20 || title.trim().length < 2}>
              Publish
            </Button>
            {dirty && (
              <Button
                variant="ghost"
                onClick={() => {
                  setTitle(doc.title);
                  setSummary(doc.summary);
                  setMarkdown(doc.markdown);
                }}
              >
                Discard changes
              </Button>
            )}
            <span className="flex-1" />
            <Button variant="danger-ghost" size="sm" onClick={() => void reset()} disabled={busy}>
              <RotateCcw /> Original text
            </Button>
          </div>
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Preview" description="Exactly as the website shows it." />
        <CardBody>
          <h1 className="text-xl font-semibold text-text">{title}</h1>
          {summary && <p className="mt-1 text-sm text-muted">{summary}</p>}
          <div className="legal-preview mt-4 max-h-[640px] overflow-y-auto pr-2" dangerouslySetInnerHTML={{ __html: html }} />
        </CardBody>
      </Card>
    </div>
  );
}
