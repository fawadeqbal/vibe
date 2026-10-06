"use client";

import { forwardRef, type InputHTMLAttributes, type TextareaHTMLAttributes } from "react";

import { cn } from "@/lib/cn";

import { Icon } from "./icon";

/** The input look: frosted glass, 18px radius, hairline, violet focus ring. */
const FIELD =
  "w-full rounded-[18px] border border-line bg-surface2 px-[18px] py-4 backdrop-blur-[16px] backdrop-saturate-150 text-text outline-none transition-[border-color,box-shadow] placeholder:text-muted focus:border-violet focus:shadow-[inset_0_0_0_0.5px_var(--color-violet)]";

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  /** Material icon shown at the start (e.g. "mail_outline"). */
  prefixIcon?: string;
  error?: string | null;
  inputClassName?: string;
};

export const TextField = forwardRef<HTMLInputElement, InputProps>(function TextField({ prefixIcon, error, className, inputClassName, ...rest }, ref) {
  return (
    <div className={className}>
      <div className="relative">
        {prefixIcon ? <Icon name={prefixIcon} size={24} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-text2" /> : null}
        <input
          ref={ref}
          className={cn("type-body text-[16px]", FIELD, prefixIcon && "pl-[52px]", error && "border-bad focus:border-bad focus:shadow-[inset_0_0_0_0.5px_var(--color-bad)]", inputClassName)}
          aria-invalid={!!error || undefined}
          {...rest}
        />
      </div>
      {error ? <p className="type-body mt-1.5 px-4 text-[12px] text-bad">{error}</p> : null}
    </div>
  );
});

type AreaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & { error?: string | null; showCount?: boolean };

export const TextArea = forwardRef<HTMLTextAreaElement, AreaProps>(function TextArea({ error, className, showCount, maxLength, value, ...rest }, ref) {
  return (
    <div className={className}>
      <textarea ref={ref} className={cn("type-body block resize-none text-[16px]", FIELD, error && "border-bad")} maxLength={maxLength} value={value} {...rest} />
      {showCount && maxLength ? <p className="type-body mt-1.5 px-4 text-right text-[12px] text-text2">{`${String(value ?? "").length}/${maxLength}`}</p> : null}
      {error ? <p className="type-body mt-1.5 px-4 text-[12px] text-bad">{error}</p> : null}
    </div>
  );
});

/** A native select in the dropdown look (country pickers). */
export function Select({
  value,
  onChange,
  options,
  label,
  className,
  icon = "arrow_drop_down",
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  label: string;
  className?: string;
  icon?: string;
}) {
  return (
    <div className={cn("relative rounded-[18px] border border-line bg-surface2 backdrop-blur-[16px] backdrop-saturate-150", className)}>
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="type-body h-12 w-full cursor-pointer appearance-none rounded-[18px] bg-transparent pr-10 pl-3.5 text-[15px] text-text outline-none focus-visible:outline-2 focus-visible:outline-lavender"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value} className="bg-surface2-solid text-text">
            {o.label}
          </option>
        ))}
      </select>
      <Icon name={icon} size={24} className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-text2" />
    </div>
  );
}
