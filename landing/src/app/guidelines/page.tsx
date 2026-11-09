import { LegalPage, legalMetadata } from "@/components/legal-page";

export const metadata = legalMetadata("guidelines");

export default function Page() {
  return <LegalPage slug="guidelines" />;
}
