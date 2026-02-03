"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import Link from "next/link"
import {
  MessageSquare,
  Users,
  CheckCircle,
  Clock,
  ArrowRight,
  Zap,
} from "lucide-react"

interface Stats {
  totalConversations: number
  activeConversations: number
  resolvedToday: number
  avgResponseTime: string
  channelStats: {
    channel: string
    count: number
    enabled: boolean
  }[]
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchStats() {
      try {
        const response = await fetch("/api/admin/stats")
        if (response.ok) {
          const data = await response.json()
          setStats(data)
        }
      } catch (error) {
        console.error("Failed to fetch stats:", error)
      } finally {
        setLoading(false)
      }
    }

    fetchStats()
  }, [])

  if (loading) {
    return (
      <div className="animate-pulse space-y-6">
        <div className="h-8 w-48 bg-neutral-200 rounded" />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-32 bg-neutral-200 rounded-lg" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-neutral-900">Admin Dashboard</h1>
        <p className="text-neutral-500 mt-1">
          Overview of your customer communication channels
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-neutral-500">
              Total Conversations
            </CardTitle>
            <MessageSquare className="h-4 w-4 text-neutral-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {stats?.totalConversations || 0}
            </div>
            <p className="text-xs text-neutral-500 mt-1">All time</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-neutral-500">
              Active Now
            </CardTitle>
            <Users className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {stats?.activeConversations || 0}
            </div>
            <p className="text-xs text-neutral-500 mt-1">
              Waiting or in progress
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-neutral-500">
              Resolved Today
            </CardTitle>
            <CheckCircle className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">
              {stats?.resolvedToday || 0}
            </div>
            <p className="text-xs text-neutral-500 mt-1">Conversations closed</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-neutral-500">
              Avg Response Time
            </CardTitle>
            <Clock className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">
              {stats?.avgResponseTime || "N/A"}
            </div>
            <p className="text-xs text-neutral-500 mt-1">First agent response</p>
          </CardContent>
        </Card>
      </div>

      {/* Channel Configuration Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Communication Channels</CardTitle>
              <p className="text-sm text-neutral-500 mt-1">
                Configure how customers connect with agents
              </p>
            </div>
            <Link
              href="/admin/settings/channels"
              className="flex items-center gap-1 text-sm text-neutral-600 hover:text-neutral-900"
            >
              Configure
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {[
              { name: "Portal", icon: "🌐", description: "Real-time web chat" },
              { name: "Salesforce", icon: "☁️", description: "Service Cloud" },
              { name: "WhatsApp", icon: "📱", description: "Business API" },
              { name: "Email", icon: "📧", description: "SMTP" },
            ].map((channel) => {
              const channelStat = stats?.channelStats?.find(
                (c) => c.channel === channel.name.toUpperCase()
              )
              const isEnabled = channelStat?.enabled || false
              const isPrimary =
                channel.name === "Portal" && !stats?.channelStats?.some((c) => c.enabled && c.channel !== "PORTAL")

              return (
                <div
                  key={channel.name}
                  className={`p-4 rounded-lg border ${
                    isEnabled
                      ? "border-green-200 bg-green-50"
                      : "border-neutral-200 bg-neutral-50"
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-2xl">{channel.icon}</span>
                    <div className="flex items-center gap-2">
                      {isPrimary && (
                        <Badge variant="secondary" className="text-xs">
                          <Zap className="h-3 w-3 mr-1" />
                          Primary
                        </Badge>
                      )}
                      <Badge
                        variant={isEnabled ? "default" : "outline"}
                        className={
                          isEnabled ? "bg-green-600" : "text-neutral-400"
                        }
                      >
                        {isEnabled ? "Active" : "Disabled"}
                      </Badge>
                    </div>
                  </div>
                  <h3 className="font-semibold text-neutral-900">
                    {channel.name}
                  </h3>
                  <p className="text-xs text-neutral-500">
                    {channel.description}
                  </p>
                  {channelStat && channelStat.count > 0 && (
                    <p className="text-xs text-neutral-600 mt-2">
                      {channelStat.count} conversations
                    </p>
                  )}
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
