"use client";

import { useQuery } from "@tanstack/react-query";
import { Command } from "cmdk";
import { CornerDownLeft, User } from "lucide-react";
import { Dialog as D } from "radix-ui";
import { useRouter } from "next/navigation";
import * as React from "react";

import { UserCell } from "@/components/common/bits";
import { useCan } from "@/features/auth/session";
import { useDebounced } from "@/hooks/use-url-state";
import { api } from "@/lib/api/client";
import type { Page, UserSummary } from "@/lib/api/types";
import { NAV } from "@/lib/nav";
import { P } from "@/lib/permissions";

/** ⌘K: jump to any screen, or find a user by name, e-mail, id or invite code. */
export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const router = useRouter();
  const can = useCan();
  const [q, setQ] = React.useState("");
  const term = useDebounced(q.trim(), 250);
  const users = useQuery({
    queryKey: ["palette", "users", term],
    queryFn: ({ signal }) => api.get<Page<UserSummary>>("admin/users", { q: term, limit: 6, bots: true }, signal),
    enabled: open && term.length >= 2 && can(P.UsersView),
    staleTime: 10_000,
  });

  const go = (href: string) => {
    onOpenChange(false);
    setQ("");
    router.push(href);
  };

  const pages = NAV.flatMap((g) => g.items.filter((i) => can(i.permission)).map((i) => ({ ...i, group: g.label })));

  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px]" />
        <D.Content className="fixed top-[15vh] left-1/2 z-50 w-[calc(100vw-2rem)] max-w-lg -translate-x-1/2 overflow-hidden rounded-xl border border-line bg-surface shadow-pop animate-in">
          <D.Title className="sr-only">Search</D.Title>
          <D.Description className="sr-only">Find a user or go to a page</D.Description>
          <Command shouldFilter={false} label="Search" className="flex flex-col">
            <Command.Input
              value={q}
              onValueChange={setQ}
              autoFocus
              placeholder="Search users by name, e-mail, id… or type a page"
              className="h-12 border-b border-line bg-transparent px-4 text-sm text-text outline-none placeholder:text-muted"
            />
            <Command.List className="max-h-[50vh] overflow-y-auto p-2">
              <Command.Empty className="px-3 py-6 text-center text-sm text-muted">{users.isFetching ? "Searching…" : "No matches"}</Command.Empty>
              {(users.data?.items.length ?? 0) > 0 && (
                <Command.Group heading="Users" className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:text-muted">
                  {users.data!.items.map((u) => (
                    <Command.Item key={u.id} value={`user-${u.id}`} onSelect={() => go(`/users/${u.id}`)} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 data-[selected=true]:bg-surface-2">
                      <UserCell user={u} link={false} sub={u.email ?? u.id} size={28} />
                      <CornerDownLeft className="ml-auto size-3.5 text-muted" />
                    </Command.Item>
                  ))}
                </Command.Group>
              )}
              <Command.Group heading="Pages" className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:text-muted">
                {pages
                  .filter((p) => !q || p.label.toLowerCase().includes(q.toLowerCase()) || p.group.toLowerCase().includes(q.toLowerCase()))
                  .map((p) => (
                    <Command.Item key={p.href} value={`page-${p.href}`} onSelect={() => go(p.href)} className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-2 text-sm text-text data-[selected=true]:bg-surface-2">
                      <p.icon className="size-4 text-muted" />
                      {p.label}
                      <span className="ml-auto text-xs text-muted">{p.group}</span>
                    </Command.Item>
                  ))}
                <Command.Item value="page-account" onSelect={() => go("/account")} className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-2 text-sm text-text data-[selected=true]:bg-surface-2">
                  <User className="size-4 text-muted" />
                  Your account & security
                </Command.Item>
              </Command.Group>
            </Command.List>
          </Command>
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
