import { z } from "zod"

export const DashboardMarketplaceIdParamsSchema = z.object({
  id: z.string().min(1),
})

export const DashboardMarketplaceInstallBodySchema = z
  .object({
    catalogItemId: z.unknown().optional(),
    authConfig: z.unknown().optional(),
    config: z.unknown().optional(),
  })
  .passthrough()

export const DashboardMarketplaceUninstallQuerySchema = z.object({
  catalogItemId: z.string().min(1),
})

export type DashboardMarketplaceInstallInput = z.infer<
  typeof DashboardMarketplaceInstallBodySchema
>
export type DashboardMarketplaceUninstallInput = z.infer<
  typeof DashboardMarketplaceUninstallQuerySchema
>
