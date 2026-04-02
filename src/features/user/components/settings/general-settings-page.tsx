"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { OrganizationSwitcher } from "@/app/dashboard/_components/organization-switcher"

export default function GeneralSettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">General Settings</h2>
        <p className="text-sm text-muted-foreground">
          Manage your application preferences.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Organization</CardTitle>
          <CardDescription>
            Switch between your organizations.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <OrganizationSwitcher className="w-full max-w-sm" />
        </CardContent>
      </Card>
    </div>
  )
}
