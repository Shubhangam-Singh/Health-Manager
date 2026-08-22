-- CreateEnum
CREATE TYPE "CalendarEventStatus" AS ENUM ('PENDING', 'SYNCED', 'DELETE_PENDING', 'DELETED', 'FAILED');

-- CreateTable
CREATE TABLE "GoogleAccount" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "accessToken" TEXT,
    "expiresAt" TIMESTAMPTZ(3),
    "scope" TEXT,
    "googleEmail" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "GoogleAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalendarEvent" (
    "id" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "googleEventId" TEXT,
    "status" "CalendarEventStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "CalendarEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GoogleAccount_userId_key" ON "GoogleAccount"("userId");

-- CreateIndex
CREATE INDEX "CalendarEvent_status_idx" ON "CalendarEvent"("status");

-- CreateIndex
CREATE UNIQUE INDEX "CalendarEvent_appointmentId_userId_key" ON "CalendarEvent"("appointmentId", "userId");

-- AddForeignKey
ALTER TABLE "GoogleAccount" ADD CONSTRAINT "GoogleAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
