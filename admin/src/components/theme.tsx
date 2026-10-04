"use client";

import * as React from "react";

type Mode = "light" | "dark" | "system";
const KEY = "vibe-admin-theme";

const Ctx = React.createContext<{ mode: Mode; resolved: "light" | "dark"; setMode: (m: Mode) => void }>({ mode: "system", resolved: "light", setMode: () => undefined });

/** Runs before paint (inlined in <head>) so there is no light flash in dark mode. */
export const themeScript = `(function(){try{var m=localStorage.getItem('${KEY}')||'system';var d=m==='dark'||(m==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d)}catch(e){}})()`;

function systemDark() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function readMode(): Mode {
  try {
    return (localStorage.getItem(KEY) as Mode) || "system";
  } catch {
    return "system";
  }
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = React.useState<Mode>("system");
  const [dark, setDark] = React.useState(false);

  React.useEffect(() => {
    // Sync with what the inline script already applied.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time read of browser-only state
    setModeState(readMode());
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  React.useEffect(() => {
    const apply = () => {
      const d = mode === "dark" || (mode === "system" && systemDark());
      document.documentElement.classList.toggle("dark", d);
      setDark(d);
    };
    apply();
    if (mode !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [mode]);

  const setMode = React.useCallback((m: Mode) => {
    try {
      localStorage.setItem(KEY, m);
    } catch {
      /* private mode: theme just won't persist */
    }
    setModeState(m);
  }, []);

  return <Ctx.Provider value={{ mode, resolved: dark ? "dark" : "light", setMode }}>{children}</Ctx.Provider>;
}

export const useTheme = () => React.useContext(Ctx);
