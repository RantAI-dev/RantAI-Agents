import { auth } from "@cloud/lib/auth"
import { redirect } from "next/navigation"
import ChatPageClient from "@/features/conversations/components/chat/pages/chat-page-client"

export default async function ChatPage() {
  const session = await auth()

  if (!session?.user?.id) {
    redirect("/login")
  }

  // Simple render without hydration for now
  return <ChatPageClient />
}
