import { prisma } from "@/lib/prisma"

export interface CustomerContext {
  firstName: string
  lastName: string
  preferredLanguage: string
  policies: PolicySummary[]
}

export interface PolicySummary {
  policyNumber: string
  productType: string
  productName: string
  productTier: string
  coverageStartDate: string
  coverageEndDate: string | null
  premiumAmount: string
  premiumFrequency: string
  paymentStatus: string
  nextPaymentDate: string | null
  status: string
}

export async function getCustomerContext(customerId: string): Promise<CustomerContext | null> {
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    include: {
      policies: {
        where: { status: { in: ["ACTIVE", "PENDING"] } },
        orderBy: { coverageStartDate: "desc" },
      },
    },
  })

  if (!customer) return null

  return {
    firstName: customer.firstName,
    lastName: customer.lastName,
    preferredLanguage: customer.preferredLanguage,
    policies: customer.policies.map((p) => ({
      policyNumber: p.policyNumber,
      productType: p.productType,
      productName: p.productName,
      productTier: p.productTier,
      coverageStartDate: p.coverageStartDate.toISOString().split("T")[0],
      coverageEndDate: p.coverageEndDate?.toISOString().split("T")[0] ?? null,
      premiumAmount: `$${p.premiumAmount.toString()}`,
      premiumFrequency: p.premiumFrequency,
      paymentStatus: p.paymentStatus,
      nextPaymentDate: p.nextPaymentDate?.toISOString().split("T")[0] ?? null,
      status: p.status,
    })),
  }
}

export function formatCustomerContextForPrompt(context: CustomerContext): string {
  const policyList =
    context.policies.length > 0
      ? context.policies
          .map(
            (p) =>
              `- **${p.productName}** (${p.productTier})\n` +
              `  - Nomor Polis: ${p.policyNumber}\n` +
              `  - Status: ${p.status}\n` +
              `  - Premium: ${p.premiumAmount}/${p.premiumFrequency.toLowerCase()}\n` +
              `  - Status Pembayaran: ${p.paymentStatus}` +
              (p.nextPaymentDate ? `\n  - Pembayaran Berikutnya: ${p.nextPaymentDate}` : "")
          )
          .join("\n\n")
      : "Tidak ada polis aktif"

  const languageNote =
    context.preferredLanguage === "id"
      ? "Nasabah ini berbahasa Indonesia. Respon dalam Bahasa Indonesia kecuali mereka menulis dalam bahasa Inggris."
      : "This customer prefers English. Respond in English unless they write in Indonesian."

  return `
## INFORMASI NASABAH (Logged-in Customer)

Nasabah ini sudah login. Anda bisa mereferensikan informasi polis mereka:

**Nama Nasabah**: ${context.firstName} ${context.lastName}

**Polis Asuransi**:
${policyList}

---

**PANDUAN UNTUK AI**:
- ${languageNote}
- Panggil nasabah dengan nama mereka (${context.firstName}) saat memulai percakapan
- Referensikan polis spesifik mereka jika relevan dengan pertanyaan
- Untuk pertanyaan billing/pembayaran, sebutkan status pembayaran dan tanggal pembayaran berikutnya
- JANGAN ungkapkan info sensitif yang tidak tercantum di atas (seperti NIK, alamat, detail bank)
- Jika mereka tanya tentang klaim atau perubahan polis, tawarkan untuk menghubungkan dengan agent
- Untuk pertanyaan teknis tentang coverage atau benefit, gunakan informasi dari knowledge base
`.trim()
}
