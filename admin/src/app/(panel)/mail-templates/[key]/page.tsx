import type { Metadata } from "next";

import { RequirePermission } from "@/features/auth/gate";
import { TemplateEditor } from "@/features/messaging/template-editor";
import { P } from "@/lib/permissions";

export const metadata: Metadata = { title: "Edit e-mail template" };

export default async function Page({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  return (
    <RequirePermission permission={P.OpsTemplates}>
      <TemplateEditor templateKey={key} />
    </RequirePermission>
  );
}
