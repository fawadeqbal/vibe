"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import { Checkbox, Segmented } from "@/components/ui/controls";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Label } from "@/components/ui/field";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { useAction } from "@/hooks/use-action";
import { api } from "@/lib/api/client";
import type { UserDetail } from "@/lib/api/types";
import { format } from "@/lib/format";
import { newKey } from "@/lib/utils";

import { userKeys } from "./api";
import { COUNTRIES } from "./users-page";

interface DialogProps {
  user: UserDetail;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}

const invalidate = (id: string) => [userKeys.detail(id), userKeys.lists()];

const BAN_OPTIONS = [
  { hours: 1, label: "1 hour" },
  { hours: 24, label: "24 hours" },
  { hours: 72, label: "3 days" },
  { hours: 168, label: "7 days" },
  { hours: 720, label: "30 days" },
  { hours: 87_600, label: "Permanently" },
];

export function BanDialog({ user, open, onOpenChange }: DialogProps) {
  const [hours, setHours] = React.useState(24);
  const [reason, setReason] = React.useState("");
  const ban = useAction(() => api.post(`admin/users/${user.id}/ban`, { hours, reason }), { success: `${user.name} is banned`, invalidate: invalidate(user.id), onSuccess: () => onOpenChange(false) });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={`Ban ${user.name || "this user"}`}
        description="They're signed out at once, any live call ends, and they can't use Vibe until the ban ends."
        footer={
          <>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button variant="danger" loading={ban.isPending} disabled={reason.trim().length < 3} onClick={() => ban.mutate()}>
              Ban
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid gap-1.5">
            <Label>How long</Label>
            <div className="grid grid-cols-3 gap-1.5">
              {BAN_OPTIONS.map((o) => (
                <button
                  key={o.hours}
                  type="button"
                  onClick={() => setHours(o.hours)}
                  aria-pressed={hours === o.hours}
                  className="h-9 rounded-lg border border-line text-sm text-text-2 hover:border-line-strong aria-pressed:border-bad aria-pressed:bg-bad-soft aria-pressed:font-medium aria-pressed:text-bad"
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>
          <Field label="Reason" hint="Saved in the audit log.">
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} maxLength={200} placeholder="e.g. Nudity on camera, confirmed in report review" />
          </Field>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function EditProfileDialog({ user, open, onOpenChange }: DialogProps) {
  const [form, setForm] = React.useState({ name: user.name, age: user.age ?? 18, gender: user.gender, countryCode: user.countryCode, bio: user.bio, removeAvatar: false, reason: "" });
  const set = (p: Partial<typeof form>) => setForm((f) => ({ ...f, ...p }));
  const save = useAction(
    () =>
      api.patch(`admin/users/${user.id}`, {
        name: form.name !== user.name ? form.name : undefined,
        age: form.age !== user.age ? Number(form.age) : undefined,
        gender: form.gender !== user.gender ? form.gender : undefined,
        countryCode: form.countryCode !== user.countryCode ? form.countryCode : undefined,
        bio: form.bio !== user.bio ? form.bio : undefined,
        removeAvatar: form.removeAvatar || undefined,
        reason: form.reason,
      }),
    { success: "Profile updated", invalidate: invalidate(user.id), onSuccess: () => onOpenChange(false) },
  );
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="Edit profile"
        description="Fix what people see on this profile. The user isn't notified."
        footer={
          <>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button variant="primary" loading={save.isPending} disabled={form.reason.trim().length < 3 || form.name.trim().length < 1} onClick={() => save.mutate()}>
              Save
            </Button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" className="sm:col-span-2">
            <Input value={form.name} onChange={(e) => set({ name: e.target.value })} maxLength={40} />
          </Field>
          <Field label="Age">
            <Input type="number" min={18} max={100} value={form.age} onChange={(e) => set({ age: Number(e.target.value) })} />
          </Field>
          <Field label="Gender">
            <NativeSelect value={form.gender} onChange={(e) => set({ gender: e.target.value as typeof form.gender })}>
              {["FEMALE", "MALE", "OTHER"].map((g) => (
                <option key={g} value={g}>
                  {format.enum(g)}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Country">
            <NativeSelect value={form.countryCode} onChange={(e) => set({ countryCode: e.target.value })}>
              {[...new Set([form.countryCode, ...COUNTRIES])].map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Bio" className="sm:col-span-2">
            <Textarea value={form.bio} onChange={(e) => set({ bio: e.target.value })} maxLength={160} rows={2} />
          </Field>
          {user.avatarUrl && (
            <label className="flex items-start gap-2.5 text-sm sm:col-span-2">
              <Checkbox checked={form.removeAvatar} onCheckedChange={(v) => set({ removeAvatar: v === true })} className="mt-0.5" />
              <span>
                <span className="font-medium text-text">Remove profile photo</span>
                <span className="block text-xs text-muted">Also removes the verified badge, which depends on the photo.</span>
              </span>
            </label>
          )}
          <Field label="Reason" hint="Saved in the audit log." className="sm:col-span-2">
            <Input value={form.reason} onChange={(e) => set({ reason: e.target.value })} maxLength={200} placeholder="e.g. Offensive name reported" />
          </Field>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function WalletDialog({ user, open, onOpenChange }: DialogProps) {
  const [direction, setDirection] = React.useState<"credit" | "debit">("credit");
  const [coins, setCoins] = React.useState("");
  const [gems, setGems] = React.useState("");
  const [title, setTitle] = React.useState("Gift from the Vibe team");
  const [reason, setReason] = React.useState("");
  // One key per dialog: a double-click or retry can never pay twice.
  const [key] = React.useState(newKey);
  const sign = direction === "credit" ? 1 : -1;
  const c = Math.abs(Math.trunc(Number(coins) || 0));
  const g = Math.abs(Math.trunc(Number(gems) || 0));
  const adjust = useAction(() => api.post<{ coins: number; gems: number }>(`admin/users/${user.id}/wallet`, { coins: sign * c, gems: sign * g, title, reason, idempotencyKey: key }), {
    success: (r) => `Balance now ${format.number(r.coins)} coins · ${format.number(r.gems)} gems`,
    invalidate: [...invalidate(user.id), userKeys.sub(user.id, "ledger")],
    onSuccess: () => onOpenChange(false),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="Adjust balance"
        description={`Now ${format.number(user.wallet?.coins ?? 0)} coins and ${format.number(user.wallet?.gems ?? 0)} gems. Every change is a ledger entry.`}
        footer={
          <>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button variant={direction === "debit" ? "danger" : "primary"} loading={adjust.isPending} disabled={(!c && !g) || reason.trim().length < 3 || title.trim().length < 3} onClick={() => adjust.mutate()}>
              {direction === "credit" ? "Add" : "Take away"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Segmented
            value={direction}
            onChange={setDirection}
            options={[
              { value: "credit", label: "Add" },
              { value: "debit", label: "Take away" },
            ]}
          />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Coins">
              <Input type="number" min={0} inputMode="numeric" value={coins} onChange={(e) => setCoins(e.target.value)} placeholder="0" />
            </Field>
            <Field label="Gems">
              <Input type="number" min={0} inputMode="numeric" value={gems} onChange={(e) => setGems(e.target.value)} placeholder="0" />
            </Field>
          </div>
          <Field label="What the user sees" hint="Shown in their wallet history.">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} />
          </Field>
          <Field label="Internal reason" hint="Saved in the audit log, not shown to the user.">
            <Input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} placeholder="e.g. Ticket #1234, refund for failed match" />
          </Field>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function VipDialog({ user, open, onOpenChange }: DialogProps) {
  const [days, setDays] = React.useState(7);
  const [reason, setReason] = React.useState("");
  const grant = useAction(() => api.post(`admin/users/${user.id}/vip`, { days, reason }), { success: `VIP added for ${days} days`, invalidate: invalidate(user.id), onSuccess: () => onOpenChange(false) });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="Give VIP"
        description={user.vipUntil ? `Adds to their current VIP (ends ${format.date(user.vipUntil)}). No bonus coins, never renews.` : "Free VIP time. No bonus coins, never renews."}
        footer={
          <>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button variant="primary" loading={grant.isPending} disabled={reason.trim().length < 3 || days < 1} onClick={() => grant.mutate()}>
              Give VIP
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Segmented value={days} onChange={setDays} options={[3, 7, 30, 90].map((d) => ({ value: d, label: `${d} days` }))} />
          <Field label="Reason" hint="Saved in the audit log.">
            <Input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} placeholder="e.g. Creator partnership" />
          </Field>
        </div>
      </DialogContent>
    </Dialog>
  );
}
