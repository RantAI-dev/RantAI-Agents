"use client"

import { Headphones, Users, Power } from "lucide-react"

interface EmptyStateProps {
  isOnline: boolean
  queueCount: number
}

export function EmptyState({ isOnline, queueCount }: EmptyStateProps) {
  if (!isOnline) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-8">
        <div className="rounded-full bg-muted p-4 mb-4">
          <Power className="h-8 w-8 text-muted-foreground" />
        </div>
        <h2 className="text-xl font-semibold mb-2">You&apos;re Offline</h2>
        <p className="text-muted-foreground max-w-md">
          Toggle your status to online in the queue panel to start receiving
          customer requests.
        </p>
      </div>
    )
  }

  if (queueCount > 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-8">
        <div className="rounded-full bg-primary/10 p-4 mb-4">
          <Users className="h-8 w-8 text-primary" />
        </div>
        <h2 className="text-xl font-semibold mb-2">
          {queueCount} Customer{queueCount !== 1 ? "s" : ""} Waiting
        </h2>
        <p className="text-muted-foreground max-w-md">
          Select a customer from the queue to start helping them.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center justify-center h-full text-center p-8">
      <div className="rounded-full bg-green-100 p-4 mb-4">
        <Headphones className="h-8 w-8 text-green-600" />
      </div>
      <h2 className="text-xl font-semibold mb-2">Ready to Help</h2>
      <p className="text-muted-foreground max-w-md">
        You&apos;re online and ready. New customer requests will appear in the
        queue panel.
      </p>
    </div>
  )
}
