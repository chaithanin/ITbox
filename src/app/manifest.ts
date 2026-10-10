import type { MetadataRoute } from "next";

/** PWA web app manifest (served at /manifest.webmanifest). Makes TECHCORE
 *  installable on mobile/desktop as a standalone app. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "TECHCORE — Enterprise IT Management",
    short_name: "TECHCORE",
    description: "ระบบบริหารจัดการไอทีองค์กร: ทรัพย์สิน, Vault, แจ้งซ่อม, สิทธิ์",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: "#0a1830",
    theme_color: "#0a1830",
    lang: "th",
    dir: "ltr",
    categories: ["business", "productivity", "utilities"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
