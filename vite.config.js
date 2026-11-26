import { defineConfig } from "vite";
export default defineConfig({
  base: "./",
  build: { target: "es2022" },
  optimizeDeps: { include: ["fonteditor-core", "pdfjs-dist/legacy/build/pdf.mjs"] },
  server: { host: "0.0.0.0" },
});
