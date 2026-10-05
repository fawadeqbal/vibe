import { ChatsSplit } from "@/features/chats/chats-split";

export default function ChatsLayout({ children }: { children: React.ReactNode }) {
  return <ChatsSplit>{children}</ChatsSplit>;
}
