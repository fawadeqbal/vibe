import { Globe, Smartphone } from "lucide-react";

import { Badge } from "@/components/ui/badge";

/** "Android app", "iPhone app", "Website". */
export const clientLabel = (c: string | null | undefined): string => (c === "android" ? "Android app" : c === "ios" ? "iPhone app" : c === "web" ? "Website" : "Unknown");
export const isAppClient = (c: string | null | undefined) => c === "android" || c === "ios";

/** Which Vibe someone is on: a phone icon for the app, a globe for the website. Green with a dot when they're on it right now. */
export function ClientChip({ client, now = false }: { client: string | null | undefined; now?: boolean }) {
  if (!client) return <span className="text-xs text-muted">—</span>;
  const Icon = isAppClient(client) ? Smartphone : Globe;
  return (
    <Badge tone={now ? "ok" : "neutral"} dot={now}>
      <Icon className="size-3.5" aria-hidden />
      {clientLabel(client)}
    </Badge>
  );
}

/** Online now: the app(s) and/or website they have open; else the one they used last. */
export function ClientCell({ onlineOn, lastClient }: { onlineOn: string[]; lastClient: string | null }) {
  if (onlineOn.length)
    return (
      <span className="flex flex-wrap gap-1">
        {onlineOn.map((c) => (
          <ClientChip key={c} client={c} now />
        ))}
      </span>
    );
  return <ClientChip client={lastClient} />;
}
