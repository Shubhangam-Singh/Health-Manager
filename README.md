# Healthcare Appointment & Follow-up Manager

Appointment platform with separate patient, doctor and admin portals. Patients book
slots and describe symptoms in advance; an LLM produces a triage summary for the
doctor before the visit and a plain-English summary for the patient afterwards.
Both sides are kept informed by email and Google Calendar.

Built with Next.js 15 (App Router), TypeScript, PostgreSQL, Prisma 7 and Auth.js v5.

---

## Contents

1. [What this project is really about](#what-this-project-is-really-about)
2. [Setup](#setup)
3. [Environment variables](#environment-variables)
4. [Demo accounts](#demo-accounts)
5. [Architecture](#architecture)
6. [Database schema](#database-schema)
7. [API reference](#api-reference)
8. [LLM prompts](#llm-prompts)
9. [Google Calendar setup](#google-calendar-setup)
10. [Background jobs](#background-jobs)
11. [Tests and proof scripts](#tests-and-proof-scripts)
12. [Known limitations](#known-limitations)

---

## What this project is really about

Four problems carry the weight. Each is solved in the database rather than in
application code, and each has a script that proves it.

| Problem | Solution | Proof |
|---|---|---|
| **Double-booking** | Partial unique index on `(doctorId, startAt) WHERE status IN ('PENDING','CONFIRMED')` | `scripts/race-test.ts` |
| **Slot holds** | `SlotHold` with `UNIQUE(doctorId, startAt)` + 10-minute expiry | `scripts/hold-test.ts` |
| **Doctor leave conflicts** | Detection separated from mutation; explicit `confirm: true` | `scripts/leave-conflict-test.ts` |
| **Notification reliability** | Outbox pattern with exponential backoff and idempotency keys | `scripts/notification-retry-test.ts` |

The measured result for double-booking: 10 simultaneous requests for one slot
produced **8 successful bookings** before the fix and **exactly 1** after.

---

## Setup

Requires **Node.js 20.9+** (developed on 24) and a PostgreSQL database.

```bash
git clone <repo-url>
cd USolutions
npm install                 # runs `prisma generate` automatically

cp .env.example .env        # then fill it in — see below
npx prisma migrate deploy   # apply all migrations
npm run seed                # demo clinic: 1 admin, 4 doctors, 3 patients

npm run dev                 # http://localhost:3000
```

**Minimum to run:** `DATABASE_URL`, `DIRECT_URL`, `AUTH_SECRET`, `CRON_SECRET`.
Everything else degrades gracefully — see [Known limitations](#known-limitations).

```bash
npm test        # 52 unit tests, no test framework (node --test)
npm run build   # production build — stop `npm run dev` first, they share .next/
```

---

## Environment variables

Copy `.env.example` to `.env`. Every key, and what happens without it:

| Variable | Required | Purpose / effect if missing |
|---|---|---|
| `DATABASE_URL` | **yes** | **Pooled** Neon endpoint (host contains `-pooler`). Used at runtime. |
| `DIRECT_URL` | **yes** | **Direct** endpoint. Used by the Prisma CLI for migrations. |
| `AUTH_SECRET` | **yes** | Signs and encrypts the session cookie. `npx auth secret` |
| `AUTH_URL` | yes in prod | Canonical app URL. |
| `CRON_SECRET` | **yes** | Guards `/api/cron/*`. Without it those endpoints refuse to run. |
| `GEMINI_API_KEY` | no | LLM summaries. Without it summaries are `FAILED`; **booking is unaffected**. |
| `GEMINI_MODEL` | no | Defaults to `gemini-3.6-flash`. Overridable when Google retires a model. |
| `LLM_TIMEOUT_MS` | no | Defaults to 30000. |
| `GMAIL_USER` / `GMAIL_APP_PASSWORD` | no | SMTP. Without them email prints to the console instead. |
| `MAIL_FROM` | no | From header. |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | no | Calendar. Without them the connect button is disabled and sync is a no-op. |
| `GOOGLE_REDIRECT_URI` | with the above | Must match Google Cloud Console **exactly**. |
| `NEXT_PUBLIC_APP_URL` | no | **Inlined into the browser bundle.** Never put a secret behind this prefix. |
| `NEXT_PUBLIC_HIDE_DEMO_ACCOUNTS` | no | `"true"` hides the demo credentials on the sign-in page. |

### Why two database URLs

`DATABASE_URL` points at the pooled endpoint because serverless functions open many
short-lived connections against a hard `max_connections` limit; PgBouncer multiplexes
them. `DIRECT_URL` points at the direct endpoint because migrations need session-level
features (advisory locks, `CREATE TYPE`) that a transaction-mode pooler cannot
provide. **The pooled one is about connection scarcity; the direct one is about
session capability.**

---

## Demo accounts

After `npm run seed`:

| Role | Email | Password |
|---|---|---|
| Admin | `admin@clinic.test` | `admin12345` |
| Doctor | `mehta@clinic.test` (Cardiology) | `doctor12345` |
| Doctor | `rao@clinic.test` (Dermatology) | `doctor12345` |
| Doctor | `shah@clinic.test` (Orthopaedics) | `doctor12345` |
| Doctor | `nair@clinic.test` (Pediatrics) | `doctor12345` |
| Patient | `asha@example.test` | `patient12345` |
| Patient | `rohit@example.test` / `meera@example.test` | `patient12345` |

To receive real emails, register a patient account with an address you own —
booking confirmations, cancellations and medication reminders are sent to whatever
address the account holds.

**Suggested 2-minute walkthrough**

1. Sign in as `asha@example.test` → **Find a doctor** → pick Dr Mehta.
2. Click a slot. It is now **held for 10 minutes** — a countdown appears.
3. Fill in the symptom form and confirm.
4. Sign in as `mehta@clinic.test` → **My appointments** → open it.
   The urgency badge, chief complaint and suggested questions were generated by the
   LLM. The patient's own words are always shown underneath.
5. Record clinical notes and a prescription, then save.
6. Back as the patient: a plain-English summary and the prescription appear.

Doctors and admins **cannot self-register** — registration only ever creates a
`PATIENT`. That is deliberate (see [D15](docs/DESIGN_DECISIONS.md)); they are created
by an admin or the seed script.

---

## Architecture

**Thin API, fat services.** Route handlers parse input, authorise, call a service and
shape a response — nothing else. All domain logic lives in `src/server/services/` as
plain functions that never touch `Request` or `NextResponse`, so the same code is
called by pages, API routes and cron jobs alike.

```
src/
  app/
    (auth)/login, register      route group — shared layout, no URL segment
    patient/ doctor/ admin/     real segments, because middleware matches on prefix
    api/**/route.ts             thin handlers
    api/cron/*                  guarded by CRON_SECRET
  server/
    services/                   ALL business logic
      *.core.ts                 PURE, zero imports, unit-tested
    llm/                        client, versioned prompts, zod schemas
    lib/                        prisma, mailer, google-calendar, errors, guards
    validation/                 zod input schemas
  components/                   client islands only
```

**Pure cores.** `slot.core.ts`, `notification.core.ts` and `reminder.core.ts` import
**nothing**. All the logic worth testing lives there and runs without a database; the
surrounding services do the I/O. A module with zero imports cannot accidentally
acquire a dependency, and the test suite fails immediately if anyone adds one.

**Server Components by default.** Read-only pages call services directly during render
— no API round trip, no loading state, no client bundle. `/patient/doctors` ships
**170 B** of JavaScript. Only genuinely interactive pieces (`SlotPicker`,
`SymptomFormCard`, `VisitNotesForm`) are client components.

**Authorisation in three layers:**

1. **Middleware** guards page navigation by role (Edge runtime, no DB access).
2. **`requireRole()`** in every API route — middleware never runs for `/api/*`, and
   an endpoint must not depend on a matcher config for its security.
3. **Ownership in the query** — `findFirst({ where: { id, doctorId } })`, so another
   doctor's appointment simply does not match. This is where healthcare systems
   actually leak: the caller is fully authenticated and correctly roled, and still
   should not see that row.

---

## Database schema

16 tables. Full definitions in [`prisma/schema.prisma`](prisma/schema.prisma).

```
User ──1:1── DoctorProfile ──1:n── WorkingHour
 │                │      └──1:n── LeaveDay
 │                └──1:n── Appointment ──1:1── SymptomForm
 │                                     ├──1:1── PreVisitSummary
 │                                     ├──1:1── VisitNote
 │                                     ├──1:1── Prescription ──1:n── PrescriptionItem ──1:n── MedicationReminder
 │                                     ├──1:1── PostVisitSummary
 │                                     └──1:n── CalendarEvent
 ├──1:n── SlotHold
 ├──1:n── Notification
 └──1:1── GoogleAccount
```

### Decisions worth knowing

**One `User` table for all roles**, discriminated by a `Role` enum. One login flow,
one namespace for email uniqueness, one target for foreign keys.

**`cuid()` primary keys, not auto-increment.** Sequential ids are enumerable:
`/appointments/41` implies `42` exists, and any authorisation gap becomes a walkable
index of patient records.

**Working hours are rows, not JSON**, with times as **minutes since midnight**
(`540` = 09:00) in the clinic's timezone. A working hour is *not an instant* — it is a
recurring wall-clock time. `DoctorProfile.timezone` is the only thing that can convert
it into a real UTC instant, and the conversion does two offset passes so it is correct
across daylight-saving boundaries.

`(doctorId, dayOfWeek)` is deliberately **not** unique, so split shifts work.

**All instants are `timestamptz`.** `LeaveDay.date` is a plain `date`, because "on
leave 12 March" must not shift by timezone.

**Constraints the ORM cannot express are hand-written SQL:**

```sql
-- prevents double-booking; partial so a CANCELLED row frees its slot
CREATE UNIQUE INDEX appointment_slot_unique
  ON "Appointment" ("doctorId", "startAt")
  WHERE status IN ('PENDING', 'CONFIRMED');

-- schedule sanity, enforced for every writer, not just the API
CHECK ("dayOfWeek" >= 0 AND "dayOfWeek" <= 6)
CHECK ("startMinute" >= 0 AND "endMinute" <= 1440 AND "startMinute" < "endMinute")
CHECK ("slotDurationMin" > 0)
```

**`onDelete` is chosen per relation.** `Cascade` for owned configuration (working
hours die with the doctor). **`Restrict` for appointments** — they are medical records
and must outlive a doctor's employment, so Postgres refuses the delete instead.

---

## API reference

All responses are JSON. Errors are `{ error, code, field? }` where `code` is one of
`BAD_REQUEST`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `INTERNAL`.
**Branch on `code`, never on the message** — messages get reworded.

`401` means "I do not know who you are"; `403` means "I know, and no".

### Auth

| Method | Path | Auth | Body | Responses |
|---|---|---|---|---|
| `POST` | `/api/auth/register` | none | `{email, password, name, phone?}` | `201` · `400` · `409` |
| `*` | `/api/auth/[...nextauth]` | — | Auth.js: `/csrf`, `/session`, `/callback/credentials`, `/signout` | — |

Registration always creates a `PATIENT`; a `role` in the body is ignored.

### Doctors — patient facing

| Method | Path | Auth | Notes |
|---|---|---|---|
| `GET` | `/api/doctors?specialisation=` | any signed-in | Case-insensitive, filtered in SQL |
| `GET` | `/api/doctors/:id/slots?date=YYYY-MM-DD` | any signed-in | `400` bad date · `404` unknown doctor |

Slots exclude leave days, booked appointments, live holds, past times and a 30-minute
minimum notice. A slot that would overrun closing time is never offered.

### Doctors — admin

| Method | Path | Success | Errors |
|---|---|---|---|
| `POST` | `/api/admin/doctors` | `201` + `Location` | `400` `401` `403` `409` |
| `GET` | `/api/admin/doctors?specialisation=` | `200` | `401` `403` |
| `GET` | `/api/admin/doctors/:id` | `200` | `401` `403` `404` |
| `PATCH` | `/api/admin/doctors/:id` | `200` | `400` `401` `403` `404` |
| `DELETE` | `/api/admin/doctors/:id` | `204` | `401` `403` `404` `409` |
| `PUT` | `/api/admin/doctors/:id/working-hours` | `200` | `400` `401` `403` `404` |

`PUT` replaces the doctor's **entire week** and is idempotent. `PATCH` changes only
named fields — an empty body is a `400`, never a silent overwrite.

**Create body**
```json
{
  "email": "dr.new@clinic.test", "password": "at-least-8", "name": "Dr New",
  "specialisation": "Neurology", "slotDurationMin": 30, "bio": "optional",
  "workingHours": [{ "dayOfWeek": 1, "startMinute": 540, "endMinute": 780 }]
}
```

### Holds and booking

| Method | Path | Auth | Notes |
|---|---|---|---|
| `POST` | `/api/holds` | patient | `201`, 10-minute hold · `409` if taken. Re-holding your own slot returns it. |
| `GET` | `/api/holds` | patient | Your live hold, if any |
| `DELETE` | `/api/holds/:id` | patient | `204` · `404` for someone else's hold (never `403`) |
| `POST` | `/api/appointments` | patient | `{holdId, symptoms?}` or `{doctorId, startAt}` |

`POST /api/appointments` returns **`409`** when the slot was taken between selection
and confirmation, and a distinct message when the hold has expired.

### Visit notes and summaries

| Method | Path | Auth | Notes |
|---|---|---|---|
| `POST` | `/api/appointments/:id/visit-notes` | **that** doctor | Notes + structured prescription; materialises reminders |
| `POST` | `/api/appointments/:id/summary` | that doctor, the patient, or admin | Regenerate the pre-visit summary |
| `POST` | `/api/appointments/:id/cancel` | the patient **or** that doctor | Cancels, notifies the other party, stops medication reminders, removes calendar events. `409` if already cancelled or completed |

### Leave

| Method | Path | Notes |
|---|---|---|
| `GET` | `/api/admin/doctors/:id/leave?date=` | **Dry run.** Lists affected appointments, changes nothing |
| `POST` | `/api/admin/doctors/:id/leave` | `{date, reason?, confirm}` — `confirm` defaults to **false** |

### Google Calendar

| Method | Path | Notes |
|---|---|---|
| `GET` | `/api/google/connect` | Redirects to Google consent |
| `GET` | `/api/google/callback` | Exchanges the code, stores the refresh token |
| `POST` | `/api/google/disconnect` | `204`, removes our stored tokens |

### Cron — all require `CRON_SECRET`

Send `Authorization: Bearer <CRON_SECRET>` or `x-cron-secret: <CRON_SECRET>`.

| Path | Does |
|---|---|
| `/api/cron/notifications` | Delivers due notifications with backoff |
| `/api/cron/reminders` | Due medication doses **and** 24-hour appointment reminders |
| `/api/cron/summaries` | Retries AI summaries stuck PENDING or FAILED |
| `/api/cron/calendar` | Creates and deletes Google Calendar events |
| `/api/cron/cleanup-holds` | Sweeps expired slot holds |

---

## LLM prompts

Both prompts are versioned exported constants in
[`src/server/llm/prompts.ts`](src/server/llm/prompts.ts). Every generated summary
stores its `promptVersion`, so when output quality changes you can tell whether the
model moved or the prompt did.

### Pre-visit — `pre-visit@v1`

The assignment's baseline was:

> *"Analyse these symptoms and return: urgency level (Low / Medium / High), chief
> complaint, and three suggested questions for the doctor. Symptoms: `<symptoms>`"*

Kept, and improved in eight specific ways: an explicit **role**; an exact **JSON
schema** with key names, because the output is parsed; a **"no markdown fences"**
instruction, since a ```` ```json ```` wrapper is the most common cause of a parse
failure; **enum values spelled exactly as stored** (`LOW`/`MEDIUM`/`HIGH`) so no
normalisation step is needed; **length caps** so a doctor gets a summary rather than
an essay; an explicit **do-not-diagnose boundary**; **structured context fields**
(duration, severity, conditions, medications) rather than prose alone, because
severity and duration drive urgency; and an **anti-fabrication rule**, because a model
asked to be helpful will otherwise supply plausible detail the patient never reported.

### Post-visit — `post-visit@v1`

Baseline:

> *"Convert these clinical notes into a patient-friendly summary with medication
> schedule and follow-up steps: `<notes>`"*

Improvements: a stated **reading level** (plain English, roughly age 12); a **jargon
rule** that translates terms while keeping the medical word in brackets so the patient
recognises it on a label; **no new clinical content** — the single most important
instruction, since the model must not invent advice, dosages or warnings; an explicit
**JSON schema**; the **medication schedule is passed in already computed** and the
model may only rephrase it, because dose arithmetic is done in unit-tested code and
never by a language model; a **calm tone**; and a **safety net** step about seeking
urgent care if things worsen, without inventing specific red-flag symptoms.

### Failure handling

- **30-second timeout** via `AbortController`, one retry, and only for `5xx`/`429` —
  a `4xx` means our request is wrong, so retrying sends the same wrong request.
- A missing API key is a **config error** and is never retried.
- Output is stripped of code fences and surrounding prose, then **validated with
  zod**. 12 unit tests cover real model failure modes.
- Summaries are `PENDING | READY | FAILED`. The `PENDING` row is created inside the
  booking transaction so "not ready yet" is distinguishable from "nobody tried".
- **Generation never blocks booking.** It runs in `after()`, once the response has
  been flushed — measured at **1062 ms to confirm a booking against a 30 s model
  budget**. With no API key at all, booking still returns `201`.
- `rawModelOutput` is stored on failure. This is not decorative: a truncated response
  was diagnosed from it in one query, and the fix was a token limit, not the prompt.

---

## Google Calendar setup

Login and calendar access are **separate concerns**: signing in proves identity,
connecting a calendar delegates a capability. A user can disconnect their calendar
without losing their account, and most never connect one.

1. **[console.cloud.google.com](https://console.cloud.google.com)** → create a project.
2. **APIs & Services → Library** → enable **Google Calendar API**.
3. **APIs & Services → OAuth consent screen** → **External** → fill in app name and
   support email → **Save**.
4. **Scopes** → add `.../auth/calendar.events` and `.../auth/userinfo.email`.
5. **Test users** → add every Google account you will demo with. While the app is in
   *Testing*, only these accounts can consent.
6. **Credentials → Create credentials → OAuth client ID → Web application.**
7. **Authorised redirect URIs** — add both, exactly:
   - `http://localhost:3000/api/google/callback`
   - `https://<your-vercel-domain>/api/google/callback`
8. Copy the client ID and secret into `.env`, and set `GOOGLE_REDIRECT_URI` to match
   the environment you are running.

Then sign in as a patient → **Google Calendar** → **Connect**.

**Notes.** `access_type=offline` with `prompt=consent` is required, because Google
returns a refresh token only on first consent unless you ask again — the classic
"worked in dev, broke in production" failure. The `state` parameter carries the user
id and is verified on return; without that check an attacker could trick a victim into
linking the attacker's Google account. A **Calendar failure never fails a booking**:
events are queued as rows and synced by a worker.

---

## Background jobs

Vercel's Hobby plan runs cron **once a day**, which is useless for retries. The
workaround is an external scheduler hitting the guarded endpoints.

**[cron-job.org](https://cron-job.org)** → create a job per endpoint:

| Endpoint | Interval |
|---|---|
| `https://<domain>/api/cron/notifications` | every 5 minutes |
| `https://<domain>/api/cron/reminders` | every 5 minutes |
| `https://<domain>/api/cron/summaries` | every 15 minutes |
| `https://<domain>/api/cron/calendar` | every 5 minutes |
| `https://<domain>/api/cron/cleanup-holds` | every 15 minutes |

Add header `Authorization: Bearer <CRON_SECRET>` to each. **Without the secret these
are an open relay for spam**, billed to you.

Retry schedule: **1m → 5m → 15m → 1h → 6h**, then `FAILED` (441 minutes total). Long
enough to ride out a provider outage, short enough that a dead address is flagged the
same working day. Failed rows are kept, never deleted, so an admin can see what was
never delivered.

Every notification carries a deterministic `idempotencyKey` such as
`booking-confirmed:<appointmentId>:patient`, so a retried operation can never send a
duplicate.

---

## Tests and proof scripts

```bash
npm test    # 52 unit tests, zero test dependencies (node --test, native TS)
```

Covering slot generation (including four DST cases and a UTC+5:45 zone), database
error translation, LLM output validation, retry backoff and medication schedules.

```bash
node --env-file=.env scripts/race-test.ts               # 1 x 201, N-1 x 409
node --env-file=.env scripts/hold-test.ts               # hold race, expiry reclaim
node --env-file=.env scripts/booking-flow-test.ts       # hold -> appointment -> outbox
node --env-file=.env scripts/leave-conflict-test.ts     # dry run, then confirm
node --env-file=.env scripts/notification-retry-test.ts # backoff to FAILED
node --env-file=.env scripts/post-visit-test.ts         # notes -> reminders -> summary
node --env-file=.env scripts/e2e-test.ts                # 16 assertions, whole journey
```

`RACE_N=25 node --env-file=.env scripts/race-test.ts` still yields exactly one winner.

---

## Known limitations

Stated plainly rather than hidden.

- **Refresh tokens are stored unencrypted.** In production they belong in a KMS or
  behind `pgcrypto`. Documented, not implemented.
- **Gemini's free tier is rate limited.** Heavy testing exhausts it and summaries
  return `429`. The system degrades correctly — the row is marked `FAILED`, the
  doctor still sees the patient's own words, and `/api/cron/summaries` retries once
  quota returns.
- **JWT sessions cannot be revoked** before expiry, so a role change takes up to 8
  hours to take effect. Mitigated by the short `maxAge`; a `tokenVersion` column
  checked from cache is the scale-up path.
- **Registration reveals whether an email exists** (it must, to be usable). The real
  fix is to always return `202` and move the answer into the email inbox, which needs
  the verification flow.
- **No reschedule flow.** Cancel and rebook — cancellation is implemented and frees
  the slot immediately, because the unique index is partial.
- **Last-write-wins on concurrent schedule edits.** Two admins editing one doctor's
  week simultaneously need optimistic locking via a version column.
- **Single light theme.** The app pins `color-scheme: light` rather than
  half-supporting dark mode, which would mean auditing every colour class.
- **Emails are marked `SENT` when SMTP accepts them,** which is not the same as
  delivery. A bounce arrives asynchronously and is not currently fed back into the
  notification row.

---

## Further reading

- [`docs/DESIGN_DECISIONS.md`](docs/DESIGN_DECISIONS.md) — 39 decisions with
  alternatives considered and trade-offs accepted.
- [`docs/SYSTEM_DESIGN.md`](docs/SYSTEM_DESIGN.md) — the 800-word write-up.
- [`docs/LEARNING_LOG.md`](docs/LEARNING_LOG.md) — build log, including bugs found and
  how they were diagnosed.
