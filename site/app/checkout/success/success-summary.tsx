"use client"

import { useEffect, useState } from "react"
import { formatIDR } from "@/lib/pricing"

interface OrderRecord {
  orderId: string
  planName: string
  billing: "monthly" | "annual"
  unitAmount: number
  totalAmount: number
  customer: { name: string; email: string; phone: string }
  createdAt: string
}

export function SuccessSummary() {
  const [order, setOrder] = useState<OrderRecord | null>(null)
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    setHydrated(true)
    try {
      const raw = sessionStorage.getItem("rantai_last_order")
      if (raw) setOrder(JSON.parse(raw) as OrderRecord)
    } catch {
      // ignore
    }
  }, [])

  if (!hydrated) return null
  if (!order) {
    return (
      <p className="text-sm text-zinc-500">
        We&apos;ll send next steps to your email shortly.
      </p>
    )
  }

  return (
    <div className="text-left mx-auto max-w-md border border-zinc-800 rounded-xl p-5 bg-zinc-900/40 text-sm">
      <div className="flex items-center justify-between mb-3 pb-3 border-b border-zinc-800">
        <span className="text-zinc-500">Order ID</span>
        <span className="text-zinc-200 font-mono text-xs">{order.orderId}</span>
      </div>
      <dl className="space-y-2">
        <Row label="Plan" value={`${order.planName} (${order.billing})`} />
        <Row label="Amount" value={formatIDR(order.totalAmount)} />
        <Row label="Name" value={order.customer.name} />
        <Row label="Email" value={order.customer.email} />
        <Row label="Phone" value={order.customer.phone} />
      </dl>
      <p className="mt-4 text-xs text-zinc-500">
        A confirmation has been queued to <span className="text-zinc-300">{order.customer.email}</span>.
      </p>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-zinc-500">{label}</dt>
      <dd className="text-zinc-200 text-right truncate">{value}</dd>
    </div>
  )
}
