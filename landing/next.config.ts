import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // A marketing page with no server logic: `next build` writes plain files to
  // out/, served by nginx in the Docker image (or any static host / CDN).
  output: "export",
  poweredByHeader: false,
  images: { unoptimized: true },
  trailingSlash: true,
};

export default nextConfig;
