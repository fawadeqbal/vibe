"use client";

import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

import { CircleIconButton } from "./button";

/**
 * Big title for tab screens ("Store", "Chats", "Me") with room for chips or
 * an action on the right. Replaces an app bar on those screens.
 */
export function PageHeader({ title, actions, onBack, className }: { title: string; actions?: ReactNode; onBack?: () => void; className?: string }) {
  return (
    <header className={cn("flex items-center gap-2 px-5 pt-2.5 pb-3.5", className)}>
      {onBack ? <CircleIconButton icon="arrow_back" label="Back" onClick={onBack} className="mr-1" /> : null}
      <h1 className="type-display min-w-0 flex-1 truncate text-[30px] leading-[1.1]">{title}</h1>
      {actions}
    </header>
  );
}

/** App bar for pushed pages (wallet, checkout, edit profile): round back button, quiet title. */
export function AppBar({ title, onBack, actions, children, className }: { title?: string; onBack?: () => void; actions?: ReactNode; children?: ReactNode; className?: string }) {
  return (
    <header className={cn("flex h-16 shrink-0 items-center pr-3", !onBack && "pl-5", className)}>
      {onBack ? (
        <span className="flex w-16 shrink-0 justify-center">
          <CircleIconButton icon="arrow_back" label="Back" onClick={onBack} />
        </span>
      ) : null}
      <div className="flex min-w-0 flex-1 items-center">{children ?? <h1 className="type-title truncate text-[18px]">{title}</h1>}</div>
      {actions ? <div className="flex items-center gap-1">{actions}</div> : null}
    </header>
  );
}
