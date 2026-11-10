import { redirect } from "next/navigation";

/** Old link: the settings groups now sit on Me. */
export default function Page() {
  redirect("/me");
}
