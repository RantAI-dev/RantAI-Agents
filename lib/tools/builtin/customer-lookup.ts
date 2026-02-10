import { z } from "zod"
import { getCustomerContext } from "@/lib/customer-context"
import type { ToolDefinition } from "../types"

export const customerLookupTool: ToolDefinition = {
  name: "customer_lookup",
  displayName: "Customer Lookup",
  description:
    "Look up a customer's profile and active insurance policies by their customer ID. Returns customer name, preferred language, and a summary of their active/pending policies including coverage details and payment status.",
  category: "builtin",
  parameters: z.object({
    customerId: z
      .string()
      .describe("The customer ID to look up"),
  }),
  execute: async (params) => {
    const context = await getCustomerContext(params.customerId as string)
    if (!context) {
      return { found: false, message: "Customer not found" }
    }
    return {
      found: true,
      customer: {
        firstName: context.firstName,
        lastName: context.lastName,
        preferredLanguage: context.preferredLanguage,
        policyCount: context.policies.length,
        policies: context.policies,
      },
    }
  },
}
