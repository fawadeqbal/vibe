import { cn } from "@/lib/cn";

/** Material's indeterminate circular progress, in any colour. */
export function Spinner({ size = 36, stroke = 4, className }: { size?: number; stroke?: number; className?: string }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className={cn("shrink-0 animate-spin text-pink", className)} role="progressbar" aria-label="Loading">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeDasharray={`${c * 0.28} ${c}`} />
    </svg>
  );
}
