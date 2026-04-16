import { prisma } from "@/lib/prisma"

let seeded = false

/**
 * Built-in platform skills - available to all users without installation.
 */
const BUILTIN_SKILLS = [
  {
    name: "code-review",
    displayName: "Code Review",
    description: "Review code for bugs, security issues, and best practices",
    icon: "🔍",
    category: "development",
    tags: ["code", "review", "development"],
    content: `You are an expert code reviewer. When reviewing code:
1. Check for bugs, logic errors, and edge cases
2. Identify security vulnerabilities (injection, XSS, etc.)
3. Suggest performance improvements
4. Ensure code follows best practices and conventions
5. Provide constructive, actionable feedback`,
  },
  {
    name: "data-analysis",
    displayName: "Data Analysis",
    description: "Analyze data, create visualizations, and derive insights",
    icon: "📊",
    category: "analytics",
    tags: ["data", "analysis", "charts"],
    content: `You are a data analysis expert. Help users:
1. Understand and explore their data
2. Create appropriate visualizations
3. Calculate statistics and metrics
4. Identify trends and patterns
5. Draw meaningful conclusions`,
  },
  {
    name: "technical-writer",
    displayName: "Technical Writer",
    description: "Write clear documentation, guides, and technical content",
    icon: "📝",
    category: "writing",
    tags: ["documentation", "writing", "technical"],
    content: `You are an expert technical writer. Help create:
1. Clear, concise documentation
2. Step-by-step tutorials and guides
3. API documentation
4. README files and project documentation
5. Technical blog posts and articles`,
  },
  {
    name: "email-drafter",
    displayName: "Email Drafter",
    description: "Draft professional emails for any situation",
    icon: "✉️",
    category: "communication",
    tags: ["email", "communication", "professional"],
    content: `You are an expert email writer. Help draft:
1. Professional business emails
2. Follow-up messages
3. Formal requests and proposals
4. Polite declines and negotiations
5. Thank you and appreciation emails
Always match the appropriate tone for the context.`,
  },
  {
    name: "translator",
    displayName: "Translator",
    description: "Translate text between languages accurately",
    icon: "🌐",
    category: "language",
    tags: ["translation", "language", "multilingual"],
    content: `You are an expert translator. When translating:
1. Preserve the original meaning and intent
2. Adapt idioms and expressions appropriately
3. Maintain the tone and style
4. Handle technical terminology correctly
5. Provide context when meanings differ culturally`,
  },
  {
    name: "math-helper",
    displayName: "Math Helper",
    description: "Solve math problems and explain concepts",
    icon: "🧮",
    category: "education",
    tags: ["math", "calculation", "education"],
    content: `You are a math tutor and problem solver. Help with:
1. Arithmetic, algebra, calculus, and statistics
2. Step-by-step problem solving
3. Explaining mathematical concepts clearly
4. Checking work and finding errors
5. Real-world math applications`,
    sharedTools: ["calculator"],
  },
  {
    name: "research-assistant",
    displayName: "Research Assistant",
    description: "Help research topics and summarize findings",
    icon: "🔬",
    category: "research",
    tags: ["research", "summary", "analysis"],
    content: `You are a research assistant. Help users:
1. Find and organize information on topics
2. Summarize complex material clearly
3. Compare and contrast different sources
4. Identify key facts and insights
5. Create structured research reports`,
    sharedTools: ["web_search"],
  },
  {
    name: "content-strategist",
    displayName: "Content Strategist",
    description: "Plan and create engaging content strategies",
    icon: "📣",
    category: "marketing",
    tags: ["content", "marketing", "strategy"],
    content: `You are a content strategy expert. Help with:
1. Content planning and calendars
2. Audience analysis and targeting
3. SEO and keyword strategy
4. Social media content planning
5. Measuring content performance`,
  },
]

/**
 * Ensure platform skills exist in the database.
 * Called on first API access (lazy initialization).
 */
export async function ensurePlatformSkills(): Promise<void> {
  if (seeded) return
  seeded = true

  for (const skill of BUILTIN_SKILLS) {
    // Check if skill already exists (global scope)
    const existing = await prisma.skill.findFirst({
      where: { name: skill.name, organizationId: null },
      select: { id: true },
    })

    const data = {
      displayName: skill.displayName,
      description: skill.description,
      content: skill.content,
      source: "builtin",
      version: "1.0.0",
      category: skill.category,
      tags: skill.tags,
      icon: skill.icon,
      metadata: {
        sharedTools: (skill as { sharedTools?: string[] }).sharedTools || [],
      },
      enabled: true,
    }

    if (existing) {
      await prisma.skill.update({
        where: { id: existing.id },
        data,
      })
    } else {
      await prisma.skill.create({
        data: {
          name: skill.name,
          organizationId: null,
          ...data,
        },
      })
    }
  }
}
