import { LegalPage, legalMetadata } from "@/components/legal-page";

export const metadata = legalMetadata("child-safety");

export default function Page() {
  return <LegalPage slug="child-safety" />;
}
