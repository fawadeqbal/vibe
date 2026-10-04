"use client";

import { useQueryClient } from "@tanstack/react-query";
import { RotateCcw, Save, Send, Trash2, Undo2 } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";

import { Time } from "@/components/common/bits";
import { useConfirm } from "@/components/common/confirm";
import { ErrorState, PageHeader } from "@/components/common/page";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/controls";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useAction } from "@/hooks/use-action";
import { ApiError, api } from "@/lib/api/client";
import type { MailFields, MailTemplate } from "@/lib/api/types";

import { FIELD_KEYS, messagingKeys, pickFields, useTemplate, useTemplatePreview } from "./api";
import { EmailPreview } from "./email-preview";
import { MailFieldsEditor } from "./fields-editor";

export function TemplateEditor({ templateKey }: { templateKey: string }) {
  const q = useTemplate(templateKey);
  if (q.error) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (!q.data)
    return (
      <div className="grid gap-5 lg:grid-cols-2">
        <Skeleton className="h-[600px]" />
        <Skeleton className="h-[600px]" />
      </div>
    );
  // Remount on save/reset so the draft starts from the stored version.
  return <Editor key={`${q.data.key}:${q.data.updatedAt ?? "default"}`} tpl={q.data} />;
}

function Editor({ tpl }: { tpl: MailTemplate }) {
  const router = useRouter();
  const confirm = useConfirm();
  const qc = useQueryClient();
  const refresh = (keys: readonly (readonly unknown[])[]) => Promise.all(keys.map((queryKey) => qc.invalidateQueries({ queryKey })));
  const saved = React.useMemo(() => pickFields(tpl), [tpl]);
  const [draft, setDraft] = React.useState<MailFields>(saved);
  const [name, setName] = React.useState(tpl.name);
  const [description, setDescription] = React.useState(tpl.description);
  const preview = useTemplatePreview(draft, tpl.usage === "starter");

  const dirty = FIELD_KEYS.some((k) => draft[k] !== saved[k]) || (tpl.custom && (name !== tpl.name || description !== tpl.description));

  // Don't lose an unsaved edit to a stray reload or tab close.
  React.useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const invalidate = [messagingKeys.template(tpl.key), messagingKeys.templates, messagingKeys.starters];
  const save = useAction(
    () => {
      return api.put<MailTemplate>(`admin/mail-templates/${tpl.key}`, {
        ...draft,
        ...(tpl.custom ? { name: name.trim(), description: description.trim() } : {}),
      });
    },
    { success: "Template saved", invalidate },
  );
  // Explain validation problems next to the form; a toast disappears.
  const problem = React.useMemo(() => {
    const e = save.error;
    if (!(e instanceof ApiError)) return null;
    const d = e.details as { missing?: string[]; unknown?: string[] } | undefined;
    if (d?.missing?.length) return `This e-mail must include ${d.missing.map((m) => `{{${m}}}`).join(", ")}.`;
    if (d?.unknown?.length) return `Unknown placeholder ${d.unknown.map((m) => `{{${m}}}`).join(", ")} — use one from the list above.`;
    return e.message;
  }, [save.error]);

  const test = useAction(
    () =>
      api.post<{ sentTo: string }>(`admin/mail-templates/${tpl.key}/test`, {
        fields: draft,
      }),
    { success: (r) => `Test sent to ${r.sentTo}` },
  );

  const subjectMissing = !draft.subject.trim();
  // Messages have no highlight box (that's for codes in automatic e-mails).
  const fields = tpl.usage === "system" ? [...FIELD_KEYS] : FIELD_KEYS.filter((k) => k !== "highlight");

  return (
    <div>
      <PageHeader
        back={{ href: "/mail-templates", label: "E-mail templates" }}
        title={
          <span className="flex flex-wrap items-center gap-2">
            {tpl.custom ? name || "Untitled" : tpl.name}
            {tpl.usage === "system" ? <Badge tone="primary">Sent automatically</Badge> : <Badge tone="info">Message template</Badge>}
            {dirty && <Badge tone="warn">Unsaved</Badge>}
          </span>
        }
        description={tpl.custom ? undefined : tpl.description}
        actions={
          <>
            <Button onClick={() => test.mutate()} loading={test.isPending} disabled={subjectMissing}>
              <Send /> Send me a test
            </Button>
            {dirty && (
              <Button variant="ghost" onClick={() => setDraft(saved)}>
                <Undo2 /> Discard
              </Button>
            )}
            <Button variant="primary" onClick={() => save.mutate()} loading={save.isPending} disabled={!dirty || subjectMissing}>
              <Save /> Save
            </Button>
          </>
        }
      />
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="space-y-5">
          {tpl.custom && (
            <Card>
              <CardBody className="grid gap-4 sm:grid-cols-2">
                <Field label="Name">
                  <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
                </Field>
                <Field label="What it's for" optional>
                  <Input value={description} onChange={(e) => setDescription(e.target.value)} maxLength={200} />
                </Field>
              </CardBody>
            </Card>
          )}
          <Card>
            <CardHeader title="Wording" description="Type {{ to add a placeholder, or click one below. It's replaced for each person when sent." />
            <CardBody>
              <MailFieldsEditor
                value={draft}
                onChange={(v) => {
                  setDraft(v);
                  if (save.error) save.reset();
                }}
                variables={tpl.variables}
                required={tpl.required}
                fields={fields}
              />
              {problem && (
                <p role="alert" className="mt-4 rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">
                  {problem}
                </p>
              )}
            </CardBody>
          </Card>
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted">
            <span>
              {tpl.updatedAt ? (
                <>
                  Last changed <Time iso={tpl.updatedAt} />
                </>
              ) : (
                "Using Vibe's default wording"
              )}
            </span>
            {!tpl.custom && tpl.edited && (
              <Button
                size="sm"
                variant="ghost"
                className="ml-auto"
                onClick={() =>
                  void confirm({
                    title: "Go back to the default wording?",
                    description: "Your changes to this template are removed. E-mails sent from now on use Vibe's original text.",
                    confirmLabel: "Reset",
                    tone: "danger",
                    action: async () => {
                      await api.post(`admin/mail-templates/${tpl.key}/reset`);
                      toast.success("Back to default");
                      await refresh(invalidate);
                    },
                  })
                }
              >
                <RotateCcw /> Reset to default
              </Button>
            )}
            {tpl.custom && (
              <Button
                size="sm"
                variant="danger-ghost"
                className="ml-auto"
                onClick={() =>
                  void confirm({
                    title: `Delete “${tpl.name}”?`,
                    description: "Messages already sent aren't affected.",
                    confirmLabel: "Delete",
                    tone: "danger",
                    action: async () => {
                      await api.delete(`admin/mail-templates/${tpl.key}`);
                      toast.success("Template deleted");
                      await refresh([messagingKeys.templates, messagingKeys.starters]);
                      router.push("/mail-templates");
                    },
                  })
                }
              >
                <Trash2 /> Delete template
              </Button>
            )}
          </div>
        </div>
        <div className="lg:sticky lg:top-4">
          <EmailPreview rendered={preview.data} loading={preview.isFetching} preheader={draft.preheader} />
          <p className="mt-2 text-xs text-muted">
            Placeholders are filled with sample values here
            {tpl.usage === "starter" ? "; the real “Stop e-mail updates” link is added for each person" : ""}.
          </p>
        </div>
      </div>
    </div>
  );
}
