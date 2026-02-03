import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { whatsapp } from "@/lib/whatsapp"

/**
 * POST - Send a message to a WhatsApp user
 * Used by agents to reply to WhatsApp customers
 */
export async function POST(request: NextRequest) {
  try {
    // Verify agent is authenticated
    const session = await auth()
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { conversationId, message } = body

    if (!conversationId || !message) {
      return NextResponse.json(
        { error: "Missing conversationId or message" },
        { status: 400 }
      )
    }

    // Get the conversation
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      include: { agent: true },
    })

    if (!conversation) {
      return NextResponse.json(
        { error: "Conversation not found" },
        { status: 404 }
      )
    }

    // Verify this is a WhatsApp conversation
    if (conversation.channel !== "WHATSAPP") {
      return NextResponse.json(
        { error: "Not a WhatsApp conversation" },
        { status: 400 }
      )
    }

    // Get customer phone number
    const customerPhone = conversation.customerPhone
    if (!customerPhone) {
      return NextResponse.json(
        { error: "Customer phone number not found" },
        { status: 400 }
      )
    }

    // Send message via WhatsApp
    const result = await whatsapp.sendMessage({
      to: customerPhone,
      message,
    })

    // Save message to database
    const savedMessage = await prisma.message.create({
      data: {
        conversationId,
        role: "AGENT",
        content: message,
        metadata: JSON.stringify({
          whatsappMessageId: result.messages?.[0]?.id,
          sentBy: session.user.email,
        }),
      },
    })

    return NextResponse.json({
      success: true,
      messageId: savedMessage.id,
      whatsappMessageId: result.messages?.[0]?.id,
    })
  } catch (error) {
    console.error("[WhatsApp Send] Error:", error)
    return NextResponse.json(
      { error: "Failed to send message" },
      { status: 500 }
    )
  }
}
