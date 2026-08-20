/**
 * Stub for Next.js's `server-only` sentinel.
 *
 * The real package throws if a client component imports it. Under vitest there
 * is no "react-server" resolver condition, so any module guarded by it would
 * fail to load. Aliased in vitest.config.ts.
 *
 * This lives in the repo rather than pointing at node_modules/server-only:
 * that path has been wrong (it referenced an `empty.js` the installed package
 * does not ship), which failed the suite with "Cannot find package
 * 'server-only'" for anything importing lib/llm/provider-registry.
 */
export {}
