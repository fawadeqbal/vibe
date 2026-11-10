import { redirect } from "next/navigation";

/** "Messages from Vibe" lives on the Notifications page now (one place for everything); old links land there. */
export default function Page() {
  redirect("/notifications");
}
