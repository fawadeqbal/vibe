"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Plus, RotateCcw, X } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import { Time } from "@/components/common/bits";
import { useConfirm } from "@/components/common/confirm";
import { ErrorState, PageHeader } from "@/components/common/page";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Skeleton, Switch } from "@/components/ui/controls";
import { Input, NativeSelect } from "@/components/ui/input";
import { SearchPicker } from "@/components/ui/search-select";
import { meKey } from "@/features/auth/session";
import { api } from "@/lib/api/client";
import type { RegionRefusals, Setting } from "@/lib/api/types";
import { allCountryOptions, countryName } from "@/lib/countries";
import { flag } from "@/lib/format";
import { cn } from "@/lib/utils";

const key = ["ops", "settings"] as const;

/** Settings that change risky behaviour ask for confirmation first. */
const CONFIRM: Record<string, (v: unknown) => string | null> = {
  "maintenance.enabled": (v) => (v ? "Everyone using the app is paused right now. Only staff can work." : null),
  "signups.enabled": (v) => (!v ? "New people can't create accounts until you turn this back on." : null),
  "matching.enabled": (v) => (!v ? "Nobody can start a new video match until you turn this back on." : null),
  "payouts.paused": (v) => (v ? "Every new cash-out waits for someone to approve it." : null),
  "security.require2fa": (v) => (v ? "Staff without two-factor must set it up before they can use the panel." : null),
  "region.blockEnabled": (v) => (!v ? "People in the blocked countries can sign up, sign in and match again." : null),
  "payments.localMethodsInStoreApps": (v) => (v ? "Store builds will offer JazzCash, Easypaisa, card and bank too. Google Play and the App Store may reject or remove the app for this." : null),
};

/** Readable names for `select` values; unknown values show as they are. */
const OPTION_LABELS: Record<string, string> = { off: "Off", monetag: "Monetag", admob: "Google AdMob" };

/**
 * Runtime settings, rendered from the API's own list (type, label, help),
 * so a new setting on the server shows up here without frontend work.
 */
export function SettingsPage() {
  const q = useQuery({ queryKey: key, queryFn: ({ signal }) => api.get<Setting[]>("admin/settings", undefined, signal) });
  if (q.error) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  const groups = Object.entries(
    (q.data ?? []).reduce<Record<string, Setting[]>>((acc, s) => {
      (acc[s.group] ??= []).push(s);
      return acc;
    }, {}),
  );
  const maintenance = q.data?.find((s) => s.key === "maintenance.enabled")?.value === true;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Settings" description="Changes apply to every server within seconds and are recorded in the audit log." />
      {maintenance && (
        <div className="mb-5 flex items-center gap-3 rounded-xl border border-warn/40 bg-warn-soft px-4 py-3 text-sm text-warn">
          <AlertTriangle className="size-4 shrink-0" />
          Maintenance mode is on — the app is paused for everyone.
        </div>
      )}
      {q.isLoading ? (
        <Skeleton className="h-96" />
      ) : (
        <div className="space-y-5">
          {groups.map(([group, items]) => (
            <Card key={group}>
              <CardHeader title={group} />
              <ul className="divide-y divide-line">
                {items.map((s) => (
                  <SettingRow key={s.key} setting={s} />
                ))}
              </ul>
              {group === "Region" && <RegionStats />}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function SettingRow({ setting: s }: { setting: Setting }) {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [draft, setDraft] = React.useState(String(s.value));
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset the draft when the server value changes
    setDraft(String(s.value));
  }, [s.value]);

  const save = async (value: unknown) => {
    const warning = CONFIRM[s.key]?.(value);
    if (warning && !(await confirm({ title: `${s.label}?`, description: warning, confirmLabel: "Yes, change it", tone: "danger" }))) return;
    setBusy(true);
    try {
      await api.put(`admin/settings/${s.key}`, { value });
      toast.success(`${s.label} updated`);
      await qc.invalidateQueries({ queryKey: key });
      if (s.key === "security.require2fa") await qc.invalidateQueries({ queryKey: meKey });
    } catch (e) {
      toast.error((e as Error).message);
      setDraft(String(s.value));
    } finally {
      setBusy(false);
    }
  };

  const changed = s.type !== "boolean" && s.type !== "select" && s.type !== "countries" && draft !== String(s.value);
  const isDefault = s.type === "countries" ? sameList(s.value, s.default) : String(s.value) === String(s.default);

  return (
    <li className={cn("flex flex-col gap-3 px-4 py-4", s.type !== "countries" && "sm:flex-row sm:items-center")}>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 text-sm font-medium text-text">
          {s.label}
          {!isDefault && <Badge tone="primary">Changed</Badge>}
        </p>
        <p className="mt-0.5 text-xs text-muted">{s.description}</p>
        {s.updatedAt && (
          <p className="mt-1 text-[11px] text-muted">
            Last changed <Time iso={s.updatedAt} />
          </p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {s.type === "countries" ? (
          <CountryList value={Array.isArray(s.value) ? s.value : []} label={s.label} busy={busy} onChange={(v) => void save(v)} />
        ) : s.type === "boolean" ? (
          <Switch checked={s.value === true} disabled={busy} onCheckedChange={(v) => void save(v)} aria-label={s.label} />
        ) : s.type === "select" ? (
          <NativeSelect value={String(s.value)} disabled={busy} onChange={(e) => void save(e.target.value)} className="w-44" aria-label={s.label}>
            {(s.options ?? []).map((o) => (
              <option key={o} value={o}>
                {OPTION_LABELS[o] ?? o}
              </option>
            ))}
          </NativeSelect>
        ) : (
          <form
            className="flex items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void save(s.type === "number" ? Number(draft) : draft);
            }}
          >
            <Input type={s.type === "number" ? "number" : "text"} step={s.type === "number" ? "any" : undefined} value={draft} onChange={(e) => setDraft(e.target.value)} className={cn(s.type === "number" ? "w-28" : "w-64")} aria-label={s.label} />
            {changed && (
              <Button type="submit" size="sm" variant="primary" loading={busy}>
                Save
              </Button>
            )}
          </form>
        )}
        {!isDefault && (
          <Button size="icon-xs" variant="ghost" aria-label="Reset to default" title={`Default: ${Array.isArray(s.default) ? s.default.join(", ") || "none" : (OPTION_LABELS[String(s.default)] ?? (String(s.default) || "empty"))}`} onClick={() => void save(s.default)} disabled={busy}>
            <RotateCcw />
          </Button>
        )}
      </div>
    </li>
  );
}

const sameList = (a: Setting["value"], b: Setting["default"]) => Array.isArray(a) && Array.isArray(b) && [...a].sort().join() === [...b].sort().join();

/** A list of countries: chips to remove, a searchable picker to add. Each change saves. */
function CountryList({ value, label, busy, onChange }: { value: string[]; label: string; busy: boolean; onChange: (v: string[]) => void }) {
  const options = React.useMemo(() => allCountryOptions(undefined), []);
  const toggle = (code: string) => onChange(value.includes(code) ? value.filter((c) => c !== code) : [...value, code].sort());
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {value.length === 0 && <span className="text-xs text-muted">None — every country can use Vibe.</span>}
      {value.map((code) => (
        <span key={code} className="inline-flex h-7 items-center gap-1.5 rounded-full border border-line bg-surface-2 pr-1 pl-2.5 text-xs text-text">
          <span>{flag(code)}</span>
          {countryName(code)}
          <button type="button" disabled={busy} onClick={() => toggle(code)} aria-label={`Remove ${countryName(code)}`} className="grid size-5 place-items-center rounded-full text-muted hover:bg-surface hover:text-text disabled:opacity-50">
            <X className="size-3" />
          </button>
        </span>
      ))}
      <SearchPicker
        multi
        label={label}
        options={options}
        selected={value}
        onPick={toggle}
        placeholder="Search countries…"
        trigger={
          <Button size="sm" variant="ghost" disabled={busy}>
            <Plus />
            Add country
          </Button>
        }
      />
    </div>
  );
}

const PLACE_LABELS: Record<string, string> = { api: "app & website", socket: "live connection", profile: "profile country", phone: "phone number", payout: "payout account", card: "card" };

/** What still reaches the API from blocked countries (Cloudflare stops most of it first). */
function RegionStats() {
  const q = useQuery({ queryKey: ["ops", "region-refusals"], queryFn: ({ signal }) => api.get<RegionRefusals>("admin/region/refusals", undefined, signal), refetchInterval: 60_000 });
  const r = q.data;
  return (
    <div className="border-t border-line px-4 py-3 text-xs text-muted">
      {!r ? (
        <Skeleton className="h-4 w-56" />
      ) : r.total === 0 ? (
        <>Nothing refused in the last {r.days} days.</>
      ) : (
        <div className="space-y-1.5">
          <p>
            <span className="font-medium text-text tabular">{r.total.toLocaleString("en-US")}</span> refused in the last {r.days} days (requests that got past Cloudflare):
          </p>
          <ul className="flex flex-wrap gap-x-4 gap-y-1">
            {r.countries.map((c) => (
              <li key={c.country} title={Object.entries(c.places).map(([p, n]) => `${PLACE_LABELS[p] ?? p}: ${n}`).join(" · ")}>
                {flag(c.country)} {countryName(c.country)} <span className="text-text tabular">{c.total.toLocaleString("en-US")}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
