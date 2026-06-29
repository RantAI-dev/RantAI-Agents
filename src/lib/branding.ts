import type { Metadata } from "next"

export type ProductMode = "default" | "nexus"

export interface BrandConfig {
  mode: ProductMode
  productName: string
  productShortName: string
  companyName: string
  companyUrl: string

  // Logos
  logoMain: string
  /** Optional logo variant for dark surfaces (white mark). */
  logoMainDark?: string
  logoIcon: string
  logoIconDark?: string

  // Favicons & PWA
  favicon16: string
  favicon16Dark?: string
  favicon32: string
  favicon32Dark?: string
  appleTouchIcon: string
  appleTouchIconDark?: string
  faviconIco?: string
  faviconIcoDark?: string
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

    logoMain: "/logo/logo-rantai.png",
    logoMainDark: "/logo/logo-rantai-dark.png",
    logoIcon: "/logo/logo-rantai.png",
    logoIconDark: "/logo/logo-rantai-dark.png",

    favicon16: "/logo/favicon-16x16.png",
    favicon16Dark: "/logo/dark/favicon-16x16.png",
    favicon32: "/logo/favicon-32x32.png",
    favicon32Dark: "/logo/dark/favicon-32x32.png",
    appleTouchIcon: "/logo/apple-touch-icon.png",
    appleTouchIconDark: "/logo/dark/apple-touch-icon.png",
    faviconIco: "/logo/favicon.ico",
    faviconIcoDark: "/logo/dark/favicon.ico",
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
    faviconIco: "/nexus/favicon.ico",
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

type IconList = NonNullable<Metadata["icons"]>

/**
 * Theme-aware icon metadata for the active brand. When dark variants exist,
 * favicons + apple-touch icons are emitted with `prefers-color-scheme` media
 * queries so the browser tab icon follows the OS/browser color scheme. The
 * `.ico` shortcut is the universal fallback for older clients and bookmarks.
 */
function buildBrandIcons(b: BrandConfig): IconList {
  const icon: Array<{ url: string; sizes?: string; type?: string; media?: string }> = [
    { url: b.favicon32, sizes: "32x32", type: "image/png", ...(b.favicon32Dark ? { media: "(prefers-color-scheme: light)" } : {}) },
    { url: b.favicon16, sizes: "16x16", type: "image/png", ...(b.favicon16Dark ? { media: "(prefers-color-scheme: light)" } : {}) },
  ]
  if (b.favicon32Dark) icon.push({ url: b.favicon32Dark, sizes: "32x32", type: "image/png", media: "(prefers-color-scheme: dark)" })
  if (b.favicon16Dark) icon.push({ url: b.favicon16Dark, sizes: "16x16", type: "image/png", media: "(prefers-color-scheme: dark)" })

  const apple = b.appleTouchIconDark
    ? [
        { url: b.appleTouchIcon, media: "(prefers-color-scheme: light)" },
        { url: b.appleTouchIconDark, media: "(prefers-color-scheme: dark)" },
      ]
    : b.appleTouchIcon

  return {
    icon,
    apple,
    ...(b.faviconIco ? { shortcut: b.faviconIco } : {}),
  }
}

/** Pre-computed `<head>` icon metadata for the active brand (see {@link buildBrandIcons}). */
export const brandIcons: IconList = buildBrandIcons(brand)
