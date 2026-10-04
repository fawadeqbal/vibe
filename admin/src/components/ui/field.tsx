import { Label as LabelPrimitive } from "radix-ui";
import * as React from "react";

import { cn } from "@/lib/utils";

export function Label({ className, ...props }: React.ComponentProps<typeof LabelPrimitive.Root>) {
  return <LabelPrimitive.Root className={cn("text-sm font-medium text-text", className)} {...props} />;
}

/**
 * Label + control + hint/error, wired for screen readers. Pass the control
 * as the child; `id` is generated when not given.
 */
export function Field({
  label,
  hint,
  error,
  className,
  children,
  id: idProp,
  optional,
}: {
  label: React.ReactNode;
  hint?: React.ReactNode;
  error?: string;
  className?: string;
  children: React.ReactElement<{ id?: string; "aria-invalid"?: boolean; "aria-describedby"?: string }>;
  id?: string;
  optional?: boolean;
}) {
  const auto = React.useId();
  const id = idProp ?? auto;
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div className={cn("grid gap-1.5", className)}>
      <Label htmlFor={id} className="flex items-baseline gap-1.5">
        {label}
        {optional && <span className="text-xs font-normal text-muted">optional</span>}
      </Label>
      {React.cloneElement(children, { id, "aria-invalid": !!error || undefined, "aria-describedby": describedBy })}
      {error ? (
        <p id={`${id}-error`} className="text-xs text-bad">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-xs text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
