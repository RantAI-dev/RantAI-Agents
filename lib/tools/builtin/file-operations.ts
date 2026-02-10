import { z } from "zod"
import { getPresignedDownloadUrl } from "@/lib/s3"
import type { ToolDefinition } from "../types"

export const fileOperationsTool: ToolDefinition = {
  name: "file_operations",
  displayName: "File Operations",
  description:
    "Generate a temporary download link for a file stored in the system. Provide the file's storage key to get a time-limited URL that can be shared with the user.",
  category: "builtin",
  parameters: z.object({
    fileKey: z
      .string()
      .describe("The S3 storage key of the file to generate a download URL for"),
  }),
  execute: async (params) => {
    const url = await getPresignedDownloadUrl(params.fileKey as string)
    return {
      success: true,
      downloadUrl: url,
      expiresIn: "1 hour",
    }
  },
}
