-- CreateEnum
CREATE TYPE "MediaModality" AS ENUM ('IMAGE', 'AUDIO', 'VIDEO');

-- CreateEnum
CREATE TYPE "MediaJobStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED');

-- AlterTable: User (mapped to "Agent" table)
ALTER TABLE "Agent" ADD COLUMN "mediaLimitCentsPerDay" INTEGER;

-- AlterTable: LlmModel
ALTER TABLE "LlmModel" ADD COLUMN "outputModalities" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "LlmModel" ADD COLUMN "inputModalities" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "MediaJob" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "modality" "MediaModality" NOT NULL,
    "modelId" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "parameters" JSONB NOT NULL,
    "referenceAssetIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "status" "MediaJobStatus" NOT NULL DEFAULT 'PENDING',
    "providerJobId" TEXT,
    "errorMessage" TEXT,
    "estimatedCostCents" INTEGER,
    "costCents" INTEGER,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MediaJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MediaAsset" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "modality" "MediaModality" NOT NULL,
    "mimeType" TEXT NOT NULL,
    "s3Key" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "durationMs" INTEGER,
    "thumbnailS3Key" TEXT,
    "isFavorite" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MediaAsset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MediaJob_organizationId_createdAt_idx" ON "MediaJob"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "MediaJob_userId_createdAt_idx" ON "MediaJob"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "MediaJob_status_idx" ON "MediaJob"("status");

-- CreateIndex
CREATE INDEX "MediaJob_modality_idx" ON "MediaJob"("modality");

-- CreateIndex
CREATE INDEX "MediaJob_status_modality_idx" ON "MediaJob"("status", "modality");

-- CreateIndex
CREATE INDEX "MediaAsset_organizationId_createdAt_idx" ON "MediaAsset"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "MediaAsset_jobId_idx" ON "MediaAsset"("jobId");

-- CreateIndex
CREATE INDEX "MediaAsset_modality_idx" ON "MediaAsset"("modality");

-- AddForeignKey
ALTER TABLE "MediaJob" ADD CONSTRAINT "MediaJob_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaJob" ADD CONSTRAINT "MediaJob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Agent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "MediaJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
