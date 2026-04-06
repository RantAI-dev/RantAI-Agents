declare module "@rantai/community-skills" {
  import type {
    CommunityToolDefinition,
    CommunitySkillDefinition,
  } from "@/lib/skill-sdk"

  export const tools: Record<string, CommunityToolDefinition>
  export const skills: Record<string, CommunitySkillDefinition>
}
