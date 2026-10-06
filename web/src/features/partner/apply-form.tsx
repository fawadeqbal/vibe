"use client";

import { useEffect, useState } from "react";

import { startSelfieVerification, VerifyPill } from "@/components/shared/selfie-verification";
import { CircleIconButton, GradientButton, TextButton } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Panel } from "@/components/ui/panel";
import { Spinner } from "@/components/ui/spinner";
import { Select, TextArea, TextField } from "@/components/ui/text-field";
import { SectionTitle } from "@/components/ui/typography";
import { applyErrors, type ApplyInput, type ChannelInput, codeReasonLabel, PLATFORMS, type Platform, sourceLabel } from "@/lib/affiliate";
import { ApiError, errorMessage } from "@/lib/api/errors";
import { cn } from "@/lib/cn";
import { config } from "@/lib/config";
import { normaliseCode } from "@/lib/referrals";
import { useAffiliate } from "@/stores/affiliate";
import { useSession } from "@/stores/session";
import { toast } from "@/stores/ui";

type CodeCheck = { state: "idle" | "checking" } | { state: "ok"; code: string } | { state: "bad"; reason: string };

const emptyChannel = (platform: Platform = "tiktok"): ChannelInput => ({ platform, url: "", followers: "" });

/**
 * Apply to the creator partner program (verified accounts, once): the name
 * people see, your code (checked as you type), 1–5 channels and a note.
 */
export function ApplyForm() {
  const me = useSession((s) => s.me);
  const busySession = useSession((s) => s.busy);
  const [input, setInput] = useState<ApplyInput>({ displayName: me?.name ?? "", code: "", channels: [emptyChannel()], note: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [answer, setAnswer] = useState<{ code: string; available: boolean; reason: string | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const code = normaliseCode(input.code);

  // Code availability, 400 ms after the last keystroke; a stale answer is dropped.
  useEffect(() => {
    if (!code) return;
    let alive = true;
    const t = setTimeout(() => {
      useAffiliate
        .getState()
        .codeAvailable(code)
        .then((r) => alive && setAnswer({ code, available: r.available, reason: r.reason }))
        .catch(() => {});
    }, 400);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [code]);
  const check: CodeCheck = !input.code.trim()
    ? { state: "idle" }
    : !code
      ? { state: "bad", reason: codeReasonLabel("invalid") }
      : answer?.code !== code
        ? { state: "checking" }
        : answer.available
          ? { state: "ok", code }
          : { state: "bad", reason: codeReasonLabel(answer.reason) };

  const patch = (p: Partial<ApplyInput>) => setInput((s) => ({ ...s, ...p }));
  const patchChannel = (i: number, p: Partial<ChannelInput>) => setInput((s) => ({ ...s, channels: s.channels.map((c, j) => (j === i ? { ...c, ...p } : c)) }));

  if (!me?.verified)
    return (
      <Panel className="flex items-center border-trust/22">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-[12px] bg-trust/12">
          <Icon name="verified" variant="outlined" className="text-trust" />
        </span>
        <span className="ml-3.5 min-w-0 flex-1">
          <span className="type-title block text-[15px] font-semibold">Verify your profile first</span>
          <span className="type-body block text-[12px] text-text2">Partners are real, selfie-verified people. It takes a minute.</span>
        </span>
        <VerifyPill busy={busySession} onClick={() => void startSelfieVerification()} />
      </Panel>
    );

  const submit = async () => {
    const errs = applyErrors(input);
    if (check.state === "bad") errs.code = check.reason;
    setErrors(errs);
    setServerError(null);
    if (Object.keys(errs).length) return;
    setBusy(true);
    try {
      await useAffiliate.getState().apply(input);
      toast("Application sent. We'll let you know soon.");
    } catch (e) {
      if (e instanceof ApiError && e.code === "AFFILIATE_CODE_TAKEN") setErrors({ code: codeReasonLabel(typeof e.details.reason === "string" ? e.details.reason : "taken") });
      else if (e instanceof ApiError && e.code === "AFFILIATE_EXISTS") await useAffiliate.getState().load();
      else if (e instanceof ApiError && e.code === "VERIFICATION_REQUIRED") setServerError("Verify your profile first, then apply.");
      else setServerError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <SectionTitle text="Apply" top={26} />
      <Label text="Name people see" />
      <TextField value={input.displayName} maxLength={40} onChange={(e) => patch({ displayName: e.target.value })} placeholder="Your creator name" aria-label="Name people see" error={errors.displayName} />

      <Label text="Your code" className="mt-4" />
      <TextField
        value={input.code}
        maxLength={20}
        onChange={(e) => {
          patch({ code: e.target.value.replace(/[^A-Za-z0-9_]/g, "") });
          setErrors((x) => ({ ...x, code: "" }));
        }}
        placeholder="e.g. ALI"
        autoCapitalize="characters"
        autoComplete="off"
        spellCheck={false}
        aria-label="Partner code"
        aria-describedby="code-status"
        error={errors.code || null}
        inputClassName="type-mono uppercase tracking-[1px]"
      />
      <p id="code-status" className="type-body mt-1.5 flex min-h-[18px] items-center px-1 text-[12px]" aria-live="polite">
        {check.state === "checking" ? (
          <>
            <Spinner size={12} stroke={1.6} className="text-muted" />
            <span className="ml-1.5 text-muted">Checking…</span>
          </>
        ) : check.state === "ok" ? (
          <>
            <Icon name="check_circle" size={14} className="text-trust" />
            <span className="ml-1 text-text2">
              Available · <span className="type-mono text-text">{config.siteUrl.replace(/^https?:\/\//, "")}/i/{check.code}</span>
            </span>
          </>
        ) : check.state === "bad" && !errors.code ? (
          <span className="text-bad">{check.reason}</span>
        ) : null}
      </p>

      <Label text={`Where you post (${input.channels.length}/5)`} className="mt-3" />
      <div className="flex flex-col gap-2.5">
        {input.channels.map((c, i) => (
          <Panel key={i} className="p-3">
            <div className="flex items-center gap-2">
              <Select className="flex-1" label={`Channel ${i + 1} platform`} value={c.platform} onChange={(v) => patchChannel(i, { platform: v as Platform })} options={PLATFORMS.map((p) => ({ value: p, label: sourceLabel(p) }))} />
              {input.channels.length > 1 ? <CircleIconButton icon="close" label={`Remove channel ${i + 1}`} iconSize={18} onClick={() => setInput((s) => ({ ...s, channels: s.channels.filter((_, j) => j !== i) }))} /> : null}
            </div>
            <TextField
              className="mt-2"
              inputMode="url"
              autoCapitalize="none"
              spellCheck={false}
              value={c.url}
              onChange={(e) => patchChannel(i, { url: e.target.value })}
              placeholder="https://www.tiktok.com/@you"
              aria-label={`Channel ${i + 1} link`}
              error={errors[`channels.${i}.url`]}
              inputClassName="py-3 text-[15px]"
            />
            <TextField
              className="mt-2"
              inputMode="numeric"
              value={c.followers}
              onChange={(e) => patchChannel(i, { followers: e.target.value })}
              placeholder="Followers, e.g. 25k"
              aria-label={`Channel ${i + 1} followers`}
              error={errors[`channels.${i}.followers`]}
              inputClassName="py-3 text-[15px]"
            />
          </Panel>
        ))}
      </div>
      {errors.channels ? <p className="type-body mt-1.5 px-1 text-[12px] text-bad">{errors.channels}</p> : null}
      {input.channels.length < 5 ? (
        <TextButton icon="add" className="mt-1" onClick={() => setInput((s) => ({ ...s, channels: [...s.channels, emptyChannel(PLATFORMS.find((p) => !s.channels.some((x) => x.platform === p)) ?? "other")] }))}>
          Add another channel
        </TextButton>
      ) : null}

      <Label text="Anything we should know? (optional)" className="mt-3" />
      <TextArea rows={3} maxLength={1000} showCount value={input.note} onChange={(e) => patch({ note: e.target.value })} placeholder="Your audience, where they're from, how you'd talk about Vibe…" aria-label="Note" error={errors.note} />

      {serverError ? <p className="type-body mt-2 text-[13px] text-bad">{serverError}</p> : null}
      <div className="mt-5">
        <GradientButton label="Send application" busy={busy} onClick={() => void submit()} />
      </div>
      <p className="type-body mt-2 text-center text-[11.5px] text-muted">One application per account. We usually reply within a few days.</p>
    </div>
  );
}

const Label = ({ text, className }: { text: string; className?: string }) => <p className={cn("type-overline mb-2.5 ml-0.5", className)}>{text}</p>;
