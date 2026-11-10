"use client";

import { forwardRef, type InputHTMLAttributes, type TextareaHTMLAttributes } from "react";

import { cn } from "@/lib/cn";

import { Dropdown, type DropdownOption } from "./dropdown";
import { Icon } from "./icon";

/** The app's input look: surface2 fill, 18px radius, hairline, violet focus ring. */
const FIELD =
  "w-full rounded-[18px] border border-line bg-surface2 px-[18px] py-4 text-text outline-none transition-[border-color,box-shadow] placeholder:text-muted focus:border-violet focus:shadow-[inset_0_0_0_0.5px_var(--color-violet)]";

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

/** A form dropdown (the design system's Dropdown in its field size). */
export function Select({
  value,
  onChange,
  options,
  label,
  className,
  suggested,
  icon,
}: {
  value: string;
  onChange: (v: string) => void;
  options: DropdownOption[];
  label: string;
  className?: string;
  suggested?: string[];
  icon?: string;
}) {
  return <Dropdown value={value} onChange={onChange} options={options} label={label} className={className} suggested={suggested} icon={icon} />;
}
