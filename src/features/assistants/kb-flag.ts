/**
 * Whether the assistant builder shows the knowledge base.
 *
 * Knowledge-base retrieval is off for every agent in this phase (design §3.6): the capability gate
 * answers 409 and the builder hides the section and its toggles. The flag is a Next public
 * variable so the answer is the same on the server render and in the client bundle;
 * `NEXT_PUBLIC_AGENT_KB_ENABLED=true` brings the section back once the capability returns.
 */
export function isAgentKbEnabled(): boolean {
  return process.env.NEXT_PUBLIC_AGENT_KB_ENABLED === "true"
}
