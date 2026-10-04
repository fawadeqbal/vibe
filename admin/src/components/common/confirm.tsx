"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";

export interface ConfirmOptions {
  title: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  tone?: "primary" | "danger";
  /** Ask for a reason (stored in the audit log). */
  reason?: { label?: string; placeholder?: string; required?: boolean; minLength?: number };
  /** Make the person type this text to enable the button (irreversible actions). */
  typeToConfirm?: string;
  /** Runs while the dialog shows a spinner; throw to keep it open (the error is shown). */
  action?: (input: { reason: string }) => Promise<unknown>;
}

type Resolver = (v: { reason: string } | null) => void;

const Ctx = React.createContext<((o: ConfirmOptions) => Promise<{ reason: string } | null>) | null>(null);

/**
 * `const confirm = useConfirm(); if (await confirm({ title: 'Ban Sara?', reason: {} })) …`
 * One dialog for every "are you sure", with an optional reason and typed
 * confirmation, so destructive actions behave the same everywhere.
 */
export function useConfirm() {
  const fn = React.useContext(Ctx);
  if (!fn) throw new Error("useConfirm must be used inside <ConfirmProvider>");
  return fn;
}

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [opts, setOpts] = React.useState<ConfirmOptions | null>(null);
  const resolver = React.useRef<Resolver | null>(null);

  const confirm = React.useCallback((o: ConfirmOptions) => {
    setOpts(o);
    return new Promise<{ reason: string } | null>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const close = (v: { reason: string } | null) => {
    resolver.current?.(v);
    resolver.current = null;
    setOpts(null);
  };

  return (
    <Ctx.Provider value={confirm}>
      {children}
      {opts && <ConfirmDialog key={opts.title} opts={opts} onClose={close} />}
    </Ctx.Provider>
  );
}

function ConfirmDialog({ opts, onClose }: { opts: ConfirmOptions; onClose: (v: { reason: string } | null) => void }) {
  const [reason, setReason] = React.useState("");
  const [typed, setTyped] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const min = opts.reason?.minLength ?? 3;
  const reasonOk = !opts.reason || (opts.reason.required === false ? true : reason.trim().length >= min);
  const typedOk = !opts.typeToConfirm || typed.trim() === opts.typeToConfirm;
  const ok = reasonOk && typedOk && !busy;

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!ok) return;
    if (!opts.action) return onClose({ reason: reason.trim() });
    setBusy(true);
    setError(null);
    try {
      await opts.action({ reason: reason.trim() });
      onClose({ reason: reason.trim() });
    } catch (err) {
      setError((err as Error).message ?? "Something went wrong");
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose(null)}>
      <DialogContent
        size="sm"
        title={opts.title}
        description={opts.description}
        footer={
          <>
            <Button variant="ghost" onClick={() => onClose(null)} disabled={busy}>
              Cancel
            </Button>
            <Button variant={opts.tone === "danger" ? "danger" : "primary"} onClick={() => void submit()} disabled={!ok} loading={busy}>
              {opts.confirmLabel ?? "Confirm"}
            </Button>
          </>
        }
      >
        <form onSubmit={submit} className="space-y-3">
          {opts.reason && (
            <Field label={opts.reason.label ?? "Reason"} hint="Saved in the audit log." optional={opts.reason.required === false}>
              <Textarea autoFocus value={reason} onChange={(e) => setReason(e.target.value)} placeholder={opts.reason.placeholder ?? "Why?"} rows={2} maxLength={200} />
            </Field>
          )}
          {opts.typeToConfirm && (
            <Field label={<>Type <span className="font-mono text-bad">{opts.typeToConfirm}</span> to confirm</>}>
              <Input value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" autoFocus={!opts.reason} />
            </Field>
          )}
          {error && <p className="rounded-md bg-bad-soft px-3 py-2 text-sm text-bad">{error}</p>}
          {!opts.reason && !opts.typeToConfirm && !error && <span className="sr-only">Confirm to continue</span>}
          <button type="submit" hidden />
        </form>
      </DialogContent>
    </Dialog>
  );
}
