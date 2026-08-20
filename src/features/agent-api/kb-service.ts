/**
 * KB read API — lets an external frontend (bound to an agent-api key) browse the
 * assistant's knowledge base: list documents, and read a document's knowledge
 * graph (entities + relations). Reuses the agent-api key auth; requires the
 * `kb:read` scope. Read-only, scoped to the key's assistant's KB groups.
 */
import { prisma } from "@/lib/prisma"
import { expandGroupIds } from "@/features/knowledge/groups/tree"
import { authenticateV1Request } from "./service"
import { listDocumentsInKnowledgeGroups } from "@/features/knowledge/groups/service"
import { getKnowledgeDocumentIntelligence } from "@/features/knowledge/documents/service"

export interface KbAuth {
  apiKeyId: string
  assistantId: string
  groupIds: string[]
}

/** Authenticate a KB read request and resolve the bound assistant's KB groups. */
export async function authenticateKbRequest(
  authHeader: string | null
): Promise<KbAuth | { status: number; error: string }> {
  const auth = await authenticateV1Request(authHeader)
  if ("status" in auth) return auth

  const scopes = auth.apiKey.scopes
  if (scopes.length > 0 && !scopes.includes("kb:read")) {
    return { status: 403, error: "API key does not have scope: kb:read" }
  }

  const assistant = await prisma.assistant.findUnique({
    where: { id: auth.apiKey.assistantId },
    select: { useKnowledgeBase: true, knowledgeBaseGroupIds: true },
  })
  if (!assistant?.useKnowledgeBase) {
    return { status: 404, error: "This assistant has no knowledge base" }
  }
  return {
    apiKeyId: auth.apiKey.id,
    assistantId: auth.apiKey.assistantId,
    groupIds: assistant.knowledgeBaseGroupIds ?? [],
  }
}

/** Documents available in the assistant's KB groups. */
export async function listKbDocuments(a: KbAuth) {
  if (!a.groupIds.length) return []
  const docs = await listDocumentsInKnowledgeGroups(a.groupIds, 500)
  return docs.map((d) => ({
    id: d.id,
    title: d.title,
    categories: d.categories ?? [],
    subcategory: d.subcategory ?? null,
  }))
}

/** Knowledge graph (entities + relations) for one document, after verifying it
 *  belongs to the assistant's KB groups. Returns null if not found/authorized. */
export async function getKbDocumentGraph(a: KbAuth, documentId: string) {
  if (!a.groupIds.length) return null
  // Subtree-expanded: an assistant scoped to a parent KB can retrieve from its
  // children, so the graph endpoint has to accept the same set of documents
  // retrieval does — otherwise it 404s on a document the assistant just cited.
  const owned = await prisma.document.findFirst({
    where: {
      id: documentId,
      groups: { some: { groupId: { in: await expandGroupIds(a.groupIds) } } },
    },
    select: { id: true, title: true },
  })
  if (!owned) return null
  const intel = await getKnowledgeDocumentIntelligence({ documentId })
  return { document: { id: owned.id, title: owned.title }, ...intel }
}
