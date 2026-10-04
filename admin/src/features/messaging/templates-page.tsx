"use client";

import { ChevronRight, Lock, Mail, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";

import { Time } from "@/components/common/bits";
import { EmptyState, ErrorState, PageHeader, Section } from "@/components/common/page";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/controls";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input, NativeSelect } from "@/components/ui/input";
import { useCan } from "@/features/auth/session";
import { useAction } from "@/hooks/use-action";
import { api } from "@/lib/api/client";
import type { MailTemplate } from "@/lib/api/types";
import { P } from "@/lib/permissions";

import { messagingKeys, useTemplates } from "./api";

export function TemplatesPage() {
  const q = useTemplates();
  const [creating, setCreating] = React.useState(false);
  const system = q.data?.filter((t) => t.usage === "system") ?? [];
  const starters = q.data?.filter((t) => t.usage === "starter") ?? [];
  const can = useCan();

  return (
    <div>
      <PageHeader
        title="E-mail templates"
        description="The wording of every e-mail Vibe sends. Edit the text, see it exactly as people will, and send yourself a test. Everything shares one Vibe layout."
        actions={
          <>
            {can(P.OpsMessages) && (
              <Button asChild>
                <Link href="/messages/new">Write a message</Link>
              </Button>
            )}
            <Button variant="primary" onClick={() => setCreating(true)}>
              <Plus /> New template
            </Button>
          </>
        }
      />
      {q.error ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : q.isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-20" />
          <Skeleton className="h-40" />
        </div>
      ) : (
        <div className="space-y-6">
          <Section title="Sent automatically" description="Vibe sends these by itself. You can change the wording, not when they're sent.">
            <TemplateList items={system} />
          </Section>
          <Section title="Message templates" description="Starting points for messages you send from Messages. Pick one in the composer and adjust it before sending.">
            {starters.length ? (
              <TemplateList items={starters} />
            ) : (
              <Card>
                <EmptyState icon={Mail} title="No message templates" description="Create one to reuse wording you send often." />
              </Card>
            )}
          </Section>
        </div>
      )}
      {creating && <CreateTemplateDialog templates={q.data ?? []} onClose={() => setCreating(false)} />}
    </div>
  );
}

function TemplateList({ items }: { items: MailTemplate[] }) {
  return (
    <Card className="divide-y divide-line overflow-hidden">
      {items.map((t) => (
        <Link key={t.key} href={`/mail-templates/${t.key}`} className="group flex items-center gap-4 px-4 py-3.5 hover:bg-surface-2/60">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
            {t.usage === "system" ? <Lock className="size-4" /> : <Mail className="size-4" />}
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium text-text">{t.name}</span>
              {t.custom ? <Badge tone="info">Custom</Badge> : t.edited ? <Badge tone="warn">Edited</Badge> : <Badge>Default</Badge>}
            </span>
            <span className="block truncate text-xs text-muted">{t.description || t.subject}</span>
          </span>
          <span className="hidden min-w-0 max-w-xs flex-1 truncate text-sm text-text-2 md:block">“{t.subject}”</span>
          <span className="hidden w-28 text-right text-xs text-muted sm:block">{t.updatedAt ? <Time iso={t.updatedAt} /> : "Never changed"}</span>
          <ChevronRight className="size-4 text-muted transition-transform group-hover:translate-x-0.5" />
        </Link>
      ))}
    </Card>
  );
}

function CreateTemplateDialog({ templates, onClose }: { templates: MailTemplate[]; onClose: () => void }) {
  const router = useRouter();
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const starters = templates.filter((t) => t.usage === "starter");
  const [from, setFrom] = React.useState(starters[0]?.key ?? "");
  const create = useAction(
    () =>
      api.post<MailTemplate>("admin/mail-templates", {
        name: name.trim(),
        description: description.trim() || undefined,
        from: from || undefined,
      }),
    {
      success: "Template created",
      invalidate: [messagingKeys.templates, messagingKeys.starters],
      onSuccess: (t) => router.push(`/mail-templates/${t.key}`),
    },
  );
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        title="New message template"
        description="A reusable starting point for messages. You'll write the wording next."
        footer={
          <>
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" loading={create.isPending} disabled={name.trim().length < 2} onClick={() => create.mutate()}>
              Create and edit
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Name">
            <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="Weekend event" autoFocus />
          </Field>
          <Field label="What it's for" optional>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} maxLength={200} placeholder="Invite people to Saturday's live event" />
          </Field>
          <Field label="Start from">
            <NativeSelect value={from} onChange={(e) => setFrom(e.target.value)}>
              <option value="">Blank</option>
              {starters.map((t) => (
                <option key={t.key} value={t.key}>
                  {t.name}
                </option>
              ))}
            </NativeSelect>
          </Field>
        </div>
      </DialogContent>
    </Dialog>
  );
}
