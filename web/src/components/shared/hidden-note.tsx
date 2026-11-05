import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/cn";

/** Under your own message when contact details were hidden ("****"). */
export function HiddenNote({ className }: { className?: string }) {
  return (
    <p className={cn("type-body mt-1 flex items-center gap-1 text-[11.5px] text-muted", className)}>
      <Icon name="shield" size={13} />
      Contact details are hidden to keep chats safe
    </p>
  );
}
