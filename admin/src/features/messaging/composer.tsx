"use client";

import { useQuery } from "@tanstack/react-query";
import { Bell, Globe2, Loader2, Mail, Search, Send, ShieldAlert, SlidersHorizontal, UserPlus, Users, X } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import * as React from "react";

import { UserCell } from "@/components/common/bits";
import { useConfirm } from "@/components/common/confirm";
import { PageHeader } from "@/components/common/page";
import { FilterMulti } from "@/components/data-table/filters";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Avatar, Skeleton, Switch, Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/controls";
import { Field } from "@/components/ui/field";
import { Input, NativeSelect } from "@/components/ui/input";
import { COUNTRIES } from "@/features/users/users-page";
import { useDebounced } from "@/hooks/use-url-state";
import { api } from "@/lib/api/client";
import type { Campaign, CampaignAudience, MailFields, MailTemplate, Page, PersonRef, Segment, TemplateVariable, UserDetail, UserSummary } from "@/lib/api/types";
import { flag, format } from "@/lib/format";
import { cn } from "@/lib/utils";

import { pickFields, useAudience, useMessagePreview, useStarters } from "./api";
import { EmailPreview, InAppPreview } from "./email-preview";
import { MailFieldsEditor } from "./fields-editor";

type Content = Omit<MailFields, "highlight">;
type Picked = Pick<PersonRef, "id" | "name" | "avatarUrl" | "verified" | "countryCode"> & { email?: string | null };

const CONTENT_KEYS = ["subject", "preheader", "heading", "body", "buttonLabel", "buttonUrl", "footer"] as const;
const EMPTY: Content = {
  subject: "",
  preheader: "",
  heading: "Hi {{name}},",
  body: "",
  buttonLabel: "",
  buttonUrl: "",
  footer: "",
};
const MAX_PICKED = 1000;
/** Big sends need the person to type SEND first. */
const BIG = 1000;
const FALLBACK_VARS: TemplateVariable[] = [
  { name: "name", description: "Their display name", sample: "Sara" },
  {
    name: "email",
    description: "Their e-mail address",
    sample: "sara@example.com",
  },
  { name: "appName", description: "The app's name", sample: "Vibe" },
];

const toContent = (t: Partial<MailFields>): Content => {
  const f = pickFields(t);
  return Object.fromEntries(CONTENT_KEYS.map((k) => [k, f[k]])) as Content;
};

/**
 * Write and send a message: who gets it, how (e-mail / in-app), what it
 * says — with the real rendered e-mail and in-app card side by side.
 * `?to=id,id` pre-picks people (from a profile or the users list);
 * `?copy=<messageId>` starts from an earlier message.
 */
export function Composer() {
  const params = useSearchParams();
  const to = React.useMemo(() => (params.get("to") ?? "").split(",").filter(Boolean).slice(0, 100), [params]);
  const copyId = params.get("copy");

  const prefill = useQuery({
    queryKey: ["messaging", "compose-prefill", to.join(","), copyId],
    queryFn: async () => {
      const copy = copyId ? await api.get<Campaign>(`admin/messages/${copyId}`) : null;
      const people = to.length ? await Promise.all(to.map((id) => api.get<UserDetail>(`admin/users/${id}`).catch(() => null))) : [];
      return { copy, people: people.filter((p): p is UserDetail => !!p) };
    },
    enabled: !!copyId || to.length > 0,
    staleTime: Infinity,
    gcTime: 0,
  });

  if ((copyId || to.length) && !prefill.data && !prefill.error) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-14" />
        <Skeleton className="h-[600px]" />
      </div>
    );
  }
  return <ComposerForm copy={prefill.data?.copy ?? null} people={prefill.data?.people ?? []} />;
}

function ComposerForm({ copy, people }: { copy: Campaign | null; people: Picked[] }) {
  const router = useRouter();
  const confirm = useConfirm();
  const starters = useStarters();

  const [audience, setAudience] = React.useState<CampaignAudience>(copy?.audience ?? (people.length ? "USERS" : "USERS"));
  const [picked, setPicked] = React.useState<Picked[]>(copy?.picked?.length ? copy.picked : people);
  const [segment, setSegment] = React.useState<Segment>(copy?.segment ?? {});
  const [sendEmail, setSendEmail] = React.useState(copy?.sendEmail ?? true);
  const [sendInApp, setSendInApp] = React.useState(copy?.sendInApp ?? true);
  const [important, setImportant] = React.useState(copy?.important ?? false);
  const [templateKey, setTemplateKey] = React.useState<string>(copy?.templateKey ?? "");
  const [content, setContent] = React.useState<Content>(copy ? toContent(copy) : EMPTY);
  const [name, setName] = React.useState(copy ? `${copy.name} (again)`.slice(0, 120) : "");
  const [sending, setSending] = React.useState(false);

  // Start from the general template when writing from scratch — unless
  // they've already started typing before the templates arrived.
  const touched = React.useRef(!!copy);
  React.useEffect(() => {
    if (touched.current || !starters.data?.length) return;
    touched.current = true;
    const first = starters.data.find((t) => t.key === "general_message") ?? starters.data[0];
    setTemplateKey(first.key);
    setContent(toContent(first));
  }, [starters.data]);

  const spec = React.useMemo(() => {
    if (audience === "USERS") return picked.length ? { audience, userIds: picked.map((p) => p.id), important } : null;
    if (audience === "SEGMENT") return { audience, segment, important };
    return { audience, important };
  }, [audience, picked, segment, important]);
  const counts = useAudience(spec);
  const c = spec ? counts.data : undefined;

  const previewUser = (audience === "USERS" ? picked[0]?.id : undefined) ?? c?.sample[0]?.id;
  const preview = useMessagePreview(content, previewUser);
  const variables = starters.data?.find((t) => t.key === templateKey)?.variables.filter((v) => v.name !== "unsubscribeUrl") ?? FALLBACK_VARS;

  const pickTemplate = async (key: string) => {
    const t = starters.data?.find((s) => s.key === key);
    const changed = CONTENT_KEYS.some((k) => content[k] !== (starters.data?.find((s) => s.key === templateKey)?.[k] ?? EMPTY[k]));
    if (
      changed &&
      !(await confirm({
        title: "Replace what you've written?",
        description: "The wording is replaced with the template's.",
        confirmLabel: "Replace",
      }))
    )
      return;
    setTemplateKey(key);
    setContent(t ? toContent(t) : { ...EMPTY, heading: "" });
  };

  const reach = c ? (sendEmail && sendInApp ? c.total : sendEmail ? c.email : c.inApp) : 0;
  const problems = [
    !sendEmail && !sendInApp && "Choose e-mail, in-app, or both.",
    audience === "USERS" && !picked.length && "Pick at least one person.",
    c && c.total === 0 && "Nobody matches — change who it goes to.",
    !content.subject.trim() && "Add a subject.",
    !content.body.trim() && "Write the message.",
    content.buttonLabel.trim() && !/^(https:\/\/|mailto:)/.test(content.buttonUrl.trim()) && "The button needs a link starting with https://",
  ].filter(Boolean) as string[];

  const send = () => {
    if (!c) return;
    const finalName = (name.trim() || content.subject.trim()).slice(0, 120);
    const who = audience === "ALL" ? "everyone on Vibe" : audience === "SEGMENT" ? "the filtered group" : picked.length === 1 ? picked[0].name : `${picked.length} people`;
    const how = [sendInApp && `${format.number(c.inApp)} in the app`, sendEmail && `${format.number(c.email)} by e-mail`].filter(Boolean).join(" and ");
    void confirm({
      title: `Send to ${who}?`,
      description: (
        <>
          {how}. It can&apos;t be unsent, but you can stop it while it&apos;s going out.
          {sendEmail && c.email > 400 && <span className="mt-2 block text-warn">Gmail sends about 500 e-mails a day from one account. Large sends are paced and may take a while.</span>}
        </>
      ),
      confirmLabel: "Send now",
      typeToConfirm: audience === "ALL" || c.total >= BIG ? "SEND" : undefined,
      action: async () => {
        setSending(true);
        try {
          const created = await api.post<Campaign>("admin/messages", {
            name: finalName.length >= 2 ? finalName : "Message",
            sendEmail,
            sendInApp,
            important,
            audience,
            userIds: audience === "USERS" ? picked.map((p) => p.id) : undefined,
            segment: audience === "SEGMENT" ? segment : undefined,
            templateKey: templateKey || undefined,
            ...content,
          });
          router.push(`/messages/${created.id}`);
        } finally {
          setSending(false);
        }
      },
    });
  };

  return (
    <div>
      <PageHeader back={{ href: "/messages", label: "Messages" }} title={copy ? "Send again" : "New message"} description="Choose who gets it and how, write it, check the preview, send." />
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="space-y-5">
          {/* 1 — who */}
          <Card>
            <CardHeader title="1 · Who gets it" />
            <CardBody className="space-y-4">
              <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Audience">
                <AudienceOption icon={UserPlus} active={audience === "USERS"} onClick={() => setAudience("USERS")} title="Picked people" sub="One or a few" />
                <AudienceOption icon={SlidersHorizontal} active={audience === "SEGMENT"} onClick={() => setAudience("SEGMENT")} title="Filtered group" sub="VIP, country, activity…" />
                <AudienceOption icon={Globe2} active={audience === "ALL"} onClick={() => setAudience("ALL")} title="Everyone" sub="All active users" />
              </div>
              {audience === "USERS" && <PeoplePicker picked={picked} onChange={setPicked} />}
              {audience === "SEGMENT" && <SegmentBuilder value={segment} onChange={setSegment} />}
              <AudienceSummary counts={c} loading={counts.isFetching} sendEmail={sendEmail} sendInApp={sendInApp} important={important} />
            </CardBody>
          </Card>

          {/* 2 — how */}
          <Card>
            <CardHeader title="2 · How" />
            <CardBody className="space-y-3">
              <ToggleRow icon={Bell} label="In the app" sub="Appears in their “Messages from Vibe” inbox, with a banner if they're online." checked={sendInApp} onChange={setSendInApp} />
              <ToggleRow icon={Mail} label="By e-mail" sub="Uses the Vibe e-mail layout, with a “Stop e-mail updates” link." checked={sendEmail} onChange={setSendEmail} />
              {sendEmail && (
                <ToggleRow
                  icon={ShieldAlert}
                  label="Important service message"
                  sub="Also e-mails people who turned off updates, and leaves out the unsubscribe link. Only for account, safety or legal notices — never promotions."
                  checked={important}
                  onChange={setImportant}
                  tone="warn"
                />
              )}
            </CardBody>
          </Card>

          {/* 3 — what */}
          <Card>
            <CardHeader
              title="3 · What it says"
              actions={
                <NativeSelect aria-label="Template" value={templateKey} onChange={(e) => void pickTemplate(e.target.value)} className="h-8 w-48 text-xs">
                  <option value="">Blank</option>
                  {(starters.data ?? []).map((t: MailTemplate) => (
                    <option key={t.key} value={t.key}>
                      {t.name}
                    </option>
                  ))}
                </NativeSelect>
              }
            />
            <CardBody className="space-y-4">
              <MailFieldsEditor
                value={{ ...content, highlight: "" }}
                onChange={(v) => {
                  touched.current = true;
                  setContent(toContent(v));
                }}
                variables={variables}
                fields={[...CONTENT_KEYS]}
              />
              <Field label="Name in the list" optional hint="Only staff see this. Defaults to the subject.">
                <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} placeholder={content.subject || "October event invite"} />
              </Field>
            </CardBody>
          </Card>
        </div>

        {/* Preview + send */}
        <div className="space-y-4 xl:sticky xl:top-4">
          <Tabs defaultValue={sendEmail ? "email" : "app"} key={`${sendEmail}${sendInApp}`}>
            <TabsList>
              {sendEmail && <TabsTrigger value="email">E-mail</TabsTrigger>}
              {sendInApp && <TabsTrigger value="app">In-app</TabsTrigger>}
            </TabsList>
            <div className="pt-3">
              <TabsContent value="email">
                <EmailPreview rendered={preview.data?.email} loading={preview.isFetching} preheader={content.preheader} />
              </TabsContent>
              <TabsContent value="app">
                <InAppPreview message={preview.data?.inApp} />
              </TabsContent>
            </div>
          </Tabs>
          <p className="text-xs text-muted">{previewUser ? "Shown with the first recipient's details." : "Shown with sample details."}</p>
          <Card>
            <CardBody className="flex flex-wrap items-center gap-3">
              <div className="min-w-0 flex-1 text-sm">
                {problems.length ? (
                  <p className="text-muted">{problems[0]}</p>
                ) : (
                  <p className="text-text-2">
                    Ready to reach <span className="font-semibold text-text">{format.number(reach)}</span> {reach === 1 ? "person" : "people"}.
                  </p>
                )}
              </div>
              <Button variant="primary" size="lg" disabled={!!problems.length || !c || sending} loading={sending} onClick={send}>
                <Send /> Send
              </Button>
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}

function AudienceOption({ icon: Icon, title, sub, active, onClick }: { icon: typeof Users; title: string; sub: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className={cn(
        "flex items-center gap-3 rounded-lg border p-3 text-left transition-colors",
        active ? "border-primary bg-primary-soft/60 ring-1 ring-primary/30" : "border-line hover:bg-surface-2",
      )}
    >
      <Icon className={cn("size-4 shrink-0", active ? "text-primary" : "text-muted")} />
      <span>
        <span className="block text-sm font-medium text-text">{title}</span>
        <span className="block text-xs text-muted">{sub}</span>
      </span>
    </button>
  );
}

function ToggleRow({ icon: Icon, label, sub, checked, onChange, tone }: { icon: typeof Users; label: string; sub: string; checked: boolean; onChange: (v: boolean) => void; tone?: "warn" }) {
  const id = React.useId();
  return (
    <div className={cn("flex items-start gap-3 rounded-lg border border-line p-3", tone === "warn" && checked && "border-warn/50 bg-warn-soft/40")}>
      <Icon className={cn("mt-0.5 size-4 shrink-0", tone === "warn" ? "text-warn" : "text-muted")} />
      <label htmlFor={id} className="min-w-0 flex-1 cursor-pointer">
        <span className="block text-sm font-medium text-text">{label}</span>
        <span className="block text-xs text-muted">{sub}</span>
      </label>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

function AudienceSummary({
  counts,
  loading,
  sendEmail,
  sendInApp,
  important,
}: {
  counts?: {
    total: number;
    inApp: number;
    email: number;
    noEmail: number;
    optedOut: number;
  };
  loading: boolean;
  sendEmail: boolean;
  sendInApp: boolean;
  important: boolean;
}) {
  if (!counts) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-1 rounded-lg bg-surface-2/60 px-3 py-2.5 text-sm">
      <span className="flex items-center gap-1.5 font-medium text-text">
        {loading ? <Loader2 className="size-3.5 animate-spin text-muted" /> : <Users className="size-3.5 text-muted" />}
        {format.number(counts.total)} {counts.total === 1 ? "person" : "people"}
      </span>
      {sendInApp && <span className="text-text-2">{format.number(counts.inApp)} in-app</span>}
      {sendEmail && <span className="text-text-2">{format.number(counts.email)} by e-mail</span>}
      {sendEmail && counts.noEmail > 0 && <span className="text-xs text-muted">{format.number(counts.noEmail)} have no e-mail</span>}
      {sendEmail && !important && counts.optedOut > 0 && <span className="text-xs text-muted">{format.number(counts.optedOut)} turned off e-mail updates</span>}
    </div>
  );
}

function PeoplePicker({ picked, onChange }: { picked: Picked[]; onChange: (p: Picked[]) => void }) {
  const [q, setQ] = React.useState("");
  const [open, setOpen] = React.useState(false);
  const debounced = useDebounced(q.trim(), 250);
  const results = useQuery({
    queryKey: ["messaging", "people-search", debounced],
    queryFn: ({ signal }) => api.get<Page<UserSummary>>("admin/users", { q: debounced, limit: 8 }, signal),
    enabled: debounced.length >= 2,
    placeholderData: (prev) => prev,
  });
  const ids = new Set(picked.map((p) => p.id));
  const add = (u: UserSummary) => {
    if (ids.has(u.id) || picked.length >= MAX_PICKED) return;
    onChange([
      ...picked,
      {
        id: u.id,
        name: u.name,
        avatarUrl: u.avatarUrl,
        verified: u.verified,
        countryCode: u.countryCode,
        email: u.email,
      },
    ]);
    setQ("");
  };
  const items = debounced.length >= 2 ? (results.data?.items ?? []) : [];

  return (
    <div className="space-y-3">
      <div className="relative">
        <Input
          leading={<Search className="size-4" />}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && items[0]) {
              e.preventDefault();
              add(items[0]);
            }
          }}
          placeholder="Search by name, e-mail or user id"
          aria-label="Find people"
          role="combobox"
          aria-expanded={open && items.length > 0}
        />
        {open && debounced.length >= 2 && (
          <div className="absolute inset-x-0 top-full z-20 mt-1 max-h-72 overflow-y-auto rounded-lg border border-line bg-surface p-1 shadow-pop" role="listbox">
            {results.isFetching && !items.length ? (
              <p className="px-3 py-2 text-sm text-muted">Searching…</p>
            ) : !items.length ? (
              <p className="px-3 py-2 text-sm text-muted">Nobody found</p>
            ) : (
              items.map((u) => (
                <button
                  key={u.id}
                  type="button"
                  role="option"
                  aria-selected={ids.has(u.id)}
                  disabled={ids.has(u.id)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => add(u)}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-surface-2 disabled:opacity-50"
                >
                  <UserCell user={u} size={26} link={false} sub={u.email ?? "No e-mail"} />
                  {ids.has(u.id) && <span className="ml-auto text-xs text-muted">Added</span>}
                  {u.status === "DELETED" && <Badge className="ml-auto">Deleted</Badge>}
                </button>
              ))
            )}
          </div>
        )}
      </div>
      {picked.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {picked.map((p) => (
            <span key={p.id} className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface py-0.5 pr-1 pl-0.5 text-sm">
              <Avatar src={p.avatarUrl} name={p.name || "?"} size={22} />
              <span className="max-w-40 truncate">{p.name || "No name"}</span>
              {p.countryCode && <span className="text-xs">{flag(p.countryCode)}</span>}
              <button
                type="button"
                onClick={() => onChange(picked.filter((x) => x.id !== p.id))}
                className="rounded-full p-0.5 text-muted hover:bg-surface-2 hover:text-text"
                aria-label={`Remove ${p.name}`}
              >
                <X className="size-3.5" />
              </button>
            </span>
          ))}
          {picked.length > 1 && (
            <Button size="xs" variant="ghost" onClick={() => onChange([])}>
              Clear all
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

const yesNo = (v: boolean | undefined) => (v === undefined ? "" : v ? "yes" : "no");
const fromYesNo = (v: string) => (v === "" ? undefined : v === "yes");

function SegmentBuilder({ value, onChange }: { value: Segment; onChange: (s: Segment) => void }) {
  const set = (patch: Partial<Segment>) => {
    const next: Segment = { ...value, ...patch };
    for (const k of Object.keys(next) as (keyof Segment)[]) if (next[k] === undefined || next[k] === "" || (Array.isArray(next[k]) && !(next[k] as unknown[]).length)) delete next[k];
    onChange(next);
  };
  const day = (iso?: string) => (iso ? iso.slice(0, 10) : "");
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <Field label="VIP">
        <NativeSelect value={yesNo(value.vip)} onChange={(e) => set({ vip: fromYesNo(e.target.value) })}>
          <option value="">Anyone</option>
          <option value="yes">VIP only</option>
          <option value="no">Not VIP</option>
        </NativeSelect>
      </Field>
      <Field label="Gender">
        <NativeSelect value={value.gender ?? ""} onChange={(e) => set({ gender: (e.target.value || undefined) as Segment["gender"] })}>
          <option value="">Anyone</option>
          <option value="FEMALE">Women</option>
          <option value="MALE">Men</option>
          <option value="OTHER">Other</option>
        </NativeSelect>
      </Field>
      <Field label="Verified">
        <NativeSelect value={yesNo(value.verified)} onChange={(e) => set({ verified: fromYesNo(e.target.value) })}>
          <option value="">Anyone</option>
          <option value="yes">Verified</option>
          <option value="no">Not verified</option>
        </NativeSelect>
      </Field>
      <Field label="Last active">
        <NativeSelect
          value={String(value.activeWithinDays ?? "")}
          onChange={(e) =>
            set({
              activeWithinDays: e.target.value ? Number(e.target.value) : undefined,
            })
          }
        >
          <option value="">Any time</option>
          <option value="1">Today</option>
          <option value="7">Last 7 days</option>
          <option value="30">Last 30 days</option>
          <option value="90">Last 90 days</option>
        </NativeSelect>
      </Field>
      <Field label="Joined after" optional>
        <Input
          type="date"
          value={day(value.joinedAfter)}
          onChange={(e) =>
            set({
              joinedAfter: e.target.value ? new Date(`${e.target.value}T00:00:00Z`).toISOString() : undefined,
            })
          }
        />
      </Field>
      <Field label="Joined before" optional>
        <Input
          type="date"
          value={day(value.joinedBefore)}
          onChange={(e) =>
            set({
              joinedBefore: e.target.value ? new Date(`${e.target.value}T00:00:00Z`).toISOString() : undefined,
            })
          }
        />
      </Field>
      <div className="sm:col-span-3">
        <p className="mb-1.5 text-sm font-medium text-text">Countries</p>
        <FilterMulti
          label="Countries"
          value={value.countries ?? []}
          onChange={(countries) => set({ countries })}
          options={COUNTRIES.map((cc) => ({
            value: cc,
            label: `${flag(cc)} ${cc}`,
          }))}
        />
      </div>
    </div>
  );
}
