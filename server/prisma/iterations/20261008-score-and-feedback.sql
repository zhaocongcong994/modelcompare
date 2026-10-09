-- AlterTable
ALTER TABLE "UserFeedback" ADD COLUMN     "recommendationRunId" TEXT;

-- CreateTable
CREATE TABLE "EvaluationScoreRun" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "inputHash" TEXT NOT NULL,
    "scene" TEXT NOT NULL,
    "modelVersion" TEXT NOT NULL,
    "rubricVersion" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "inputSnapshot" JSONB NOT NULL,
    "result" JSONB,
    "budgetId" TEXT NOT NULL,
    "reservedCostUsd" DECIMAL(18,10) NOT NULL,
    "costUsd" DECIMAL(18,10),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "errorCode" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EvaluationScoreRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EvaluationScoreRun_status_createdAt_idx" ON "EvaluationScoreRun"("status", "createdAt");

-- CreateIndex
CREATE INDEX "EvaluationScoreRun_userId_createdAt_idx" ON "EvaluationScoreRun"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "EvaluationScoreRun_budgetId_idx" ON "EvaluationScoreRun"("budgetId");

-- CreateIndex
CREATE UNIQUE INDEX "EvaluationScoreRun_runId_inputHash_modelVersion_rubricVersi_key" ON "EvaluationScoreRun"("runId", "inputHash", "modelVersion", "rubricVersion");

-- AddForeignKey
ALTER TABLE "UserFeedback" ADD CONSTRAINT "UserFeedback_recommendationRunId_fkey" FOREIGN KEY ("recommendationRunId") REFERENCES "UserRecommendationRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvaluationScoreRun" ADD CONSTRAINT "EvaluationScoreRun_runId_fkey" FOREIGN KEY ("runId") REFERENCES "EvaluationRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvaluationScoreRun" ADD CONSTRAINT "EvaluationScoreRun_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
