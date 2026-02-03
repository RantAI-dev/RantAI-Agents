"use client"

import { useState, useRef, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Send,
  User,
  Bot,
  UserCheck,
  CheckCircle,
  Mail,
  Package,
  ArrowLeft,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { TypingIndicator } from "@/components/chat/typing-indicator"

interface Message {
  id: string
  role: string
  content: string
  createdAt: string
}

interface ActiveConversationProps {
  conversationId: string
  customerName: string | null
  customerEmail: string | null
  productInterest: string | null
  messages: Message[]
  isCustomerTyping: boolean
  onSendMessage: (content: string) => void
  onResolve: () => void
  onBack: () => void
}

export function ActiveConversation({
  customerName,
  customerEmail,
  productInterest,
  messages,
  isCustomerTyping,
  onSendMessage,
  onResolve,
  onBack,
}: ActiveConversationProps) {
  const [input, setInput] = useState("")
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim()) return
    onSendMessage(input.trim())
    setInput("")
  }

  const getRoleIcon = (role: string) => {
    switch (role) {
      case "USER":
        return <User className="h-4 w-4 text-primary-foreground" />
      case "ASSISTANT":
        return <Bot className="h-4 w-4 text-foreground" />
      case "AGENT":
        return <UserCheck className="h-4 w-4 text-green-600" />
      default:
        return null
    }
  }

  const getRoleStyle = (role: string) => {
    switch (role) {
      case "USER":
        return "bg-primary text-primary-foreground rounded-tr-sm"
      case "ASSISTANT":
        return "bg-secondary text-foreground rounded-tl-sm"
      case "AGENT":
        return "bg-green-100 text-green-900 rounded-tl-sm"
      default:
        return "bg-muted text-muted-foreground"
    }
  }

  const getAvatarStyle = (role: string) => {
    switch (role) {
      case "USER":
        return "bg-primary"
      case "ASSISTANT":
        return "bg-secondary"
      case "AGENT":
        return "bg-green-100"
      default:
        return "bg-muted"
    }
  }

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="border-b pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={onBack}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <CardTitle className="text-lg">
                {customerName || "Customer"}
              </CardTitle>
              <div className="flex items-center gap-2 mt-1">
                {customerEmail && (
                  <span className="text-sm text-muted-foreground flex items-center gap-1">
                    <Mail className="h-3 w-3" />
                    {customerEmail}
                  </span>
                )}
                {productInterest && (
                  <Badge variant="outline" className="text-xs">
                    <Package className="h-3 w-3 mr-1" />
                    {productInterest.replace("-", " ")}
                  </Badge>
                )}
              </div>
            </div>
          </div>
          <Button variant="outline" onClick={onResolve}>
            <CheckCircle className="h-4 w-4 mr-2" />
            Resolve
          </Button>
        </div>
      </CardHeader>

      <CardContent className="flex-1 flex flex-col p-0 overflow-hidden">
        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.map((message) => {
            if (message.role === "SYSTEM") {
              return (
                <div key={message.id} className="flex justify-center">
                  <div className="bg-muted/50 text-muted-foreground text-xs px-3 py-1.5 rounded-full">
                    {message.content}
                  </div>
                </div>
              )
            }

            return (
              <div
                key={message.id}
                className={cn(
                  "flex gap-3",
                  message.role === "USER" && "flex-row-reverse"
                )}
              >
                <div
                  className={cn(
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
                    getAvatarStyle(message.role)
                  )}
                >
                  {getRoleIcon(message.role)}
                </div>
                <div
                  className={cn(
                    "max-w-[70%] rounded-2xl px-4 py-2.5",
                    getRoleStyle(message.role)
                  )}
                >
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">
                    {message.content}
                  </p>
                  <p className="text-[10px] opacity-60 mt-1">
                    {new Date(message.createdAt).toLocaleTimeString()}
                  </p>
                </div>
              </div>
            )
          })}

          {isCustomerTyping && (
            <div className="flex gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary">
                <User className="h-4 w-4 text-primary-foreground" />
              </div>
              <div className="bg-muted rounded-2xl rounded-tl-sm px-4 py-3">
                <TypingIndicator />
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <form onSubmit={handleSubmit} className="border-t p-4">
          <div className="flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type your message..."
              className="flex-1 rounded-xl border border-input bg-background px-4 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
            />
            <Button type="submit" disabled={!input.trim()}>
              <Send className="h-4 w-4 mr-2" />
              Send
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
