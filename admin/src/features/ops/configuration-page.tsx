"use client";

import { PageHeader } from "@/components/common/page";

import { DownloadSettings } from "./download-settings";
import { PushSettings } from "./push-settings";
import { SmtpSettings } from "./smtp-settings";

/** Connections to outside services: e-mail, push and the Android download. Keys are write-only and stored encrypted. */
export function ConfigurationPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader title="Configuration" description="Connections to outside services. Passwords and keys are checked when you save, stored encrypted, and never shown again." />
      <SmtpSettings />
      <PushSettings />
      <DownloadSettings />
    </div>
  );
}
