"use client"

import { useOrganization } from "@/hooks/use-organization"
import { Building2, Sparkles, ShieldAlert } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"

interface PlanGateProps {
  children: React.ReactNode
  requiredPlans?: string[]
}

const PAID_PLANS = ["starter", "pro", "enterprise"]

export function PlanGate({
  children,
  requiredPlans = PAID_PLANS,
}: PlanGateProps) {
  const { activeOrganization, isOwner, isAdmin } = useOrganization()

  if (!activeOrganization) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <Card className="max-w-md">
          <CardContent className="pt-6 text-center space-y-4">
            <Building2 className="h-12 w-12 text-muted-foreground mx-auto" />
            <h2 className="text-lg font-semibold">No Organization Selected</h2>
            <p className="text-sm text-muted-foreground">
              Select or create an organization from the sidebar to manage your
              team and settings.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (!isOwner && !isAdmin) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <Card className="max-w-md">
          <CardContent className="pt-6 text-center space-y-4">
            <ShieldAlert className="h-12 w-12 text-muted-foreground mx-auto" />
            <h2 className="text-lg font-semibold">Access Restricted</h2>
            <p className="text-sm text-muted-foreground">
              Only organization owners and admins can access this page. Contact
              your organization admin for access.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (!requiredPlans.includes(activeOrganization.plan)) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <Card className="max-w-md">
          <CardContent className="pt-6 text-center space-y-4">
            <Sparkles className="h-12 w-12 text-amber-500 mx-auto" />
            <h2 className="text-lg font-semibold">Upgrade Required</h2>
            <p className="text-sm text-muted-foreground">
              Organization management is available on paid plans. Upgrade to Pro
              or Enterprise to manage members, settings, and more.
            </p>
            <Button className="mt-2">Upgrade Plan</Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return <>{children}</>
}
