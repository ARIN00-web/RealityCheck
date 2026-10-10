-- CreateEnum
CREATE TYPE "RunStatus" AS ENUM ('QUEUED', 'RUNNING', 'CANCEL_REQUESTED', 'CANCELED', 'SUCCEEDED', 'FAILED');

-- CreateEnum
CREATE TYPE "JourneyStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "ActionStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "FindingStatus" AS ENUM ('CANDIDATE', 'VERIFYING', 'VERIFIED', 'INCONCLUSIVE', 'RESOLVED');

-- CreateEnum
CREATE TYPE "EvidenceKind" AS ENUM ('SCREENSHOT', 'TRACE', 'CONSOLE', 'NETWORK', 'DOM_SNAPSHOT', 'ACTION_LOG');

-- CreateEnum
CREATE TYPE "ArtifactKind" AS ENUM ('GENERATED_TEST', 'REPORT', 'OTHER');

-- CreateEnum
CREATE TYPE "RegressionExecutionStatus" AS ENUM ('RUNNING', 'PASSED', 'FAILED', 'ERROR');

-- CreateTable
CREATE TABLE "Target" (
    "id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Target_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Run" (
    "id" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "status" "RunStatus" NOT NULL DEFAULT 'QUEUED',
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Run_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RunEvent" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "data" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RunEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Journey" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "status" "JourneyStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Journey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Action" (
    "id" TEXT NOT NULL,
    "journeyId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "target" TEXT,
    "status" "ActionStatus" NOT NULL DEFAULT 'PENDING',
    "detail" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Action_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Finding" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "journeyId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "FindingStatus" NOT NULL DEFAULT 'CANDIDATE',
    "fingerprint" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Finding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Evidence" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "findingId" TEXT,
    "kind" "EvidenceKind" NOT NULL,
    "storageKey" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Artifact" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "findingId" TEXT,
    "kind" "ArtifactKind" NOT NULL,
    "storageKey" TEXT NOT NULL,
    "contentType" TEXT,
    "byteSize" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Artifact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RegressionTest" (
    "id" TEXT NOT NULL,
    "findingId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sourceArtifactId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RegressionTest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RegressionExecution" (
    "id" TEXT NOT NULL,
    "regressionTestId" TEXT NOT NULL,
    "status" "RegressionExecutionStatus" NOT NULL DEFAULT 'RUNNING',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "message" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RegressionExecution_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Target_url_idx" ON "Target"("url");

-- CreateIndex
CREATE INDEX "Run_targetId_createdAt_idx" ON "Run"("targetId", "createdAt");

-- CreateIndex
CREATE INDEX "Run_status_createdAt_idx" ON "Run"("status", "createdAt");

-- CreateIndex
CREATE INDEX "RunEvent_runId_createdAt_idx" ON "RunEvent"("runId", "createdAt");

-- CreateIndex
CREATE INDEX "Journey_runId_status_idx" ON "Journey"("runId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Journey_runId_position_key" ON "Journey"("runId", "position");

-- CreateIndex
CREATE INDEX "Action_journeyId_status_idx" ON "Action"("journeyId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Action_journeyId_position_key" ON "Action"("journeyId", "position");

-- CreateIndex
CREATE INDEX "Finding_runId_status_idx" ON "Finding"("runId", "status");

-- CreateIndex
CREATE INDEX "Finding_fingerprint_idx" ON "Finding"("fingerprint");

-- CreateIndex
CREATE INDEX "Evidence_runId_kind_idx" ON "Evidence"("runId", "kind");

-- CreateIndex
CREATE INDEX "Evidence_findingId_idx" ON "Evidence"("findingId");

-- CreateIndex
CREATE INDEX "Artifact_runId_kind_idx" ON "Artifact"("runId", "kind");

-- CreateIndex
CREATE INDEX "Artifact_findingId_idx" ON "Artifact"("findingId");

-- CreateIndex
CREATE UNIQUE INDEX "RegressionTest_sourceArtifactId_key" ON "RegressionTest"("sourceArtifactId");

-- CreateIndex
CREATE INDEX "RegressionTest_findingId_createdAt_idx" ON "RegressionTest"("findingId", "createdAt");

-- CreateIndex
CREATE INDEX "RegressionExecution_regressionTestId_createdAt_idx" ON "RegressionExecution"("regressionTestId", "createdAt");

-- CreateIndex
CREATE INDEX "RegressionExecution_status_createdAt_idx" ON "RegressionExecution"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "Run" ADD CONSTRAINT "Run_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "Target"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RunEvent" ADD CONSTRAINT "RunEvent_runId_fkey" FOREIGN KEY ("runId") REFERENCES "Run"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Journey" ADD CONSTRAINT "Journey_runId_fkey" FOREIGN KEY ("runId") REFERENCES "Run"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Action" ADD CONSTRAINT "Action_journeyId_fkey" FOREIGN KEY ("journeyId") REFERENCES "Journey"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Finding" ADD CONSTRAINT "Finding_runId_fkey" FOREIGN KEY ("runId") REFERENCES "Run"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Finding" ADD CONSTRAINT "Finding_journeyId_fkey" FOREIGN KEY ("journeyId") REFERENCES "Journey"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evidence" ADD CONSTRAINT "Evidence_runId_fkey" FOREIGN KEY ("runId") REFERENCES "Run"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evidence" ADD CONSTRAINT "Evidence_findingId_fkey" FOREIGN KEY ("findingId") REFERENCES "Finding"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Artifact" ADD CONSTRAINT "Artifact_runId_fkey" FOREIGN KEY ("runId") REFERENCES "Run"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Artifact" ADD CONSTRAINT "Artifact_findingId_fkey" FOREIGN KEY ("findingId") REFERENCES "Finding"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegressionTest" ADD CONSTRAINT "RegressionTest_findingId_fkey" FOREIGN KEY ("findingId") REFERENCES "Finding"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegressionTest" ADD CONSTRAINT "RegressionTest_sourceArtifactId_fkey" FOREIGN KEY ("sourceArtifactId") REFERENCES "Artifact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegressionExecution" ADD CONSTRAINT "RegressionExecution_regressionTestId_fkey" FOREIGN KEY ("regressionTestId") REFERENCES "RegressionTest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
