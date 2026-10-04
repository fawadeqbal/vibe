"use client";

import { Check } from "lucide-react";
import { DropdownMenu as M } from "radix-ui";
import * as React from "react";

import { cn } from "@/lib/utils";

export const Menu = M.Root;
export const MenuTrigger = M.Trigger;

export function MenuContent({ className, align = "end", ...props }: React.ComponentProps<typeof M.Content>) {
  return (
    <M.Portal>
      <M.Content align={align} sideOffset={6} className={cn("z-50 min-w-48 rounded-lg border border-line bg-surface p-1 shadow-pop data-[state=open]:animate-in", className)} {...props} />
    </M.Portal>
  );
}

export function MenuItem({ className, tone, icon, children, ...props }: React.ComponentProps<typeof M.Item> & { tone?: "danger"; icon?: React.ReactNode }) {
  return (
    <M.Item
      className={cn(
        "flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-text outline-none select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[highlighted]:bg-surface-2 [&_svg]:size-4 [&_svg]:text-muted",
        tone === "danger" && "text-bad data-[highlighted]:bg-bad-soft [&_svg]:text-bad",
        className,
      )}
      {...props}
    >
      {icon}
      {children}
    </M.Item>
  );
}

export function MenuCheckboxItem({ className, children, ...props }: React.ComponentProps<typeof M.CheckboxItem>) {
  return (
    <M.CheckboxItem className={cn("flex cursor-pointer items-center gap-2 rounded-md py-1.5 pr-2 pl-7 text-sm text-text outline-none select-none data-[highlighted]:bg-surface-2 relative", className)} {...props}>
      <M.ItemIndicator className="absolute left-2">
        <Check className="size-4 text-primary" />
      </M.ItemIndicator>
      {children}
    </M.CheckboxItem>
  );
}

export function MenuLabel({ className, ...props }: React.ComponentProps<typeof M.Label>) {
  return <M.Label className={cn("px-2 py-1.5 text-xs font-medium text-muted", className)} {...props} />;
}

export function MenuSeparator({ className, ...props }: React.ComponentProps<typeof M.Separator>) {
  return <M.Separator className={cn("-mx-1 my-1 h-px bg-line", className)} {...props} />;
}
