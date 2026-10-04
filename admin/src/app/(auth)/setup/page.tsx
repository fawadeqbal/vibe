import type { Metadata } from "next";

import { SetupFlow } from "@/features/account/setup-flow";

export const metadata: Metadata = { title: "Secure your account" };

export default function SetupPage() {
  return <SetupFlow />;
}
