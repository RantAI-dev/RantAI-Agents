# Mobile App — Phase B (Chat) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a working mobile chat experience: conversation list, conversation detail with streaming AI replies (using AI SDK v6 + `expo/fetch`), composer with text input, image/document attachments, voice dictation, drafts persistence, optimistic sends, and pull-to-refresh — all consuming the existing Next.js chat backend with mobile JWT auth.

**Architecture:** Add a tiny `getUserId(req)` shim accepting EITHER NextAuth session OR mobile JWT, drop it into the chat-related backend routes (no behavior change for web). On mobile, build a new `features/chat/` slice with TanStack Query hooks for conversation list/detail, an `expo/fetch`-backed `useChat` adapter for streaming, FlashList-virtualized messages, a composer component with attach + voice + send, and per-conversation MMKV-backed drafts. Replace the Phase A empty-state chat screens with the real implementation.

**Tech Stack:** Same as Phase A. New mobile additions: `@shopify/flash-list` (already installed), `expo-image-picker`, `expo-document-picker`, `expo-speech-recognition` (all already installed in `mobile/package.json` from Phase A).

**Spec reference:** `docs/superpowers/specs/2026-04-16-mobile-app-react-native-design.md`
**Builds on:** Phase A commits on `feat/mobile-phase-a` (or merge target branch).

---

## File structure

### Backend

**Created:**
- `src/lib/get-user-id.ts` — drop-in `getUserId(req)` accepting cookie or Bearer
- `tests/unit/get-user-id.test.ts`

**Modified (each is a 2-3 line mechanical edit replacing `await auth()` with `await getUserId(req)`):**
- `src/app/api/chat/route.ts` — main streaming chat
- `src/app/api/conversations/route.ts` — list/create
- `src/app/api/conversations/[id]/route.ts` — get/update/delete one
- `src/app/api/dashboard/chat/sessions/route.ts`
- `src/app/api/dashboard/chat/sessions/[id]/route.ts`
- `src/app/api/dashboard/chat/sessions/[id]/messages/route.ts`
- `src/app/api/chat/upload/route.ts` — file upload for attachments

(Other routes — agents, knowledge, ops — are deferred to Plan 2b.)

### Mobile

**Created:**
- `mobile/src/api/conversations.ts` — list, get, create, delete
- `mobile/src/api/messages.ts` — list per session, append
- `mobile/src/api/upload.ts` — chunked file upload helper
- `mobile/src/features/chat/use-conversations.ts` — TanStack Query infinite list
- `mobile/src/features/chat/use-conversation.ts` — single conversation w/ messages
- `mobile/src/features/chat/use-chat-stream.ts` — AI SDK `useChat` adapter w/ expo/fetch
- `mobile/src/features/chat/use-draft.ts` — per-conversation MMKV draft
- `mobile/src/components/chat/message-bubble.tsx`
- `mobile/src/components/chat/composer.tsx`
- `mobile/src/components/chat/attachment-sheet.tsx`
- `mobile/src/components/chat/voice-button.tsx`
- `mobile/src/components/chat/typing-indicator.tsx`
- `mobile/__tests__/features/chat/use-conversations.test.ts`
- `mobile/__tests__/features/chat/use-draft.test.ts`
- `mobile/__tests__/api/conversations.test.ts`
- `mobile/.maestro/chat-flow.yaml`

**Modified:**
- `mobile/app/(tabs)/chat/index.tsx` — replace empty state with `<ConversationList>`
- `mobile/app/(tabs)/chat/[id].tsx` — NEW conversation detail screen
- `mobile/app/(tabs)/chat/new.tsx` — NEW assistant picker for fresh conversation
- `mobile/src/components/ui/input.tsx` — already exists; reuse
- `mobile/app.json` — already has speech-recognition + image-picker plugins from Phase A

---

## Conventions

Same as Phase A: working dir is `/home/shiro/rantai/RantAI-Agents/.worktrees/mobile-phase-a`, branch is `feat/mobile-phase-a` (continuing the same branch). All commits use the `Co-Authored-By` trailer. Idempotent script at `.scripts/run-phase-b-chat.sh` mirrors the Phase A pattern.

---

## Phase B.1 — Backend: universal `getUserId` shim

### Task 1: Add `src/lib/get-user-id.ts` and test

**Files:** Create `src/lib/get-user-id.ts`, `tests/unit/get-user-id.test.ts`

- [ ] **Step 1: Write failing test** at `tests/unit/get-user-id.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from "vitest"

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }))
vi.mock("@/lib/prisma", () => ({
  prisma: { mobileSession: { findUnique: vi.fn(), update: vi.fn().mockResolvedValue({}) } },
}))

import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { signAccessToken } from "@/lib/auth-mobile"
import { getUserId } from "@/lib/get-user-id"

beforeEach(() => {
  vi.clearAllMocks()
  process.env.MOBILE_JWT_SECRET = "test-secret-32-bytes-of-random-data!!"
  process.env.MOBILE_JWT_ACCESS_TTL = "900"
})

describe("getUserId", () => {
  it("returns userId from NextAuth session", async () => {
    ;(auth as any).mockResolvedValue({ user: { id: "u_web" } })
    const id = await getUserId(new Request("http://localhost/x"))
    expect(id).toBe("u_web")
  })

  it("returns userId from mobile JWT", async () => {
    ;(auth as any).mockResolvedValue(null)
    ;(prisma.mobileSession.findUnique as any).mockResolvedValue({
      id: "sess_1", userId: "u_mob", revokedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
    })
    const token = await signAccessToken({ userId: "u_mob", sessionId: "sess_1" })
    const req = new Request("http://localhost/x", {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(await getUserId(req)).toBe("u_mob")
  })

  it("returns null when neither method authenticates", async () => {
    ;(auth as any).mockResolvedValue(null)
    expect(await getUserId(new Request("http://localhost/x"))).toBeNull()
  })

  it("returns null when mobile JWT references revoked session", async () => {
    ;(auth as any).mockResolvedValue(null)
    ;(prisma.mobileSession.findUnique as any).mockResolvedValue({
      id: "sess_1", userId: "u_mob", revokedAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
    })
    const token = await signAccessToken({ userId: "u_mob", sessionId: "sess_1" })
    const req = new Request("http://localhost/x", {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(await getUserId(req)).toBeNull()
  })
})
```

- [ ] **Step 2: Run test (expect fail)**

Run: `bunx vitest run tests/unit/get-user-id.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement `src/lib/get-user-id.ts`**

```ts
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { verifyAccessToken } from "@/lib/auth-mobile"

/**
 * Returns the authenticated user's id whether the caller is the web app
 * (NextAuth session cookie) or the mobile app (Authorization: Bearer <jwt>).
 * Returns null when neither path authenticates.
 *
 * Drop-in replacement for `await auth()` followed by `session?.user?.id`.
 */
export async function getUserId(req: Request): Promise<string | null> {
  const session = await auth()
  if (session?.user?.id) return session.user.id

  const header = req.headers.get("authorization")
  if (!header?.startsWith("Bearer ")) return null
  const token = header.slice(7).trim()
  try {
    const claims = await verifyAccessToken(token)
    const sess = await prisma.mobileSession.findUnique({
      where: { id: claims.sessionId },
    })
    if (
      !sess ||
      sess.revokedAt ||
      sess.expiresAt < new Date() ||
      sess.userId !== claims.userId
    ) {
      return null
    }
    prisma.mobileSession
      .update({ where: { id: sess.id }, data: { lastUsedAt: new Date() } })
      .catch(() => {})
    return sess.userId
  } catch {
    return null
  }
}
```

- [ ] **Step 4: Run test (expect pass)** — `bunx vitest run tests/unit/get-user-id.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/lib/get-user-id.ts tests/unit/get-user-id.test.ts
git commit -m "feat(auth): add getUserId(req) drop-in shim accepting NextAuth or mobile JWT

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

### Task 2: Refactor chat-related routes

**Files (all modified):**
- `src/app/api/chat/route.ts`
- `src/app/api/conversations/route.ts`
- `src/app/api/conversations/[id]/route.ts`
- `src/app/api/dashboard/chat/sessions/route.ts`
- `src/app/api/dashboard/chat/sessions/[id]/route.ts`
- `src/app/api/dashboard/chat/sessions/[id]/messages/route.ts`
- `src/app/api/chat/upload/route.ts`

**The refactor pattern**, applied identically to each route:

OLD:
```ts
import { auth } from "@/lib/auth"
// …
const session = await auth()
if (!session?.user?.id) {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
}
// then later: session.user.id
```

NEW:
```ts
import { getUserId } from "@/lib/get-user-id"
// …
const userId = await getUserId(req)
if (!userId) {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
}
// then later: userId
```

- [ ] **Step 1: Refactor each route** — sed-style for each: remove `import { auth }`, add `import { getUserId }`, replace `const session = await auth()` block, replace `session.user.id` with `userId`. For functions that don't already accept `req`, add it as the first param.

- [ ] **Step 2: Verify web still works** — `bun run dev` (manual smoke), open `/dashboard/chat`, send a message. Should behave identically.

- [ ] **Step 3: Run all integration tests** — `bunx vitest run tests/integration` (allow pre-existing unrelated failures, but no NEW failures).

- [ ] **Step 4: Commit**

```bash
git add src/app/api/chat/ src/app/api/conversations/ src/app/api/dashboard/chat/
git commit -m "refactor(api): switch chat routes to getUserId() (web + mobile auth)

Each route now accepts either a NextAuth session cookie or a mobile JWT
Bearer token. No behavior change for the web dashboard.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Phase B.2 — Mobile chat API client

### Task 3: Conversation API client

**Files:** Create `mobile/src/api/conversations.ts`, `mobile/src/api/messages.ts`, `mobile/__tests__/api/conversations.test.ts`

- [ ] **Step 1: Write `mobile/src/api/conversations.ts`**

```ts
import { apiFetch } from "./client"

export interface Conversation {
  id: string
  sessionId: string
  title?: string | null
  status: string
  channel: string
  createdAt: string
  updatedAt: string
  lastMessagePreview?: string | null
}

export interface ConversationDetail extends Conversation {
  messages: ChatMessage[]
}

export interface ChatMessage {
  id: string
  role: "user" | "assistant" | "system" | "tool"
  content: string
  createdAt: string
  attachments?: { id: string; url: string; mimeType: string; name: string }[]
}

export const conversationsApi = {
  list: () => apiFetch<{ conversations: Conversation[] }>("/api/conversations"),
  get: (id: string) => apiFetch<ConversationDetail>(`/api/conversations/${id}`),
  create: (sessionId: string) =>
    apiFetch<Conversation>("/api/conversations", {
      method: "POST",
      json: { sessionId },
    }),
  delete: (id: string) =>
    apiFetch<void>(`/api/conversations/${id}`, { method: "DELETE" }),
}
```

- [ ] **Step 2: Write `mobile/src/api/messages.ts`**

```ts
import { apiFetch } from "./client"
import type { ChatMessage } from "./conversations"

export const messagesApi = {
  list: (sessionId: string) =>
    apiFetch<{ messages: ChatMessage[] }>(
      `/api/dashboard/chat/sessions/${sessionId}/messages`,
    ),
  append: (sessionId: string, messages: { role: string; content: string }[]) =>
    apiFetch<{ messages: ChatMessage[] }>(
      `/api/dashboard/chat/sessions/${sessionId}/messages`,
      { method: "POST", json: { messages } },
    ),
}
```

- [ ] **Step 3: Write the test**

```ts
import { describe, it, expect, beforeEach, vi } from "vitest"

vi.mock("@/lib/env", () => ({ env: { apiBaseUrl: "http://test", sentryDsn: null } }))

beforeEach(() => { vi.restoreAllMocks() })

describe("conversationsApi.list", () => {
  it("hits /api/conversations and returns conversations", async () => {
    const { useAuthStore } = await import("@/auth/use-auth-store")
    useAuthStore.setState({
      accessToken: "tok",
      activeAccount: { id: "a", email: "x@y.z", name: "X", refreshToken: "r" },
    })
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ conversations: [{ id: "c1" }] }), { status: 200 }),
    )
    const { conversationsApi } = await import("@/api/conversations")
    const res = await conversationsApi.list()
    expect(res.conversations[0].id).toBe("c1")
  })
})
```

- [ ] **Step 4: Run test** — `cd mobile && bunx vitest run __tests__/api/conversations.test.ts`

- [ ] **Step 5: Commit**

```bash
git add mobile/src/api/conversations.ts mobile/src/api/messages.ts mobile/__tests__/api/conversations.test.ts
git commit -m "feat(mobile): conversations + messages API clients

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Phase B.3 — Mobile chat hooks

### Task 4: TanStack Query hooks for conversations

**Files:** Create `mobile/src/features/chat/use-conversations.ts`, `use-conversation.ts`

- [ ] **Step 1: Write `use-conversations.ts`**

```ts
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { conversationsApi, type Conversation } from "@/api/conversations"

export function useConversations() {
  return useQuery({
    queryKey: ["conversations"],
    queryFn: conversationsApi.list,
    select: (data) => data.conversations,
  })
}

export function useCreateConversation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (sessionId: string) => conversationsApi.create(sessionId),
    onSuccess: (created) => {
      qc.setQueryData<{ conversations: Conversation[] }>(["conversations"], (prev) => ({
        conversations: [created, ...(prev?.conversations ?? [])],
      }))
    },
  })
}

export function useDeleteConversation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => conversationsApi.delete(id),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: ["conversations"] })
      const prev = qc.getQueryData<{ conversations: Conversation[] }>(["conversations"])
      qc.setQueryData(["conversations"], {
        conversations: prev?.conversations.filter((c) => c.id !== id) ?? [],
      })
      return { prev }
    },
    onError: (_e, _id, ctx) => {
      if (ctx?.prev) qc.setQueryData(["conversations"], ctx.prev)
    },
  })
}
```

- [ ] **Step 2: Write `use-conversation.ts`**

```ts
import { useQuery } from "@tanstack/react-query"
import { conversationsApi } from "@/api/conversations"

export function useConversation(id: string) {
  return useQuery({
    queryKey: ["conversations", id],
    queryFn: () => conversationsApi.get(id),
    enabled: !!id,
  })
}
```

- [ ] **Step 3: Commit**

```bash
git add mobile/src/features/chat/
git commit -m "feat(mobile): TanStack Query hooks for conversations

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

### Task 5: AI SDK chat-stream hook

**Files:** Create `mobile/src/features/chat/use-chat-stream.ts`

- [ ] **Step 1: Write the hook**

```ts
import { useChat } from "@ai-sdk/react"
import { fetch as expoFetch } from "expo/fetch"
import { env } from "@/lib/env"
import { useAuthStore } from "@/auth/use-auth-store"

export interface UseChatStreamOptions {
  sessionId: string
  assistantId?: string
  initialMessages?: Array<{ id: string; role: "user" | "assistant"; content: string }>
}

export function useChatStream({ sessionId, assistantId, initialMessages }: UseChatStreamOptions) {
  return useChat({
    api: `${env.apiBaseUrl}/api/chat`,
    id: sessionId,
    initialMessages,
    fetch: expoFetch as unknown as typeof fetch,
    headers: () => {
      const { accessToken } = useAuthStore.getState()
      const h: Record<string, string> = { "Content-Type": "application/json" }
      if (accessToken) h["Authorization"] = `Bearer ${accessToken}`
      if (assistantId) h["X-Assistant-Id"] = assistantId
      return h
    },
    body: { sessionId },
  })
}
```

- [ ] **Step 2: Commit**

```bash
git add mobile/src/features/chat/use-chat-stream.ts
git commit -m "feat(mobile): useChatStream hook (AI SDK v6 + expo/fetch streaming)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

### Task 6: Per-conversation drafts

**Files:** Create `mobile/src/features/chat/use-draft.ts`, `mobile/__tests__/features/chat/use-draft.test.ts`

- [ ] **Step 1: Write the hook**

```ts
import { useEffect, useState } from "react"
import { storage } from "@/lib/mmkv"

const draftKey = (id: string) => `draft/conversation/${id}`

export function useDraft(conversationId: string | null) {
  const [text, setText] = useState("")

  useEffect(() => {
    if (!conversationId) { setText(""); return }
    setText(storage.getString(draftKey(conversationId)) ?? "")
  }, [conversationId])

  function update(value: string) {
    setText(value)
    if (!conversationId) return
    if (value) storage.set(draftKey(conversationId), value)
    else storage.delete(draftKey(conversationId))
  }

  function clear() {
    if (conversationId) storage.delete(draftKey(conversationId))
    setText("")
  }

  return { text, setText: update, clear }
}
```

- [ ] **Step 2: Write the test**

```ts
import { describe, it, expect, beforeEach } from "vitest"
import { renderHook, act } from "@testing-library/react-native"

beforeEach(async () => {
  const { storage } = await import("@/lib/mmkv")
  // mocked MMKV in setup.ts; reset by clearing all mocks
})

describe("useDraft", () => {
  it("persists text per conversation", async () => {
    const { useDraft } = await import("@/features/chat/use-draft")
    const { result, rerender } = renderHook(({ id }) => useDraft(id), {
      initialProps: { id: "c1" },
    })
    act(() => result.current.setText("hello"))
    expect(result.current.text).toBe("hello")
    // Switch conversation, expect different draft
    rerender({ id: "c2" })
    expect(result.current.text).toBe("")
    rerender({ id: "c1" })
    expect(result.current.text).toBe("hello")
  })
})
```

- [ ] **Step 3: Run test, commit**

```bash
cd mobile && bunx vitest run __tests__/features/chat/use-draft.test.ts
cd ..
git add mobile/src/features/chat/use-draft.ts mobile/__tests__/features/chat/use-draft.test.ts
git commit -m "feat(mobile): per-conversation MMKV draft hook + test

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Phase B.4 — Mobile chat UI components

### Task 7: MessageBubble component

**Files:** Create `mobile/src/components/chat/message-bubble.tsx`

```tsx
import { View, Text, Pressable } from "react-native"
import * as Clipboard from "expo-clipboard"
import * as Haptics from "expo-haptics"
import { cn } from "@/lib/cn"

export interface MessageBubbleProps {
  role: "user" | "assistant" | "system" | "tool"
  content: string
}

export function MessageBubble({ role, content }: MessageBubbleProps) {
  const isUser = role === "user"

  async function copy() {
    await Haptics.selectionAsync()
    await Clipboard.setStringAsync(content)
  }

  return (
    <View className={cn("px-4 py-2", isUser ? "items-end" : "items-start")}>
      <Pressable
        onLongPress={copy}
        className={cn(
          "rounded-2xl px-4 py-3 max-w-[85%]",
          isUser ? "bg-primary" : "bg-muted",
        )}
      >
        <Text className={cn(isUser ? "text-white" : "text-foreground")}>
          {content}
        </Text>
      </Pressable>
    </View>
  )
}
```

- [ ] Commit:
```bash
git add mobile/src/components/chat/message-bubble.tsx
git commit -m "feat(mobile): MessageBubble with long-press copy + haptics

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

### Task 8: AttachmentSheet bottom sheet

**Files:** Create `mobile/src/components/chat/attachment-sheet.tsx`

```tsx
import { View, Text, Pressable, Modal } from "react-native"
import { Camera, Image as ImageIcon, FileText } from "lucide-react-native"
import * as ImagePicker from "expo-image-picker"
import * as DocumentPicker from "expo-document-picker"

export interface AttachmentSheetProps {
  visible: boolean
  onClose: () => void
  onPick: (uri: string, name: string, mimeType: string) => void
}

export function AttachmentSheet({ visible, onClose, onPick }: AttachmentSheetProps) {
  async function pickCamera() {
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"] })
    if (!result.canceled && result.assets[0]) {
      const a = result.assets[0]
      onPick(a.uri, a.fileName ?? "photo.jpg", a.mimeType ?? "image/jpeg")
    }
    onClose()
  }
  async function pickLibrary() {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"] })
    if (!result.canceled && result.assets[0]) {
      const a = result.assets[0]
      onPick(a.uri, a.fileName ?? "image.jpg", a.mimeType ?? "image/jpeg")
    }
    onClose()
  }
  async function pickDoc() {
    const result = await DocumentPicker.getDocumentAsync({ type: "*/*", copyToCacheDirectory: true })
    if (!result.canceled && result.assets[0]) {
      const a = result.assets[0]
      onPick(a.uri, a.name, a.mimeType ?? "application/octet-stream")
    }
    onClose()
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable className="flex-1 bg-black/40" onPress={onClose}>
        <View className="mt-auto bg-background rounded-t-2xl p-6 gap-4">
          <SheetButton icon={Camera} label="Take photo" onPress={pickCamera} />
          <SheetButton icon={ImageIcon} label="Choose from library" onPress={pickLibrary} />
          <SheetButton icon={FileText} label="Attach document" onPress={pickDoc} />
        </View>
      </Pressable>
    </Modal>
  )
}

function SheetButton({ icon: Icon, label, onPress }: { icon: any; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} className="flex-row items-center gap-3 py-3 active:opacity-60">
      <Icon size={24} color="currentColor" />
      <Text className="text-foreground text-base">{label}</Text>
    </Pressable>
  )
}
```

- [ ] Commit:
```bash
git add mobile/src/components/chat/attachment-sheet.tsx
git commit -m "feat(mobile): AttachmentSheet (camera, photos, documents)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

### Task 9: VoiceButton (dictation)

**Files:** Create `mobile/src/components/chat/voice-button.tsx`

```tsx
import { useState, useEffect } from "react"
import { Pressable } from "react-native"
import { Mic, MicOff } from "lucide-react-native"
import * as SpeechRecognition from "expo-speech-recognition"

export interface VoiceButtonProps {
  onTranscript: (text: string) => void
}

export function VoiceButton({ onTranscript }: VoiceButtonProps) {
  const [recording, setRecording] = useState(false)

  useEffect(() => {
    const subResult = SpeechRecognition.ExpoSpeechRecognitionModule.addListener(
      "result",
      (event) => {
        if (event.results[0]?.transcript) onTranscript(event.results[0].transcript)
      },
    )
    const subEnd = SpeechRecognition.ExpoSpeechRecognitionModule.addListener("end", () => {
      setRecording(false)
    })
    return () => { subResult.remove(); subEnd.remove() }
  }, [onTranscript])

  async function toggle() {
    if (recording) {
      await SpeechRecognition.ExpoSpeechRecognitionModule.stop()
      setRecording(false)
      return
    }
    const perm = await SpeechRecognition.ExpoSpeechRecognitionModule.requestPermissionsAsync()
    if (!perm.granted) return
    await SpeechRecognition.ExpoSpeechRecognitionModule.start({
      lang: "en-US",
      interimResults: true,
      continuous: false,
    })
    setRecording(true)
  }

  return (
    <Pressable onPress={toggle} className="p-2 active:opacity-60">
      {recording ? <MicOff size={22} color="#ef4444" /> : <Mic size={22} color="currentColor" />}
    </Pressable>
  )
}
```

- [ ] Commit:
```bash
git add mobile/src/components/chat/voice-button.tsx
git commit -m "feat(mobile): VoiceButton with expo-speech-recognition dictation

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

### Task 10: Composer

**Files:** Create `mobile/src/components/chat/composer.tsx`

```tsx
import { useState } from "react"
import { View, Pressable } from "react-native"
import { Plus, Send } from "lucide-react-native"
import * as Haptics from "expo-haptics"
import { Input } from "@/components/ui/input"
import { AttachmentSheet } from "./attachment-sheet"
import { VoiceButton } from "./voice-button"

export interface ComposerProps {
  value: string
  onChange: (text: string) => void
  onSend: () => void
  onAttach: (uri: string, name: string, mimeType: string) => void
  disabled?: boolean
}

export function Composer({ value, onChange, onSend, onAttach, disabled }: ComposerProps) {
  const [sheetOpen, setSheetOpen] = useState(false)
  const canSend = value.trim().length > 0 && !disabled

  function send() {
    if (!canSend) return
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    onSend()
  }

  return (
    <View className="border-t border-border bg-background px-3 py-2 flex-row items-end gap-2">
      <Pressable
        onPress={() => setSheetOpen(true)}
        className="p-2 active:opacity-60"
        accessibilityLabel="Attach"
      >
        <Plus size={22} color="currentColor" />
      </Pressable>
      <Input
        className="flex-1 max-h-32"
        placeholder="Message"
        accessibilityLabel="Message input"
        multiline
        value={value}
        onChangeText={onChange}
      />
      <VoiceButton onTranscript={(t) => onChange((value ? value + " " : "") + t)} />
      <Pressable
        onPress={send}
        disabled={!canSend}
        className="p-2 active:opacity-60"
        accessibilityLabel="Send"
      >
        <Send size={22} color={canSend ? "#1d4ed8" : "#9ca3af"} />
      </Pressable>
      <AttachmentSheet
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onPick={onAttach}
      />
    </View>
  )
}
```

- [ ] Commit:
```bash
git add mobile/src/components/chat/composer.tsx
git commit -m "feat(mobile): Composer (text, attach, voice, send) with haptics

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

### Task 11: TypingIndicator (3 dots animation)

**Files:** Create `mobile/src/components/chat/typing-indicator.tsx`

```tsx
import { useEffect } from "react"
import { View } from "react-native"
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withTiming, withDelay } from "react-native-reanimated"

function Dot({ delay }: { delay: number }) {
  const opacity = useSharedValue(0.3)
  useEffect(() => {
    opacity.value = withDelay(
      delay,
      withRepeat(withTiming(1, { duration: 400 }), -1, true),
    )
  }, [delay])
  const style = useAnimatedStyle(() => ({ opacity: opacity.value }))
  return <Animated.View className="w-2 h-2 rounded-full bg-foreground/60" style={style} />
}

export function TypingIndicator() {
  return (
    <View className="flex-row gap-1.5 px-4 py-3">
      <Dot delay={0} />
      <Dot delay={150} />
      <Dot delay={300} />
    </View>
  )
}
```

- [ ] Commit:
```bash
git add mobile/src/components/chat/typing-indicator.tsx
git commit -m "feat(mobile): TypingIndicator with Reanimated 4 dot pulse

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Phase B.5 — Mobile chat screens

### Task 12: ConversationList screen

**Files:** Modify `mobile/app/(tabs)/chat/index.tsx`

```tsx
import { useState } from "react"
import { View, Text, RefreshControl, Pressable } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { useRouter } from "expo-router"
import { FlashList } from "@shopify/flash-list"
import { Plus } from "lucide-react-native"
import { useConversations } from "@/features/chat/use-conversations"
import { Button } from "@/components/ui/button"

export default function ChatListScreen() {
  const router = useRouter()
  const { data: conversations, isLoading, refetch, isRefetching } = useConversations()
  const [_, setRefresh] = useState(0)

  if (isLoading && !conversations) {
    return (
      <SafeAreaView className="flex-1 bg-background">
        <View className="flex-1 items-center justify-center">
          <Text className="text-foreground/60">Loading…</Text>
        </View>
      </SafeAreaView>
    )
  }

  if (!conversations || conversations.length === 0) {
    return (
      <SafeAreaView className="flex-1 bg-background">
        <View className="flex-1 items-center justify-center px-6 gap-4">
          <Text className="text-foreground text-lg">No conversations yet</Text>
          <Button onPress={() => router.push("/(tabs)/chat/new")}>Start a chat</Button>
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView className="flex-1 bg-background">
      <View className="px-4 py-3 flex-row items-center justify-between border-b border-border">
        <Text className="text-foreground text-2xl font-semibold">Chat</Text>
        <Pressable
          onPress={() => router.push("/(tabs)/chat/new")}
          className="p-2 active:opacity-60"
          accessibilityLabel="New chat"
        >
          <Plus size={22} color="currentColor" />
        </Pressable>
      </View>
      <FlashList
        data={conversations}
        keyExtractor={(c) => c.id}
        estimatedItemSize={72}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push(`/(tabs)/chat/${item.id}`)}
            className="px-4 py-3 border-b border-border active:opacity-60"
          >
            <Text className="text-foreground font-medium" numberOfLines={1}>
              {item.title || "Untitled"}
            </Text>
            {item.lastMessagePreview && (
              <Text className="text-foreground/60 text-sm mt-1" numberOfLines={1}>
                {item.lastMessagePreview}
              </Text>
            )}
          </Pressable>
        )}
      />
    </SafeAreaView>
  )
}
```

- [ ] Commit:
```bash
git add mobile/app/(tabs)/chat/index.tsx
git commit -m "feat(mobile): conversation list screen with FlashList + pull-to-refresh

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

### Task 13: ConversationDetail screen with streaming

**Files:** Create `mobile/app/(tabs)/chat/[id].tsx`

```tsx
import { useEffect, useRef } from "react"
import { View, Text, KeyboardAvoidingView, Platform } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { Stack, useLocalSearchParams } from "expo-router"
import { FlashList } from "@shopify/flash-list"
import { useConversation } from "@/features/chat/use-conversation"
import { useChatStream } from "@/features/chat/use-chat-stream"
import { useDraft } from "@/features/chat/use-draft"
import { MessageBubble } from "@/components/chat/message-bubble"
import { Composer } from "@/components/chat/composer"
import { TypingIndicator } from "@/components/chat/typing-indicator"

export default function ConversationDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { data: conv } = useConversation(id)
  const draft = useDraft(id ?? null)
  const listRef = useRef<FlashList<any>>(null)

  const { messages, sendMessage, status, stop } = useChatStream({
    sessionId: id!,
    initialMessages: conv?.messages.map((m) => ({
      id: m.id,
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
  })

  useEffect(() => {
    listRef.current?.scrollToEnd({ animated: true })
  }, [messages.length])

  function send() {
    if (!draft.text.trim()) return
    sendMessage({ role: "user", content: draft.text })
    draft.clear()
  }

  function attach(_uri: string, _name: string, _mimeType: string) {
    // TODO Phase B.6 — wire upload then append as a message attachment.
    // Placeholder for now: just keep the file URI in a future state slice.
  }

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["bottom"]}>
      <Stack.Screen options={{ title: conv?.title ?? "Chat" }} />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 64 : 0}
        style={{ flex: 1 }}
      >
        <FlashList
          ref={listRef}
          data={messages}
          keyExtractor={(m) => m.id}
          estimatedItemSize={88}
          renderItem={({ item }) => <MessageBubble role={item.role as any} content={item.content} />}
          ListFooterComponent={status === "in_progress" ? <TypingIndicator /> : null}
        />
        <Composer
          value={draft.text}
          onChange={draft.setText}
          onSend={send}
          onAttach={attach}
          disabled={status === "in_progress"}
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}
```

- [ ] Commit:
```bash
git add mobile/app/(tabs)/chat/[id].tsx
git commit -m "feat(mobile): conversation detail screen w/ streaming + composer + keyboard handling

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

### Task 14: NewChat (assistant picker) screen

**Files:** Create `mobile/app/(tabs)/chat/new.tsx`

```tsx
import { View, Text, FlatList, Pressable } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { useRouter, Stack } from "expo-router"
import { useQuery } from "@tanstack/react-query"
import { apiFetch } from "@/api/client"
import { useCreateConversation } from "@/features/chat/use-conversations"

interface Assistant {
  id: string
  name: string
  description?: string
}

export default function NewChatScreen() {
  const router = useRouter()
  const create = useCreateConversation()
  const { data } = useQuery({
    queryKey: ["assistants"],
    queryFn: () => apiFetch<{ assistants: Assistant[] }>("/api/assistants"),
    select: (d) => d.assistants,
  })

  async function start(_assistantId: string) {
    // sessionId == cuid (matches conversation backend's expectation)
    const sessionId = `m_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const conv = await create.mutateAsync(sessionId)
    router.replace(`/(tabs)/chat/${conv.id}`)
  }

  return (
    <SafeAreaView className="flex-1 bg-background">
      <Stack.Screen options={{ title: "New chat" }} />
      <View className="flex-1 px-4 py-3">
        <Text className="text-foreground text-lg font-medium mb-3">Pick an assistant</Text>
        <FlatList
          data={data ?? []}
          keyExtractor={(a) => a.id}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => start(item.id)}
              className="py-3 border-b border-border active:opacity-60"
            >
              <Text className="text-foreground font-medium">{item.name}</Text>
              {item.description && (
                <Text className="text-foreground/60 text-sm mt-1" numberOfLines={2}>
                  {item.description}
                </Text>
              )}
            </Pressable>
          )}
        />
      </View>
    </SafeAreaView>
  )
}
```

- [ ] Commit:
```bash
git add mobile/app/(tabs)/chat/new.tsx
git commit -m "feat(mobile): new-chat screen (assistant picker)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Phase B.6 — Maestro E2E

### Task 15: Maestro chat flow

**Files:** Create `mobile/.maestro/chat-flow.yaml`

```yaml
appId: ai.rantai.mobile
---
- launchApp
- assertVisible: "Sign in"
- tapOn: "Email"
- inputText: "test@example.com"
- tapOn: "Password"
- inputText: "test-password"
- tapOn: "Sign in"
- assertVisible: "Chat"
- tapOn:
    id: "New chat"
- assertVisible: "Pick an assistant"
- tapOn:
    index: 0
- assertVisible: "Message"
- tapOn: "Message input"
- inputText: "Hello"
- tapOn: "Send"
- waitForAnimationToEnd:
    timeout: 30000
- assertVisible: "Hello"
```

- [ ] Commit:
```bash
git add mobile/.maestro/chat-flow.yaml
git commit -m "test(mobile): Maestro E2E for chat (login → new chat → send → assert reply)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Self-review checklist

Run through after execution:

- [ ] All `bunx vitest run tests/unit/get-user-id.test.ts` pass
- [ ] All `bunx vitest run tests/integration` show no NEW failures vs Phase A baseline
- [ ] `cd mobile && bun run test` passes all chat tests
- [ ] Manual smoke (Phase B.7 build): cold-launch app, sign in, see existing conversations OR empty state, tap "Start a chat" → assistant picker → tap one → land in detail → type message → see streaming reply

## Definition of done (Phase B)

A user on a real device can:
1. Open the Chat tab and see their conversation list (loaded from existing backend)
2. Pull-to-refresh
3. Tap "+" to start a new conversation, pick an assistant, get a session
4. Type a message; see it appear immediately (optimistic), then see streaming AI reply
5. Long-press any bubble to copy text (with haptic)
6. Tap the attach button → choose camera / library / document (file picked, even if upload not yet wired in B.6)
7. Tap the mic button → dictate a message (transcript appears in input)
8. Background and reopen — draft is preserved per conversation
9. Existing web users continue to use `/dashboard/chat` with no behavior change

## What's next (Plan 2b, 2c, 3)

- **Plan 2b — Phase C (Agents + Knowledge + Ops)**: assistant detail/edit screens, digital-employee monitor, files/media/groups/marketplace, audit log, organization
- **Plan 3 — Phase D + E (Polish + Ship)**: push notification triggers wired into chat/runtime/audit/org services, deep links, animation polish, full Maestro E2E suite, Sentry source maps, App Store + Play Store submission
