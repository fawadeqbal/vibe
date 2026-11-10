"use client";

import { type PointerEvent as ReactPointerEvent, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

export type Corner = "tl" | "tr" | "bl" | "br";

/** The tile's size and the room it keeps clear: the header on top, the controls dock at the bottom. */
export interface PipFrame {
  w: number;
  h: number;
  /** Clear of the call's header (plus the top safe area). */
  top: number;
  /** Clear of the controls dock (plus the bottom safe area). */
  bottom: number;
  margin: number;
}

export const PIP_FRAME: PipFrame = { w: 100, h: 140, top: 78, bottom: 132, margin: 12 };

/** While the call's controls are hidden: the header and dock are gone, so the tile moves up (and down) to the edges. */
export const PIP_FRAME_BARE: PipFrame = { ...PIP_FRAME, top: 18, bottom: 24 };

/** Where a tile sits in each corner of a `width` × `height` stage (pure: tested). */
export function cornerPoint(corner: Corner, width: number, height: number, f: PipFrame, safeTop = 0, safeBottom = 0): { x: number; y: number } {
  const x = corner.endsWith("l") ? f.margin : Math.max(f.margin, width - f.w - f.margin);
  const y = corner.startsWith("t") ? f.top + safeTop : Math.max(f.top + safeTop, height - f.h - f.bottom - safeBottom);
  return { x, y };
}

/** The corner nearest to where the tile was let go (its centre against the stage's middle). */
export function nearestCorner(x: number, y: number, width: number, height: number, f: PipFrame): Corner {
  const left = x + f.w / 2 < width / 2;
  const top = y + f.h / 2 < height / 2;
  return `${top ? "t" : "b"}${left ? "l" : "r"}` as Corner;
}

/** A movement under this many pixels is a tap (swap), not a drag. */
const TAP_SLOP = 8;

/**
 * The small picture in a video call, like WhatsApp: drag it anywhere and
 * it snaps to the nearest corner (clear of the header and the controls);
 * tap it to swap it with the big picture. Place the returned `style` and
 * `handlers` on the tile, and `probe` anywhere in the stage (it measures
 * the safe areas).
 */
export function usePip(onTap: () => void, frame: PipFrame = PIP_FRAME) {
  const [corner, setCorner] = useState<Corner>("tr");
  const [size, setSize] = useState({ w: 0, h: 0, safeTop: 0, safeBottom: 0 });
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null);
  const start = useRef<{ px: number; py: number; x: number; y: number; moved: boolean } | null>(null);
  const probe = useRef<HTMLSpanElement>(null);

  const measure = useCallback(() => {
    const p = probe.current;
    const stage = p?.offsetParent as HTMLElement | null;
    if (!p || !stage) return;
    const safeTop = p.offsetTop;
    const safeBottom = Math.max(0, stage.clientHeight - p.offsetTop - p.offsetHeight);
    setSize({ w: stage.clientWidth, h: stage.clientHeight, safeTop, safeBottom });
  }, []);
  useLayoutEffect(measure, [measure]);
  useEffect(() => {
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [measure]);

  const at = cornerPoint(corner, size.w, size.h, frame, size.safeTop, size.safeBottom);
  const pos = drag ?? at;

  const handlers = {
    onPointerDown: (e: ReactPointerEvent<HTMLElement>) => {
      if (e.button !== 0) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      start.current = { px: e.clientX, py: e.clientY, x: pos.x, y: pos.y, moved: false };
    },
    onPointerMove: (e: ReactPointerEvent<HTMLElement>) => {
      const s = start.current;
      if (!s) return;
      const dx = e.clientX - s.px;
      const dy = e.clientY - s.py;
      if (!s.moved && Math.hypot(dx, dy) < TAP_SLOP) return;
      s.moved = true;
      // Kept on screen while it moves.
      const x = Math.min(Math.max(0, s.x + dx), Math.max(0, size.w - frame.w));
      const y = Math.min(Math.max(0, s.y + dy), Math.max(0, size.h - frame.h));
      setDrag({ x, y });
    },
    onPointerUp: () => {
      const s = start.current;
      start.current = null;
      if (!s) return;
      if (!s.moved) return onTap();
      if (drag) setCorner(nearestCorner(drag.x, drag.y, size.w, size.h, frame));
      setDrag(null);
    },
    onPointerCancel: () => {
      start.current = null;
      setDrag(null);
    },
  };

  const style = {
    left: 0,
    top: 0,
    width: frame.w,
    height: frame.h,
    transform: `translate3d(${pos.x}px, ${pos.y}px, 0)`,
    transition: drag ? "none" : "transform 220ms cubic-bezier(0.16, 1, 0.3, 1)",
    touchAction: "none" as const,
    // Until the stage is measured, stay out of sight rather than flash in the corner.
    visibility: size.w ? ("visible" as const) : ("hidden" as const),
  };

  return { corner, style, handlers, probe, dragging: drag !== null };
}
