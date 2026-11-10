import { redirect } from "next/navigation";

/** Old link: these settings now live in Me → Privacy & safety. */
export default function Page() {
  redirect("/me/settings/privacy");
}
