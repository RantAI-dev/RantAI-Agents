import { vi } from "vitest"
import type { KbRuntime } from "@/lib/kb-runtime/ports"

/**
 * In-memory KB ports for tests.
 *
 * The engine reaches infrastructure only through these, so a unit test never
 * needs a database, an object store or a socket server — it registers fakes
 * and asserts on them. `installFakeKbRuntime` is applied globally in
 * tests/setup-kb-runtime.ts so no test explodes on an unconfigured port;
 * individual tests override whatever they want to assert.
 */
export function makeFakeKbRuntime(overrides: Partial<KbRuntime> = {}): KbRuntime {
  const base: KbRuntime = {
    blob: {
      upload: vi.fn(async () => ({ size: 0 })),
      download: vi.fn(async () => Buffer.from("")),
      delete: vi.fn(async () => {}),
      documentPath: (org, doc, file) => `documents/${org ?? "global"}/${doc}/${file}`,
      assetPath: (org, doc, file) => `documents/${org ?? "global"}/${doc}/assets/${file}`,
    },
    progress: { emit: vi.fn(async () => {}) },
    jobs: {
      create: vi.fn(async () => "job_test"),
      claimNextPending: vi.fn(async () => null),
      updateProgress: vi.fn(async () => {}),
      finish: vi.fn(async () => {}),
      touch: vi.fn(async () => {}),
      reclaimStale: vi.fn(async () => 0),
      listReapable: vi.fn(async () => []),
      clearS3Key: vi.fn(async () => {}),
    },
    documents: {
      findAliveIdsByFilter: vi.fn(async () => []),
      findAliveMetaByIds: vi.fn(async () => []),
      findById: vi.fn(async () => null),
      filterVisibleIds: vi.fn(async (ids: string[]) => ids),
      listAll: vi.fn(async () => []),
      deleteById: vi.fn(async () => {}),
      deleteAll: vi.fn(async () => {}),
      setStatus: vi.fn(async () => {}),
      updateMetadata: vi.fn(async () => {}),
      setMetadataFlag: vi.fn(async () => {}),
      recordRetrievalHits: vi.fn(async () => {}),
    },
    vectors: {
      query: vi.fn(async () => [] as never),
      relate: vi.fn(async () => {}),
      cleanupDocumentIntelligence: vi.fn(async () => ({
        deletedRelationTables: 0,
        entitiesDeleted: 0,
        chunksDeleted: 0,
      })),
    },
    config: {
      readKbSetting: vi.fn(async () => null),
      resolveProvider: vi.fn(async () => null),
    },
    endpoints: { resolveModel: vi.fn(() => null) },
    processor: { process: vi.fn(async () => "ready" as const) },
  }
  return { ...base, ...overrides }
}
