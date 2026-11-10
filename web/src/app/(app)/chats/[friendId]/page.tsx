import { ChatView } from "@/features/chats/chat-view";

export const metadata = { title: "Chat" };

export default async function Page({ params, searchParams }: { params: Promise<{ friendId: string }>; searchParams: Promise<{ m?: string }> }) {
  const [{ friendId }, { m }] = await Promise.all([params, searchParams]);
  return <ChatView friendId={friendId} focusId={m} />;
}
