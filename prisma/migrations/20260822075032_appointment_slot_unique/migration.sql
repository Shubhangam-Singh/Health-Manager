-- ============================================================================
-- THE DOUBLE-BOOKING FIX
--
-- Hand-written: Prisma's schema language cannot express a PARTIAL unique
-- index, so this cannot come from schema.prisma.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. REPAIR EXISTING DATA
--
-- Postgres refuses to build a unique index over rows that already violate it,
-- and this table contains duplicates created by the naive booking code in
-- step 14. Real migrations that add constraints to live tables always face
-- this: the constraint is the easy half, the data repair is the hard half.
--
-- Policy: first come, first served. The earliest booking for each slot keeps
-- it; later ones are CANCELLED rather than deleted, because an appointment is
-- a medical record and the affected patients must still be notifiable.
-- ---------------------------------------------------------------------------
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY "doctorId", "startAt"
      ORDER BY "createdAt" ASC, id ASC
    ) AS rn
  FROM "Appointment"
  WHERE status IN ('PENDING', 'CONFIRMED')
)
UPDATE "Appointment" a
   SET status         = 'CANCELLED',
       "cancelReason" = 'ADMIN',
       "cancelledAt"  = NOW()
  FROM ranked r
 WHERE a.id = r.id
   AND r.rn > 1;

-- ---------------------------------------------------------------------------
-- 2. THE CONSTRAINT
--
-- Two requests can no longer both succeed: Postgres serialises inserts on this
-- key and rejects the loser with SQLSTATE 23505, which Prisma surfaces as
-- P2002. There is no window, because the check and the write are one operation.
--
-- WHY PARTIAL (the WHERE): a plain unique index would treat a CANCELLED row as
-- still occupying the slot, making that time permanently unbookable. Excluding
-- non-live statuses frees the slot while keeping the history.
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX "appointment_slot_unique"
  ON "Appointment" ("doctorId", "startAt")
  WHERE status IN ('PENDING', 'CONFIRMED');
