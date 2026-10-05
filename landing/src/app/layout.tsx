import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import Script from "next/script";

import { JsonLd } from "@/components/json-ld";
import { organizationLd, websiteLd } from "@/lib/seo";
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

const verification: Metadata["verification"] = {
  ...(site.verification.google ? { google: site.verification.google } : {}),
  ...(site.verification.yandex ? { yandex: site.verification.yandex } : {}),
  ...(site.verification.bing ? { other: { "msvalidate.01": site.verification.bing } } : {}),
};

export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  title: { default: site.title, template: `%s | ${site.name}` },
  description: site.description,
  keywords: [...site.keywords],
  applicationName: site.name,
  authors: [{ name: site.legalName, url: site.url }],
  creator: site.legalName,
  publisher: site.legalName,
  category: "social networking",
  alternates: { canonical: "/", types: { "application/rss+xml": [{ url: "/blog/feed.xml", title: `${site.name} blog` }] } },
  robots: { index: true, follow: true, googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1, "max-video-preview": -1 } },
  openGraph: { type: "website", siteName: site.name, locale: site.locale, title: site.title, description: site.description, url: "/" },
  twitter: { card: "summary_large_image", title: site.title, description: site.description, ...(site.twitter ? { site: site.twitter, creator: site.twitter } : {}) },
  // favicon.ico, icon.svg and apple-icon.png in app/ are picked up as files.
  appleWebApp: { title: site.name, statusBarStyle: "black-translucent" },
  formatDetection: { telephone: false },
  verification,
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
      <body>
        {children}
        <JsonLd nodes={[organizationLd(), websiteLd()]} />
        {site.gaId && (
          <>
            <Script src={`https://www.googletagmanager.com/gtag/js?id=${site.gaId}`} strategy="afterInteractive" />
            <Script id="ga" strategy="afterInteractive">
              {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','${site.gaId}');`}
            </Script>
          </>
        )}
      </body>
    </html>
  );
}
