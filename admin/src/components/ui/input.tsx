import * as React from "react";

import { cn } from "@/lib/utils";

export const controlClass =
  "w-full rounded-lg border border-line bg-surface px-3 text-sm text-text shadow-card transition-colors placeholder:text-muted hover:border-line-strong focus-visible:border-primary focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60 aria-invalid:border-bad aria-invalid:focus-visible:ring-bad/25";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement> & { leading?: React.ReactNode }>(function Input({ className, leading, ...props }, ref) {
  if (!leading) return <input ref={ref} className={cn(controlClass, "h-9", className)} {...props} />;
  return (
    <div className="relative">
      <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-muted [&_svg]:size-4">{leading}</span>
      <input ref={ref} className={cn(controlClass, "h-9 pl-9", className)} {...props} />
    </div>
  );
});

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...props }, ref) {
  return <textarea ref={ref} className={cn(controlClass, "min-h-20 py-2 leading-relaxed", className)} {...props} />;
});

/** Native select, styled: accessible, fast, works with forms and keyboard out of the box. */
export const NativeSelect = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(function NativeSelect({ className, children, ...props }, ref) {
  return (
    <div className="relative">
      <select ref={ref} className={cn(controlClass, "h-9 appearance-none pr-8", className)} {...props}>
        {children}
      </select>
      <svg aria-hidden className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-muted" viewBox="0 0 16 16" fill="none">
        <path d="M4.5 6.5 8 10l3.5-3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
});
