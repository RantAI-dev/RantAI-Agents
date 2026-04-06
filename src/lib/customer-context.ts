import { prisma } from "@/lib/prisma"

interface Policy {
  policyNumber: string
  type: string
  status: string
  coverage: string
  premium: number
  paymentStatus: string
}

interface CustomerContext {
  firstName: string
  lastName: string
  preferredLanguage: string
  policies: Policy[]
}

/**
 * Look up customer context by ID.
 * Queries the Customer and related Policy tables if they exist,
 * otherwise returns null.
 */
export async function getCustomerContext(
  customerId: string
): Promise<CustomerContext | null> {
  try {
    // Try to find customer in database
    const customer = await (prisma as any).customer?.findUnique({
      where: { id: customerId },
      include: { policies: true },
    })

    if (!customer) return null

    return {
      firstName: customer.firstName || "",
      lastName: customer.lastName || "",
      preferredLanguage: customer.preferredLanguage || "en",
      policies: (customer.policies || []).map((p: any) => ({
        policyNumber: p.policyNumber || p.id,
        type: p.type || "unknown",
        status: p.status || "unknown",
        coverage: p.coverage || "",
        premium: p.premium || 0,
        paymentStatus: p.paymentStatus || "unknown",
      })),
    }
  } catch {
    // Customer table may not exist yet
    return null
  }
}
