import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// Reflective Lens — installable PWA. The manifest + service worker let a coach
// add the app icon to their phone/iPad home screen (see the sign-up flow).
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg", "pwa-icon.svg"],
      manifest: {
        name: "Reflective Lens",
        short_name: "Reflective Lens",
        description: "See your coaching clearly — reflect, don't judge.",
        theme_color: "#123a2a",
        background_color: "#f6f5ef",
        display: "standalone",
        orientation: "portrait",
        icons: [
          { src: "pwa-icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
          { src: "pwa-icon.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,woff2}"],
        navigateFallbackDenylist: [/^\/functions\//],
      },
    }),
  ],
});
