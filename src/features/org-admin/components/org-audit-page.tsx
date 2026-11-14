"use client"

import { formatDistanceToNow } from "date-fns"
import { AlertCircle, Loader2, History } from "@/lib/icons"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useOrganization } from "@/hooks/use-organization"
import { useCursorPage } from "@/hooks/use-api-resource"
import { orgPaths } from "@/features/org-admin/api"
import type { AuditRow } from "@/features/org-admin/types"

/**
 * Audit log: every change to members, units, roles, grants, shares, providers and keys, newest
 * first. The API decides who may read it (`org.audit.read`); this screen shows what it answers.
 */
export default function OrgAuditPage() {
  const { activeOrganization } = useOrganization()
  const orgId = activeOrganization?.id ?? null
  const page = useCursorPage<AuditRow>(orgId ? orgPaths.audit(orgId) : null)

  if (!orgId) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          Select an organisation to read its audit log.
        </CardContent>
      </Card>
    )
  }

  const rows = page.data

  return (
    <div className="space-y-6">
      <div>
        <h2 className="flex items-center gap-2 text-xl font-semibold">
          <History className="h-5 w-5" />
          Audit log
        </h2>
        <p className="text-sm text-muted-foreground">
          Every change to the organisation&apos;s people, units, access, sharing and sign-in.
        </p>
      </div>

      {page.error && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {page.error}
        </div>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Recent activity</CardTitle>
          <CardDescription>Newest first, 50 at a time.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {page.loading && rows.length === 0 ? (
            <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading...
            </div>
          ) : rows.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">Nothing recorded yet.</p>
          ) : (
            <ul className="divide-y">
              {rows.map((row) => (
                <li key={row.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-sm">
                  <Badge variant="outline" className="font-mono text-[10px]">
                    {row.action}
                  </Badge>
                  <span className="min-w-0 flex-1 truncate">{row.resource}</span>
                  {row.riskLevel !== "low" && (
                    <Badge
                      variant={row.riskLevel === "high" ? "destructive" : "secondary"}
                      className="text-[10px]"
                    >
                      {row.riskLevel}
                    </Badge>
                  )}
                  <span className="text-xs text-muted-foreground">
                    {row.ipAddress ?? "no address"}
                  </span>
                  <span
                    className="text-xs text-muted-foreground"
                    title={new Date(row.createdAt).toISOString()}
                  >
                    {formatDistanceToNow(new Date(row.createdAt), { addSuffix: true })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {page.nextCursor && (
        <Button variant="outline" onClick={page.loadMore} disabled={page.loadingMore}>
          {page.loadingMore && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Load more
        </Button>
      )}
    </div>
  )
}
