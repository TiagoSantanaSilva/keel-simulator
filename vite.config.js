import { defineConfig } from "vite";

// base: "./" keeps asset paths relative so the built site works on GitHub Pages
// or any static host, including when served from a sub-folder.
export default defineConfig({
  base: "./",
});
