import { defineConfig } from "vitest/config"
import path from "node:path"

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@app": path.resolve(__dirname, "./app"),
    },
  },
  test: {
    environment: "node",
    setupFiles: ["./__tests__/setup.ts"],
    globals: true,
  },
})
