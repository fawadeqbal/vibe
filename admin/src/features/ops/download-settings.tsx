"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, ExternalLink, Link2, RotateCcw } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import { Time } from "@/components/common/bits";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/controls";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { api, ApiError } from "@/lib/api/client";
import { format } from "@/lib/format";

interface DownloadView {
  androidUrl: string;
  source: "admin" | "default";
  defaultUrl: string;
  updatedAt: string | null;
  updatedBy: string | null;
  downloads: { last7Days: number; allTime: number };
}

const key = ["config", "download"] as const;

/** Admin → Configuration → Android app download: where every "Download for Android" button leads. */
export function DownloadSettings() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: key, queryFn: ({ signal }) => api.get<DownloadView>("admin/config/download", undefined, signal) });
  const v = q.data;
  const [url, setUrl] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const value = url ?? (v?.source === "admin" ? v.androidUrl : "");

  const save = useMutation({
    mutationFn: (androidUrl: string) => api.put<DownloadView>("admin/config/download", { androidUrl }),
    onSuccess: (r) => {
      qc.setQueryData(key, r);
      setUrl(null);
      setError(null);
      toast.success(r.source === "admin" ? "Download link saved — it opens a real APK" : "Back to the latest GitHub release");
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : "Couldn't save"),
    meta: { silent: true },
  });

  return (
    <Card>
      <CardHeader
        title="Android app download"
        description='Where every "Download for Android" and "Get the app" button on the website, the invite page and the web app leads. Each download is counted first.'
        actions={v ? v.source === "admin" ? <Badge tone="info">Custom link</Badge> : <Badge tone="ok">Latest GitHub release</Badge> : null}
      />
      <CardBody className="space-y-4">
        {!v ? (
          <Skeleton className="h-32" />
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
              <span className="min-w-0 truncate">
                <span className="text-muted">Now: </span>
                <a href={v.androidUrl} className="font-medium text-primary hover:underline" target="_blank" rel="noreferrer">
                  {v.androidUrl.replace(/^https:\/\//, "")} <ExternalLink className="inline size-3" />
                </a>
              </span>
              <span className="text-muted">
                {format.number(v.downloads.last7Days)} downloads in 7 days · {format.number(v.downloads.allTime)} all time
              </span>
            </div>
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                if (value.trim()) save.mutate(value.trim());
              }}
            >
              <Field label="Link to the .apk" hint="Leave as the latest GitHub release unless you need a specific file. It must be a direct https link to the .apk — it is checked before saving.">
                <Input value={value} onChange={(e) => setUrl(e.target.value)} placeholder={v.defaultUrl} spellCheck={false} leading={<Link2 className="size-3.5" />} />
              </Field>
              {error ? (
                <p role="alert" className="text-sm text-bad">
                  {error}
                </p>
              ) : null}
              <div className="flex flex-wrap items-center gap-2">
                <Button type="submit" variant="primary" loading={save.isPending && !!value.trim()} disabled={!value.trim() || value.trim() === (v.source === "admin" ? v.androidUrl : "")}>
                  <CheckCircle2 /> Check and save
                </Button>
                {v.source === "admin" ? (
                  <Button type="button" variant="secondary" loading={save.isPending && !value.trim()} onClick={() => save.mutate("")}>
                    <RotateCcw /> Use the latest GitHub release
                  </Button>
                ) : null}
                {v.updatedAt ? (
                  <span className="text-xs text-muted">
                    Changed <Time iso={v.updatedAt} />
                    {v.updatedBy ? ` by ${v.updatedBy}` : ""}
                  </span>
                ) : null}
              </div>
            </form>
          </>
        )}
      </CardBody>
    </Card>
  );
}
