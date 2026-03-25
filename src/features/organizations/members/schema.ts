import { z } from "zod"

export const OrganizationIdParamsSchema = z.object({
  id: z.string().min(1),
})

export const OrganizationMemberParamsSchema = z.object({
  id: z.string().min(1),
  memberId: z.string().min(1),
})

export const InviteMemberSchema = z
  .object({
    email: z.string().email(),
    role: z.enum(["admin", "member", "viewer"]).optional().default("member"),
  })
  .strict()

export const UpdateMemberRoleSchema = z
  .object({
    role: z.enum(["admin", "member", "viewer"]),
  })
  .strict()

export type InviteMemberInput = z.infer<typeof InviteMemberSchema>
export type UpdateMemberRoleInput = z.infer<typeof UpdateMemberRoleSchema>
