import { z } from "zod"

export const DashboardChatSessionIdParamsSchema = z.object({
  id: z.string().min(1),
})

export const DashboardChatSessionArtifactParamsSchema = z.object({
  id: z.string().min(1),
  artifactId: z.string().min(1),
})

export const DashboardChatSessionCreateBodySchema = z.any()
export const DashboardChatSessionUpdateBodySchema = z.any()
export const DashboardChatSessionMessagesBodySchema = z.any()
export const DashboardChatSessionMessageUpdateBodySchema = z.any()
export const DashboardChatSessionMessageDeleteBodySchema = z.any()
export const DashboardChatSessionArtifactBodySchema = z.any()

export type DashboardChatSessionCreateInput = z.infer<
  typeof DashboardChatSessionCreateBodySchema
>
export type DashboardChatSessionUpdateInput = z.infer<
  typeof DashboardChatSessionUpdateBodySchema
>
export type DashboardChatSessionMessagesInput = z.infer<
  typeof DashboardChatSessionMessagesBodySchema
>
export type DashboardChatSessionMessageUpdateInput = z.infer<
  typeof DashboardChatSessionMessageUpdateBodySchema
>
export type DashboardChatSessionMessageDeleteInput = z.infer<
  typeof DashboardChatSessionMessageDeleteBodySchema
>
export type DashboardChatSessionArtifactInput = z.infer<
  typeof DashboardChatSessionArtifactBodySchema
>
