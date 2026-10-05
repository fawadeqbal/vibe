"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

import { ChatsList } from "./chats-list";

/**
 * Phones: the list at /chats, a conversation full-screen at /chats/…
 * Wide screens: the list stays on the left and the conversation opens beside it.
 */
export function ChatsSplit({ children }: { children: ReactNode }) {
  const path = usePathname();
  const atList = path === "/chats";
  return (
    <div className="flex min-h-0 flex-1 lg:h-dvh">
      <aside className={cn("min-h-0 w-full flex-col lg:flex lg:w-[400px] lg:shrink-0 lg:border-r lg:border-line-soft", atList ? "flex" : "hidden")}>
        <ChatsList />
      </aside>
      <section className={cn("min-h-0 min-w-0 flex-1 flex-col", atList ? "hidden lg:flex" : "flex")}>{children}</section>
    </div>
  );
}
