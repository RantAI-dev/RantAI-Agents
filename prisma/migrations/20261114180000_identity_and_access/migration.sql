-- Identity and access, slice S1 (docs/design/identity-and-access.md §3).
--
-- Org units (departments and teams, nested), unit membership, per-assistant grants, chat
-- shares, identity providers and linked identities. `User.passwordHash` becomes nullable for
-- SSO-only users, and an organisation can turn password sign-in off. Purely additive apart from
-- dropping one NOT NULL.
--
-- The parent of a unit is a composite key (organizationId, parentId), so a unit can never hang
-- under another organisation's unit. It is NO ACTION, not RESTRICT, so deleting an organisation
-- can cascade through a whole tree in one statement; deleting a unit that still has children
-- fails.

-- AlterTable
ALTER TABLE "Agent" ALTER COLUMN "passwordHash" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "passwordLoginEnabled" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "OrgUnit" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "parentId" TEXT,
    "kind" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "externalId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrgUnit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrgUnitMember" (
    "organizationId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'member',
    "source" TEXT NOT NULL DEFAULT 'manual',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrgUnitMember_pkey" PRIMARY KEY ("unitId","userId")
);

-- CreateTable
CREATE TABLE "AssistantGrant" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "assistantId" TEXT NOT NULL,
    "subjectType" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "level" TEXT NOT NULL DEFAULT 'use',
    "grantedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssistantGrant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatShare" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "subjectType" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "level" TEXT NOT NULL DEFAULT 'view',
    "sharedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "ChatShare_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IdentityProvider" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "config" JSONB NOT NULL DEFAULT '{}',
    "emailDomains" TEXT[],
    "jitProvisioning" BOOLEAN NOT NULL DEFAULT false,
    "defaultRole" TEXT NOT NULL DEFAULT 'member',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IdentityProvider_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserIdentity" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserIdentity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OrgUnit_organizationId_parentId_idx" ON "OrgUnit"("organizationId", "parentId");

-- CreateIndex
CREATE INDEX "OrgUnit_organizationId_externalId_idx" ON "OrgUnit"("organizationId", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "OrgUnit_organizationId_id_key" ON "OrgUnit"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "OrgUnit_organizationId_parentId_slug_key" ON "OrgUnit"("organizationId", "parentId", "slug");

-- CreateIndex
CREATE INDEX "OrgUnitMember_organizationId_userId_idx" ON "OrgUnitMember"("organizationId", "userId");

-- CreateIndex
CREATE INDEX "AssistantGrant_organizationId_subjectType_subjectId_idx" ON "AssistantGrant"("organizationId", "subjectType", "subjectId");

-- CreateIndex
CREATE UNIQUE INDEX "AssistantGrant_assistantId_subjectType_subjectId_key" ON "AssistantGrant"("assistantId", "subjectType", "subjectId");

-- CreateIndex
CREATE INDEX "ChatShare_organizationId_subjectType_subjectId_idx" ON "ChatShare"("organizationId", "subjectType", "subjectId");

-- CreateIndex
CREATE UNIQUE INDEX "ChatShare_sessionId_subjectType_subjectId_key" ON "ChatShare"("sessionId", "subjectType", "subjectId");

-- CreateIndex
CREATE INDEX "IdentityProvider_organizationId_idx" ON "IdentityProvider"("organizationId");

-- CreateIndex
CREATE INDEX "UserIdentity_userId_idx" ON "UserIdentity"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "UserIdentity_providerId_subject_key" ON "UserIdentity"("providerId", "subject");

-- AddForeignKey
ALTER TABLE "OrgUnit" ADD CONSTRAINT "OrgUnit_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgUnit" ADD CONSTRAINT "OrgUnit_organizationId_parentId_fkey" FOREIGN KEY ("organizationId", "parentId") REFERENCES "OrgUnit"("organizationId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgUnitMember" ADD CONSTRAINT "OrgUnitMember_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgUnitMember" ADD CONSTRAINT "OrgUnitMember_organizationId_unitId_fkey" FOREIGN KEY ("organizationId", "unitId") REFERENCES "OrgUnit"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgUnitMember" ADD CONSTRAINT "OrgUnitMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssistantGrant" ADD CONSTRAINT "AssistantGrant_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssistantGrant" ADD CONSTRAINT "AssistantGrant_assistantId_fkey" FOREIGN KEY ("assistantId") REFERENCES "Assistant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatShare" ADD CONSTRAINT "ChatShare_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatShare" ADD CONSTRAINT "ChatShare_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "DashboardSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IdentityProvider" ADD CONSTRAINT "IdentityProvider_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserIdentity" ADD CONSTRAINT "UserIdentity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserIdentity" ADD CONSTRAINT "UserIdentity_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "IdentityProvider"("id") ON DELETE CASCADE ON UPDATE CASCADE;

