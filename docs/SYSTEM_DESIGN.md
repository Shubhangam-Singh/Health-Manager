# System Design Write-up

## Double-booking prevention

The naive booking flow reads availability, checks the slot is free, then inserts.
Between the read and the write there is a gap of real milliseconds in which another
request can run the same check, get the same answer, and insert too. This is a time-of-check-to-time-of-use race, and no application code closes it,
because the gap sits *between* statements. I built that version deliberately and
measured it: ten simultaneous requests for one slot produced **eight confirmed
bookings**, across a 51 ms window.

The fix belongs in the database: on serverless it is the only component every request
passes through, since each instance has its own memory and an application-level lock
is invisible to the others. Prisma cannot express a partial unique index, so the
migration is hand-written SQL:

```sql
CREATE UNIQUE INDEX appointment_slot_unique
  ON "Appointment" ("doctorId", "startAt")
  WHERE status IN ('PENDING', 'CONFIRMED');
```

Postgres serialises inserts on that key and rejects the loser with SQLSTATE 23505,
which Prisma surfaces as `P2002`. I map that to `409 Conflict`, not `400` — the
request was valid, the world changed — and not `500`, because losing a race is a
planned outcome and 500s should page someone.

The `WHERE` clause is essential. A plain unique index would treat a cancelled row as
still occupying the slot, making that time permanently unbookable. Excluding
non-live statuses frees the slot while preserving the record.

I chose optimistic concurrency over `SELECT ... FOR UPDATE`, which locks rows that
*exist* — and the contested row is the one nobody has inserted yet, so it would mean
locking the doctor row and serialising every booking to prevent a rare conflict.
**Trade-off accepted:** the loser learns only at write time, so the UI handles a 409
at the final step. After the fix, ten concurrent requests yield exactly one success;
so do twenty-five.

## Slot hold mechanism

Patients describe symptoms before confirming, which takes two or three minutes.
Without a reservation they complete the form and are rejected at the last step — the
system behaving correctly and serving the user terribly.

Selecting a slot writes a `SlotHold` row with `UNIQUE(doctorId, startAt)` and a
ten-minute `expiresAt`. Availability excludes live holds, so the slot disappears for
everyone else. Confirming converts the hold into an appointment inside one
transaction.

I used Postgres rather than Redis with a TTL. Redis gives automatic expiry, but it
puts the hold and the appointment in **different systems**, so converting one to the
other could no longer be atomic — reintroducing the exact failure the design removes.
**Trade-off accepted:** Postgres has no TTL, so expiry is mine to implement, and a stale
row still occupies the unique key. It is handled twice: lazily when someone
claims that slot, and by a cron sweep for slots nobody retries. Redis is the scale-up
path once hold churn becomes a write-throughput problem.

Creating a hold releases the patient's previous one, matching the interaction and
stopping one account holding a doctor's entire day.

## Doctor leave conflict handling

Marking a doctor on leave can cancel other people's appointments, so **detection is
separate from mutation**. The admin first receives the exact list of affected
appointments with patient names and times, and nothing is written. Applying requires
an explicit `confirm: true`, which defaults to false so the destructive path is never
the accidental one.

On confirm, one transaction creates the `LeaveDay`, cancels each appointment with
reason `DOCTOR_LEAVE`, queues a notification per patient and a summary for the doctor,
and marks calendar events for deletion. The leave date is a calendar date in the
clinic's timezone, converted to the UTC window that day occupies, so appointments near
midnight are neither missed nor wrongly swept in.

Three alternative slots are computed **before** the transaction opens — several reads
do not belong inside one — and included in the cancellation email.

## Notification failure handling

Sending email inside the booking transaction means a mail server hiccup rolls back a
valid appointment, and a hang holds a database connection open. **Never do network
I/O inside a database transaction.**

The business transaction writes a `Notification` row with `status = PENDING` instead.
A cron worker delivers them afterwards. On failure it records `lastError`, increments
`attempts` and sets `nextRetryAt` with exponential backoff — 1m, 5m, 15m, 1h, 6h —
giving up after five attempts and marking `FAILED` rather than deleting, so an admin
can see what was never delivered. Total retry window is 441 minutes: long enough to
survive a provider outage, short enough that a dead address surfaces the same day.

Every notification carries a deterministic `idempotencyKey` such as
`booking-confirmed:<appointmentId>:patient`, unique in the database, so a retried
operation can never queue a duplicate.

The same pattern covers Google Calendar, rescheduling and LLM summaries: queued
rows, retried by a worker, degrading to a visible failed state. **Trade-off accepted:** email is no longer
instant — up to one worker interval. Invisible for a booking confirmation;
unacceptable for a passcode, which would justify a different design.

---
*Under 800 words, excluding headings and the SQL block.*
