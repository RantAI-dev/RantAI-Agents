"use client"

import { Globe, Code, Wifi, Info } from "@/lib/icons"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { DeployWidgetSection } from "./deploy/deploy-widget-section"
import { DeployRestApiSection } from "./deploy/deploy-rest-api-section"
import { DeployWebSocketSection } from "./deploy/deploy-websocket-section"
import { DeployInfoSection } from "./deploy/deploy-info-section"
import { DeployReadinessPanel } from "./deploy/deploy-readiness-panel"
import type { DeployReadiness } from "@/features/assistants/core/completeness"
import type { TabId } from "./agent-editor-layout"

interface TabDeployProps {
  agentId: string | null
  agentName: string
  agentModel: string
  agentCreatedAt?: Date
  isNew: boolean
  readiness: DeployReadiness
  onJumpToTab: (tab: TabId) => void
}

export function TabDeploy({ agentId, agentName, agentModel, agentCreatedAt, isNew, readiness, onJumpToTab }: TabDeployProps) {
  if (isNew || !agentId) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-8">
        <Globe className="h-8 w-8 text-muted-foreground mb-3" />
        <h3 className="text-base font-semibold mb-1">Save Agent First</h3>
        <p className="text-sm text-muted-foreground max-w-sm">
          Save the agent to configure deployment options.
        </p>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-4">
      <DeployReadinessPanel
        readiness={readiness}
        onJumpTo={(field) => {
          if (field === "name" || field === "systemPrompt" || field === "openingMessage") {
            onJumpToTab("configure")
          } else if (field === "model") {
            onJumpToTab("model")
          }
        }}
      />
      <div>
        <h2 className="text-sm font-semibold text-foreground">Deploy</h2>
        <p className="text-xs text-muted-foreground mt-1">
          Deploy &quot;{agentName}&quot; via widget embed, REST API, or WebSocket.
        </p>
      </div>

      <div className={readiness.ok ? "" : "pointer-events-none opacity-50"}>
        <Tabs defaultValue="rest-api">
          <TabsList className="h-9">
            <TabsTrigger value="rest-api" className="text-xs gap-1.5">
              <Code className="h-3.5 w-3.5" />
              REST API
            </TabsTrigger>
            <TabsTrigger value="widget" className="text-xs gap-1.5">
              <Globe className="h-3.5 w-3.5" />
              Widget Embed
            </TabsTrigger>
            <TabsTrigger value="websocket" className="text-xs gap-1.5">
              <Wifi className="h-3.5 w-3.5" />
              WebSocket
            </TabsTrigger>
            <TabsTrigger value="info" className="text-xs gap-1.5">
              <Info className="h-3.5 w-3.5" />
              Agent Info
            </TabsTrigger>
          </TabsList>

          <TabsContent value="rest-api" className="mt-4">
            <DeployRestApiSection agentId={agentId} agentName={agentName} />
          </TabsContent>

          <TabsContent value="widget" className="mt-4">
            <DeployWidgetSection agentId={agentId} />
          </TabsContent>

          <TabsContent value="websocket" className="mt-4">
            <DeployWebSocketSection agentId={agentId} />
          </TabsContent>

          <TabsContent value="info" className="mt-4">
            <DeployInfoSection
              agentId={agentId}
              agentName={agentName}
              agentModel={agentModel}
              agentCreatedAt={agentCreatedAt}
            />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
