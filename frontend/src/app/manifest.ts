import type { MetadataRoute } from "next";

// Makes YesBoss installable from Chrome on Android (and other browsers): its own icon and a full-screen window with no
// browser bar. Opening /dashboard sends an owner to the dashboard and an employee to Let's Talk (see DashboardLayout);
// someone who is signed out lands on the login page.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "YesBoss",
    short_name: "YesBoss",
    description: "Your AI business operating system",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#ffffff",
    theme_color: "#ffffff",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
