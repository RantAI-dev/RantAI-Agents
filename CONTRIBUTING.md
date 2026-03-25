Contributing to RantAI Agents

Welcome to the team! We are thrilled to have you contributing to RantAI Agents.

We are building a modern, full-stack platform using Next.js 16, React 19, TypeScript, Bun, Tailwind CSS, and shadcn/ui. Because our application serves both human users (via the frontend) and AI Agents (via the API), discipline, strict data contracts, and context are our highest priorities. AI agents will inevitably hallucinate JSON payloads or perform unpredictable loops; our codebase must be resilient to this.

Please read this guide carefully to understand our architecture, code style, and commenting expectations before opening a Pull Request.

🏗️ 1. Global Architecture: Features over Layers

We organize our codebase by Features (Vertical Slicing), not by technical layers (e.g., we do not use massive global components/ or utils/ folders).

Next.js's folder-based routing in the src/app/ directory is strictly for Routing and HTTP Delivery. The actual business logic, database queries, validation schemas, and UI components live safely isolated in src/features/.

The File Structure

src/
├── app/                        
│   ├── (dashboard)/            # 1. FRONTEND ROUTING
│   │   └── agents/
│   │       └── page.tsx        # Thin wrapper: Imports <AgentDashboard />
│   │
│   └── api/                    # 2. BACKEND ROUTING (The HTTP Shell)
│       └── v1/
│           └── agents/
│               └── route.ts    # Next.js Route Handlers (GET, POST)
│
├── features/                   # 3. VERTICAL SLICES (The Brains, DB, & UI)
│   └── agents/
│       ├── components/         # UI specific to this feature (e.g., <AgentConfigForm />)
│       ├── actions.ts          # Server Actions (Next.js frontend mutations)
│       ├── schema.ts           # Zod schemas (The universal data contract)
│       ├── service.ts          # Pure business logic (Framework agnostic)
│       ├── repository.ts       # Database access layer (Drizzle/Prisma queries)
│       └── service.test.ts     # Bun unit tests
│
├── lib/                        # 4. GLOBAL SHARED INFRASTRUCTURE
│   └── db.ts                   # Global database connection pool
│
└── components/                 # 5. GLOBAL UI ONLY
    └── ui/                     # shadcn/ui primitives (Button, Input, Card)


🛡️ 2. The Golden Rules (Backend)

Rule #1: API Routes are "Thin" (Parse, Don't Validate)

Because our API routes (src/app/api/...) are consumed by unpredictable AI agents, they must strictly enforce data contracts. A route.ts file should never contain business logic or database queries.

Its only jobs are:

Extract the request payload.

Parse it strictly using Zod (schema.ts).

Pass the valid data to service.ts and return the HTTP response.

Rule #2: Protect the Core (Service vs. Repository)

We separate what we want to do (Business Logic) from how data is stored (Database Queries).

service.ts (The Brain): Must never import NextResponse, Request, or next/headers. It should contain pure TS functions that orchestrate business rules and return structured results or errors.

repository.ts (The Port): Contains the actual SQL/Drizzle queries specifically for this feature. It imports the global DB connection from src/lib/db.ts.

💻 3. Frontend SOTA: React 19 & Next.js 16

In modern Next.js 16, relying on useEffect() for data fetching or mutations is an anti-pattern. We leverage React Server Components (RSCs) and React 19 hooks to eliminate race conditions and client-side waterfalls.

Rule #1: Data Fetching via Async Server Components

Do not initialize empty states and fetch data on the client side. Fetch data directly inside an async RSC.
Note: In Next.js 16, params and searchParams are strictly asynchronous and must be awaited.

import { Suspense } from 'react';
import { getAgentService } from '@/features/agents/service';
import { AgentCard } from '@/features/agents/components/agent-card';

export default async function AgentProfilePage({ 
  params 
}: { 
  params: Promise<{ id: string }> 
}) {
  // 1. Await params (Required in Next.js 16)
  const { id } = await params;
  
  // 2. Fetch directly—no useEffect needed
  const agent = await getAgentService(id);

  return (
    <Suspense fallback={<p>Loading agent data...</p>}>
      <AgentCard agent={agent.data} />
    </Suspense>
  );
}


Rule #2: Form Mutations via useActionState

The old way of handling forms involved messy useState (for loading/errors) and useEffect. We use Server Actions combined with useActionState for automatic pending states and standardized responses.

'use client';

import { useActionState } from 'react';
import { updateAgentAction } from '@/features/agents/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const initialState = { success: false, message: '' };

export function UpdateAgentForm() {
  // Automatically handles pending states and binds to our Server Action
  const [state, formAction, isPending] = useActionState(updateAgentAction, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <Input type="text" name="name" required placeholder="Agent Name" />
      
      <Button type="submit" disabled={isPending}>
        {isPending ? 'Updating...' : 'Update Agent'}
      </Button>
      
      {state.message && <p className="text-sm text-red-500">{state.message}</p>}
    </form>
  );
}


Rule #3: Client-Side Promise Resolution (use())

If you must pass data to a Client Component before it has finished resolving on the server, pass a Promise as a prop and unwrap it using React 19's use() hook.

'use client';

import { use } from 'react';
import type { Agent } from '@/features/agents/schema';

export function AgentLiveStatus({ agentPromise }: { agentPromise: Promise<Agent> }) {
  // `use()` unwraps the promise and triggers the nearest <Suspense> boundary
  const agent = use(agentPromise);
  
  return <div>Status: {agent.isOnline ? 'Active' : 'Offline'}</div>;
}

### Frontend compliance guardrail

`bun run check:frontend-compliance` enforces the thin-route contract in two phases:

- Strict scopes fail when they introduce mount-time data fetching or mutations in `useEffect` / `useLayoutEffect`.
- Report-only scopes still print warnings while their client-side migration is in flight.

The compliant frontend patterns are:

- Fetch initial data in async Server Components.
- Keep `page.tsx` files thin: re-export the feature slice or redirect.
- Use Server Actions and `useActionState` for mutations.
- Keep client components focused on local UI state, interactions, and rendering.
- Avoid mount-time data fetching in client effects once a scope has moved to strict mode.

Migration status map:

| Scope status | Scopes |
|--------------|--------|
| Strict | credentials, embed-keys, marketplace, mcp, memory, platform-features, statistics, tools, organizations, user, audit, digital-employees, workflows, knowledge, conversations-agent, conversations-chat |
| Report-only | none |


🎨 4. Code Style & Conventions

Consistency makes the codebase readable. We enforce strict styling rules.

TypeScript Strictness:

Never use any. If you truly do not know a type, use unknown and narrow it down via Zod or type guards.

Avoid non-null assertions (!).

Exports:

Use Default Exports only for Next.js mandatory files (page.tsx, layout.tsx).

Use Named Exports for everything else (export const fetchAgent = ...).

UI Components:

Use standard shadcn/ui primitives from src/components/ui/ instead of writing raw HTML elements with Tailwind classes (e.g., use <Button> instead of <button className="...">).

💬 5. Code Commenting & Explanation

Code tells you what is happening. Comments should tell you why it is happening. Do not narrate your code.

❌ Bad Commenting (Narrating the "What")

// Check if the agent ID exists
if (!agentId) {
  // Return an error
  return { error: "Missing ID" };
}
// Call the LLM
const response = await llm.generate(prompt);


✅ Good Commenting (Explaining the "Why")

// AI Agents often hallucinate their own IDs when chaining tools. 
// If the ID is missing or malformed, we immediately abort rather than 
// falling back to the default system agent to prevent prompt injection.
if (!agentId || !isValidUUID(agentId)) {
  return { error: "Missing or malformed Agent ID" };
}

// Temperature is hardcoded to 0.2 here. Higher temperatures cause 
// the JSON output parser to fail ~15% of the time during multi-step reasoning.
const response = await llm.generate(prompt, { temperature: 0.2 });


JSDoc for Services

For core business logic inside service.ts, use JSDoc comments to clearly define the inputs, outputs, and potential failure states. This powers our IDE intellisense.

/**
 * Provisions a new RantAI Agent in the database and initializes its vector store.
 * @param {CreateAgentInput} input - The validated configuration payload.
 * @returns {Promise<Result<Agent>>} The created agent or a domain-specific error.
 * @throws Will never throw an unhandled exception. Always returns a Result object.
 */
export async function provisionAgent(input: CreateAgentInput) { ... }


🧪 6. Testing with Bun

We rely on Bun for our runtime and its native, blazing-fast test runner. You do not need Jest.

Where: Unit tests live directly next to the files they test (e.g., service.test.ts next to service.ts).

Rule: Test the pure service.ts logic. Do not try to spin up a Next.js server to test route.ts handlers in unit tests. Mock the repository.ts calls when testing the service.

Command: Run bun test locally before committing.

✅ 7. Pre-PR Checklist

Before assigning a reviewer, please confirm the following:

[ ] My Next.js app/ routes are "thin" and contain zero business logic.

[ ] My business logic is inside service.ts, and database queries are isolated in repository.ts.

[ ] All incoming API payloads and Server Action inputs are strictly validated using zod.

[ ] I am not using useEffect for data fetching or form submissions.

[ ] I have used React 19's useActionState and Server Components where appropriate.

[ ] My code contains no any types or eslint-disable comments without explicit justification.

[ ] My comments explain why decisions were made, particularly around AI/LLM quirks.

[ ] I have written bun test unit tests for any new business logic inside src/features/.

[ ] I used standard shadcn/ui primitives for my interfaces.
