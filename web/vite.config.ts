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
      includeAssets: ["favicon.svg", "pwa-icon.svg", "pwa-icon-512.png", "pwa-icon-192.png", "pwa-icon-96.png", "pwa-icon-maskable.png"],
      manifest: {
        name: "Reflective Lens",
        short_name: "Reflective Lens",
        description: "See your coaching clearly. Reflect, don't judge.",
        theme_color: "#22272b",
        background_color: "#22272b",
        display: "standalone",
        orientation: "portrait",
        // PNG, not SVG. Android launchers rasterise these themselves and will
        // quietly ignore an SVG, which is why "press and hold the icon" never
        // produced the shortcut below: the shortcut was there, its icon was
        // not, and the launcher dropped the whole entry rather than showing it
        // without one. The SVG stays last as a nicety for anything that
        // prefers vector.
        icons: [
          { src: "pwa-icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          { src: "pwa-icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "pwa-icon-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
          { src: "pwa-icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
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
            icons: [{ src: "pwa-icon-96.png", sizes: "96x96", type: "image/png" }],
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
        navigateFallbackDenylist: [/^\/functions\//],
      },
    }),
  ],
});
