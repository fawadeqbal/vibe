import { site } from "@/lib/site";

/** The two overlapping rings: pink, and violet screened over it. */
export function LogoMark({ size = 26, stroke = 2.4 }: { size?: number; stroke?: number }) {
  const ring = size * 0.62;
  const inset = size * 0.0615;
  const top = (size - ring) / 2;
  return (
    <span aria-hidden="true" className="relative inline-block shrink-0" style={{ width: size, height: size }}>
      <span className="absolute rounded-full border-pink" style={{ left: inset, top, width: ring, height: ring, borderWidth: stroke, borderStyle: "solid" }} />
      <span className="absolute rounded-full border-violet mix-blend-screen" style={{ right: inset, top, width: ring, height: ring, borderWidth: stroke, borderStyle: "solid" }} />
    </span>
  );
}

export function Logo({ size = 26, stroke = 2.4, textClass = "text-[19px]" }: { size?: number; stroke?: number; textClass?: string }) {
  return (
    <span className="flex items-center gap-2.5">
      <LogoMark size={size} stroke={stroke} />
      <span className={`${textClass} font-bold tracking-[-0.4px]`}>{site.name}</span>
    </span>
  );
}
