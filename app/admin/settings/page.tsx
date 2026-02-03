"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import Link from "next/link"
import { MessageSquare, ArrowRight } from "lucide-react"

const settingsItems = [
  {
    title: "Communication Channels",
    description:
      "Configure Salesforce, WhatsApp, Email, and Portal integrations",
    href: "/admin/settings/channels",
    icon: MessageSquare,
  },
]

export default function SettingsPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-neutral-900">Settings</h1>
        <p className="text-neutral-500 mt-1">
          Manage your application configuration
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {settingsItems.map((item) => (
          <Link key={item.href} href={item.href}>
            <Card className="hover:border-neutral-400 transition-colors cursor-pointer h-full">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-neutral-100">
                      <item.icon className="h-5 w-5 text-neutral-600" />
                    </div>
                    <CardTitle className="text-base">{item.title}</CardTitle>
                  </div>
                  <ArrowRight className="h-5 w-5 text-neutral-400" />
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-neutral-500">{item.description}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  )
}
