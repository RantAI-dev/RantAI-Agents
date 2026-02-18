"use client"

import { CreditCard, Sparkles, Check, Building2, Wallet, Receipt, Plus, MoreHorizontal } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { useOrganization } from "@/hooks/use-organization"

const PLAN_DETAILS: Record<string, { name: string; description: string; price: string; features: string[] }> = {
  free: {
    name: "Free",
    description: "Basic access for individuals",
    price: "$0/mo",
    features: ["1 assistant", "10 documents", "Community support"],
  },
  starter: {
    name: "Starter",
    description: "For small teams getting started",
    price: "$19/mo",
    features: ["3 assistants", "100 documents", "5 team members", "Email support"],
  },
  pro: {
    name: "Pro",
    description: "For growing teams and businesses",
    price: "$49/mo",
    features: ["10 assistants", "500 documents", "25 team members", "Priority support", "Custom tools"],
  },
  enterprise: {
    name: "Enterprise",
    description: "For large organizations",
    price: "Custom",
    features: ["Unlimited assistants", "Unlimited documents", "Unlimited members", "Dedicated support", "Custom integrations", "SLA"],
  },
}

export default function BillingSettingsPage() {
  const { activeOrganization, isOwner, isAdmin } = useOrganization()

  if (!activeOrganization) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center space-y-3">
          <Building2 className="h-12 w-12 text-muted-foreground mx-auto" />
          <h2 className="text-lg font-semibold">No Organization Selected</h2>
          <p className="text-sm text-muted-foreground max-w-sm">
            Select or create an organization from the sidebar to view billing and plan details.
          </p>
        </div>
      </div>
    )
  }

  const plan = activeOrganization.plan
  const planInfo = PLAN_DETAILS[plan] || PLAN_DETAILS.free
  const isUpgradable = plan !== "enterprise"
  const canManageBilling = isOwner || isAdmin

  const usageItems = [
    {
      label: "Members",
      current: activeOrganization.counts.members,
      max: activeOrganization.limits.maxMembers,
    },
    {
      label: "Assistants",
      current: activeOrganization.counts.assistants,
      max: activeOrganization.limits.maxAssistants,
    },
    {
      label: "Documents",
      current: activeOrganization.counts.documents,
      max: activeOrganization.limits.maxDocuments,
    },
    {
      label: "API Keys",
      current: activeOrganization.counts.apiKeys,
      max: activeOrganization.limits.maxApiKeys,
    },
  ]

  const getPlanBadgeVariant = (p: string) => {
    switch (p) {
      case "enterprise":
        return "default" as const
      case "pro":
        return "secondary" as const
      default:
        return "outline" as const
    }
  }

  return (
    <div className="space-y-6">
      {/* Current Plan */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            Current Plan
          </CardTitle>
          <CardDescription>
            Your organization&apos;s subscription details
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-3">
                <span className="text-2xl font-bold">{planInfo.name}</span>
                <Badge variant={getPlanBadgeVariant(plan)}>Active</Badge>
                <span className="text-lg text-muted-foreground">{planInfo.price}</span>
              </div>
              <p className="text-sm text-muted-foreground">{planInfo.description}</p>
            </div>
            {canManageBilling && isUpgradable && (
              <Button>
                <Sparkles className="h-4 w-4 mr-2" />
                Upgrade Plan
              </Button>
            )}
          </div>

          <div className="pt-2">
            <Label className="text-muted-foreground text-xs uppercase tracking-wide">Plan Features</Label>
            <ul className="mt-2 space-y-1.5">
              {planInfo.features.map((feature) => (
                <li key={feature} className="flex items-center gap-2 text-sm">
                  <Check className="h-4 w-4 text-chart-2 shrink-0" />
                  {feature}
                </li>
              ))}
            </ul>
          </div>
        </CardContent>
      </Card>

      {/* Usage & Limits */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Usage & Limits</CardTitle>
          <CardDescription>
            Current resource usage and plan limits
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-5">
            {usageItems.map((item) => {
              const percentage = item.max > 0 ? (item.current / item.max) * 100 : 0
              const isNearLimit = percentage >= 80

              return (
                <div key={item.label} className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">{item.label}</span>
                    <span className={isNearLimit ? "text-amber-500 font-medium" : "text-muted-foreground"}>
                      {item.current} / {item.max}
                    </span>
                  </div>
                  <Progress
                    value={percentage}
                    className="h-2"
                  />
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* Payment Method - Owner/Admin only */}
      {canManageBilling && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Wallet className="h-5 w-5" />
              Payment Method
            </CardTitle>
            <CardDescription>
              Manage how you pay for your subscription
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-4 rounded-lg border border-dashed">
              <div className="flex items-center gap-3">
                <div className="h-10 w-14 rounded-md bg-muted flex items-center justify-center">
                  <CreditCard className="h-5 w-5 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">No payment method added</p>
                  <p className="text-xs text-muted-foreground">Add a card or payment method to upgrade your plan</p>
                </div>
              </div>
              <Button variant="outline" size="sm">
                <Plus className="h-4 w-4 mr-1.5" />
                Add Method
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Invoices & Billing History */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Receipt className="h-5 w-5" />
                Invoices
              </CardTitle>
              <CardDescription>
                Billing history and past invoices
              </CardDescription>
            </div>
            {canManageBilling && (
              <Button variant="outline" size="sm">
                <MoreHorizontal className="h-4 w-4 mr-1.5" />
                View All
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <Receipt className="h-8 w-8 text-muted-foreground/50 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">No invoices yet</p>
            <p className="text-xs text-muted-foreground mt-1">
              Invoices will appear here once you subscribe to a paid plan.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Pay As You Go - Owner/Admin only */}
      {canManageBilling && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Sparkles className="h-5 w-5" />
              Pay As You Go
            </CardTitle>
            <CardDescription>
              Set spending limits for usage beyond your plan
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Pay-as-you-go billing is coming soon. You&apos;ll be able to set spending limits
              and pay for additional usage beyond your plan limits.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
