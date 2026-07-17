-- Superadmin admin pages: user suspension, managed LLM providers, platform
-- settings KV, admin audit log. See docs/superpowers/specs/
-- 2026-07-17-superadmin-user-model-admin-design.md.

-- User (table "Agent"): platform-admin suspension + activity tracking.
-- Distinct from "status", which is live-chat presence.
ALTER TABLE "Agent" ADD COLUMN "suspendedAt" TIMESTAMP(3);
ALTER TABLE "Agent" ADD COLUMN "lastActiveAt" TIMESTAMP(3);

-- Managed chat/LLM upstream endpoints (admin UI, global per-deployment).
CREATE TABLE "LlmProvider" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "baseUrl" TEXT,
    "encryptedApiKey" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LlmProvider_pkey" PRIMARY KEY ("id")
);

-- LlmModel: link to managed provider + catalog source + admin on/off switch.
ALTER TABLE "LlmModel" ADD COLUMN "providerId" TEXT;
ALTER TABLE "LlmModel" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'openrouter_sync';
ALTER TABLE "LlmModel" ADD COLUMN "enabled" BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX "LlmModel_providerId_idx" ON "LlmModel"("providerId");

ALTER TABLE "LlmModel" ADD CONSTRAINT "LlmModel_providerId_fkey"
    FOREIGN KEY ("providerId") REFERENCES "LlmProvider"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- Deployment-wide scalar settings (DB overrides env; env stays the fallback).
CREATE TABLE "PlatformSetting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformSetting_pkey" PRIMARY KEY ("key")
);

-- Append-only audit trail for admin actions (same shape as the cloud repo's
-- AdminAuditLog so shared admin services work in both builds).
CREATE TABLE "AdminAuditLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "actorEmail" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "targetLabel" TEXT,
    "reason" TEXT NOT NULL,
    "metadata" JSONB,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminAuditLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AdminAuditLog_actorId_idx" ON "AdminAuditLog"("actorId");
CREATE INDEX "AdminAuditLog_targetId_idx" ON "AdminAuditLog"("targetId");
CREATE INDEX "AdminAuditLog_targetType_idx" ON "AdminAuditLog"("targetType");
CREATE INDEX "AdminAuditLog_action_idx" ON "AdminAuditLog"("action");
CREATE INDEX "AdminAuditLog_createdAt_idx" ON "AdminAuditLog"("createdAt");
