"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Users, Clock, Package, Mail, MessageSquare } from "lucide-react"
import { formatDistanceToNow } from "date-fns"
import type { QueueConversation } from "@/types/socket"

interface ConversationQueueProps {
  conversations: QueueConversation[]
  onAccept: (conversationId: string) => void
  isLoading?: boolean
}

export function ConversationQueue({
  conversations,
  onAccept,
  isLoading,
}: ConversationQueueProps) {
  if (conversations.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Users className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
          <h3 className="font-medium text-muted-foreground">No waiting customers</h3>
          <p className="text-sm text-muted-foreground/70 mt-1">
            New customer requests will appear here
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Users className="h-5 w-5" />
          Customer Queue
        </h2>
        <Badge variant="secondary">{conversations.length} waiting</Badge>
      </div>

      <div className="space-y-3">
        {conversations.map((conversation) => (
          <Card key={conversation.id} className="overflow-hidden">
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle className="text-base">
                    {conversation.customerName || "Anonymous Customer"}
                  </CardTitle>
                  {conversation.customerEmail && (
                    <p className="text-sm text-muted-foreground flex items-center gap-1 mt-0.5">
                      <Mail className="h-3 w-3" />
                      {conversation.customerEmail}
                    </p>
                  )}
                </div>
                <div className="text-right text-xs text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {conversation.handoffAt
                      ? formatDistanceToNow(new Date(conversation.handoffAt), {
                          addSuffix: true,
                        })
                      : "Just now"}
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              {conversation.productInterest && (
                <Badge variant="outline" className="mb-2">
                  <Package className="h-3 w-3 mr-1" />
                  {conversation.productInterest.replace("-", " ")}
                </Badge>
              )}

              {conversation.messagePreview && (
                <div className="bg-muted rounded-lg p-2 mb-3">
                  <p className="text-sm text-muted-foreground flex items-start gap-2">
                    <MessageSquare className="h-4 w-4 mt-0.5 shrink-0" />
                    <span className="line-clamp-2">
                      {conversation.messagePreview}
                    </span>
                  </p>
                </div>
              )}

              <Button
                onClick={() => onAccept(conversation.id)}
                className="w-full"
                disabled={isLoading}
              >
                Accept Conversation
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
