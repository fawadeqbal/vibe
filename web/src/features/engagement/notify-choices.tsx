"use client";

import { useEffect, useState } from "react";

import { Icon } from "@/components/ui/icon";
import { GroupCard } from "@/components/ui/panel";
import { SectionTitle } from "@/components/ui/typography";
import { asMap } from "@/lib/api/mappers";
import { cn } from "@/lib/cn";
import { api } from "@/stores/services";
import { toast } from "@/stores/ui";

type Channel = "push" | "inApp" | "email";
interface Group {
  key: string;
  label: string;
  description: string;
  locked: boolean;
  push: boolean;
  inApp: boolean;
  email: boolean;
}

const CHANNELS: { key: Channel; label: string; icon: string }[] = [
  { key: "push", label: "Phone", icon: "notifications" },
  { key: "inApp", label: "Inbox", icon: "inbox" },
  { key: "email", label: "E-mail", icon: "mail_outline" },
];

const ICONS: Record<string, string> = { messages: "chat_bubble_outline", calls: "videocam", friends: "favorite_border", reminders: "alarm", money: "account_balance_wallet", team: "campaign", account: "shield" };

function toGroups(raw: unknown): Group[] {
  const list = (asMap(raw).groups ?? []) as Record<string, unknown>[];
  return list.map((g) => ({ key: String(g.key), label: String(g.label), description: String(g.description ?? ""), locked: !!g.locked, push: g.push !== false, inApp: g.inApp !== false, email: g.email !== false }));
}

/** Me → Notifications: what reaches you, per group, on the phone, in your inbox and by e-mail. */
export function NotifyChoices() {
  const [groups, setGroups] = useState<Group[] | null>(null);

  useEffect(() => {
    let live = true;
    api
      .get("/me/notifications")
      .then((r) => live && setGroups(toGroups(r)))
      .catch(() => live && setGroups([]));
    return () => {
      live = false;
    };
  }, []);

  const flip = async (g: Group, channel: Channel) => {
    const on = !g[channel];
    setGroups((gs) => gs?.map((x) => (x.key === g.key ? { ...x, [channel]: on } : x)) ?? gs);
    try {
      setGroups(toGroups(await api.put("/me/notifications", { group: g.key, channel, on })));
    } catch {
      setGroups((gs) => gs?.map((x) => (x.key === g.key ? { ...x, [channel]: !on } : x)) ?? gs);
      toast("Couldn't save that, try again", { error: true });
    }
  };

  if (groups && !groups.length) return null;
  return (
    <>
      <SectionTitle text="What we tell you" top={4} />
      <GroupCard className="mb-2.5">
        {(groups ?? []).map((g) => (
          <div key={g.key} className="px-4 py-3.5">
            <div className="flex items-center">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-[12px] bg-white/5">
                <Icon name={ICONS[g.key] ?? "notifications"} size={22} className="text-text2" />
              </span>
              <span className="ml-3.5 min-w-0 flex-1">
                <span className="type-title block text-[15px] font-semibold">{g.label}</span>
                <span className="type-body mt-px block text-[12px] text-text2">{g.description}</span>
              </span>
            </div>
            <div className="mt-2.5 flex gap-1.5 pl-[54px]">
              {CHANNELS.map((c) => {
                const on = g[c.key];
                return (
                  <button
                    key={c.key}
                    type="button"
                    role="switch"
                    aria-checked={on}
                    aria-label={`${g.label}: ${c.label}`}
                    disabled={g.locked}
                    onClick={() => void flip(g, c.key)}
                    className={cn(
                      "type-label flex h-8 items-center gap-1 rounded-full border px-3 text-[12px] transition-colors",
                      on ? "border-trust/40 bg-trust/12 text-trust" : "border-line-soft text-muted",
                      g.locked && "opacity-60",
                    )}
                  >
                    <Icon name={on ? "check" : c.icon} size={15} />
                    {c.label}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
        {!groups ? <div className="h-40" /> : null}
      </GroupCard>
    </>
  );
}
