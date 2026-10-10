-- AlterEnum
ALTER TYPE "RegressionExecutionStatus" ADD VALUE IF NOT EXISTS 'QUEUED';

-- AlterTable
ALTER TABLE "RegressionExecution"
  ADD COLUMN "attemptNumber" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "assertions" JSONB,
  ADD COLUMN "failureReason" TEXT,
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ALTER COLUMN "startedAt" DROP NOT NULL,
  ALTER COLUMN "startedAt" DROP DEFAULT;

-- CreateIndex
CREATE UNIQUE INDEX "RegressionExecution_regressionTestId_attemptNumber_key"
  ON "RegressionExecution"("regressionTestId", "attemptNumber");

-- CreateIndex
CREATE UNIQUE INDEX "RegressionExecution_active_key"
  ON "RegressionExecution"("regressionTestId")
  WHERE "status" IN ('QUEUED', 'RUNNING');
