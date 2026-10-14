import { auth } from "@/lib/auth"
import { resolveActiveOrgServer } from "@/lib/org-context"
import {
  getKnowledgeDocumentForDashboard,
  type KnowledgeDocumentDetail,
} from "@/features/knowledge/documents/service"
import { isHttpServiceError } from "@/features/shared/http-service-error"
import DocumentViewerClient, {
  type DocumentDetail,
} from "./document-viewer-client"

function mapDocumentDetail(detail: KnowledgeDocumentDetail): DocumentDetail {
  return {
    id: detail.id,
    title: detail.title,
    content: detail.content,
    categories: detail.categories,
    subcategory: detail.subcategory,
    groups: detail.groups,
    metadata:
      detail.metadata && typeof detail.metadata === "object" && !Array.isArray(detail.metadata)
        ? (detail.metadata as DocumentDetail["metadata"])
        : undefined,
    fileType: detail.fileType as DocumentDetail["fileType"],
    artifactType: detail.artifactType,
    fileSize: detail.fileSize ?? undefined,
    mimeType: detail.mimeType ?? undefined,
    s3Key: detail.s3Key ?? undefined,
    fileUrl: detail.fileUrl,
    chunks: detail.chunks,
    createdAt: detail.createdAt,
    updatedAt: detail.updatedAt,
    status: detail.status,
    ingest: detail.ingest ?? null,
  }
}

export default async function DocumentViewerPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams?: Promise<{ kb?: string }>
}) {
  const { id } = await params
  const resolvedSearchParams = searchParams ? await searchParams : undefined
  const kb = resolvedSearchParams?.kb
  const session = await auth()

  if (!session?.user?.id) {
    return <DocumentViewerClient id={id} initialDocument={null} kb={kb} />
  }

  const orgContext = await resolveActiveOrgServer(session.user.id)

  const result = await getKnowledgeDocumentForDashboard({
    documentId: id,
    organizationId: orgContext?.organizationId ?? null,
  })

  const initialDocument = isHttpServiceError(result)
    ? null
    : mapDocumentDetail(result)

  return <DocumentViewerClient id={id} initialDocument={initialDocument} kb={kb} />
}
