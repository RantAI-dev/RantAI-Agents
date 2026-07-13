import Link from "next/link"
import { brand } from "@/lib/branding"

const FOOTER_COLUMNS = [
  {
    heading: "Explore",
    links: [
      { href: "/docs/", label: "Documentations" },
      { href: "https://github.com/RantAI-dev", label: "RantAIClaw" },
      { href: brand.companyUrl, label: brand.companyName },
    ],
  },
  {
    heading: "Connect",
    links: [
      { href: "https://x.com/rantaidev", label: "X" },
      { href: "https://www.linkedin.com/company/rantai-dev/", label: "LinkedIn" },
      { href: "https://www.instagram.com/rantaidev", label: "Instagram" },
    ],
  },
] as const

export function HomeFooter() {
  return (
    <footer className="border-t-2 border-dashed border-border py-12" role="contentinfo">
      <div className="mx-auto flex max-w-6xl flex-col justify-between gap-10 px-6 sm:flex-row sm:items-end">
        <div className="flex gap-20">
          {FOOTER_COLUMNS.map((column) => (
            <nav key={column.heading} aria-label={column.heading}>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-foreground">
                {column.heading}
              </h3>
              <ul className="mt-3 space-y-2">
                {column.links.map((link) => {
                  const isExternal = link.href.startsWith("http")
                  return (
                    <li key={link.label}>
                      <Link
                        href={link.href}
                        target={isExternal ? "_blank" : undefined}
                        rel={isExternal ? "noreferrer" : undefined}
                        className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                      >
                        {link.label}
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </nav>
          ))}
        </div>
        <p className="text-sm text-muted-foreground">
          Designed and build by {brand.companyName} © {new Date().getFullYear()}
        </p>
      </div>
    </footer>
  )
}
