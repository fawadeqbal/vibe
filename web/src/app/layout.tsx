import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";

import { AppRuntime } from "@/components/layout/app-runtime";

import "./globals.css";

// The app's bundled typefaces (SIL Open Font License, see fonts/OFL.txt).
const geist = localFont({
  variable: "--font-geist",
  display: "swap",
  src: [
    { path: "./fonts/Geist-Regular.ttf", weight: "400" },
    { path: "./fonts/Geist-Medium.ttf", weight: "500" },
    { path: "./fonts/Geist-SemiBold.ttf", weight: "600" },
    { path: "./fonts/Geist-Bold.ttf", weight: "700" },
    { path: "./fonts/Geist-ExtraBold.ttf", weight: "800" },
  ],
});

const geistMono = localFont({
  variable: "--font-geist-mono",
  display: "swap",
  src: [
    { path: "./fonts/GeistMono-Medium.ttf", weight: "500" },
    { path: "./fonts/GeistMono-SemiBold.ttf", weight: "600" },
  ],
});

const instrumentSerif = localFont({
  variable: "--font-instrument-serif",
  display: "swap",
  src: [{ path: "./fonts/InstrumentSerif-Italic.ttf", weight: "400", style: "italic" }],
});

export const metadata: Metadata = {
  title: { default: "Vibe", template: "%s · Vibe" },
  description: "Meet someone new on video, right now. One tap connects you with a real person somewhere in the world.",
  applicationName: "Vibe",
};

export const viewport: Viewport = {
  themeColor: "#0B0A10",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${geist.variable} ${geistMono.variable} ${instrumentSerif.variable}`}>
      <body>
        <AppRuntime>{children}</AppRuntime>
      </body>
    </html>
  );
}
