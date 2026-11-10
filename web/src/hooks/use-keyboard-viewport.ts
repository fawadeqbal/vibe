"use client";

import { useEffect } from "react";

/**
 * Keeps the app the size of what you can actually see, in every browser,
 * so opening the keyboard never zooms, slides or jumps the page.
 *
 * Browsers differ: iPhone/iPad Safari (and every iOS browser, all WebKit)
 * slide the whole page up instead of resizing it; Samsung Internet and some
 * Android WebViews lay the keyboard over the page; Chrome and Firefox on
 * Android resize it (viewport `interactive-widget=resizes-content`). This
 * handles them all the same way:
 *
 *  - `--app-h` = the visible height (the app shell uses it; also a height for
 *    old browsers without `100dvh`),
 *  - `html[data-keyboard="open"]` while the keyboard is up, so the home-bar
 *    gap under message boxes goes away (`--safe-bottom: 0`),
 *  - `--app-top` = where the visible area starts on the page: when a browser
 *    slides the page to show the field (iOS does, while the keyboard comes
 *    up), the shell moves with it instead of being scrolled back, so the
 *    header never jumps or flickers. Only with a keyboard up: any other movement
 *    of the page is iOS bouncing it at the end of a list (globals.css stops
 *    that), and following the bounce made the whole screen shake.
 */
export function useKeyboardViewport() {
  useEffect(() => {
    const root = document.documentElement;
    const vv = window.visualViewport;
    // The tallest the page has been in this orientation: the keyboard is "open" when we're well under it.
    let full = 0;
    let orientation = window.innerWidth > window.innerHeight;
    const update = () => {
      const landscape = window.innerWidth > window.innerHeight;
      if (landscape !== orientation) {
        orientation = landscape;
        full = 0;
      }
      const v = viewportState({
        height: vv ? vv.height : window.innerHeight,
        full: Math.max(full, vv ? 0 : window.innerHeight),
        pageTop: vv ? vv.pageTop : window.scrollY,
        typing: isTextField(document.activeElement),
      });
      full = v.full;
      // Set right away (no frame later): the shell follows the keyboard as it slides.
      root.style.setProperty("--app-h", `${v.height}px`);
      root.style.setProperty("--app-top", `${v.top}px`);
      // Only while slid: the shell moves then (and only then changes how things inside it stack).
      if (v.top > 0) root.dataset.shift = "1";
      else delete root.dataset.shift;
      if (v.open) root.dataset.keyboard = "open";
      else delete root.dataset.keyboard;
    };
    update();
    vv?.addEventListener("resize", update);
    vv?.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    // Focus moving in or out of a field can open/close the keyboard before any resize arrives.
    document.addEventListener("focusin", update);
    document.addEventListener("focusout", update);
    return () => {
      vv?.removeEventListener("resize", update);
      vv?.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
      document.removeEventListener("focusin", update);
      document.removeEventListener("focusout", update);
      root.style.removeProperty("--app-h");
      root.style.removeProperty("--app-top");
      delete root.dataset.shift;
      delete root.dataset.keyboard;
    };
  }, []);
}

/**
 * What the shell should do for one measurement: its height, how far to move
 * with a page the browser slid, and whether the keyboard is open. `full` is
 * the tallest height seen in this orientation (returned updated).
 */
export function viewportState(m: { height: number; full: number; pageTop: number; typing: boolean }) {
  const full = Math.max(m.full, m.height);
  // A text field has focus and the page lost a keyboard's worth of height.
  const open = m.typing && full - m.height > 120;
  // Follow the slide only while a keyboard is (or is still closing) on screen:
  // any other movement is iOS bouncing the page, and following it shook the screen.
  const keyboardUp = m.typing || full - m.height > 120;
  const top = keyboardUp ? Math.max(0, Math.round(m.pageTop)) : 0;
  return { height: Math.round(m.height), full, open, top };
}

function isTextField(el: Element | null): boolean {
  if (!el) return false;
  if (el instanceof HTMLTextAreaElement || (el as HTMLElement).isContentEditable) return true;
  if (el instanceof HTMLInputElement) return !["checkbox", "radio", "range", "button", "submit", "file", "color", "image", "reset"].includes(el.type);
  return el instanceof HTMLSelectElement;
}
