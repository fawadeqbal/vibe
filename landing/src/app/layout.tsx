import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";

import { site } from "@/lib/site";

import "./globals.css";

// Same typefaces as the app (SIL Open Font License, see fonts/OFL.txt).
const geist = localFont({
  variable: "--font-geist",
  display: "swap",
  src: [
    { path: "./fonts/Geist-Regular.woff2", weight: "400" },
    { path: "./fonts/Geist-Medium.woff2", weight: "500" },
    { path: "./fonts/Geist-SemiBold.woff2", weight: "600" },
    { path: "./fonts/Geist-Bold.woff2", weight: "700" },
  ],
});

const instrumentSerif = localFont({
  variable: "--font-instrument-serif",
  display: "swap",
  src: [{ path: "./fonts/InstrumentSerif-Italic.woff2", weight: "400", style: "italic" }],
});

export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  title: site.title,
  description: site.description,
  applicationName: site.name,
  alternates: { canonical: "/" },
  openGraph: { type: "website", siteName: site.name, title: site.title, description: site.description, url: "/" },
  twitter: { card: "summary_large_image", title: site.title, description: site.description },
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
    <html lang="en" className={`${geist.variable} ${instrumentSerif.variable}`}>
      <body>{children}</body>
    </html>
  );
}
