import { LegalPage, legalMetadata } from "@/components/legal-page";

export const metadata = legalMetadata("privacy");

export default function Page() {
  return <LegalPage slug="privacy" />;
}
