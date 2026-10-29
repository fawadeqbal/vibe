import type { MetadataRoute } from "next";

/** Lets people add Vibe to their home screen and open it like an app (fullscreen, its own icon). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Vibe — meet someone new",
    short_name: "Vibe",
    description: "Random video chat and swipe-to-match with real, verified people.",
    start_url: "/match",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0B0A10",
    theme_color: "#0B0A10",
    categories: ["social", "entertainment", "lifestyle"],
    icons: [
      { src: "/icons/app-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/app-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/app-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Video match", url: "/match" },
      { name: "Discover", url: "/discover" },
      { name: "Chats", url: "/chats" },
    ],
  };
}
