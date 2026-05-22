import { describe, it, expect, vi, beforeEach } from "vitest"

const { documentCount, knowledgeBaseGroupFindMany } = vi.hoisted(() => ({
  documentCount: vi.fn(),
  knowledgeBaseGroupFindMany: vi.fn(),
}))

vi.mock("@/lib/prisma", () => ({
  prisma: {
    document: { count: documentCount },
    knowledgeBaseGroup: { findMany: knowledgeBaseGroupFindMany },
  },
}))

import { countKnowledgeDocumentsForScope } from "@/features/knowledge/documents/repository"
import { listKnowledgeGroupsByOrganization } from "@/features/knowledge/groups/repository"
import { countDocumentsByCategoryName } from "@/features/knowledge/categories/repository"

describe("knowledge counts exclude soft-deleted documents", () => {
  beforeEach(() => {
    documentCount.mockReset().mockResolvedValue(0)
    knowledgeBaseGroupFindMany.mockReset().mockResolvedValue([])
  })

  it("countKnowledgeDocumentsForScope filters deletedAt: null (orgless scope)", async () => {
    await countKnowledgeDocumentsForScope(null)
    expect(documentCount).toHaveBeenCalledTimes(1)
    const [args] = documentCount.mock.calls[0]
    expect(args.where).toMatchObject({ deletedAt: null })
  })

  it("countKnowledgeDocumentsForScope filters deletedAt: null and keeps the org OR clause", async () => {
    await countKnowledgeDocumentsForScope("org_42")
    const [args] = documentCount.mock.calls[0]
    expect(args.where.deletedAt).toBeNull()
    expect(args.where.OR).toEqual([{ organizationId: "org_42" }, { organizationId: null }])
  })

  it("countDocumentsByCategoryName filters deletedAt: null", async () => {
    await countDocumentsByCategoryName("FAQ", "org_42")
    const [args] = documentCount.mock.calls[0]
    expect(args.where).toMatchObject({
      deletedAt: null,
      categories: { has: "FAQ" },
      organizationId: "org_42",
    })
  })

  it("listKnowledgeGroupsByOrganization scopes _count.documents by document.deletedAt: null", async () => {
    await listKnowledgeGroupsByOrganization("org_42")
    const [args] = knowledgeBaseGroupFindMany.mock.calls[0]
    expect(args.include?._count?.select?.documents).toEqual({
      where: { document: { deletedAt: null } },
    })
  })
})
