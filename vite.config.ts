import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";

/** Tags the installable web app needs; the Claude artifact build leaves them out */
const webAppTags = (): Plugin => ({
  name: "web-app-tags",
  transformIndexHtml: () => [
    { tag: "link", attrs: { rel: "manifest", href: "manifest.webmanifest" }, injectTo: "head" },
    { tag: "link", attrs: { rel: "apple-touch-icon", href: "apple-touch-icon.png" }, injectTo: "head" },
    { tag: "meta", attrs: { name: "theme-color", content: "#f3f3f1", media: "(prefers-color-scheme: light)" }, injectTo: "head" },
    { tag: "meta", attrs: { name: "theme-color", content: "#0b0c0b", media: "(prefers-color-scheme: dark)" }, injectTo: "head" },
    { tag: "meta", attrs: { name: "apple-mobile-web-app-capable", content: "yes" }, injectTo: "head" },
    { tag: "meta", attrs: { name: "mobile-web-app-capable", content: "yes" }, injectTo: "head" },
    { tag: "meta", attrs: { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" }, injectTo: "head" },
    { tag: "meta", attrs: { name: "apple-mobile-web-app-title", content: "Пости" }, injectTo: "head" },
  ],
});

// `vite build` makes the website (Vercel); `vite build --mode artifact` makes the single-file Claude artifact.
export default defineConfig(({ mode }) =>
  mode === "artifact"
    ? {
        plugins: [react(), viteSingleFile()],
        build: { target: "es2020", assetsInlineLimit: 100000000, cssCodeSplit: false, outDir: "dist-artifact" },
      }
    : {
        base: "./",
        plugins: [react(), webAppTags()],
        build: { target: "es2020" },
      },
);
