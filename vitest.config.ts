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
    // Stub heavy / browser-only icon library at the test boundary. The real
    // module pulls in @lineiconshq packages whose package.json points "main"
    // at a non-existent file, breaking vitest's module resolution. Tests that
    // transitively import @/lib/icons (registry.ts, create-artifact.ts, etc.)
    // only need icon symbols to exist as truthy objects — they never render
    // the components.
    setupFiles: ["./tests/setup-icons-stub.ts"],
  },
})
