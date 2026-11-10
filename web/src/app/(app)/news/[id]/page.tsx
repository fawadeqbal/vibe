import { TeamMessageView } from "@/features/notifications/account-pages";

export const metadata = { title: "From the Vibe team" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <TeamMessageView id={id} />;
}
