import { defineConfig } from "vitest/config"
import path from "path"

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  test: {
    globals: true,
    include: ["tests/**/*.test.ts", "src/features/**/*.test.ts"],
    testTimeout: 60000,
    hookTimeout: 60000,
    fileParallelism: false,
  },
})
