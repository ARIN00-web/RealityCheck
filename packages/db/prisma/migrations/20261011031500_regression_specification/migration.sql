ALTER TABLE "RegressionTest" ADD COLUMN "specification" JSONB;
ALTER TABLE "RegressionTest" ADD COLUMN "specificationVersion" INTEGER NOT NULL DEFAULT 1;

UPDATE "RegressionTest" SET "specification" = '{}'::jsonb WHERE "specification" IS NULL;
ALTER TABLE "RegressionTest" ALTER COLUMN "specification" SET NOT NULL;

CREATE UNIQUE INDEX "RegressionTest_findingId_specificationVersion_key"
  ON "RegressionTest"("findingId", "specificationVersion");
