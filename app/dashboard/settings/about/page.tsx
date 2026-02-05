"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import {
  Shield,
  Cpu,
  Database,
  MessageSquare,
  Brain,
  ExternalLink
} from "lucide-react"

export default function AboutPage() {
  const technologies = [
    {
      name: "Next.js 16",
      description: "React framework with App Router",
      icon: Cpu,
      category: "Framework",
    },
    {
      name: "React 19",
      description: "UI library with Server Components",
      icon: Cpu,
      category: "Framework",
    },
    {
      name: "PostgreSQL + pgvector",
      description: "Database with vector similarity search",
      icon: Database,
      category: "Database",
    },
    {
      name: "Prisma ORM",
      description: "Type-safe database client",
      icon: Database,
      category: "Database",
    },
    {
      name: "Socket.io",
      description: "Real-time bidirectional communication",
      icon: MessageSquare,
      category: "Real-time",
    },
    {
      name: "OpenRouter AI",
      description: "LLM integration for AI chat",
      icon: Brain,
      category: "AI",
    },
    {
      name: "NextAuth v5",
      description: "Authentication and session management",
      icon: Shield,
      category: "Security",
    },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">About</h2>
        <p className="text-sm text-muted-foreground">
          System information and technology stack.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Shield className="h-5 w-5" />
            RantAI Agents Platform
          </CardTitle>
          <CardDescription>AI-powered agent platform for customer support</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            An AI-powered agent platform that provides intelligent customer support,
            document management with RAG capabilities, and multi-channel communication.
          </p>

          <div className="flex items-center gap-2">
            <Badge variant="outline">Version 1.0.0</Badge>
            <Badge variant="secondary">Production</Badge>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Technology Stack</CardTitle>
          <CardDescription>Core technologies powering the platform</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2">
            {technologies.map((tech) => {
              const Icon = tech.icon
              return (
                <div
                  key={tech.name}
                  className="flex items-start gap-3 p-3 rounded-lg border bg-muted/30"
                >
                  <div className="p-2 rounded-md bg-background">
                    <Icon className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{tech.name}</span>
                      <Badge variant="outline" className="text-xs">
                        {tech.category}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {tech.description}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Features</CardTitle>
          <CardDescription>Key capabilities of the platform</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="space-y-3 text-sm">
            <li className="flex items-start gap-2">
              <MessageSquare className="h-4 w-4 mt-0.5 text-chart-3" />
              <div>
                <span className="font-medium">AI Chat</span>
                <p className="text-muted-foreground">
                  Intelligent chatbot with RAG-powered knowledge retrieval
                </p>
              </div>
            </li>
            <li className="flex items-start gap-2">
              <Shield className="h-4 w-4 mt-0.5 text-chart-2" />
              <div>
                <span className="font-medium">Agent Support</span>
                <p className="text-muted-foreground">
                  Real-time customer handoff and queue management
                </p>
              </div>
            </li>
            <li className="flex items-start gap-2">
              <Brain className="h-4 w-4 mt-0.5 text-chart-4" />
              <div>
                <span className="font-medium">Knowledge Base</span>
                <p className="text-muted-foreground">
                  Document management with automatic chunking and embeddings
                </p>
              </div>
            </li>
            <li className="flex items-start gap-2">
              <Database className="h-4 w-4 mt-0.5 text-chart-1" />
              <div>
                <span className="font-medium">Multi-Channel</span>
                <p className="text-muted-foreground">
                  Support for Portal, Salesforce, WhatsApp, and Email channels
                </p>
              </div>
            </li>
          </ul>
        </CardContent>
      </Card>

      <Separator />

      <div className="text-center text-xs text-muted-foreground">
        <p>Built with Rantai AI Platform</p>
      </div>
    </div>
  )
}
