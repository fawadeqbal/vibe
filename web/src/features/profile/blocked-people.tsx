"use client";

import { useEffect, useState } from "react";

import { confirm } from "@/components/shared/dialogs";
import { Avatar } from "@/components/ui/avatar";
import { GhostButton } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/misc";
import { errorMessage } from "@/lib/api/errors";
import { asList, asMap, profile as mapProfile } from "@/lib/api/mappers";
import { ago } from "@/lib/format";
import type { Profile } from "@/lib/models";
import { api } from "@/stores/services";
import { useSocial } from "@/stores/social";
import { openSheet, toast } from "@/stores/ui";

export interface BlockedPerson {
  profile: Profile;
  blockedAt: Date | null;
}

export const openBlockedPeople = () => openSheet<void>(() => <BlockedPeople />);

/** Me → Safety → Blocked people: who you blocked, and Unblock for each. */
export function BlockedPeople() {
  const [people, setPeople] = useState<BlockedPerson[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const fetchPeople = () =>
    api.get("/blocks").then(
      (r) => {
        const list = asList(r).map((e) => {
          const m = asMap(e);
          return { profile: mapProfile(m), blockedAt: typeof m.blockedAt === "string" ? new Date(m.blockedAt) : null };
        });
        setPeople(list);
        useSocial.setState({ blocked: list.map((p) => p.profile.id) });
      },
      (e: unknown) => setError(errorMessage(e)),
    );
  const load = () => {
    setError(null);
    void fetchPeople();
  };

  useEffect(() => {
    void fetchPeople();
  }, []);

  const unblock = async (b: BlockedPerson) => {
    const name = b.profile.name || "this person";
    const ok = await confirm({
      title: `Unblock ${name}?`,
      body: "You can meet again in Match and Discover, and they can send you a friend request. We won't tell them.",
      ok: "Unblock",
    });
    if (!ok) return;
    setBusy(b.profile.id);
    try {
      await useSocial.getState().unblock(b.profile.id);
      setPeople((p) => p?.filter((x) => x.profile.id !== b.profile.id) ?? null);
      toast(`${name} is unblocked`);
    } catch (e) {
      toast(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-col px-5 pt-2.5 pb-5">
      <h2 className="type-title-lg text-[22px]">Blocked people</h2>
      {error ? (
        <EmptyState icon="cloud_off" title="Couldn't load " accent="the list" body={error} action={<GhostButton label="Try again" icon="refresh" onClick={load} />} />
      ) : people == null ? (
        <div className="mt-4 flex flex-col gap-2" aria-busy="true">
          {[0, 1].map((i) => (
            <span key={i} className="h-[64px] animate-pulse rounded-[18px] bg-surface2" />
          ))}
        </div>
      ) : people.length === 0 ? (
        <EmptyState icon="block" title="Nobody " accent="blocked" body="People you block show up here. You can unblock them any time." />
      ) : (
        <>
          <p className="type-body mt-1.5 text-[13px] leading-[1.45] text-text2">They can&apos;t match with you, find you in Discover or message you. Unblocking doesn&apos;t tell them.</p>
          <ul className="mt-4 flex flex-col gap-2">
            {people.map((b) => (
              <li key={b.profile.id} className="flex items-center gap-3 rounded-[18px] bg-surface2 py-2.5 pr-2 pl-3">
                <Avatar url={b.profile.avatarUrl} name={b.profile.name} size={44} />
                <span className="min-w-0 flex-1">
                  <span className="type-title block truncate text-[15px] font-semibold">{b.profile.name || "Someone"}</span>
                  {b.blockedAt ? <span className="type-body block text-[12px] text-text2">Blocked {ago(b.blockedAt)}</span> : null}
                </span>
                <GhostButton label="Unblock" height={38} disabled={busy === b.profile.id} onClick={() => void unblock(b)} aria-label={`Unblock ${b.profile.name}`} />
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
