-- HAND-WRITTEN. Prisma's schema language cannot express CHECK constraints, so
-- these invariants have to be stated in SQL directly.
--
-- Why bother when the API validates the same things with zod? Because zod only
-- guards the one path that goes through the API. A seed script, a manual fix in
-- the SQL editor, or a future endpoint written in a hurry all bypass it. A CHECK
-- constraint is enforced by the database for every writer, forever.

-- A weekday is 0 (Sunday) through 6 (Saturday).
ALTER TABLE "WorkingHour"
  ADD CONSTRAINT "WorkingHour_dayOfWeek_range"
  CHECK ("dayOfWeek" >= 0 AND "dayOfWeek" <= 6);

-- Minutes since midnight must sit inside a day, and a shift must move forwards.
-- 1440 = 24 * 60, allowed as an end value so a shift can run until midnight.
ALTER TABLE "WorkingHour"
  ADD CONSTRAINT "WorkingHour_minutes_valid"
  CHECK (
    "startMinute" >= 0
    AND "endMinute" <= 1440
    AND "startMinute" < "endMinute"
  );

-- A zero or negative slot duration would make slot generation loop forever.
ALTER TABLE "DoctorProfile"
  ADD CONSTRAINT "DoctorProfile_slotDuration_positive"
  CHECK ("slotDurationMin" > 0);
