import type { ReactNode } from "react";
import { create } from "zustand";

/**
 * Toasts and overlays (sheets, dialogs) as promises, like Flutter's
 * `showModalBottomSheet` / `showDialog`: `const gift = await openSheet(...)`.
 * One host renders them (components/layout/overlay-host.tsx), so no screen
 * keeps open/closed state for its pop-ups.
 */
export interface Toast {
  id: number;
  message: string;
  error: boolean;
}

export type OverlayKind = "sheet" | "dialog" | "screen";

export interface Overlay {
  id: number;
  kind: OverlayKind;
  render: (close: (value?: unknown) => void) => ReactNode;
  resolve: (value: unknown) => void;
  /** Tapping the backdrop / Escape closes it (with undefined). */
  dismissible: boolean;
  /** Dialog content draws its own surface (e.g. a full-bleed ad), with a 16px inset. */
  bare?: boolean;
}

interface UiState {
  toasts: Toast[];
  overlays: Overlay[];
}

export const useUi = create<UiState>()(() => ({ toasts: [], overlays: [] }));

let seq = 0;

/** A short confirmation or error line at the bottom (Flutter's SnackBar). */
export function toast(message: string, opts: { error?: boolean } = {}) {
  const id = ++seq;
  // One at a time, like hideCurrentSnackBar().
  useUi.setState({ toasts: [{ id, message, error: !!opts.error }] });
  setTimeout(() => useUi.setState((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 2400);
}

function open<T>(kind: OverlayKind, render: (close: (value?: T) => void) => ReactNode, dismissible = true, bare = false): Promise<T | undefined> {
  return new Promise<T | undefined>((resolve) => {
    const id = ++seq;
    const overlay: Overlay = {
      id,
      kind,
      dismissible,
      bare,
      render: render as Overlay["render"],
      resolve: (v) => {
        useUi.setState((s) => ({ overlays: s.overlays.filter((o) => o.id !== id) }));
        resolve(v as T | undefined);
      },
    };
    useUi.setState((s) => ({ overlays: [...s.overlays, overlay] }));
  });
}

/** Bottom sheet on phones, a centred card on wide screens. Resolves with what it closes with. */
export const openSheet = <T,>(render: (close: (value?: T) => void) => ReactNode) => open<T>("sheet", render);

/** A modal dialog. Resolves with what it closes with. */
export const openDialog = <T,>(render: (close: (value?: T) => void) => ReactNode, dismissible = true, opts: { bare?: boolean } = {}) =>
  open<T>("dialog", render, dismissible, opts.bare);

/** Full-screen over everything (the moments viewer). Escape closes it. */
export const openScreen = <T,>(render: (close: (value?: T) => void) => ReactNode) => open<T>("screen", render);

/** Closes every open overlay (e.g. on navigation). */
export function closeAllOverlays() {
  useUi.getState().overlays.forEach((o) => o.resolve(undefined));
}
