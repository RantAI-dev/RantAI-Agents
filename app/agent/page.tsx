"use client"

import { useState, useCallback, useEffect } from "react"
import { useSession, signOut } from "next-auth/react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { LogOut, MessageSquare, Users } from "lucide-react"
import Image from "next/image"
import { brand } from "@/lib/branding"
import { useAgentSocket } from "@/components/agent/hooks/use-agent-socket"
import { ConversationQueue } from "@/components/agent/conversation-queue"
import { ActiveConversation } from "@/components/agent/active-conversation"
import { StatusToggle } from "@/components/agent/status-toggle"
import type { QueueConversation } from "@/types/socket"

interface Message {
  id: string
  role: string
  content: string
  createdAt: string
}

interface ActiveConversationData {
  id: string
  customerName: string | null
  customerEmail: string | null
  productInterest: string | null
  messages: Message[]
}

export default function AgentDashboard() {
  const { data: session } = useSession()
  const router = useRouter()
  const [queue, setQueue] = useState<QueueConversation[]>([])
  const [activeConversation, setActiveConversation] =
    useState<ActiveConversationData | null>(null)
  const [isCustomerTyping, setIsCustomerTyping] = useState(false)

  const handleQueueUpdate = useCallback((conversations: QueueConversation[]) => {
    setQueue(conversations)
  }, [])

  const handleNewConversation = useCallback(
    (conversation: QueueConversation) => {
      setQueue((prev) => {
        // Avoid duplicates
        if (prev.some((c) => c.id === conversation.id)) {
          return prev
        }
        return [...prev, conversation]
      })
    },
    []
  )

  const handleMessage = useCallback(
    (data: {
      conversationId: string
      id: string
      role: string
      content: string
      createdAt: string
    }) => {
      if (activeConversation?.id === data.conversationId) {
        setActiveConversation((prev) => {
          if (!prev) return null
          // Avoid duplicate messages
          if (prev.messages.some((m) => m.id === data.id)) {
            return prev
          }
          return {
            ...prev,
            messages: [
              ...prev.messages,
              {
                id: data.id,
                role: data.role,
                content: data.content,
                createdAt: data.createdAt,
              },
            ],
          }
        })
      }
    },
    [activeConversation?.id]
  )

  const handleCustomerTyping = useCallback(
    (conversationId: string) => {
      if (activeConversation?.id === conversationId) {
        setIsCustomerTyping(true)
        setTimeout(() => setIsCustomerTyping(false), 2000)
      }
    },
    [activeConversation?.id]
  )

  const handleConversationEnded = useCallback(
    (conversationId: string) => {
      if (activeConversation?.id === conversationId) {
        setActiveConversation((prev) => {
          if (!prev) return null
          return {
            ...prev,
            messages: [
              ...prev.messages,
              {
                id: `ended-${Date.now()}`,
                role: "SYSTEM",
                content: "Customer has left the conversation.",
                createdAt: new Date().toISOString(),
              },
            ],
          }
        })
      }
    },
    [activeConversation?.id]
  )

  const socket = useAgentSocket({
    agentId: session?.user?.id || "",
    onQueueUpdate: handleQueueUpdate,
    onNewConversation: handleNewConversation,
    onMessage: handleMessage,
    onCustomerTyping: handleCustomerTyping,
    onConversationEnded: handleConversationEnded,
  })

  // Load conversation messages when accepting
  const handleAcceptConversation = async (conversationId: string) => {
    // Find the conversation in queue
    const conversation = queue.find((c) => c.id === conversationId)
    if (!conversation) return

    // Fetch messages from API
    try {
      const response = await fetch(`/api/conversations/${conversationId}/messages`)
      const messages = await response.json()

      setActiveConversation({
        id: conversationId,
        customerName: conversation.customerName,
        customerEmail: conversation.customerEmail,
        productInterest: conversation.productInterest,
        messages: messages.map((m: Message) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          createdAt: m.createdAt,
        })),
      })

      // Accept via socket
      socket.acceptConversation(conversationId)

      // Remove from queue
      setQueue((prev) => prev.filter((c) => c.id !== conversationId))
    } catch (error) {
      console.error("Failed to load conversation:", error)
    }
  }

  const handleSendMessage = (content: string) => {
    if (!activeConversation) return

    socket.sendMessage(activeConversation.id, content)

    // Optimistically add message
    setActiveConversation((prev) => {
      if (!prev) return null
      return {
        ...prev,
        messages: [
          ...prev.messages,
          {
            id: `temp-${Date.now()}`,
            role: "AGENT",
            content,
            createdAt: new Date().toISOString(),
          },
        ],
      }
    })
  }

  const handleResolve = () => {
    if (!activeConversation) return
    socket.resolveConversation(activeConversation.id)
    setActiveConversation(null)
  }

  const handleStatusToggle = () => {
    if (socket.isOnline) {
      socket.goOffline()
    } else {
      socket.goOnline()
    }
  }

  const handleSignOut = async () => {
    if (socket.isOnline) {
      socket.goOffline()
    }
    await signOut({ callbackUrl: "/login" })
  }

  // Redirect if not authenticated
  useEffect(() => {
    if (!session) {
      router.push("/login")
    }
  }, [session, router])

  if (!session) {
    return null
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <Image
                src={brand.logoMain}
                alt={brand.productName}
                width={100}
                height={100}
                className="h-8 w-auto"
              />
              <div>
                <h1 className="text-lg font-bold">Agent Portal</h1>
                <p className="text-xs text-muted-foreground">
                  {session.user?.name || session.user?.email}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <StatusToggle
                isOnline={socket.isOnline}
                isConnected={socket.isConnected}
                onToggle={handleStatusToggle}
              />
              <Button variant="ghost" size="sm" onClick={handleSignOut}>
                <LogOut className="h-4 w-4 mr-2" />
                Sign Out
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {!socket.isOnline ? (
          <Card className="max-w-lg mx-auto">
            <CardContent className="py-12 text-center">
              <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
                <MessageSquare className="h-8 w-8 text-muted-foreground" />
              </div>
              <h2 className="text-xl font-semibold mb-2">You&apos;re Offline</h2>
              <p className="text-muted-foreground mb-6">
                Go online to start receiving customer conversations
              </p>
              <Button onClick={socket.goOnline} disabled={!socket.isConnected}>
                Go Online
              </Button>
            </CardContent>
          </Card>
        ) : activeConversation ? (
          <div className="h-[calc(100vh-12rem)]">
            <ActiveConversation
              conversationId={activeConversation.id}
              customerName={activeConversation.customerName}
              customerEmail={activeConversation.customerEmail}
              productInterest={activeConversation.productInterest}
              messages={activeConversation.messages}
              isCustomerTyping={isCustomerTyping}
              onSendMessage={handleSendMessage}
              onResolve={handleResolve}
              onBack={() => {
                // Leave the conversation room when going back
                socket.leaveConversation(activeConversation.id)
                setActiveConversation(null)
              }}
            />
          </div>
        ) : (
          <div className="grid gap-8 lg:grid-cols-3">
            {/* Queue */}
            <div className="lg:col-span-2">
              <ConversationQueue
                conversations={queue}
                onAccept={handleAcceptConversation}
              />
            </div>

            {/* Stats */}
            <div className="space-y-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Queue Status
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2">
                    <Users className="h-5 w-5 text-primary" />
                    <span className="text-2xl font-bold">{queue.length}</span>
                    <span className="text-muted-foreground">
                      customers waiting
                    </span>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Quick Tips
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground space-y-2">
                  <p>• Greet customers by name when available</p>
                  <p>• Review conversation history before responding</p>
                  <p>• Mark conversations as resolved when complete</p>
                </CardContent>
              </Card>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
