import { NodeType, type WorkflowNodeData, type RagSearchNodeData, type DatabaseNodeData, type StorageNodeData } from "../types"
import type { ExecutionContext } from "../engine"
import { buildTemplateContext } from "../engine"
import { resolveTemplate } from "../template-engine"
import { prisma } from "@/lib/prisma"
import { smartRetrieve } from "@/lib/rag/retriever"
import { getS3Client, getBucket } from "@/lib/s3"
import { GetObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3"

/**
 * Integration node handler — RAG search, database, storage.
 */
export async function executeIntegration(
  data: WorkflowNodeData,
  input: unknown,
  context: ExecutionContext
): Promise<{ output: unknown }> {
  const tctx = buildTemplateContext(data.label, data.nodeType, input, context)

  switch (data.nodeType) {
    case NodeType.RAG_SEARCH: {
      const ragData = data as RagSearchNodeData

      // Smart query extraction: if using default template and input is an object,
      // try to extract the user's actual query from common fields
      let query: string
      if (ragData.queryTemplate) {
        query = resolveTemplate(ragData.queryTemplate, tctx)
      } else {
        query = extractSearchQuery(input, context)
      }

      const result = await smartRetrieve(query, {
        maxChunks: ragData.topK || 5,
        groupIds: ragData.knowledgeBaseGroupIds?.length > 0
          ? ragData.knowledgeBaseGroupIds
          : undefined,
      })

      return {
        output: {
          context: result.context,
          sources: result.sources,
          chunks: result.chunks,
          resultCount: result.chunks.length,
        },
      }
    }

    case NodeType.DATABASE: {
      const dbData = data as DatabaseNodeData
      const resolvedQuery = resolveTemplate(dbData.query || "", tctx)

      // SECURITY: only allow SELECT queries
      const trimmed = resolvedQuery.trim().toUpperCase()
      if (!trimmed.startsWith("SELECT")) {
        throw new Error("Only SELECT queries are allowed in workflow database nodes")
      }

      // Apply timeout (default: 10s) and result limit (default: 1000)
      const timeout = dbData.timeout ?? 10000
      const resultLimit = dbData.resultLimit ?? 1000

      // Execute query with timeout
      const queryPromise = prisma.$queryRawUnsafe(resolvedQuery)
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Query timeout after ${timeout}ms`)), timeout)
      )

      const rawResult = await Promise.race([queryPromise, timeoutPromise]) as unknown[]

      // Apply result limit
      const result = rawResult.slice(0, resultLimit)
      const truncated = rawResult.length > resultLimit

      if (truncated) {
        console.warn(
          `[workflow] Database node truncated ${rawResult.length} rows to ${resultLimit} (resultLimit)`
        )
      }

      return {
        output: {
          rows: result,
          rowCount: result.length,
          totalCount: rawResult.length,
          truncated,
        },
      }
    }

    case NodeType.STORAGE: {
      const storageData = data as StorageNodeData
      const path = resolveTemplate(storageData.path || "", tctx)

      if (!path) throw new Error("Storage node: path is required")

      const s3 = getS3Client()
      const bucket = getBucket()

      switch (storageData.operation) {
        case "read": {
          const response = await s3.send(
            new GetObjectCommand({ Bucket: bucket, Key: path })
          )
          const content = await response.Body?.transformToString()
          return {
            output: {
              content,
              contentType: response.ContentType,
              contentLength: response.ContentLength,
            },
          }
        }

        case "list": {
          const response = await s3.send(
            new ListObjectsV2Command({ Bucket: bucket, Prefix: path })
          )
          return {
            output: {
              files: response.Contents?.map((c) => ({
                key: c.Key,
                size: c.Size,
                lastModified: c.LastModified?.toISOString(),
              })) || [],
              count: response.KeyCount || 0,
            },
          }
        }

        default:
          throw new Error(`Storage operation "${storageData.operation}" not supported in workflow nodes (read/list only)`)
      }
    }

    default:
      return { output: input }
  }
}

/**
 * Extract a meaningful search query from structured node input.
 * In a chatflow chain like Trigger → LLM → Switch → RAG_SEARCH,
 * the RAG node receives the LLM's classification output, not the user's message.
 * This function tries to find the original user query from flow state first,
 * then falls back to extracting from the input object.
 */
function extractSearchQuery(input: unknown, context: ExecutionContext): string {
  // Best source: original user message from flow input
  const flowInput = context.flow?.input as Record<string, unknown> | undefined
  if (flowInput) {
    if (typeof flowInput.message === "string") return flowInput.message
    if (typeof flowInput.question === "string") return flowInput.question
  }

  if (typeof input === "string") return input

  if (input && typeof input === "object") {
    const obj = input as Record<string, unknown>

    // Direct query/message/text/question fields
    if (typeof obj.message === "string") return obj.message
    if (typeof obj.query === "string") return obj.query
    if (typeof obj.question === "string") return obj.question
    if (typeof obj.text === "string") return obj.text

    // LLM classification output — skip metadata, look for meaningful field
    // e.g. { intent: "product", _raw: "...", _usage: {...} }
    // The intent alone isn't a good search query — use flow input instead
  }

  // Last resort: stringify
  return typeof input === "undefined" ? "" : JSON.stringify(input)
}
