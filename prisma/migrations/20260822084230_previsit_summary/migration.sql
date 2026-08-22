-- CreateEnum
CREATE TYPE "SummaryStatus" AS ENUM ('PENDING', 'READY', 'FAILED');

-- CreateEnum
CREATE TYPE "Urgency" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateTable
CREATE TABLE "PreVisitSummary" (
    "id" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "status" "SummaryStatus" NOT NULL DEFAULT 'PENDING',
    "urgency" "Urgency",
    "chiefComplaint" TEXT,
    "summary" TEXT,
    "suggestedQuestions" TEXT[],
    "rawModelOutput" TEXT,
    "promptVersion" TEXT,
    "lastError" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "generatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PreVisitSummary_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PreVisitSummary_appointmentId_key" ON "PreVisitSummary"("appointmentId");

-- AddForeignKey
ALTER TABLE "PreVisitSummary" ADD CONSTRAINT "PreVisitSummary_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
