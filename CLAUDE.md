# CLAUDE.md — Read this fully before writing a single line of code

## Who you are working with

Shubhangam, pre-final year B.Tech CSE student. Strong in: React, Node basics, Java,
DSA, blockchain/Solidity, ESP32/IoT. **Has never used Next.js. Has never used Prisma.
Has never used Auth.js. Has never touched Google OAuth.**

This project is an assignment for a company. He will be **interviewed and grilled on
every line of it**. So the goal is NOT "working app fastest". The goal is
**"working app that he can defend under questioning"**.

If he can't explain it, you failed — even if the code runs.

---

## THE TEACHING CONTRACT (non-negotiable)

These rules override any instinct you have to be efficient.

### Rule 1 — One micro-step at a time
Do exactly ONE step from `BUILD_PLAN.md`, then **STOP** and wait for him to say
`next`. Do not chain steps. Do not "while I'm here, let me also...". Even if the
next step is 3 lines. Stop.

### Rule 2 — Concept before code, always
Every step opens with a `## CONCEPT` block, max ~200 words, containing:
- What this thing is, in plain English
- A real-world analogy
- **What breaks if we don't do it** (this is what makes it stick)
- Why we chose this over the alternative

No code appears until this block is written.

### Rule 3 — Small chunks, then walkthrough
Never paste more than ~40 lines of new code in one go. After each chunk, walk
through anything he hasn't seen before, line by line. Assume zero Next.js
knowledge. `"use client"`, `async` server components, route handlers, `params`,
middleware — all of it needs explaining the first time it appears.

### Rule 4 — Verify block
Every step ends with a `## VERIFY` block: the exact command to run, and the exact
output/behaviour he should see. If it's a UI change, tell him what URL to open and
what he should see on screen.

### Rule 5 — Interview drill
Every step ends with **2 interview questions** about what was just built. Ask them,
then **stop and wait for his answer**. Do not answer them yourself immediately.
When he answers, tell him what was right, what was weak, and what a strong answer
sounds like.

Questions should be the kind an interviewer actually asks:
- "Why did you use X instead of Y?"
- "What happens if two users do this at the same time?"
- "How would this break at 10,000 users?"

### Rule 6 — Keep two logs updated
After every step, append to:
- `docs/LEARNING_LOG.md` — what was built, what concepts appeared, in his words
- `docs/DESIGN_DECISIONS.md` — decision, alternatives considered, why chosen,
  trade-off accepted

`DESIGN_DECISIONS.md` becomes the 800-word write-up at the end. Do not skip it.

### Rule 7 — Language
Simple English. Occasional Hinglish is fine and welcome. Never use a technical term
without defining it the first time. "Idempotent", "optimistic locking", "outbox
pattern" — define them.

### Rule 8 — When he's lost
If he says "I don't get it" / "explain again" — **re-explain with a different
analogy**, do not repeat the same words louder. Do not move forward until he says
he's got it.

### Rule 9 — The escape hatch
If he types `SPEEDRUN`, you may batch steps and skip the teaching blocks — but say
clearly at the top: *"Teaching mode off. You will need to come back and understand
this before the interview."* Default is always teaching mode.

### Rule 10 — Commit after every step, in his name
Set this once at the start of the project (Step 5), and use it for every commit:

```bash
git config user.name "Shubhangam-Singh"
git config user.email "shubhangam2005singh@gmail.com"
```

After each completed step, make one clean commit with a message describing what was
built, e.g. `feat: partial unique index to prevent double-booking`. Never commit as
Claude, never add Claude as co-author — this is his assignment and the commit history
is part of what he'll be asked about. A clear, incremental history is itself evidence
he built it step by step.

### Rule 11 — Show the bug before the fix
For the four graded problems (see below), **first demonstrate the failure**, then
fix it. Write the naive version, prove it breaks, then fix it properly. Nothing
teaches a race condition like watching two rows get inserted where one should be.

---

## THE ASSIGNMENT (source of truth)

Healthcare Appointment & Follow-up Manager. Three portals: patient, doctor, admin.

**Functional requirements:**
- Admin creates/manages doctor profiles: specialisation, working hours, slot
  duration, leave days
- Patient: register, login, search doctors by specialisation, book a slot
- System must prevent double-booking and handle simultaneous booking attempts
- Doctor marked on leave for a date that already has bookings → affected patients
  must be notified
- Patient fills a symptom form **before confirming** → LLM generates a pre-visit
  summary with urgency level, for the doctor
- Doctor submits post-visit notes + prescription → LLM generates patient-friendly
  post-visit summary
- Medication reminders based on prescription frequency
- Emails to patient AND doctor: booking confirmation, reminder, cancellation
- Google Calendar event for both on booking; updated/deleted on reschedule/cancel
- LLM failures must be handled gracefully — system must not break

**Deliverables:**
1. Zip of complete source
2. README: setup guide, `.env.example`, API docs, DB schema, LLM prompts, Google
   Calendar setup steps
3. Hosted URL
4. System design write-up, **800 words max**, covering: double-booking prevention,
   doctor leave conflict handling, slot hold mechanism, notification failure handling

**Graded on:** slot conflict / leave / notification reliability problem-solving,
LLM prompt quality + failure handling, DB schema design, API design + code
structure, email + Calendar integration, documentation.

---

## THE FOUR GRADED PROBLEMS

Everything else is CRUD. These four are where the marks are, and where the
interview questions will come from. Build these properly even if the UI stays ugly.

### 1. Double-booking prevention
The naive approach — `SELECT` to check if slot is free, then `INSERT` — has a race
window between the two queries. Two requests both read "free", both insert.

**Our approach:** a database-level partial unique index is the single source of
truth. Prisma can't express partial unique indexes, so we write a raw SQL
migration:

```sql
CREATE UNIQUE INDEX appointment_slot_unique
  ON "Appointment" ("doctorId", "startAt")
  WHERE status IN ('CONFIRMED', 'PENDING');
```

Booking runs inside a transaction. On unique violation Prisma throws error code
`P2002` → we catch it and return `409 Slot just got taken`. The DB, not the app,
decides who wins.

Why partial (the `WHERE`)? So a cancelled appointment doesn't permanently block
that slot from being rebooked.

Interview ammo: mention that `SELECT ... FOR UPDATE` (pessimistic locking) is the
alternative, and why we didn't need it here.

### 2. Slot hold mechanism
The patient picks a slot, then fills a symptom form — that's 2-3 minutes where
someone else could grab it. Without a hold, the patient fills the whole form and
gets rejected at the last second. Terrible UX.

**Our approach:** a `SlotHold` row with `UNIQUE(doctorId, startAt)` and an
`expiresAt` (10 minutes). Created when they select the slot. Confirming converts
hold → appointment inside one transaction. Expired holds are cleaned up lazily
(checked on read) AND by the cron job (belt and braces).

Interview ammo: why not Redis with TTL? Because it adds infra for a free-tier
deploy, and Postgres gives us the same guarantee inside the same transaction as
the booking. Mention Redis as the scale-up path.

### 3. Doctor leave conflict handling
Admin marks doctor on leave for a date that already has confirmed bookings.

**Our approach:** detect conflicts BEFORE writing. Return the affected appointment
list to the admin and require an explicit `confirm: true` to proceed. On confirm,
one transaction: create `LeaveDay` → cancel affected appointments with reason
`DOCTOR_LEAVE` → write notification rows → write calendar-delete tasks. Emails and
Calendar calls happen AFTER the transaction, via the worker. Nice-to-have: suggest
3 alternate slots in the email.

### 4. Notification failure handling
Email fails. Google Calendar returns 500. If we send inside the booking
transaction, a mail server hiccup rolls back a valid appointment. Unacceptable.

**Our approach: the outbox pattern.** The business transaction only writes a
`Notification` row with `status = PENDING`. A cron worker picks up pending rows and
sends them. On failure: increment `attempts`, store `lastError`, set `nextRetryAt`
with exponential backoff (1m, 5m, 15m, 1h, 6h), give up after 5 attempts and mark
`FAILED` for admin visibility.

Each notification has an `idempotencyKey` so a retry can never send a duplicate.

**Golden rule to state in the interview: never do network I/O inside a DB
transaction.**

---

## LLM FAILURE HANDLING (also explicitly graded)

- 15s timeout via `AbortController`
- 1 retry, then give up
- Response validated with a **zod schema** — LLMs return malformed JSON regularly
- Summary rows have `status: PENDING | READY | FAILED`
- **Generation NEVER blocks booking.** Booking succeeds, summary generates after
- On `FAILED`, the doctor UI shows the raw symptom text plus a "Regenerate" button
- Store `rawModelOutput` and `promptVersion` for debugging

Prompts live in `src/server/llm/prompts.ts` as versioned exported constants, so
they can be pasted straight into the README.

---

## LOCKED STACK — do not substitute without asking

| Layer | Choice | Why (he must be able to say this) |
|---|---|---|
| Framework | Next.js 15, App Router, TypeScript | One deploy, one language, route handlers are just Node |
| Styling | Tailwind CSS | Speed. UI is not graded |
| DB | PostgreSQL (Neon free tier) | Need real transactions + unique constraints for the concurrency requirement |
| ORM | Prisma | Type-safe, readable migrations, easy to show schema in README |
| Auth | Auth.js v5 (NextAuth), Credentials provider, JWT session carrying `role` | Role-based auth is a hard requirement |
| Google Calendar | `googleapis`, separate OAuth 2.0 consent flow, refresh token in DB | Login auth and Calendar authorisation are different concerns — say this in the interview |
| Email | Nodemailer + Gmail SMTP app password | Free, instant, no domain verification wait |
| LLM | Google Gemini free tier (check current flash model name in their docs) | Free, fast, JSON mode |
| Background jobs | `/api/cron/*` routes guarded by `CRON_SECRET`, triggered by cron-job.org every 5 min | Vercel Hobby cron only fires once daily — this is the free workaround |
| Deploy | Vercel + Neon | Free, zero config |

---

## ARCHITECTURE RULE — thin API, fat services

Even though it's Next.js full-stack, it must be **structured like it has a real
backend**. This is deliberate and is an interview talking point.

```
src/
  app/
    (auth)/login, register
    (patient)/...
    (doctor)/...
    (admin)/...
    api/
      **/route.ts          ← THIN. parse input → authorise → call service → return
      cron/
        notifications/route.ts
        reminders/route.ts
        cleanup-holds/route.ts
  server/
    services/              ← ALL business logic lives here
      booking.service.ts
      leave.service.ts
      notification.service.ts
      reminder.service.ts
      slot.service.ts
    llm/
      client.ts
      prompts.ts
      schemas.ts           ← zod
    lib/
      prisma.ts
      mailer.ts
      google-calendar.ts
    validation/            ← zod input schemas
  components/
docs/
  LEARNING_LOG.md
  DESIGN_DECISIONS.md
prisma/
  schema.prisma
  migrations/
scripts/
  seed.ts
  race-test.ts             ← proves double-booking prevention works
```

**Every route handler stays under ~25 lines.** If it grows, logic belongs in a
service. Services are plain TypeScript functions that know nothing about HTTP —
no `req`, no `res`, no `NextResponse` inside them.

Interview line this buys him: *"I kept the API layer thin and the domain logic
framework-agnostic. Porting this to Express or Nest would only mean rewriting the
controller layer."*

---

## DATA MODEL (agree on this before coding)

- `User` — id, email, passwordHash, name, phone, role (PATIENT|DOCTOR|ADMIN)
- `DoctorProfile` — userId, specialisation, slotDurationMin, bio
- `WorkingHour` — doctorId, dayOfWeek, startTime, endTime
- `LeaveDay` — doctorId, date, reason
- `SlotHold` — doctorId, patientId, startAt, expiresAt · UNIQUE(doctorId, startAt)
- `Appointment` — doctorId, patientId, startAt, endAt, status, cancelReason
  · partial UNIQUE(doctorId, startAt) WHERE status IN ('PENDING','CONFIRMED')
- `SymptomForm` — appointmentId, rawText, durationDays, severity
- `PreVisitSummary` — appointmentId, status, urgency, chiefComplaint,
  suggestedQuestions[], rawModelOutput, promptVersion
- `VisitNote` — appointmentId, clinicalNotes
- `Prescription` → `PrescriptionItem` — drugName, dose, frequency, durationDays
- `PostVisitSummary` — appointmentId, status, patientFriendlyText, rawModelOutput
- `MedicationReminder` — prescriptionItemId, scheduledAt, status, attempts
- `Notification` — userId, type, channel, payload, status, attempts, lastError,
  nextRetryAt, idempotencyKey
- `CalendarEvent` — appointmentId, userId, googleEventId, status
- `GoogleAccount` — userId, refreshToken, accessToken, expiresAt, scope

Explain each table's purpose when you create it. Explain every relation and every
index. Schema design is explicitly on the grading list.

---

## TIME BUDGET

3 days. If falling behind, cut in this order:
1. UI polish (it is not graded)
2. Reschedule flow
3. Alternate-slot suggestions in leave emails
4. Doctor availability calendar view

**Never cut:** the four graded problems, LLM failure handling, README, or the
800-word write-up. A rough-looking app with bulletproof concurrency scores far
higher than a pretty app that double-books.

---

## Start by reading `BUILD_PLAN.md`, then begin at Step 1. One step. Then stop.
