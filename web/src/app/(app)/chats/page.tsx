import { EmptyState } from "@/components/ui/misc";

export const metadata = { title: "Chats" };

/** Wide screens: the empty detail pane beside the list (phones show the list instead). */
export default function Page() {
  return <EmptyState className="flex-1" icon="forum" title="Pick a " accent="conversation" body="Your friends and messages from the Vibe team open here." />;
}
