import { ChatView } from "@/features/chats/chat-view";

export const metadata = { title: "Chat" };

export default async function Page({ params }: { params: Promise<{ friendId: string }> }) {
  const { friendId } = await params;
  return <ChatView friendId={friendId} />;
}
