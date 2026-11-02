"use client";

import { Bell, BellRing, Mail, Smartphone } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";

import { PageHeader } from "@/components/common/page";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/controls";

import { DownloadSettings } from "./download-settings";
import { NotificationSettings } from "./notification-settings";
import { PushSettings } from "./push-settings";
import { SmtpSettings } from "./smtp-settings";

const TABS = [
  { key: "email", label: "E-mail", icon: Mail, body: <SmtpSettings /> },
  { key: "push", label: "Push", icon: BellRing, body: <PushSettings /> },
  { key: "notifications", label: "Notifications", icon: Bell, body: <NotificationSettings /> },
  { key: "android", label: "Android app", icon: Smartphone, body: <DownloadSettings /> },
] as const;
type TabKey = (typeof TABS)[number]["key"];
const isTab = (v: string | null): v is TabKey => TABS.some((t) => t.key === v);

/** Connections to outside services (e-mail, push, the Android download) and which notifications go out, one tab each. Keys are write-only and stored encrypted. */
export function ConfigurationPage() {
  const router = useRouter();
  const params = useSearchParams();
  // ?tab=push opens that tab, so a reload or a shared link lands in the same place.
  const q = params.get("tab");
  const tab: TabKey = isTab(q) ? q : "email";
  const open = (v: string) => {
    if (isTab(v)) router.replace(`?tab=${v}`, { scroll: false });
  };

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader
        title="Configuration"
        description="Connections to outside services and what Vibe tells people. Passwords and keys are checked when you save, stored encrypted, and never shown again."
      />
      <Tabs value={tab} onValueChange={open}>
        <TabsList className="mb-5">
          {TABS.map((t) => (
            <TabsTrigger key={t.key} value={t.key}>
              <t.icon className="size-4" />
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
        {TABS.map((t) => (
          <TabsContent key={t.key} value={t.key} className="outline-none">
            {t.body}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
