import { auth } from "@/lib/auth"
import { resolveActiveOrgServer } from "@/lib/org-context"
import {
  listKnowledgeDocumentsForDashboard,
} from "@/features/knowledge/documents/service"
import {
  listKnowledgeGroupsForDashboard,
  type KnowledgeGroupListItem,
} from "@/features/knowledge/groups/service"
import {
  listKnowledgeCategoriesForDashboard,
} from "@/features/knowledge/categories/service"
import { mapDocument } from "@/features/knowledge/documents/service-shared"
import KnowledgePageClient, {
  type Document,
  type KnowledgeBase,
} from "./knowledge-page-client"

interface KnowledgeSearchParams {
  kb?: string
  action?: string
}

interface CategoryListItem {
  id: string
  name: string
  label: string
  color: string
  isSystem: boolean
  createdAt: string
  updatedAt: string
}

function mapKnowledgeBase(item: KnowledgeGroupListItem): KnowledgeBase {
  return {
    id: item.id,
    name: item.name,
    description: item.description,
    color: item.color,
    documentCount: item.documentCount,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  }
}

function mapCategory(item: CategoryListItem) {
  return {
    id: item.id,
    name: item.name,
    label: item.label,
    color: item.color,
    isSystem: item.isSystem,
  }
}

export default async function KnowledgePage({
  searchParams,
}: {
  searchParams: Promise<KnowledgeSearchParams>
}) {
  const session = await auth()
  const resolvedSearchParams = await searchParams

  if (!session?.user?.id) {
    return (
      <KnowledgePageClient
        initialDocuments={[]}
        initialKnowledgeBases={[]}
        initialCategories={[]}
        initialSelectedKBId={null}
        initialAction={resolvedSearchParams.action ?? null}
      />
    )
  }

  const orgContext = await resolveActiveOrgServer(session.user.id)

  const selectedKBId = resolvedSearchParams.kb ?? null

  const [documents, knowledgeBases, categories] = await Promise.all([
    listKnowledgeDocumentsForDashboard({
      organizationId: orgContext?.organizationId ?? null,
      groupId: selectedKBId,
    }),
    listKnowledgeGroupsForDashboard(orgContext?.organizationId ?? null),
    listKnowledgeCategoriesForDashboard(),
  ])

  return (
    <KnowledgePageClient
      initialDocuments={documents.map(mapDocument)}
      initialKnowledgeBases={knowledgeBases.map(mapKnowledgeBase)}
      initialCategories={categories.map(mapCategory)}
      initialSelectedKBId={selectedKBId}
      initialAction={resolvedSearchParams.action ?? null}
    />
  )
}
