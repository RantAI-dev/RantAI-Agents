/**
 * Preload for `bun test` (bunfig.toml [test] preload).
 *
 * Next.js ships `server-only` as a sentinel that throws if a Client Component
 * imports it. Under vitest, vitest.config.ts aliases it to
 * tests/stubs/server-only.ts; `bun test` does not read that config, so the
 * real package throws for every server module guarded by it. Mocked here —
 * the bun-side equivalent of the same stub — so the suite runs under both
 * runners. Never loaded by vitest: it is not a *.test.ts and not a vitest
 * setup file.
 *
 * "bun:test" is imported through require because the repo has no bun type
 * declarations (tsc cannot resolve the module, and Bun provides require in
 * preloaded files).
 */
type BunTestMock = { module: (specifier: string, factory: () => unknown) => void }

// eslint-disable-next-line @typescript-eslint/no-require-imports
const bunTest = require("bun:test") as { mock: BunTestMock }

bunTest.mock.module("server-only", () => ({}))
