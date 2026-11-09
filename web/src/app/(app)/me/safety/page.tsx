import { redirect } from "next/navigation";

/** Old link: these settings now live in Settings and activity. */
export default function Page() {
  redirect("/me/settings");
}
