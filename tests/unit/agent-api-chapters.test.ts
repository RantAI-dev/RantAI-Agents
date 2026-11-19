/**
 * Unit tests for GET /api/v1/mapel/chapters (UAT issue 9).
 *
 * The picker this route fills has two jobs, and both are pinned here:
 *  - it must list REAL chapters (outline, rantai-kb structure, or BAB
 *    headings in the chunks — in that order) with 0-based pages, never an
 *    invented title;
 *  - it must list them ONLY for the subject the authenticated assistant
 *    owns — the document query below is where-aware, so a leak past
 *    resolveMapel's ids would show up as another grade's book in data.
 *
 * S3, the PDF reader, the chunk store, the KB structure client and prisma
 * are all mocked; no network, no database. The prisma mocks are
 * WHERE-AWARE for the same reason as agent-api-kb-scope: a naive mock
 * returning every row would pass the tenancy tests against a broken
 * filter.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { mkdtempSync, rmSync, writeFileSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"

// ── module mocks ─────────────────────────────────────────────────────────────

const assistantFindUnique = vi.fn()
const groupFindMany = vi.fn()
const documentFindMany = vi.fn()

vi.mock("@/lib/prisma", () => ({
  prisma: {
    assistant: { findUnique: (...a: unknown[]) => assistantFindUnique(...a) },
    knowledgeBaseGroup: { findMany: (...a: unknown[]) => groupFindMany(...a) },
    document: { findMany: (...a: unknown[]) => documentFindMany(...a) },
  },
}))

// Full working set, like agent-api-uat-chat re-registers: files that ran
// earlier leave partial (non-Promise) members on this path in bun's shared
// registry.
vi.mock("@/features/agent-api-keys/repository", () => ({
  findAgentApiKeyByHash: vi.fn(async () => null),
  findAgentApiKeyByKey: vi.fn(async (key: string) => ({
    id: "key_k7",
    keyHash: null,
    assistantId: "asst_k7",
    enabled: true,
    expiresAt: null,
    scopes: ["chat", "chat:stream"],
    ipWhitelist: [],
    key,
  })),
  findAgentApiKeyById: vi.fn(),
  findAgentApiKeysByOrganization: vi.fn(),
  findAgentApiKeysByAssistantId: vi.fn(),
  findAssistantById: vi.fn(async () => ({ id: "asst_k7", name: "Elise Kelas 7 — Tanya", emoji: null })),
  createAgentApiKey: vi.fn(),
  updateAgentApiKey: vi.fn(async () => ({})),
  deleteAgentApiKey: vi.fn(),
  incrementAgentApiKeyUsage: vi.fn(async () => ({})),
}))

const downloadFileMock = vi.fn()
const uploadFileMock = vi.fn()
vi.mock("@/lib/s3", () => ({
  downloadFile: (...a: unknown[]) => downloadFileMock(...a),
  uploadFile: (...a: unknown[]) => uploadFileMock(...a),
}))

const readPdfOutlineMock = vi.fn()
vi.mock("@/features/agent-api/pdf-outline", () => ({
  readPdfOutline: (...a: unknown[]) => readPdfOutlineMock(...a),
}))

const listDocumentChunkTextsMock = vi.fn()
vi.mock("@/features/agent-api/chunk-texts", () => ({
  listDocumentChunkTexts: (...a: unknown[]) => listDocumentChunkTextsMock(...a),
}))

const remoteDocumentTextsMock = vi.fn()
vi.mock("@/lib/kb-client/remote-structure", () => ({
  remoteDocumentTexts: (...a: unknown[]) => remoteDocumentTextsMock(...a),
}))

import { GET as chaptersRoute } from "@/app/api/v1/mapel/chapters/route"
import {
  chaptersFromTextUnits,
  parseChapterNumber,
  __resetChaptersCacheForTests,
} from "@/features/agent-api/chapters"
import { __resetRemoteRouteCacheForTests } from "@/lib/kb-client/routing"

// ── fixtures ────────────────────────────────────────────────────────────────

const ORG = "org-ugm"
const OTHER_ORG = "org-lain"

/** The grade-7 layout: the assistant binds its per-subject groups directly. */
const GROUPS = [
  { id: "g_ipa7", name: "IPA — Kelas 7", parentId: null, organizationId: ORG, docCount: 2 },
  { id: "g_mtk7", name: "Matematika — Kelas 7", parentId: null, organizationId: ORG, docCount: 1 },
  { id: "g_ipa8", name: "IPA — Kelas 8", parentId: null, organizationId: ORG, docCount: 5 },
  { id: "g_bio10", name: "Biologi", parentId: null, organizationId: OTHER_ORG, docCount: 7 },
]

const KELAS_7 = { organizationId: ORG, knowledgeBaseGroupIds: ["g_ipa7", "g_mtk7"] }

/** Documents with the groups they belong to; the route must only ever see
 *  the ones joined to the resolved subject's groups. */
const DOCS = [
  {
    id: "doc-ipa-a",
    title: "Buku IPA VII A",
    s3Key: "documents/org-ugm/doc-ipa-a/ipa-a.pdf",
    fileType: "pdf",
    updatedAt: new Date("2026-11-01T08:00:00.000Z"),
    deletedAt: null,
    groupIds: ["g_ipa7"],
  },
  {
    id: "doc-ipa-b",
    title: "Buku IPA VII B",
    s3Key: "documents/org-ugg/doc-ipa-b/ipa-b.pdf",
    fileType: "pdf",
    updatedAt: new Date("2026-11-02T08:00:00.000Z"),
    deletedAt: null,
    groupIds: ["g_ipa7"],
  },
  {
    id: "doc-mtk",
    title: "Buku Matematika VII",
    s3Key: null,
    fileType: "pdf",
    updatedAt: new Date("2026-11-03T08:00:00.000Z"),
    deletedAt: null,
    groupIds: ["g_mtk7"],
  },
  {
    id: "doc-ipa-8",
    title: "Buku IPA VIII",
    s3Key: "documents/org-ugm/doc-ipa-8/ipa-8.pdf",
    fileType: "pdf",
    updatedAt: new Date("2026-11-04T08:00:00.000Z"),
    deletedAt: null,
    groupIds: ["g_ipa8"],
  },
  {
    id: "doc-bio",
    title: "Buku Biologi X",
    s3Key: "documents/org-lain/doc-bio/bio.pdf",
    fileType: "pdf",
    updatedAt: new Date("2026-11-05T08:00:00.000Z"),
    deletedAt: null,
    groupIds: ["g_bio10"],
  },
]

interface GroupWhere {
  organizationId?: string | null
  OR?: Array<{ id?: { in: string[] }; parentId?: { in: string[] } }>
  parentId?: { in: string[] }
}

/** Where-aware stand-in for prisma.knowledgeBaseGroup.findMany: answers the
 *  scope lookup (organization + id/parentId OR) and expandGroupIds'
 *  children lookup alike, so listMapelForAssistant and the document scope
 *  can never disagree about what is reachable. */
const answerGroupFindMany = async (args?: { where?: GroupWhere }) => {
  const where = args?.where
  let rows = GROUPS
  if (where && "organizationId" in where) {
    rows = rows.filter((g) => g.organizationId === where.organizationId)
  }
  const or = where?.OR
  if (Array.isArray(or)) {
    const ids = new Set(or.flatMap((c) => c?.id?.in ?? []))
    const parents = new Set(or.flatMap((c) => c?.parentId?.in ?? []))
    rows = rows.filter((g) => ids.has(g.id) || parents.has(g.parentId ?? ""))
  }
  const parentId = where?.parentId
  if (parentId && typeof parentId === "object" && Array.isArray(parentId.in)) {
    rows = rows.filter((g) => parentId.in.includes(g.parentId ?? ""))
  }
  return rows
    .slice()
    .sort((a, b) => (a.name < b.name ? -1 : 1))
    .map((g) => ({ id: g.id, name: g.name, parentId: g.parentId, _count: { documents: g.docCount } }))
}

interface DocumentWhere {
  deletedAt?: null
  groups?: { some?: { groupId?: { in?: string[] } } }
}

/** Captures the last where so the tenancy assertions can read the group ids
 *  the route actually queried with. */
let lastDocumentWhere: DocumentWhere | undefined

/** Where-aware stand-in for prisma.document.findMany. */
const answerDocumentFindMany = async (args?: { where?: DocumentWhere }) => {
  const where = args?.where
  lastDocumentWhere = where
  let rows = DOCS.filter((d) => d.deletedAt === null)
  const inGroups = where?.groups?.some?.groupId?.in
  if (Array.isArray(inGroups)) {
    rows = rows.filter((d) => d.groupIds.some((g) => inGroups.includes(g)))
  } else if (where?.groups) {
    rows = []
  }
  return rows
    .slice()
    .sort((a, b) => (a.title < b.title ? -1 : 1))
    .map((d) => ({
      id: d.id,
      title: d.title,
      s3Key: d.s3Key,
      fileType: d.fileType,
      updatedAt: d.updatedAt,
    }))
}

function chaptersRequest(mapel?: string): Request {
  const url =
    mapel === undefined
      ? "http://app.test/api/v1/mapel/chapters"
      : `http://app.test/api/v1/mapel/chapters?mapel=${encodeURIComponent(mapel)}`
  return new Request(url, { headers: { authorization: "Bearer rantai_sk_test" } })
}

async function getJson(mapel?: string): Promise<{ status: number; body: Record<string, any> }> {
  const res = await chaptersRoute(chaptersRequest(mapel))
  return { status: res.status, body: (await res.json()) as Record<string, any> }
}

/** The heading-line fixture the chunk fallback tests share: a contents
 *  page, a markdown heading, a running header, a roman-numeral BAB and a
 *  body sentence that merely starts with the words. */
const HEADING_UNITS = [
  {
    page: 3,
    text:
      "Daftar Isi\n" +
      "Bab 1 Objek IPA dan Pengamatannya .... 1\n" +
      "Bab 2 Pengamatan dan Percobaan .... 15\n" +
      "Bab 3 Klasifikasi Makhluk Hidup .... 40",
  },
  { page: 5, text: "## **Bab 1** Objek IPA dan Pengamatannya\nSegala sesuatu di sekitar kita dapat diamati." },
  { page: 20, text: "Bab 1 Objek IPA dan Pengamatannya 7\nTabel pengamatan pada kegiatan 1.1." },
  { page: 21, text: "Bab 2 Pengamatan dan Percobaan\nSuatu pengamatan memerlukan alat." },
  { page: 35, text: "Bab 3 ini, kamu akan belajar tentang klasifikasi makhluk hidup.\nBanyak makhluk hidup di sekitar kita." },
  { page: 40, text: "BAB III Klasifikasi Makhluk Hidup\nCiri-ciri makhluk hidup berbeda-beda." },
]

// ── environment plumbing ────────────────────────────────────────────────────

const ROUTE_ENV_KEYS = ["KB_REMOTE_URL", "KB_REMOTE_API_KEY", "KB_REMOTE_ROUTES_FILE"] as const
const savedRouteEnv: Record<string, string | undefined> = {}
let routesDir: string | null = null

beforeEach(() => {
  for (const key of ROUTE_ENV_KEYS) savedRouteEnv[key] = process.env[key]
  delete process.env.KB_REMOTE_URL
  delete process.env.KB_REMOTE_API_KEY
  delete process.env.KB_REMOTE_ROUTES_FILE
  __resetRemoteRouteCacheForTests()

  assistantFindUnique.mockReset()
  assistantFindUnique.mockResolvedValue(KELAS_7)
  groupFindMany.mockReset()
  groupFindMany.mockImplementation(answerGroupFindMany)
  documentFindMany.mockReset()
  documentFindMany.mockImplementation(answerDocumentFindMany)
  lastDocumentWhere = undefined

  downloadFileMock.mockReset()
  downloadFileMock.mockImplementation(async (key: string) => Buffer.from(`pdf-bytes:${key}`))
  uploadFileMock.mockReset()
  uploadFileMock.mockImplementation(async (key: string) => ({ key, url: "", size: 0 }))
  readPdfOutlineMock.mockReset()
  readPdfOutlineMock.mockResolvedValue([])
  listDocumentChunkTextsMock.mockReset()
  listDocumentChunkTextsMock.mockResolvedValue([])
  remoteDocumentTextsMock.mockReset()
  remoteDocumentTextsMock.mockResolvedValue(null)

  __resetChaptersCacheForTests()
})

afterEach(() => {
  for (const key of ROUTE_ENV_KEYS) {
    if (savedRouteEnv[key] === undefined) delete process.env[key]
    else process.env[key] = savedRouteEnv[key]
  }
  __resetRemoteRouteCacheForTests()
  if (routesDir) {
    rmSync(routesDir, { recursive: true, force: true })
    routesDir = null
  }
})

// ── pure helpers ─────────────────────────────────────────────────────────────

describe("parseChapterNumber", () => {
  it("reads arabic and roman chapter numbers", () => {
    expect(parseChapterNumber("3")).toBe(3)
    expect(parseChapterNumber("iii")).toBe(3)
    expect(parseChapterNumber("III")).toBe(3)
    expect(parseChapterNumber("XII")).toBe(12)
    expect(parseChapterNumber("XIV")).toBe(14)
  })

  it("rejects what is not a chapter number a book would have", () => {
    expect(parseChapterNumber("abc")).toBeNull()
    expect(parseChapterNumber("")).toBeNull()
    expect(parseChapterNumber("0")).toBeNull()
    expect(parseChapterNumber("31")).toBeNull()
  })
})

describe("chaptersFromTextUnits", () => {
  it("keeps chapter headings in document order, first page per number", () => {
    const found = chaptersFromTextUnits(HEADING_UNITS)
    expect(found).toEqual([
      { title: "Objek IPA dan Pengamatannya", number: 1, page: 5 },
      { title: "Pengamatan dan Percobaan", number: 2, page: 21 },
      { title: "Klasifikasi Makhluk Hidup", number: 3, page: 40 },
    ])
  })

  it("drops the contents page whole, even without dot leaders", () => {
    // The dot-leader lines above are also individually filtered; this page
    // keeps its entries clean of dots but dense — the per-unit rule is what
    // must catch it.
    const units = [
      {
        page: 2,
        text: "Bab 1 Suhu dan Kalor\nBab 2 Zat dan Perubahannya\nBab 3 Listrik dan Kemagnetan",
      },
      { page: 10, text: "Bab 1 Suhu dan Kalor" },
    ]
    expect(chaptersFromTextUnits(units)).toEqual([
      { title: "Suhu dan Kalor", number: 1, page: 10 },
    ])
  })

  it("reads English Chapter headings", () => {
    const units = [{ page: 4, text: "Chapter 1 What Is Science" }]
    expect(chaptersFromTextUnits(units)).toEqual([
      { title: "What Is Science", number: 1, page: 4 },
    ])
  })

  it("drops a line that merged several contents entries", () => {
    // Real corpus noise (Agama Buddha Kelas VII, raw page text): a TOC line
    // carrying "Bab 4 …; Bab V Kesehatan" is entries run together, not a
    // chapter heading.
    const units = [
      { page: 5, text: "Bab 4 Kesetaraan Gender Dalam Agama Buddha; Bab V Kesehatan" },
      { page: 12, text: "Bab 4 Kesetaraan Gender Dalam Agama Buddha" },
    ]
    expect(chaptersFromTextUnits(units)).toEqual([
      { title: "Kesetaraan Gender Dalam Agama Buddha", number: 4, page: 12 },
    ])
  })

  it("strips a dot-leader's printed page remnant from the title", () => {
    // Real corpus noise (Informatika Kelas XI): "… Konfigurasi Keamanannya .205".
    const units = [{ page: 6, text: "Bab 5 Merancang Jaringan Komputer dan Konfigurasi Keamanannya .205" }]
    expect(chaptersFromTextUnits(units)).toEqual([
      { title: "Merancang Jaringan Komputer dan Konfigurasi Keamanannya", number: 5, page: 6 },
    ])
  })

  it("returns nothing when no unit holds a heading", () => {
    expect(chaptersFromTextUnits([{ page: 1, text: "Plain prose about suhu and kalor." }])).toEqual([])
    expect(chaptersFromTextUnits([])).toEqual([])
  })
})

// ── the route ────────────────────────────────────────────────────────────────

describe("GET /api/v1/mapel/chapters", () => {
  it("unknown mapel answers the same 400 as chat, before any document query", async () => {
    const { status, body } = await getJson("Kimia")
    expect(status).toBe(400)
    expect(body.error.message).toBe(
      'Unknown mapel "Kimia" for this assistant. Call GET /api/v1/mapel for the list. Available: IPA, Matematika',
    )
    expect(documentFindMany).not.toHaveBeenCalled()
  })

  it("missing mapel is a 400 that names the parameter", async () => {
    const { status, body } = await getJson(undefined)
    expect(status).toBe(400)
    expect(body.error.message).toContain("mapel")
  })

  it("no authorization header is a 401", async () => {
    const res = await chaptersRoute(new Request("http://app.test/api/v1/mapel/chapters?mapel=IPA"))
    expect(res.status).toBe(401)
  })

  it("outline present → titles + 0-based pages in outline order, book order then chapter order", async () => {
    // Book A's outline: an untitled introduction, then two numbered chapters.
    const outlineA = [
      { title: "Pendahuluan", page: 1 },
      { title: "Bab I Hakikat Ilmu Sains dan Metode Ilmiah", page: 3 },
      { title: "Bab II Klasifikasi Makhluk Hidup", page: 60 },
    ]
    // Book B (title sorts after A): two chapters of its own.
    const outlineB = [
      { title: "Bab 1 Suhu, Kalor, dan Pemuaian", page: 41 },
      { title: "Bab 2 Zat dan Perubahannya", page: 88 },
    ]
    downloadFileMock.mockImplementation(async (key: string) =>
      Buffer.from(key.includes("doc-ipa-a") ? "pdf-a" : "pdf-b"),
    )
    readPdfOutlineMock.mockImplementation(async (buffer: Buffer) =>
      buffer.toString() === "pdf-a" ? outlineA : outlineB,
    )

    const { status, body } = await getJson("IPA")

    expect(status).toBe(200)
    expect(body.object).toBe("list")
    expect(body.mapel).toBe("IPA")
    expect(body.data).toEqual([
      { title: "Pendahuluan", number: null, documentId: "doc-ipa-a", documentTitle: "Buku IPA VII A", page: 1 },
      { title: "Hakikat Ilmu Sains dan Metode Ilmiah", number: 1, documentId: "doc-ipa-a", documentTitle: "Buku IPA VII A", page: 3 },
      { title: "Klasifikasi Makhluk Hidup", number: 2, documentId: "doc-ipa-a", documentTitle: "Buku IPA VII A", page: 60 },
      { title: "Suhu, Kalor, dan Pemuaian", number: 1, documentId: "doc-ipa-b", documentTitle: "Buku IPA VII B", page: 41 },
      { title: "Zat dan Perubahannya", number: 2, documentId: "doc-ipa-b", documentTitle: "Buku IPA VII B", page: 88 },
    ])

    // The cache earned its keep: a second call parses no PDF at all.
    const outlinesBefore = readPdfOutlineMock.mock.calls.length
    await getJson("IPA")
    expect(readPdfOutlineMock.mock.calls.length).toBe(outlinesBefore)
  })

  it("writes the chapters.json sidecar beside the original", async () => {
    downloadFileMock.mockImplementation(async (key: string) => Buffer.from("pdf-a"))
    readPdfOutlineMock.mockImplementation(async (buffer: Buffer) =>
      buffer.toString() === "pdf-a"
        ? [
            { title: "Bab I Suhu", page: 4 },
            { title: "Bab II Kalor", page: 30 },
          ]
        : [],
    )

    await getJson("IPA")

    const keys = uploadFileMock.mock.calls.map((c) => c[0] as string)
    expect(keys).toContain("documents/org-ugm/doc-ipa-a/assets/chapters.json")
    const write = uploadFileMock.mock.calls.find((c) => (c[0] as string).endsWith("doc-ipa-a/assets/chapters.json"))
    const written = JSON.parse((write![1] as Buffer).toString("utf8"))
    expect(written.v).toBe(1)
    expect(written.documentId).toBe("doc-ipa-a")
    expect(written.updatedAt).toBe(new Date("2026-11-01T08:00:00.000Z").toISOString())
    expect(written.chapters).toEqual([
      { title: "Suhu", number: 1, page: 4 },
      { title: "Kalor", number: 2, page: 30 },
    ])
  })

  it("a stale sidecar is ignored and rebuilt", async () => {
    // A sidecar recorded against a DIFFERENT updatedAt than the document now
    // carries must not serve chapters — the book changed since it was written.
    downloadFileMock.mockImplementation(async (key: string) => {
      if (key.endsWith("assets/chapters.json")) {
        return Buffer.from(
          JSON.stringify({
            v: 1,
            documentId: "doc-ipa-a",
            updatedAt: new Date("2020-01-01T00:00:00.000Z").toISOString(),
            chapters: [{ title: "Bab Lama", number: 1, page: 0 }],
          }),
        )
      }
      return Buffer.from("pdf-a")
    })
    readPdfOutlineMock.mockImplementation(async (buffer: Buffer) =>
      buffer.toString() === "pdf-a"
        ? [
            { title: "Bab I Suhu", page: 4 },
            { title: "Bab II Kalor", page: 30 },
          ]
        : [],
    )

    const { body } = await getJson("IPA")
    const titles = body.data.map((c: { title: string }) => c.title)
    expect(titles).toContain("Suhu")
    expect(titles).not.toContain("Bab Lama")
  })

  it("a fresh sidecar answers without parsing that book's PDF", async () => {
    const sidecar = Buffer.from(
      JSON.stringify({
        v: 1,
        documentId: "doc-ipa-a",
        updatedAt: new Date("2026-11-01T08:00:00.000Z").toISOString(),
        chapters: [{ title: "Suhu, Kalor, dan Pemuaian", number: 3, page: 41 }],
      }),
    )
    downloadFileMock.mockImplementation(async (key: string) =>
      key === "documents/org-ugm/doc-ipa-a/assets/chapters.json"
        ? sidecar
        : Buffer.from(`pdf:${key}`),
    )

    const { status, body } = await getJson("IPA")

    expect(status).toBe(200)
    expect(body.data).toContainEqual({
      title: "Suhu, Kalor, dan Pemuaian",
      number: 3,
      documentId: "doc-ipa-a",
      documentTitle: "Buku IPA VII A",
      page: 41,
    })
    // Book A was answered by its sidecar; only book B ever reached the
    // outline parser.
    expect(readPdfOutlineMock.mock.calls.length).toBe(1)
    expect((readPdfOutlineMock.mock.calls[0][0] as Buffer).toString()).toContain("doc-ipa-b")
    expect(listDocumentChunkTextsMock).not.toHaveBeenCalledWith("doc-ipa-a")
  })

  it("splitter-artifact outline (every bookmark on page 0) falls through to the chunk headings", async () => {
    // The only outline shape the real corpus's books carry: filename titles,
    // two entries, both destinations page 0. It must NOT reach the picker.
    readPdfOutlineMock.mockResolvedValue([
      { title: "Kelas VII IPA BS Sem 1_MJCrev2017-1", page: 0 },
      { title: "Kelas VII IPA BS Sem 1_MJCrev2017", page: 0 },
    ])
    listDocumentChunkTextsMock.mockImplementation(async (documentId: string) =>
      documentId === "doc-ipa-a" ? HEADING_UNITS : [],
    )

    const { status, body } = await getJson("IPA")

    expect(status).toBe(200)
    expect(body.data).toEqual([
      { title: "Objek IPA dan Pengamatannya", number: 1, documentId: "doc-ipa-a", documentTitle: "Buku IPA VII A", page: 5 },
      { title: "Pengamatan dan Percobaan", number: 2, documentId: "doc-ipa-a", documentTitle: "Buku IPA VII A", page: 21 },
      { title: "Klasifikasi Makhluk Hidup", number: 3, documentId: "doc-ipa-a", documentTitle: "Buku IPA VII A", page: 40 },
    ])
  })

  it("no outline at all → the BAB headings in the document's chunks", async () => {
    listDocumentChunkTextsMock.mockImplementation(async (documentId: string) =>
      documentId === "doc-ipa-a" ? HEADING_UNITS : [],
    )

    const { status, body } = await getJson("IPA")

    expect(status).toBe(200)
    expect(body.data).toHaveLength(3)
    expect(body.data[0]).toMatchObject({ number: 1, page: 5 })
    // The other book was asked too — it holds no headings, contributes nothing.
    expect(body.data.filter((c: { documentId: string }) => c.documentId === "doc-ipa-b")).toEqual([])
  })

  it("nothing anywhere → an empty list, not an error", async () => {
    const { status, body } = await getJson("IPA")
    expect(status).toBe(200)
    expect(body).toEqual({ object: "list", mapel: "IPA", data: [] })
  })

  it("another grade's books are unreachable: the document query uses resolveMapel's ids alone", async () => {
    // Both books yield one chapter each, so a leaked document would show up
    // as someone else's chapter in data.
    listDocumentChunkTextsMock.mockImplementation(async (documentId: string) => [
      { page: 5, text: `Bab 1 Materi ${documentId}` },
    ])

    // Positive control: the assistant's own subject answers 200…
    const own = await getJson("IPA")
    expect(own.status).toBe(200)
    expect(own.body.data.map((c: { documentId: string }) => c.documentId)).toEqual(["doc-ipa-a", "doc-ipa-b"])

    // …and only because the document scope was exactly the subject group
    // resolveMapel returned. The Kelas-8 IPA book and the other tenant's
    // book exist in the fixtures — a filter that widened past the resolved
    // ids would have returned them.
    expect(lastDocumentWhere?.groups?.some?.groupId?.in).toEqual(["g_ipa7"])

    // A subject the assistant does not own is the unknown-mapel 400, never
    // a peek at its books.
    const other = await getJson("Biologi")
    expect(other.status).toBe(400)
    expect(documentFindMany.mock.calls.length).toBe(1) // only the IPA call above
  })

  it("a subject with no documents answers 200 with an empty list", async () => {
    const { status, body } = await getJson("Matematika")
    expect(status).toBe(200)
    expect(body.data).toEqual([])
  })

  it("a book without a stored original still yields chapters from its chunks", async () => {
    // doc-mtk has no s3Key: the outline and sidecar are impossible, the
    // chunk headings remain.
    listDocumentChunkTextsMock.mockImplementation(async (documentId: string) =>
      documentId === "doc-mtk"
        ? [
            { page: 7, text: "Bab 1 Bilangan Bulat" },
            { page: 44, text: "Bab 2 Bilangan Pecahan" },
          ]
        : [],
    )

    const { status, body } = await getJson("Matematika")

    expect(status).toBe(200)
    expect(body.data).toEqual([
      { title: "Bilangan Bulat", number: 1, documentId: "doc-mtk", documentTitle: "Buku Matematika VII", page: 7 },
      { title: "Bilangan Pecahan", number: 2, documentId: "doc-mtk", documentTitle: "Buku Matematika VII", page: 44 },
    ])
  })
})

// ── the routed-group source ─────────────────────────────────────────────────

describe("GET /api/v1/mapel/chapters on a rantai-kb-routed group", () => {
  it("the KB copy's page texts are the second source, before the local chunks", async () => {
    routesDir = mkdtempSync(join(tmpdir(), "chapters-routes-"))
    const routesFile = join(routesDir, "routes.json")
    writeFileSync(
      routesFile,
      JSON.stringify({ version: 1, routes: { g_ipa7: { remoteKbId: "kb-ipa7", enabled: true } } }),
    )
    process.env.KB_REMOTE_URL = "http://kb.test"
    process.env.KB_REMOTE_API_KEY = "kb-key"
    process.env.KB_REMOTE_ROUTES_FILE = routesFile
    __resetRemoteRouteCacheForTests({ statIntervalMs: 0 })

    // No outline, and the local chunks hold nothing usable — only the KB
    // copy (found through externalRef) can title this book.
    readPdfOutlineMock.mockResolvedValue([])
    remoteDocumentTextsMock.mockImplementation(async (documentId: string) =>
      documentId === "doc-ipa-a"
        ? [{ text: "Bab 1 Suhu dan Kalor", page: 10 }, { text: "Bab 2 Zat dan Perubahannya", page: 55 }]
        : null,
    )

    const { status, body } = await getJson("IPA")

    expect(status).toBe(200)
    expect(body.data).toEqual([
      { title: "Suhu dan Kalor", number: 1, documentId: "doc-ipa-a", documentTitle: "Buku IPA VII A", page: 10 },
      { title: "Zat dan Perubahannya", number: 2, documentId: "doc-ipa-a", documentTitle: "Buku IPA VII A", page: 55 },
    ])
    // The remote client was asked for the mapped KB ids of the routed group.
    expect(remoteDocumentTextsMock).toHaveBeenCalledWith("doc-ipa-a", ["kb-ipa7"])
    // The local chunks were never needed for that book.
    expect(
      listDocumentChunkTextsMock.mock.calls.map((c) => c[0]),
    ).not.toContain("doc-ipa-a")
  })
})
