import { Icon } from "@/components/ui/icon";
import { alpha, color, type Tone } from "@/lib/colors";
import type { PaymentMethod } from "@/lib/models";

const ICONS: Record<PaymentMethod, { icon: string; variant?: "filled"; tone: Tone }> = {
  googlePlay: { icon: "play_arrow", tone: "ok" },
  appStore: { icon: "apple", variant: "filled", tone: "text" },
  jazzCash: { icon: "account_balance_wallet", tone: "jazzcash" },
  easypaisa: { icon: "account_balance_wallet", tone: "easypaisa" },
  card: { icon: "credit_card", tone: "violet" },
  bank: { icon: "account_balance", tone: "text2" },
};

/** The tinted tile for a payment / payout method. */
export function PaymentMethodIcon({ method, size = 42, iconSize = 24 }: { method: PaymentMethod; size?: number; iconSize?: number }) {
  const m = ICONS[method];
  const tone = m.tone;
  return (
    <span className="flex shrink-0 items-center justify-center rounded-[12px]" style={{ width: size, height: size, backgroundColor: alpha(tone, 0.15) }}>
      <Icon name={m.icon} variant={m.variant} size={iconSize} style={{ color: color(tone) }} />
    </span>
  );
}
