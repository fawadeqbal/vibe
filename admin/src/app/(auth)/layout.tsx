import { VibeLogo } from "@/components/common/vibe-logo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden px-4 py-10">
      <div aria-hidden className="pointer-events-none absolute -top-40 left-1/2 h-96 w-[48rem] -translate-x-1/2 rounded-full bg-primary/15 blur-3xl" />
      <div className="relative w-full max-w-sm">
        <div className="mb-6 flex items-center justify-center gap-2.5">
          <VibeLogo className="size-10" />
          <div className="leading-tight">
            <p className="font-semibold text-text">Vibe Admin</p>
            <p className="text-xs text-muted">Staff only</p>
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}
