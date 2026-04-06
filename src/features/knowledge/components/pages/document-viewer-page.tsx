import { headers } from "next/headers"
import { auth } from "@/lib/auth"
import { getOrganizationContext } from "@/lib/organization"
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
  }
}

export default async function DocumentViewerPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const session = await auth()

  if (!session?.user?.id) {
    return <DocumentViewerClient id={id} initialDocument={null} />
  }

  const requestHeaders = await headers()
  const request = new Request("http://localhost", {
    headers: new Headers(requestHeaders),
  })
  const orgContext = await getOrganizationContext(request, session.user.id)

  const result = await getKnowledgeDocumentForDashboard({
    documentId: id,
    organizationId: orgContext?.organizationId ?? null,
  })

  const initialDocument = isHttpServiceError(result)
    ? null
    : mapDocumentDetail(result)

  return <DocumentViewerClient id={id} initialDocument={initialDocument} />
}
