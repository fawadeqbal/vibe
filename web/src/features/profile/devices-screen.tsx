"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { Screen } from "@/components/layout/screen";
import { confirm } from "@/components/shared/dialogs";
import { GhostButton } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { EmptyState } from "@/components/ui/misc";
import { AppBar } from "@/components/ui/page-header";
import { GroupCard } from "@/components/ui/panel";
import { Spinner } from "@/components/ui/spinner";
import { asList, asMap } from "@/lib/api/mappers";
import { errorMessage } from "@/lib/api/errors";
import { alpha, color } from "@/lib/colors";
import { ago, date } from "@/lib/format";
import { api } from "@/stores/services";
import { useSession } from "@/stores/session";
import { toast } from "@/stores/ui";

interface DeviceSession {
  id: string;
  client: "android" | "ios" | "web";
  device: string;
  signedInAt: Date;
  lastActiveAt: Date;
  current: boolean;
}

const parse = (m: Record<string, unknown>): DeviceSession => ({
  id: String(m.id ?? ""),
  client: m.client === "android" || m.client === "ios" ? m.client : "web",
  device: String(m.device ?? "Unknown device"),
  signedInAt: new Date(String(m.signedInAt ?? "")),
  lastActiveAt: new Date(String(m.lastActiveAt ?? "")),
  current: m.current === true,
});

const KIND: Record<DeviceSession["client"], string> = { android: "Android app", ios: "iPhone app", web: "Website" };

/**
 * Settings → Devices: every phone and browser you're signed in on, this one
 * first. Sign one out (it goes back to sign-in straight away), or every
 * other one at once — for a lost phone or a shared computer.
 */
export function DevicesScreen() {
  const router = useRouter();
  const [items, setItems] = useState<DeviceSession[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setItems(asList(await api.get("/me/sessions")).map((e) => parse(asMap(e))));
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, []);
  useEffect(() => {
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, [load]);

  const signOut = async (d: DeviceSession) => {
    if (!(await confirm({ title: `Sign out ${d.device}?`, body: "It goes back to the sign-in screen right away. You can sign in there again any time.", ok: "Sign out", okTone: "bad" }))) return;
    setBusy(d.id);
    try {
      await api.delete(`/me/sessions/${encodeURIComponent(d.id)}`);
      setItems((s) => s?.filter((x) => x.id !== d.id) ?? s);
      toast(`Signed out ${d.device}`);
    } catch (e) {
      toast(errorMessage(e), { error: true });
      void load();
    } finally {
      setBusy(null);
    }
  };

  const others = items?.filter((d) => !d.current) ?? [];
  const signOutOthers = async () => {
    if (!(await confirm({ title: "Sign out every other device?", body: `${others.length} ${others.length === 1 ? "device goes" : "devices go"} back to sign-in. This one stays signed in.`, ok: "Sign out all", okTone: "bad" }))) return;
    setBusy("others");
    try {
      await api.post("/me/sessions/sign-out-others", {});
      setItems((s) => s?.filter((x) => x.current) ?? s);
      toast("Signed out of every other device");
    } catch (e) {
      toast(errorMessage(e), { error: true });
    } finally {
      setBusy(null);
    }
  };

  return (
    <Screen header={<AppBar title="Devices" onBack={() => (history.length > 1 ? router.back() : router.push("/me/settings/account"))} />} bodyClassName="pt-2">
      <p className="type-body mb-3 px-1 text-[13.5px] leading-[1.5] text-text2">Where you&apos;re signed in to Vibe. Don&apos;t recognise one? Sign it out.</p>
      {items == null ? (
        failed ? (
          <EmptyState icon="wifi_off" title="Couldn’t load your devices" body="Check your connection and try again." />
        ) : (
          <div className="flex justify-center py-12">
            <Spinner size={24} stroke={3} />
          </div>
        )
      ) : !items.length ? (
        <EmptyState icon="devices" title="No devices" body="Sign in on your phone or a browser and it shows here." />
      ) : (
        <GroupCard>
          {items.map((d) => (
            <DeviceRow key={d.id} d={d} busy={busy === d.id} onSignOut={() => void signOut(d)} onLogOut={() => void useSession.getState().signOut()} />
          ))}
        </GroupCard>
      )}
      {others.length > 0 ? (
        <div className="mt-4">
          <GhostButton label="Sign out of all other devices" icon="logout" height={46} expand disabled={busy === "others"} className="text-bad" onClick={() => void signOutOthers()} />
        </div>
      ) : null}
    </Screen>
  );
}

function DeviceRow({ d, busy, onSignOut, onLogOut }: { d: DeviceSession; busy: boolean; onSignOut: () => void; onLogOut: () => void }) {
  const tone = d.client === "web" ? "lavender" : "pink-soft";
  return (
    <div className="flex items-center gap-3 px-4 py-3.5">
      <span className="flex size-11 shrink-0 items-center justify-center rounded-[14px]" style={{ backgroundColor: alpha(tone, 0.14) }}>
        <Icon name={d.client === "web" ? "laptop" : "smartphone"} size={22} style={{ color: color(tone) }} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="type-title line-clamp-2 block text-[15px] leading-[1.3] break-words">
          {d.device}
          {d.current ? <span className="type-label ml-2 inline-block rounded-full bg-ok/14 px-2 py-0.5 align-[1px] text-[11px] font-bold text-ok">This device</span> : null}
        </span>
        <span className="type-body block truncate text-[12.5px] text-text2">
          {KIND[d.client]} · {d.current ? "Active now" : `Active ${ago(d.lastActiveAt)}`}
        </span>
        <span className="type-body block text-[12px] text-muted">Signed in {date(d.signedInAt)}</span>
      </span>
      {d.current ? (
        <button type="button" onClick={onLogOut} className="type-label shrink-0 rounded-full px-3 py-1.5 text-[13px] text-text2 hover:bg-white/6 hover:text-text">
          Log out
        </button>
      ) : (
        <GhostButton label={busy ? "Signing out…" : "Sign out"} height={34} disabled={busy} className="shrink-0 px-3 text-bad [&>span]:text-[13px]" onClick={onSignOut} />
      )}
    </div>
  );
}
