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
        description: "See your coaching clearly. Reflect, don't judge.",
        theme_color: "#22272b",
        background_color: "#22272b",
        display: "standalone",
        orientation: "portrait",
        icons: [
          { src: "pwa-icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
          { src: "pwa-icon.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
        ],
        // A long press on the installed icon offers this, so a thought on the
        // drive home is icon, press, tap, speak. Android honours it; iOS ignores
        // shortcuts entirely, and the way round there is a second home screen
        // icon added straight from /capture, or the action button on a 15 Pro
        // and later. Both are in docs/beta-launch.md.
        //
        // No web app can put a record button on a LOCKED phone. Neither platform
        // will open a microphone from the lock screen for a website, at all, and
        // that is their decision rather than something to work around. This
        // removes the steps that were ours to remove.
        shortcuts: [
          {
            name: "Capture a thought",
            short_name: "Thought",
            description: "Record something without opening a session",
            url: "/capture",
            icons: [{ src: "pwa-icon.svg", sizes: "any", type: "image/svg+xml" }],
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,woff2}"],
        navigateFallbackDenylist: [/^\/functions\//],
      },
    }),
  ],
});
