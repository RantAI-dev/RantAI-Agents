export type ProductMode = "default" | "nexus"

export interface BrandConfig {
  mode: ProductMode
  productName: string
  productShortName: string
  companyName: string
  companyUrl: string

  // Logos
  logoMain: string
  logoIcon: string

  // Favicons & PWA
  favicon16: string
  favicon32: string
  appleTouchIcon: string
  manifestPath: string

  // Metadata
  metaTitle: string
  metaDescription: string
  metaKeywords: string[]

  // Placeholders
  supportEmail: string
  supportEmailName: string
  salesforceDeploymentName: string
  demoAgentEmail: string

  // Widget
  poweredByText: string
  poweredByUrl: string
  widgetComment: string
}

const mode: ProductMode =
  (process.env.NEXT_PUBLIC_PRODUCT_MODE as ProductMode) === "nexus"
    ? "nexus"
    : "default"

const configs: Record<ProductMode, BrandConfig> = {
  default: {
    mode: "default",
    productName: "RantAI Agents",
    productShortName: "RantAI",
    companyName: "RantAI",
    companyUrl: "https://rantai.dev",

    logoMain: "/logo/logo-rantai-border.png",
    logoIcon: "/logo/logo-rantai-border.png",

    favicon16: "/logo/favicon-16x16.png",
    favicon32: "/logo/favicon-32x32.png",
    appleTouchIcon: "/logo/apple-touch-icon.png",
    manifestPath: "/logo/site.webmanifest",

    metaTitle: "RantAI Agents | Enterprise AI Agent Platform",
    metaDescription:
      "Build and deploy intelligent AI agents with RAG, multi-channel deployment, and human-in-the-loop workflows. Customer support, knowledge assistants, and domain-specific AI.",
    metaKeywords: [
      "AI agents",
      "RAG",
      "customer support",
      "knowledge base",
      "RantAI",
      "enterprise",
      "chatbot",
    ],

    supportEmail: "support@rantai.com",
    supportEmailName: "RantAI Support",
    salesforceDeploymentName: "rantai_chat",
    demoAgentEmail: "agent@rantai.com",

    poweredByText: "RantAI",
    poweredByUrl: "https://rantai.dev",
    widgetComment: "<!-- RantAI Chat Widget -->",
  },
  nexus: {
    mode: "nexus",
    productName: "NQRust Agents",
    productShortName: "NQRust",
    companyName: "NQRust",
    companyUrl: "https://nexusquantum.id",

    logoMain: "/nexus/nq-logo.png",
    logoIcon: "/nexus/nqr-icon.png",

    favicon16: "/nexus/favicon-16x16.png",
    favicon32: "/nexus/favicon-32x32.png",
    appleTouchIcon: "/nexus/apple-touch-icon.png",
    manifestPath: "/nexus/site.webmanifest",

    metaTitle: "NQRust Agents | Enterprise AI Agent Platform",
    metaDescription:
      "Build and deploy intelligent AI agents with RAG, multi-channel deployment, and human-in-the-loop workflows. Customer support, knowledge assistants, and domain-specific AI.",
    metaKeywords: [
      "AI agents",
      "RAG",
      "customer support",
      "knowledge base",
      "NQRust",
      "enterprise",
      "chatbot",
    ],

    supportEmail: "support@nexusquantum.id",
    supportEmailName: "NQRust Support",
    salesforceDeploymentName: "nqrust_chat",
    demoAgentEmail: "agent@nexusquantum.id",

    poweredByText: "NQRust",
    poweredByUrl: "https://nexusquantum.id",
    widgetComment: "<!-- NQRust Chat Widget -->",
  },
}

/** The active brand configuration, determined by NEXT_PUBLIC_PRODUCT_MODE */
export const brand: BrandConfig = Object.freeze(configs[mode])
