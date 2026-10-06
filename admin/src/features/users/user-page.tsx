"use client";

import { useQueryClient } from "@tanstack/react-query";
import { BadgeCheck, Ban, Coins as CoinsIcon, Crown, LogOut, Mail, MoreHorizontal, Pencil, Send, ShieldOff, Trash2, Undo2 } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";

import { Coins, Gems, IdChip, Time, UserCell } from "@/components/common/bits";
import { useConfirm } from "@/components/common/confirm";
import { DescriptionList, ErrorState, PageHeader } from "@/components/common/page";
import { StatusBadge } from "@/components/common/status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Avatar, Skeleton, Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/controls";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { useCan } from "@/features/auth/session";
import { UserReferralsTab } from "@/features/growth/user-referrals";
import { api } from "@/lib/api/client";
import type { UserDetail } from "@/lib/api/types";
import { flag, format } from "@/lib/format";
import { P } from "@/lib/permissions";

import { useUser, userKeys } from "./api";
import { BanDialog, EditProfileDialog, VipDialog, WalletDialog } from "./user-dialogs";
import { AuditTab, CashoutsTab, LedgerTab, MatchesTab, NotesTab, PurchasesTab, ReportsTab } from "./user-tabs";

export function UserPage({ id }: { id: string }) {
  const q = useUser(id);
  if (q.error) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (!q.data) return <Skeleton className="h-96" />;
  return <UserView user={q.data} />;
}

function UserView({ user }: { user: UserDetail }) {
  const can = useCan();
  const deleted = user.status === "DELETED";
  const tabs = [
    { id: "matches", label: "Matches", count: user.counts.matches, show: true },
    { id: "wallet", label: "Wallet", show: can(P.WalletView) },
    { id: "reports", label: "Reports", count: user.counts.reportsGot, show: can(P.ModerationView) },
    { id: "purchases", label: "Purchases", count: user.counts.purchases, show: can(P.FinanceView) },
    { id: "cashouts", label: "Cash-outs", show: can(P.FinanceView) },
    { id: "referrals", label: "Referrals", count: user.counts.invitees || undefined, show: true },
    { id: "notes", label: "Notes", show: can(P.UsersNotes) },
    { id: "audit", label: "History", show: can(P.AuditView) },
  ].filter((t) => t.show);

  return (
    <div>
      <PageHeader
        back={{ href: "/users", label: "Users" }}
        title={
          <span className="flex items-center gap-3">
            <Avatar src={user.avatarUrl} name={user.name || "?"} size={44} />
            <span className="min-w-0">
              <span className="flex items-center gap-1.5">
                {user.name || "No name"}
                {user.verified && <BadgeCheck className="size-5 text-trust" aria-label="Verified" />}
              </span>
              <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs font-normal text-muted">
                <IdChip id={user.id} label="User id" />
                {user.online ? <Badge tone="ok" dot>Online{user.inCall ? " · in a call" : ""}</Badge> : <span>Last active <Time iso={user.lastSeenAt} /></span>}
              </span>
            </span>
          </span>
        }
        actions={!deleted && <UserActions user={user} />}
      >
        <div className="mt-3 flex flex-wrap gap-1.5">
          {deleted && <StatusBadge status="DELETED" />}
          {user.bannedUntil && (
            <Badge tone="bad">
              <Ban /> Banned until {format.dateTime(user.bannedUntil)}
            </Badge>
          )}
          {user.vipUntil && (
            <Badge tone="money">
              <Crown /> VIP until {format.date(user.vipUntil)}
            </Badge>
          )}
          {user.counts.openReports > 0 && <Badge tone="warn">{user.counts.openReports} open reports</Badge>}
          {user.isBot && <Badge>Dev bot</Badge>}
        </div>
      </PageHeader>

      <div className="grid gap-5 xl:grid-cols-[1fr_340px]">
        <div className="min-w-0 space-y-5">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Mini label="Coins" value={<Coins value={user.wallet?.coins ?? 0} />} />
            <Mini label="Gems" value={<Gems value={user.wallet?.gems ?? 0} />} />
            <Mini label="Spent" value={format.usd(user.money.spentUsd)} />
            <Mini label="Cashed out" value={format.usd(user.money.cashedOutUsd)} />
          </div>
          <Tabs defaultValue={tabs[0]?.id}>
            <TabsList>
              {tabs.map((t) => (
                <TabsTrigger key={t.id} value={t.id} count={t.count}>
                  {t.label}
                </TabsTrigger>
              ))}
            </TabsList>
            <div className="pt-4">
              <TabsContent value="matches">
                <MatchesTab userId={user.id} />
              </TabsContent>
              <TabsContent value="wallet">
                <LedgerTab userId={user.id} />
              </TabsContent>
              <TabsContent value="reports">
                <ReportsTab userId={user.id} />
              </TabsContent>
              <TabsContent value="purchases">
                <PurchasesTab userId={user.id} />
              </TabsContent>
              <TabsContent value="cashouts">
                <CashoutsTab userId={user.id} />
              </TabsContent>
              <TabsContent value="referrals">
                <UserReferralsTab userId={user.id} />
              </TabsContent>
              <TabsContent value="notes">
                <NotesTab userId={user.id} />
              </TabsContent>
              <TabsContent value="audit">
                <AuditTab userId={user.id} />
              </TabsContent>
            </div>
          </Tabs>
        </div>

        <aside className="space-y-5">
          <Card>
            <CardHeader title="Profile" />
            <CardBody className="space-y-4">
              <DescriptionList
                columns={2}
                items={[
                  { label: "Age", value: user.age ?? "—" },
                  { label: "Gender", value: format.enum(user.gender) },
                  { label: "Country", value: `${flag(user.countryCode)} ${user.countryCode}` },
                  { label: "Verified", value: user.verified ? <Time iso={user.verifiedAt} mode="date" /> : "No" },
                  { label: "Joined", value: <Time iso={user.createdAt} mode="date" /> },
                  { label: "Onboarded", value: user.onboardedAt ? <Time iso={user.onboardedAt} mode="date" /> : "Not yet" },
                ]}
              />
              {user.bio && <p className="rounded-lg bg-surface-2 px-3 py-2 text-sm text-text-2">{user.bio}</p>}
              {user.interests.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {user.interests.map((i) => (
                    <Badge key={i} tone="outline">
                      {i}
                    </Badge>
                  ))}
                </div>
              )}
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Account" />
            <CardBody>
              <DescriptionList
                columns={1}
                items={[
                  {
                    label: "Signs in with",
                    value: (
                      <span className="flex flex-wrap gap-1">
                        {user.signIn.email && (
                          <Badge tone="outline">
                            <Mail /> {user.signIn.email}
                          </Badge>
                        )}
                        {user.signIn.google && <Badge tone="outline">Google</Badge>}
                        {user.signIn.apple && <Badge tone="outline">Apple</Badge>}
                        {user.signIn.facebook && <Badge tone="outline">Facebook</Badge>}
                        {!user.signIn.email && !user.signIn.google && !user.signIn.apple && !user.signIn.facebook && "—"}
                      </span>
                    ),
                  },
                  { label: "Invite code", value: <span className="font-mono">{user.inviteCode}</span> },
                  { label: "Invited by", value: user.invitedBy ? <UserCell user={user.invitedBy} size={22} /> : "—" },
                  { label: "Invited", value: `${format.number(user.counts.invitees)} people` },
                  { label: "Active sessions", value: `${user.sessions.length} device${user.sessions.length === 1 ? "" : "s"}` },
                ]}
              />
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Social & safety" />
            <CardBody>
              <DescriptionList
                columns={2}
                items={[
                  { label: "Friends", value: format.number(user.counts.friends) },
                  { label: "Likes received", value: format.number(user.counts.likes) },
                  { label: "Reported", value: `${user.counts.reportsGot} times` },
                  { label: "Reported others", value: `${user.counts.reportsMade} times` },
                  { label: "Blocked by", value: `${user.counts.blockedBy} people` },
                  { label: "Gifts", value: `${user.money.giftsSent} sent · ${user.money.giftsReceived} got` },
                ]}
              />
            </CardBody>
          </Card>
          {user.subscription && (
            <Card>
              <CardHeader title="VIP subscription" actions={<StatusBadge status={user.subscription.status} />} />
              <CardBody>
                <DescriptionList
                  items={[
                    { label: "Plan", value: user.subscription.planId === "staff_grant" ? "Given by staff" : format.enum(user.subscription.planId.replace("vip_", "")) },
                    { label: "Period ends", value: format.date(user.subscription.currentPeriodEnd) },
                  ]}
                />
              </CardBody>
            </Card>
          )}
        </aside>
      </div>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-line bg-surface px-4 py-3 shadow-card">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 text-lg font-semibold text-text tabular">{value}</p>
    </div>
  );
}

function UserActions({ user }: { user: UserDetail }) {
  const can = useCan();
  const confirm = useConfirm();
  const qc = useQueryClient();
  const router = useRouter();
  const [dialog, setDialog] = React.useState<null | "ban" | "edit" | "wallet" | "vip">(null);
  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: userKeys.detail(user.id) }), qc.invalidateQueries({ queryKey: userKeys.lists() })]);
  const name = user.name || "this user";

  const run = (opts: Parameters<typeof confirm>[0], call: (reason: string) => Promise<unknown>) =>
    void confirm({
      ...opts,
      action: async ({ reason }) => {
        await call(reason);
        await refresh();
      },
    });

  return (
    <>
      {can(P.UsersBan) &&
        (user.bannedUntil ? (
          <Button onClick={() => run({ title: `Unban ${name}?`, description: "They can use Vibe again right away.", confirmLabel: "Unban", reason: {} }, (reason) => api.post(`admin/users/${user.id}/unban`, { reason }))}>
            <Undo2 />
            Unban
          </Button>
        ) : (
          <Button variant="danger-ghost" onClick={() => setDialog("ban")}>
            <Ban />
            Ban
          </Button>
        ))}
      {can(P.WalletAdjust) && (
        <Button onClick={() => setDialog("wallet")}>
          <CoinsIcon />
          Adjust balance
        </Button>
      )}
      <Menu>
        <MenuTrigger asChild>
          <Button size="icon" aria-label="More actions">
            <MoreHorizontal />
          </Button>
        </MenuTrigger>
        <MenuContent className="w-56">
          {can(P.UsersEdit) && (
            <MenuItem icon={<Pencil />} onSelect={() => setDialog("edit")}>
              Edit profile
            </MenuItem>
          )}
          {can(P.UsersVerify) && (
            <MenuItem
              icon={user.verified ? <ShieldOff /> : <BadgeCheck />}
              onSelect={() =>
                run(
                  {
                    title: user.verified ? `Remove ${name}'s verified badge?` : `Verify ${name}?`,
                    description: user.verified ? "They can verify again with a new selfie." : "Only if you've confirmed the photo is really them.",
                    confirmLabel: user.verified ? "Remove badge" : "Verify",
                    reason: {},
                  },
                  (reason) => api.post(`admin/users/${user.id}/verification`, { verified: !user.verified, reason }),
                )
              }
            >
              {user.verified ? "Remove verified badge" : "Mark as verified"}
            </MenuItem>
          )}
          {can(P.FinanceVip) &&
            (user.vipUntil ? (
              <MenuItem icon={<Crown />} onSelect={() => run({ title: `End ${name}'s VIP now?`, description: "VIP stops immediately. Renewals stop too.", confirmLabel: "End VIP", tone: "danger", reason: {} }, (reason) => api.delete(`admin/users/${user.id}/vip`, { reason }))}>
                End VIP
              </MenuItem>
            ) : null)}
          {can(P.FinanceVip) && (
            <MenuItem icon={<Crown />} onSelect={() => setDialog("vip")}>
              Give VIP time
            </MenuItem>
          )}
          {can(P.OpsMessages) && (
            <MenuItem icon={<Send />} onSelect={() => router.push(`/messages/new?to=${user.id}`)}>
              Send a message
            </MenuItem>
          )}
          {can(P.UsersSessions) && (
            <MenuItem icon={<LogOut />} onSelect={() => run({ title: `Sign ${name} out everywhere?`, description: "Every device is signed out. They can sign in again.", confirmLabel: "Sign out" }, () => api.post(`admin/users/${user.id}/sign-out`))}>
              Sign out everywhere
            </MenuItem>
          )}
          {can(P.UsersDelete) && (
            <>
              <MenuSeparator />
              <MenuItem
                tone="danger"
                icon={<Trash2 />}
                onSelect={() =>
                  void confirm({
                    title: `Delete ${name}'s account?`,
                    description: "Their name, photo, e-mail and sign-in are erased. Money records and reports stay, without personal data. This can't be undone.",
                    confirmLabel: "Delete account",
                    tone: "danger",
                    reason: {},
                    typeToConfirm: "DELETE",
                    action: async ({ reason }) => {
                      await api.delete(`admin/users/${user.id}`, { reason });
                      await refresh();
                      router.push("/users");
                    },
                  })
                }
              >
                Delete account
              </MenuItem>
            </>
          )}
        </MenuContent>
      </Menu>

      {dialog === "ban" && <BanDialog user={user} open onOpenChange={(o) => !o && setDialog(null)} />}
      {dialog === "edit" && <EditProfileDialog user={user} open onOpenChange={(o) => !o && setDialog(null)} />}
      {dialog === "wallet" && <WalletDialog user={user} open onOpenChange={(o) => !o && setDialog(null)} />}
      {dialog === "vip" && <VipDialog user={user} open onOpenChange={(o) => !o && setDialog(null)} />}
    </>
  );
}
