import type { DocumentAst } from "@/lib/document-ast/schema"

/**
 * Golden fixture: Infrastructure Migration Proposal
 * Vendor: NQ Technology  →  Client: PT Contoh
 * Document number: PROP/NQT/2026/001  |  Date: 2026-04-23
 *
 * Used as:
 *   1. Prompt example for the LLM document generator
 *   2. CI test input for the exporter and renderer
 */
export const proposalExample: DocumentAst = {
  // ──────────────────────────────────────────────
  // Meta
  // ──────────────────────────────────────────────
  meta: {
    title: "Infrastructure Migration Proposal",
    subtitle: "Java Monolith to NQRust-HV — Phased Modernisation",
    author: "NQ Technology Solutions",
    organization: "NQ Technology",
    documentNumber: "PROP/NQT/2026/001",
    date: "2026-04-23",
    pageSize: "letter",
    showPageNumbers: true,
    font: "Arial",
    fontSize: 12,
  },

  // ──────────────────────────────────────────────
  // Cover page
  // ──────────────────────────────────────────────
  coverPage: {
    title: "Infrastructure Migration Proposal",
    subtitle: "Java Monolith to NQRust-HV — Phased Modernisation",
    author: "NQ Technology Solutions",
    date: "2026-04-23",
    organization: "NQ Technology",
    logoUrl: "unsplash:company logo",
  },

  // ──────────────────────────────────────────────
  // Header (appears on every page)
  // ──────────────────────────────────────────────
  header: {
    children: [
      {
        type: "paragraph",
        children: [
          { type: "text", text: "NQ Technology", bold: true },
          { type: "tab", leader: "none" },
          { type: "text", text: "Confidential", italic: true },
        ],
      },
    ],
  },

  // ──────────────────────────────────────────────
  // Footer (appears on every page)
  // ──────────────────────────────────────────────
  footer: {
    children: [
      {
        type: "paragraph",
        align: "center",
        children: [
          { type: "text", text: "Page " },
          { type: "pageNumber" },
          { type: "text", text: " of — PROP/NQT/2026/001" },
        ],
      },
    ],
  },

  // ──────────────────────────────────────────────
  // Body
  // ──────────────────────────────────────────────
  body: [
    // ─── Document title heading ───
    {
      type: "heading",
      level: 1,
      children: [{ type: "text", text: "Infrastructure Migration Proposal" }],
    },

    // ─── Table of contents ───
    {
      type: "toc",
      maxLevel: 2,
      title: "Contents",
    },

    // ─── Executive Summary ───
    {
      type: "heading",
      level: 2,
      bookmarkId: "exec-summary",
      children: [{ type: "text", text: "Executive Summary" }],
    },
    {
      type: "paragraph",
      align: "justify",
      children: [
        {
          type: "text",
          text: "PT Contoh currently operates a Java-based monolithic application that has served its core banking operations since 2014. Twelve years of accumulated business logic, coupled with a single-threaded request model and an aging Oracle RAC cluster, have resulted in sustained p95 API latencies exceeding 400 ms during peak hours and an average of 3.2 unplanned outages per quarter. This proposal details NQ Technology's engagement to migrate PT Contoh's workload to the NQRust-HV platform — a high-velocity, memory-safe runtime built on Tokio and compiled to native binaries — targeting a p95 latency below 120 ms and zero-downtime blue-green deployments by Q4 2026.",
        },
      ],
    },
    {
      type: "paragraph",
      align: "justify",
      children: [
        {
          type: "text",
          text: "The migration will be executed in three bounded phases: (1) decomposition of the monolith into domain-aligned service boundaries with dual-write compatibility, (2) incremental traffic shifting via an Envoy-based service mesh, and (3) decommissioning of the legacy Oracle RAC nodes once PostgreSQL streaming replicas are verified stable for 60 consecutive days. NQ Technology commits to a maximum concurrent downtime of 30 seconds per service boundary during the cutover windows, with full rollback automation in place for each phase. The total engagement is estimated at 14 weeks and USD 380,000, inclusive of post-migration hypercare through to 2026-12-31.",
        },
      ],
    },

    // ─── Current State Analysis ───
    {
      type: "heading",
      level: 2,
      bookmarkId: "current-state",
      children: [{ type: "text", text: "Current State Analysis" }],
    },
    {
      type: "paragraph",
      align: "justify",
      children: [
        {
          type: "text",
          text: "The existing system comprises approximately 680,000 lines of Java (Spring Boot 2.7, JDK 11) deployed across four bare-metal servers in PT Contoh's Jakarta data centre. Session state is stored in a shared Redis 6 cluster that operates without persistence, meaning any Redis failure results in forced re-authentication for all active users. A dedicated load-balancing layer (HAProxy 2.4) routes HTTP/1.1 traffic, with no HTTP/2 or gRPC support for internal service communication. The following pain points have been identified through a two-week observability engagement conducted in March 2026:",
        },
      ],
    },
    {
      type: "list",
      ordered: false,
      items: [
        {
          children: [
            {
              type: "paragraph",
              children: [
                {
                  type: "text",
                  text: "Latency degradation: p95 API response time reaches 420 ms under a sustained load of 800 concurrent users, primarily caused by synchronous database calls blocking the Spring thread pool.",
                },
              ],
            },
          ],
        },
        {
          children: [
            {
              type: "paragraph",
              children: [
                {
                  type: "text",
                  text: "Memory pressure: the JVM heap is configured at 28 GB per node; full GC pauses of 1.8–3.4 seconds occur 4–6 times per day, causing request timeouts visible to end users.",
                },
              ],
            },
          ],
        },
        {
          children: [
            {
              type: "paragraph",
              children: [
                {
                  type: "text",
                  text: "Deployment risk: the absence of feature flags or canary deployment mechanisms means that each release requires a full maintenance window of 45–90 minutes, constraining the team to at most two production deploys per month.",
                },
              ],
            },
          ],
        },
        {
          children: [
            {
              type: "paragraph",
              children: [
                {
                  type: "text",
                  text: "Observability gaps: distributed tracing is not instrumented; incident root-cause analysis depends on manual log correlation across four servers, extending mean time to resolution (MTTR) to an average of 2.7 hours.",
                },
              ],
            },
          ],
        },
      ],
    },

    // ─── Proposed Solution ───
    {
      type: "heading",
      level: 2,
      bookmarkId: "proposed",
      children: [{ type: "text", text: "Proposed Solution" }],
    },
    {
      type: "paragraph",
      align: "justify",
      children: [
        {
          type: "text",
          text: "NQRust-HV replaces the JVM runtime with statically compiled Rust services, each exposing both gRPC (internal) and REST/HTTP2 (external) interfaces. The platform ships with built-in OpenTelemetry instrumentation, Prometheus metrics endpoints, and a zero-copy message broker (NQ-Nexus) for event-driven workflows. The comparison below benchmarks the current stack against the NQRust-HV target configuration on equivalent AWS c6i.4xlarge instances.",
        },
      ],
    },
    {
      type: "table",
      columnWidths: [3120, 3120, 3120],
      width: 9360,
      rows: [
        {
          isHeader: true,
          cells: [
            {
              shading: "E0F2FE",
              align: "center",
              children: [
                { type: "paragraph", children: [{ type: "text", text: "Feature", bold: true }] },
              ],
            },
            {
              shading: "E0F2FE",
              align: "center",
              children: [
                { type: "paragraph", children: [{ type: "text", text: "Current (Java / Spring)", bold: true }] },
              ],
            },
            {
              shading: "E0F2FE",
              align: "center",
              children: [
                { type: "paragraph", children: [{ type: "text", text: "Proposed (NQRust-HV)", bold: true }] },
              ],
            },
          ],
        },
        {
          cells: [
            {
              children: [{ type: "paragraph", children: [{ type: "text", text: "p95 API latency" }] }],
            },
            {
              align: "right",
              children: [{ type: "paragraph", children: [{ type: "text", text: "420 ms" }] }],
            },
            {
              align: "right",
              children: [{ type: "paragraph", children: [{ type: "text", text: "110 ms" }] }],
            },
          ],
        },
        {
          cells: [
            {
              children: [{ type: "paragraph", children: [{ type: "text", text: "Memory footprint per node" }] }],
            },
            {
              align: "right",
              children: [{ type: "paragraph", children: [{ type: "text", text: "28 GB JVM heap" }] }],
            },
            {
              align: "right",
              children: [{ type: "paragraph", children: [{ type: "text", text: "3.2 GB RSS" }] }],
            },
          ],
        },
        {
          cells: [
            {
              children: [{ type: "paragraph", children: [{ type: "text", text: "Deploy window" }] }],
            },
            {
              align: "right",
              children: [{ type: "paragraph", children: [{ type: "text", text: "45–90 min downtime" }] }],
            },
            {
              align: "right",
              children: [{ type: "paragraph", children: [{ type: "text", text: "< 30 s blue-green" }] }],
            },
          ],
        },
        {
          cells: [
            {
              children: [{ type: "paragraph", children: [{ type: "text", text: "Distributed tracing" }] }],
            },
            {
              children: [{ type: "paragraph", children: [{ type: "text", text: "None (manual log correlation)" }] }],
            },
            {
              children: [{ type: "paragraph", children: [{ type: "text", text: "OpenTelemetry (OTLP/gRPC)" }] }],
            },
          ],
        },
      ],
    },

    // ─── Timeline and Cost ───
    {
      type: "heading",
      level: 2,
      bookmarkId: "timeline",
      children: [{ type: "text", text: "Timeline and Cost" }],
    },
    {
      type: "paragraph",
      align: "justify",
      children: [
        {
          type: "text",
          text: "The engagement spans 14 calendar weeks starting 2026-05-12, with each phase gated by a signed acceptance milestone before the next phase begins. The total fixed-price fee is USD 380,000, payable in four tranches tied to milestone acceptance. Infrastructure costs (AWS, managed PostgreSQL, Envoy Gateway licences) are billed to PT Contoh directly and are estimated at USD 8,400 per month post-migration. The three phases are outlined below:",
        },
      ],
    },
    {
      type: "list",
      ordered: true,
      startAt: 1,
      items: [
        {
          children: [
            {
              type: "paragraph",
              children: [
                {
                  type: "text",
                  text: "Phase 1 — Service Decomposition (Weeks 1–5): Identify domain boundaries within the Java monolith using static analysis and runtime dependency tracing. Produce NQRust-HV service skeletons with dual-write adapters to keep the Oracle RAC and PostgreSQL stores in sync throughout the transition. Deliverable: five independently deployable Rust services passing integration test suites with ≥ 95% branch coverage.",
                  bold: false,
                },
              ],
            },
          ],
        },
        {
          children: [
            {
              type: "paragraph",
              children: [
                {
                  type: "text",
                  text: "Phase 2 — Traffic Migration (Weeks 6–10): Shift production traffic incrementally via weighted Envoy routes, beginning at 5% and advancing in 20-percentage-point increments once each checkpoint passes a 72-hour soak with error rates below 0.1%.",
                },
              ],
            },
          ],
          subList: {
            ordered: true,
            items: [
              {
                children: [
                  {
                    type: "paragraph",
                    children: [
                      {
                        type: "text",
                        text: "Checkpoint 2a (Week 7): 25% traffic on NQRust-HV; Oracle RAC remains primary for writes. Automated rollback triggers if p99 latency exceeds 250 ms over any 15-minute window.",
                      },
                    ],
                  },
                ],
              },
              {
                children: [
                  {
                    type: "paragraph",
                    children: [
                      {
                        type: "text",
                        text: "Checkpoint 2b (Week 10): 100% traffic on NQRust-HV; PostgreSQL promoted to primary; Oracle RAC demoted to read-only standby pending 60-day verification window.",
                      },
                    ],
                  },
                ],
              },
            ],
          },
        },
        {
          children: [
            {
              type: "paragraph",
              children: [
                {
                  type: "text",
                  text: "Phase 3 — Legacy Decommission and Hypercare (Weeks 11–14): Decommission Oracle RAC nodes after 60-day PostgreSQL stability window. Transfer operational runbooks to PT Contoh's SRE team. Hypercare support (P1 response < 1 hour, P2 response < 4 hours) active through 2026-12-31.",
                },
              ],
            },
          ],
        },
      ],
    },

    // ─── Risk Analysis ───
    {
      type: "heading",
      level: 2,
      bookmarkId: "risk-analysis",
      children: [{ type: "text", text: "Risk Analysis" }],
    },
    {
      type: "paragraph",
      align: "justify",
      children: [
        {
          type: "text",
          text: "Three primary risks have been identified and scored using a 5×5 probability-impact matrix",
        },
        {
          type: "footnote",
          children: [
            {
              type: "paragraph",
              children: [
                {
                  type: "text",
                  text: "Risk scores are computed as Probability (1–5) × Impact (1–5). Scores ≥ 15 are classified High and require a documented mitigation plan approved by both parties before the phase begins; scores 8–14 are Medium; scores ≤ 7 are Low.",
                },
              ],
            },
          ],
        },
        {
          type: "text",
          text: ". The highest-rated risk (score 16) is data-consistency drift between Oracle RAC and PostgreSQL during the dual-write window; this is mitigated by a reconciliation job that runs every 5 minutes and pages on-call if row checksums diverge by more than 0.002%. The second risk (score 12) is schema incompatibility discovered late in Phase 1 due to undocumented stored-procedure side effects; mitigation is a mandatory stored-procedure audit completed in Week 1. The third risk (score 9) is skill-transfer delay if PT Contoh's internal SRE team does not complete the NQRust-HV operator certification by Week 10; mitigation is a scheduled online cohort starting Week 4 with NQ Technology covering course fees.",
        },
      ],
    },

    // ─── Indicative topology image ───
    {
      type: "image",
      src: "unsplash:data center servers",
      alt: "Indicative server topology",
      width: 600,
      height: 300,
      caption: "Figure 1. Reference NQRust-HV topology.",
      align: "center",
    },

    // ─── Client testimonial blockquote ───
    {
      type: "blockquote",
      attribution: "Budi Santoso, CTO PT Mitra Global (post-migration, 2025)",
      children: [
        {
          type: "paragraph",
          children: [
            {
              type: "text",
              text: "Within six weeks of go-live our on-call burden dropped by 70%. The NQRust-HV platform handles our Black Friday traffic spikes without a single GC pause — something we spent three years trying to fix in the JVM.",
              italic: true,
            },
          ],
        },
      ],
    },

    // ─── Page break before closing section ───
    {
      type: "pageBreak",
    },

    // ─── Next Steps ───
    {
      type: "heading",
      level: 2,
      bookmarkId: "next",
      children: [{ type: "text", text: "Next Steps" }],
    },
    {
      type: "paragraph",
      align: "justify",
      children: [
        {
          type: "text",
          text: "To proceed, PT Contoh's technical leadership should schedule a kick-off workshop with NQ Technology no later than 2026-05-05 to confirm the Week 1 start date and finalise the AWS account access credentials required for the observability instrumentation. A signed Statement of Work based on this proposal will be issued within two business days of verbal acceptance. For context on the business outcomes underpinning this engagement, please ",
        },
        {
          type: "anchor",
          bookmarkId: "exec-summary",
          children: [
            { type: "text", text: "return to the executive summary" },
          ],
        },
        {
          type: "text",
          text: ".",
        },
      ],
    },
  ],
}
