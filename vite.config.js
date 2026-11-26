import { defineConfig } from "vite";
export default defineConfig({
  base: "./",
  build: { target: "es2022" },
  optimizeDeps: { include: ["fonteditor-core"] },
  server: { host: "0.0.0.0" },
});
