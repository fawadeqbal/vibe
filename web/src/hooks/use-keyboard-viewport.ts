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
 *  - if the browser slid the page to show the field, it's put back, since
 *    the shell already fits above the keyboard.
 */
export function useKeyboardViewport() {
  useEffect(() => {
    const root = document.documentElement;
    const vv = window.visualViewport;
    // The tallest the page has been in this orientation: the keyboard is "open" when we're well under it.
    let full = 0;
    let orientation = window.innerWidth > window.innerHeight;
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const landscape = window.innerWidth > window.innerHeight;
        if (landscape !== orientation) {
          orientation = landscape;
          full = 0;
        }
        const h = vv ? vv.height : window.innerHeight;
        full = Math.max(full, h, vv ? 0 : window.innerHeight);
        // A text field has focus and the page lost a keyboard's worth of height.
        const typing = isTextField(document.activeElement);
        const open = typing && full - h > 120;
        root.style.setProperty("--app-h", `${Math.round(h)}px`);
        if (open) root.dataset.keyboard = "open";
        else delete root.dataset.keyboard;
        if (open && (window.scrollY !== 0 || (vv && vv.offsetTop !== 0))) window.scrollTo(0, 0);
      });
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
      cancelAnimationFrame(frame);
      vv?.removeEventListener("resize", update);
      vv?.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
      document.removeEventListener("focusin", update);
      document.removeEventListener("focusout", update);
      root.style.removeProperty("--app-h");
      delete root.dataset.keyboard;
    };
  }, []);
}

function isTextField(el: Element | null): boolean {
  if (!el) return false;
  if (el instanceof HTMLTextAreaElement || (el as HTMLElement).isContentEditable) return true;
  if (el instanceof HTMLInputElement) return !["checkbox", "radio", "range", "button", "submit", "file", "color", "image", "reset"].includes(el.type);
  return el instanceof HTMLSelectElement;
}
