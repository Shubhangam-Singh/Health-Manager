# Technical deep dive — Health Manager

Everything in this system, why it is built the way it is, and what to say when
someone pushes back. Written to be read end to end before an interview.

**Rule for using this document:** for every decision, know three things — what you
did, what you rejected, and what it cost you. An answer without a trade-off sounds
rehearsed. An answer with one sounds like you built it.

---

## Contents

1. [The 60-second pitch](#1-the-60-second-pitch)
2. [Stack, and why each piece](#2-stack-and-why-each-piece)
3. [Architecture](#3-architecture)
4. [Authentication and authorisation](#4-authentication-and-authorisation)
5. [Graded problem 1 — double-booking](#5-graded-problem-1--double-booking)
6. [Graded problem 2 — slot holds](#6-graded-problem-2--slot-holds)
7. [Graded problem 3 — doctor leave](#7-graded-problem-3--doctor-leave)
8. [Graded problem 4 — notification reliability](#8-graded-problem-4--notification-reliability)
9. [Time, timezones and slot generation](#9-time-timezones-and-slot-generation)
10. [LLM integration and failure handling](#10-llm-integration-and-failure-handling)
11. [Google Calendar and OAuth 2.0](#11-google-calendar-and-oauth-20)
12. [Database schema](#12-database-schema)
13. [Testing strategy](#13-testing-strategy)
14. [Deployment and operations](#14-deployment-and-operations)
15. [Bugs I hit and how I diagnosed them](#15-bugs-i-hit-and-how-i-diagnosed-them)
16. [Interview questions with model answers](#16-interview-questions-with-model-answers)
17. [Scaling and what I would change](#17-scaling-and-what-i-would-change)

---

## 1. The 60-second pitch

> A clinic appointment platform with three portals. Patients search doctors by
> specialisation, hold a slot, describe symptoms, and confirm. An LLM turns those
> symptoms into a triage summary with an urgency level for the doctor before the
> visit, and a plain-English summary for the patient after it. Both sides get email
> and optional Google Calendar sync.
>
> The interesting part is not the CRUD. Four problems carry the design:
> double-booking under concurrency, slot holds, doctor-leave cascades, and
> notification reliability. **Every one of them is solved in the database rather
> than in application code, and every one has a script that proves it.**
>
> The headline number: I deliberately built the naive booking flow first and
> measured it. Ten simultaneous requests for one slot produced **eight confirmed
> bookings**. After the fix, the same test produces exactly one — and still does at
> twenty-five concurrent.

**Scale of the build:** 16 models, 14 migrations, 24 API routes, 17 pages,
18 services, 52 unit tests, 11 proof scripts, 63 commits.

---

## 2. Stack, and why each piece

| Layer | Choice | The reason to give |
|---|---|---|
| Framework | Next.js 15, App Router, TypeScript | One deployment, one language. A route handler is `Request` in, `Response` out — the same shape as an Express controller. |
| Database | PostgreSQL (Neon) | The concurrency requirements need real transactions and unique constraints. This is the deciding factor, not familiarity. |
| ORM | Prisma 7 | Type-safe queries and readable migrations. Its limits are known and worked around deliberately. |
| Auth | Auth.js v5, Credentials, JWT | Role-based access is a hard requirement; JWT avoids a database read per request. |
| Email | Nodemailer + Gmail SMTP | Free, instant, no domain verification wait. Behind an interface so the provider is swappable. |
| LLM | Google Gemini | Free tier, JSON mode, fast. |
| Calendar | `googleapis`, separate OAuth flow | Login and calendar authorisation are different grants. |
| Jobs | `/api/cron/*` + cron-job.org | Vercel Hobby cron fires once daily, which is useless for retries. |
| Deploy | Vercel + Neon | Free, zero config. |

### Why Postgres and not MongoDB

This is the question, and the answer is not "I prefer SQL".

> The core requirement is *"prevent double-booking and handle simultaneous booking
> attempts safely"*. I need a **partial unique index** — unique on
> `(doctorId, startAt)` but only for live appointments, so a cancelled one does not
> block its slot forever. Postgres gives me that as a single atomic guarantee.
>
> The data is also deeply relational — appointments join to doctors, patients,
> symptom forms, summaries, prescriptions and calendar events. Six of my sixteen
> tables exist purely as one-to-one extensions of `Appointment`.

### Why Prisma 7 specifically, and what surprised me

Prisma 7 **removed the Rust query engine**. The client now talks to Postgres through
a normal Node driver via a driver adapter:

```ts
new PrismaClient({ adapter: new PrismaPg({ connectionString }) })
```

Upside worth stating: no native binary means smaller serverless bundles and faster
cold starts. Two things caught me out — `new PrismaClient({ datasourceUrl })` no
longer exists, and the connection string moved from `schema.prisma` into
`prisma.config.ts`.

---

## 3. Architecture

### Thin API, fat services

Every route handler does exactly four things: parse input, authorise, call a
service, shape a response. All domain logic lives in `src/server/services/` as plain
functions that never touch `Request` or `NextResponse`.

```
src/
  app/
    (auth)/login, register      route group — shared layout, no URL segment
    patient/ doctor/ admin/     real segments; middleware matches on prefix
    api/**/route.ts             thin handlers
    api/cron/*                  guarded by CRON_SECRET
  server/
    services/                   ALL business logic
      *.core.ts                 PURE — zero imports, unit-tested
    llm/                        client, versioned prompts, zod schemas
    lib/                        prisma, mailer, google-calendar, errors, guards
    validation/                 zod input schemas
  components/                   client islands only
```

**Why it earns its keep here, concretely:** booking logic has three callers — the
patient endpoint, the admin leave-cancellation flow, and the cron worker. Logic
embedded in an HTTP handler can only be reached by making an HTTP request, so the
server would end up calling its own endpoint, or the logic would be copy-pasted and
drift.

> *"Domain logic is framework-agnostic. Porting to Express or Nest would mean
> rewriting the controller layer only."*

### Functional core, imperative shell

Three modules import **nothing at all**: `slot.core.ts`, `notification.core.ts`,
`reminder.core.ts`. All the logic worth testing lives there and runs without a
database; the surrounding services do the I/O.

**This was not a stylistic choice — it was enforced by a failure.** My first version
kept the pure slot function and its database wrapper in one file. Every test
immediately failed with `Cannot find package '@/server'`, because Node has no idea
what the `@/` alias means. The comment in that file *claimed* "functional core,
imperative shell" while the code did no such thing.

> **A module with zero imports cannot accidentally acquire a dependency, and the
> test suite fails loudly the moment someone adds one.**

### Server Components by default

Read-only pages call services directly during render — no API round trip, no loading
state, no client bundle. `/patient/doctors` ships **170 bytes** of JavaScript while
providing search, filter chips and navigation, because every interactive-looking
element is a plain `<form>` or `<Link>`.

Only genuinely interactive pieces are client components: `SlotPicker`,
`SymptomFormCard`, `VisitNotesForm`, `ThemeToggle`.

**The distinction to state precisely:** a Server Component ships **zero** JavaScript.
A Client Component runs **twice** — once on the server to produce HTML, once in the
browser on hydration. "Client Component" means *also* runs in the browser, not
*only*. That is why anything non-deterministic during render (`new Date()`,
`Math.random()`) causes a hydration mismatch, and why timestamps live in Server
Components.

---

## 4. Authentication and authorisation

### Sessions vs JWTs

A database session is a cloakroom ticket — meaningless alone, the server holds the
data, and logging out means deleting a row. A JWT carries the data itself and is
verified by signature, so no storage and no database read per request.

I chose JWT with an **8-hour** `maxAge`, and `role` is copied into the token so
middleware can authorise `/admin/*` without touching Postgres.

**The honest weakness, which you should volunteer:**

> A JWT **cannot be revoked**. There is no row to delete, so a stolen token stays
> valid until it expires, and a role change does not take effect until the token
> refreshes. That is why `maxAge` is 8 hours rather than the common 30 days.

**One precise detail most candidates get wrong:** Auth.js v5 issues a **JWE**, not a
plain JWS. I decoded the cookie — it has **five** segments with a header of
`{"alg":"dir","enc":"A256CBC-HS512"}`. The payload is **encrypted**, not merely
base64-encoded. The usual line "never put anything sensitive in a JWT because anyone
can read it" does not describe this setup, though it is still a bearer credential.

### Three layers of authorisation

**1. Middleware** guards page navigation by role. It runs on the **Edge runtime**,
which has no Node APIs — no filesystem, no TCP sockets, so **no Prisma and no
bcryptjs**.

This forced the split config, and I only discovered it by trying the obvious thing
first. Importing `@/auth` into middleware produced a build error with an import
trace that reads like a proof:

```
node:crypto
  ← @prisma/client/runtime
    ← src/generated/prisma/client.ts
      ← src/server/services/auth.service.ts
        ← src/auth.ts          ← middleware imported this
```

The fix rests on one insight: **verifying a JWT needs only the secret, not the
database.** Signing in needs Prisma and bcrypt; checking an already-issued token does
not. So `auth.config.ts` holds the edge-safe parts with `providers: []`, and
`auth.ts` adds the Credentials provider and runs only in Node.

**2. `requireRole()` in every API route.** Middleware never runs for `/api/*`, and I
proved why this matters: I wrote an "admin-only" endpoint with no guard, and a
request with **no cookie at all** returned **200 and the data**.

> **Middleware guards navigation. It is not a security boundary. An attacker does
> not browse to `/admin/doctors` — they curl `POST /api/doctors`.**

**3. Ownership in the query.** This is the layer that matters most, and the one that
distinguishes a good answer:

```ts
// FRAGILE — one early return above this and the check is gone
const appt = await prisma.appointment.findUnique({ where: { id } });
if (appt.doctorId !== mine) throw ...

// SAFE — ownership is part of the query
const appt = await prisma.appointment.findFirst({ where: { id, doctorId: mine } });
```

Authentication says *who you are*. Role authorisation says *what kind of thing you
may do*. **Ownership says which rows** — and that is where healthcare systems
actually leak, because the caller is fully authenticated and correctly roled and
still should not see that record.

Encoding it in the `WHERE` clause also produces the right response for free: a row
that does not match is indistinguishable from one that does not exist, so the caller
gets **404 rather than 403** — and a 403 would confirm the record is real.

### Password handling

- **bcrypt at cost 10**, roughly 100 ms. Deliberately slow: invisible on login,
  prohibitive for brute force. Fast hashes like SHA-256 are the wrong tool — a GPU
  does billions per second.
- **Salt demonstrated, not asserted.** I registered two users with the identical
  password and read the rows back — completely different hashes. The salt lives in
  plain sight inside the hash string, which is fine: a salt is not a secret, its job
  is uniqueness, so rainbow tables are useless.
- **Passwords capped at 72 bytes**, because bcrypt *silently truncates* there.
  Without the cap, a 200-character passphrase and its first 72 characters hash
  identically and both authenticate.
- **`role` is never read from input.** `data: { ...input }` would let anyone POST
  `role: "ADMIN"` — that is **mass assignment**, and in an app where role is the
  authorisation boundary it is full privilege escalation from an unauthenticated
  endpoint. Verified with curl: a request asking for ADMIN produced a PATIENT row.

### Timing attacks

Identical error messages are not enough. Without a defence, "no such user" returns
after one indexed lookup (~5 ms) while "wrong password" pays for bcrypt (~170 ms).
That 30× gap is a working **account enumeration oracle**.

The fix: when no user is found, still run `bcrypt.compare` against a `DUMMY_HASH` of
a random string, so both paths do identical work. **Measured:** wrong password
176/171 ms, nonexistent user 174/174 ms — a 2 ms spread that is just noise.

---

## 5. Graded problem 1 — double-booking

### The bug, built on purpose

The obvious booking flow is: read availability, check the slot is free, insert.

```
Patient A:  SELECT → "free" ─────────┐
Patient B:      SELECT → "free" ──┐  │
Patient A:                        │  └─► INSERT ✓
Patient B:                        └────► INSERT ✓   ← both booked
```

Between the read and the write there is a gap of real milliseconds. This is
**TOCTOU** — time of check to time of use. The check was truthful when made and
**stale by the time it was used**.

**No amount of application code closes it.** You can re-check just before inserting,
which only narrows the window. The gap is *between* statements, not inside one.

**Measured, not theorised.** `scripts/race-test.ts` fires N simultaneous requests:

```
  HTTP 201 × 8
  HTTP 409 × 2
  rows in the database for that slot: 8
```

Eight different patients booked the same twenty-minute appointment. The creation
timestamps span **51 milliseconds** — 01:31:57.783 through 01:31:57.834. That number
*is* the race window.

The two that got 409 were simply slow enough that a row existed by the time they
checked. That is the naive code "working", and it is luck.

### The fix

**Only the database can settle this, because only the database sees every request.**
On serverless the Node process may be one of several, each with its own memory — a
JavaScript lock or a "currently booking" set is invisible to the others.

Prisma cannot express a partial unique index, so the migration is hand-written SQL:

```sql
CREATE UNIQUE INDEX appointment_slot_unique
  ON "Appointment" ("doctorId", "startAt")
  WHERE status IN ('PENDING', 'CONFIRMED');
```

Postgres serialises inserts on that key and rejects the loser with SQLSTATE 23505,
which Prisma surfaces as `P2002`, which I map to **409**.

### Why partial — the `WHERE` clause

A plain unique index says *"this doctor can have at most one appointment ever at this
time"*, cancelled ones included. Cancel Monday 09:00 and that slot becomes
**permanently unbookable**, because the cancelled row still occupies the key.

**Proved both directions:** inserting a second live row for a booked slot was refused
with `23505: appointment_slot_unique`. After cancelling, the identical slot was
booked again successfully, leaving 1 CONFIRMED and 1 CANCELLED row for the same time.
History preserved, slot reusable.

### Why not `SELECT ... FOR UPDATE`

This is the follow-up, and the crux is subtle:

> Pessimistic locking locks rows that **exist**. The row I am protecting against is
> the one **nobody has inserted yet** — there is nothing to lock. Making it work
> would mean locking the doctor row or taking an advisory lock on a hashed key,
> which serialises *every* booking for that doctor and holds a transaction open
> across the whole request, to prevent a conflict that is rare.
>
> I chose optimistic concurrency: assume success, verify at commit, pay only when
> there is an actual conflict. **Trade-off accepted:** the loser only finds out at
> write time, so the UI must handle a 409 at the final step — which is exactly what
> the slot hold exists to make rare.

### The data-repair lesson

Postgres **refused to create the index**:

```
could not create unique index "appointment_slot_unique"
Key ("doctorId","startAt")=(…, 2026-08-24 03:30:00) is duplicated.
```

You cannot add a constraint to a table whose data already violates it. So the
migration repairs first, in the same transaction:

```sql
WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (
    PARTITION BY "doctorId", "startAt" ORDER BY "createdAt" ASC, id ASC) AS rn
  FROM "Appointment" WHERE status IN ('PENDING','CONFIRMED')
)
UPDATE "Appointment" a SET status='CANCELLED', "cancelReason"='ADMIN', "cancelledAt"=NOW()
  FROM ranked r WHERE a.id = r.id AND r.rn > 1;
```

First come, first served. Losers are **CANCELLED, not deleted** — an appointment is a
medical record and those patients still need notifying.

> **Generalises:** adding a constraint to a populated table is always two problems —
> the constraint, and the data that predates it. The second is usually harder.

### Result

| | Before | After |
|---|---|---|
| 10 concurrent | **8 × 201** | **1 × 201, 9 × 409** |
| 25 concurrent | — | **1 × 201, 24 × 409** |

---

## 6. Graded problem 2 — slot holds

### The problem is UX, not correctness

A patient picks 10:00, spends two or three minutes on the symptom form, presses
Confirm, and is told the slot was taken. They typed all of that for nothing, and the
system behaved **correctly**. That is the worst kind of correct.

### The design

Selecting a slot writes a `SlotHold` row with `UNIQUE(doctorId, startAt)` and a
ten-minute `expiresAt`. Availability excludes live holds. Confirming converts the
hold into an appointment inside one transaction.

### Why Postgres and not Redis — the question they will ask

> Redis with a TTL is the textbook answer and genuinely good: automatic expiry, very
> fast. I rejected it for one specific reason — it puts the hold and the appointment
> in **different systems**, so converting one into the other could no longer be a
> single atomic transaction. That reintroduces the exact failure the design removes:
> a hold released with no appointment created, or an appointment created against a
> hold someone else already took.
>
> Postgres gives the same exclusivity guarantee — a unique constraint — inside the
> same transaction as the booking, with no new infrastructure.
>
> **Trade-off accepted:** Postgres has no TTL, so expiry is mine to implement.

### The expiry trap

**A row whose `expiresAt` has passed is still a row, and still occupies the unique
key.** An expired hold nobody deletes locks that slot forever.

Handled twice over:

1. **Lazily** inside `createHold` — delete any expired hold on the slot being claimed
2. **A cron sweep** — because lazy expiry only reclaims a slot someone *retries*; a
   slot nobody retries would stay invisible indefinitely

The read path filters by `expiresAt > now` rather than deleting, because a GET that
mutates is surprising and would take a write lock on an availability check.

### Two details worth mentioning

**One live hold per patient.** Creating a hold deletes the patient's previous one.
That matches the interaction (choosing a new time abandons the old) *and* stops one
account holding every slot a doctor has — a denial of service needing no privileges.

**Re-holding your own slot returns the existing hold**, not a 409. A double-click
must not be an error.

**Contrast to draw:** `Appointment` uses a **partial** unique index because cancelled
rows are kept forever as medical records. `SlotHold` uses a **plain** one because a
hold is ephemeral and deleted outright, so nothing lingers in the key.

---

## 7. Graded problem 3 — doctor leave

### Detection is separate from mutation

Marking a doctor on leave cancels other people's appointments. That is destructive
and irreversible from the patient's point of view, so:

- `GET .../leave?date=` — a **dry run**. Returns exactly who is affected, with names
  and times, and changes nothing.
- `POST` with `confirm: false` (**the default**) — same report, still no writes.
- `POST` with `confirm: true` — applies it.

`confirm` defaults to false so the destructive path is never the accidental one.

### One transaction

On confirm: create the `LeaveDay` → cancel each affected appointment with reason
`DOCTOR_LEAVE` → queue a notification per patient → queue a summary for the doctor →
mark the calendar events for deletion. **No email sent, no calendar API called.**

Three alternative slots are computed **before** the transaction opens, because that
involves several reads and a transaction should stay short.

### The timezone subtlety

A leave day is a **calendar date in the clinic's zone**, not a UTC day. It is
converted to the UTC window that day actually occupies, so appointments near midnight
are neither missed nor wrongly swept in.

### Verified

```
1. booked with Dr Anita Rao on 2026-08-25 → 201
2. dry run: 1 appointment(s) would be cancelled
     nothing changed yet — still CONFIRMED: 1 ✅
3. confirmed → 201, cancelled 1, 3 alternatives suggested
     appointment now: CANCELLED / DOCTOR_LEAVE ✅
4. notifications queued: 2
5. slots on that date now: 0 (leave day) ✅
```

---

## 8. Graded problem 4 — notification reliability

### The golden rule

> **Never do network I/O inside a database transaction.**

Send email inside the booking transaction and a mail server hiccup **rolls back a
valid appointment**. A hang holds a database connection open for its duration — on a
pooled free tier that is a slow-motion outage.

Sending *after* commit without recording intent is no better: a crash between the two
loses the notification with nothing to show it was ever owed.

### The outbox pattern

The business transaction writes a `Notification` row with `status = PENDING`. A cron
worker picks up due rows and delivers them.

**Retry schedule: 1m → 5m → 15m → 1h → 6h**, then `FAILED`. Total **441 minutes** —
long enough to ride out a provider outage, short enough that a permanently bad
address is flagged the same working day.

Failures are marked **FAILED, never deleted**, so an operator can see what was never
delivered. An invisible failure is worse than a visible one.

### Idempotency

Every notification carries a deterministic key:

```
booking-confirmed:{appointmentId}:patient
leave-cancel:{appointmentId}
appt-reminder:{appointmentId}:patient
```

The column is `@unique`, and inserts use `skipDuplicates`. **A retried business
operation reuses the key and the insert is skipped rather than duplicated.**

**Proved it:** the appointment-reminder job ran twice, attempted 2 inserts each time,
and the database contains exactly **2** rows. That is why it can run every five
minutes for a whole day without spamming anyone — the unique index does the
deduplication, not a "already reminded" flag I would have to remember to set.

### Payload captured at write time

The row stores everything the worker needs to render the message, rather than
re-querying at send time. A later edit cannot change the contents of an email that
was already queued.

### The cron endpoints must be guarded

```ts
const provided = bearer ?? request.headers.get("x-cron-secret");
if (!provided || provided !== expected) throw new AppError("UNAUTHORIZED", ...);
```

> An unguarded cron endpoint is a **public URL that sends email**. Anyone who finds
> it can trigger delivery repeatedly — an open relay for spam, billed to you and
> damaging your sending reputation.

### The recovery story worth telling

Mid-build my Gmail app password was wrong by one character (15 instead of 16). Every
send failed with `535 Bad Credentials`. The rows went to `PENDING` with the error
recorded and backoff scheduled. Once I fixed the password, the next worker run
delivered **all six**, and the final state was `SENT=36, PENDING=0, FAILED=0`.

> **Nothing was lost to a config error, and no code changed to recover.** That is
> what the outbox buys you.

### Proof the scheduler runs unattended

I queued two notifications on production at 20:17 and did not touch the endpoint.
They were delivered at **14:50 and 14:55 UTC — exactly the five-minute cron ticks.**

---

## 9. Time, timezones and slot generation

### A working hour is not an instant

`WorkingHour` stores `dayOfWeek` (0–6) and `startMinute`/`endMinute` as **minutes
since midnight** in clinic-local time. `540` = 09:00.

> A working hour is **not a point in time** — it is a recurring wall-clock time.
> "The clinic opens at 9" is true every week regardless of date or daylight saving.
> Storing it as a `DateTime` forces an arbitrary date onto it and invites timezone
> conversion that must not happen.

Integers also make slot generation arithmetic rather than parsing: `start`,
`start + duration`, repeat.

`(doctorId, dayOfWeek)` is deliberately **not unique**, so split shifts work — a
doctor working 09:00–13:00 and 17:00–20:00 on a Tuesday is two rows.

### The bridge: `DoctorProfile.timezone`

`Appointment.startAt` is a UTC instant. Converting between the two needs the clinic's
zone, and **the schema originally could not answer that** — the gap was found by
asking "how do you turn 540 into a bookable instant?"

### Two-pass conversion

```ts
const guess = Date.UTC(year, month - 1, day, h, m);
const firstOffset  = zoneOffsetMinutes(new Date(guess), timeZone);
let utc = guess - firstOffset * 60000;
const secondOffset = zoneOffsetMinutes(new Date(utc), timeZone);
if (secondOffset !== firstOffset) utc = guess - secondOffset * 60000;
```

**Why two passes:** the offset depends on the instant, and the instant is what we are
solving for. One pass is wrong near a DST boundary.

**Tested against reality:** the identical schedule row for "Monday 09:00" in New York
resolves to **13:00 UTC in July** and **14:00 UTC in November**. Also tested
Asia/Kathmandu at **UTC+5:45**, which catches any code assuming whole-hour offsets.

### The pure function

```ts
generateSlots({ date, timezone, slotDurationMin, workingHours,
                leaveDates, busyStarts, now, minNoticeMinutes })
```

**`now` is a parameter, not `Date.now()`.** A function that reads the clock internally
cannot be tested — any assertion about "past slots are excluded" passes today and
fails tomorrow.

Excludes: leave days, booked appointments, live holds, past times, a 30-minute
minimum notice, and slots that would **overrun closing time** — the loop tests the
slot's *end*, so 09:00–10:00 with 45-minute slots yields one slot, not two.

### Everything is `timestamptz`

Instant columns were originally `timestamp without time zone`. Prisma read them back
as UTC while raw `pg` read them as local — a **330-minute discrepancy** on an IST
machine. Migrated all instants to `timestamptz`. `LeaveDay.date` stays a plain
`date`, because "on leave 12 March" must not shift by timezone.

---

## 10. LLM integration and failure handling

### The client

- **30-second timeout via `AbortController`.** Without it, `fetch` can hang far
  longer than any nominal timeout.
- **One retry, and only for 5xx / 429.** A 4xx means *our* request is wrong, so
  retrying sends the same wrong request.
- **A missing API key is a config error and is never retried.**
- Returns a **discriminated union rather than throwing**, because "the model did not
  answer" is a normal outcome the caller must handle, not an exception.
- `temperature: 0.2` — this is extraction, not creative writing.

### Prompts are versioned constants

Every summary stores its `promptVersion` (`pre-visit@v1`). When output quality
changes you can tell whether **the model moved or the prompt did**.

The brief supplied a baseline prompt. I kept it and improved it in eight documented
ways: an explicit role; an exact JSON schema with key names; a "no markdown fences"
instruction (a ```` ```json ```` wrapper is the most common parse failure); enum
values spelled exactly as stored so no normalisation is needed; length caps;
a do-not-diagnose safety boundary; structured context fields rather than prose alone;
and an **anti-fabrication rule**, because a model asked to be helpful will otherwise
supply plausible detail the patient never reported.

For the post-visit prompt, the single most important instruction:

> **The medication schedule is passed in already computed.** The model rephrases it;
> it never calculates timings. Dose arithmetic happens in unit-tested code, not in a
> language model.

### Validation

Prompting for a shape is a **request, not a guarantee**. `parseModelJson` strips code
fences and surrounding prose, then zod validates. **12 unit tests** cover real failure
modes: fences, chatty preamble, `"high"` instead of `"HIGH"`, invented enum values,
missing fields, truncated JSON, an apology instead of JSON, empty arrays, extra keys.

Extra keys are **stripped**; four questions where three were asked is **accepted** —
rejecting a good summary over an off-by-one serves nobody. Enum casing is **not**
forgiven, because silently normalising hides prompt drift.

### Three states, and generation never blocks booking

`PENDING | READY | FAILED`. The `PENDING` row is created **inside the booking
transaction**, so a doctor can distinguish "not ready yet" from "nobody ever tried".

Generation runs in `after()`, once the response is flushed. **Measured: booking
returned in 1062 ms against a 30-second model budget.** With no API key at all,
booking still returns 201.

### Graceful degradation in the UI

Three states, three renderings, never a blank card. **The patient's own words are
always rendered and never depend on the LLM** — so a doctor with no summary is
exactly as well-informed as one at a clinic with no AI at all.

> The AI is an **enhancement over data that is already sufficient**, not a
> dependency.

### `rawModelOutput` earned its place

A validation error alone says "the JSON was bad". The stored raw output said *"the
JSON was bad **because it stopped mid-sentence**"* — which pointed at a token limit,
not the prompt. **Diagnosis took one query.**

### The quota trap

Production summaries were failing with 429. The quota detail named it exactly:

```
GenerateRequestsPerDayPerProjectPerModel-FreeTier   limit = 20
```

`gemini-3.6-flash` allows **twenty generations per day** on the free tier — one demo
session exhausts it. Switched to `gemini-2.5-flash`, which has a far larger allowance
and, being a non-reasoning model, spends its whole output budget on the answer rather
than on internal thinking.

---

## 11. Google Calendar and OAuth 2.0

### The authorisation code flow, narrated

1. User clicks **Connect** → we redirect to Google's consent screen with our client
   ID, the scopes, a redirect URI, and a `state` parameter.
2. User consents → Google redirects back to our `redirect_uri` with a **one-time
   code**.
3. Our **server** exchanges that code, plus the client secret, for an **access
   token** and a **refresh token**.
4. The access token expires in about an hour. The refresh token mints new ones
   indefinitely until revoked.

**We never see the user's Google password.** That is the entire point of OAuth.

### Two parameters that matter

```ts
generateAuthUrl({ access_type: "offline", prompt: "consent", scope, state })
```

- **`access_type: "offline"`** is what makes Google return a **refresh token**.
  Without it you get an access token that dies in an hour and can never be renewed
  without the user present.
- **`prompt: "consent"`** forces the consent screen even on re-authorisation, because
  Google returns a refresh token **only on first consent** unless you ask again — the
  classic "worked in dev, broke in production" failure.

### `state` is a security control

It carries the user id and is **verified on return**. Without that check, an attacker
could trick a victim into linking the **attacker's** Google account to the victim's
profile.

### Why this is separate from login

> Signing in proves **identity**. Connecting a calendar delegates a **capability**.
> Different consent, different lifetime, different revocation. A user can disconnect
> their calendar and keep their account, and most users never connect one at all.

### Calendar sync is queued work, not a call

A `CalendarEvent` row is written **inside the booking transaction** with status
`PENDING`; a worker creates the real event afterwards. That is what guarantees the
brief's requirement that a **Calendar failure must never fail a booking**. Google
returning 500 leaves a PENDING row to retry, not a patient without an appointment.

`UNIQUE(appointmentId, userId)` makes retries idempotent — one event per person per
appointment, however many times the worker runs.

**Reschedule PATCHES rather than deletes and recreates**, which preserves the
attendee's own reminders and any notes they added.

A user who never connected a calendar is **SKIPPED**, not retried forever.

### Scopes

Only two: `calendar.events` and `userinfo.email`. `calendar.events` covers creating
and deleting the events we created — it does **not** grant read access to the rest of
someone's calendar. Asking for less is easier to justify on the consent screen.

### The refresh token is the high-value secret

It can mint access tokens indefinitely. Stored in `GoogleAccount`. **Honest
limitation:** stored unencrypted; in production it belongs in a KMS or behind
`pgcrypto`. Documented rather than hidden.

---

## 12. Database schema

16 models, 14 migrations.

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

### Decisions to defend

**One `User` table for all roles**, discriminated by a `Role` enum. One login flow,
one namespace for email uniqueness (the same person cannot register as patient *and*
doctor with one address), one target for foreign keys. Role-specific data lives in
`DoctorProfile`, and its **absence** is itself the signal that a user is not a doctor.

**`cuid()` not auto-increment.** Sequential ids are enumerable: `/appointments/41`
implies `42` exists, so any authorisation gap becomes a walkable index of patient
records. That is an **IDOR** vulnerability, and it matters more in healthcare than
almost anywhere.

**`onDelete` chosen per relation.** `Cascade` for owned configuration — delete a
doctor and their working hours are meaningless. **`Restrict` for appointments** —
they are medical records that outlive employment, so Postgres refuses the delete
instead. Verified: deleting a patient with appointments was blocked by `23001`.

**Working hours as rows, not JSON.** Postgres cannot index inside JSON usefully,
cannot constrain it, and cannot answer "which cardiologists work Tuesday morning?" in
SQL — that filtering moves into JavaScript, fetching every doctor to find three.

**Prescriptions are structured**, not a free-text box, because reminders must be
*computed* from frequency and duration. You cannot compute a schedule from "twice a
day for a week" written in prose.

**Reminders are materialised rows**, not computed on read, so each dose can be
queued, retried, cancelled and audited individually — and a later prescription edit
cannot silently rewrite history.

### Constraints the ORM cannot express

```sql
CHECK ("dayOfWeek" >= 0 AND "dayOfWeek" <= 6)
CHECK ("startMinute" >= 0 AND "endMinute" <= 1440 AND "startMinute" < "endMinute")
CHECK ("slotDurationMin" > 0)
```

> zod validates the same rules, but zod guards exactly **one path**. A seed script, a
> manual fix in the SQL editor, or a future endpoint written in a hurry all bypass
> it. A CHECK constraint binds every writer, forever.

`slotDurationMin > 0` is not decorative — a zero duration makes the slot-generation
loop fail to terminate. The constraint turns a potential hang into a rejected write.

### Pooled vs direct connections

Two URLs for one database:

- **`DATABASE_URL`** — pooled endpoint, used at runtime. Serverless opens many
  short-lived connections against a hard `max_connections`; PgBouncer multiplexes
  them.
- **`DIRECT_URL`** — direct endpoint, used by the Prisma CLI for migrations, because
  a transaction-mode pooler cannot hold the session state that advisory locks and
  `CREATE TYPE` need.

> **The pooled endpoint is about connection scarcity at runtime. The direct endpoint
> is about session capability at migration time.**

---

## 13. Testing strategy

### 52 unit tests, zero test dependencies

`node --test` runs `.ts` files natively on Node 24 — no vitest, no jest, no ts-node.

Coverage: slot generation (including four DST cases and a UTC+5:45 zone), database
error translation, LLM output validation, retry backoff, medication schedules.

**They are fast and deterministic because the code under test is pure.**

### 11 proof scripts

Unit tests prove logic. These prove *behaviour* against a running system:

| Script | Proves |
|---|---|
| `race-test.ts` | N concurrent bookings → exactly one wins |
| `hold-test.ts` | hold race, hidden slot, release, expiry reclaim |
| `leave-conflict-test.ts` | dry run changes nothing, confirm cascades |
| `notification-retry-test.ts` | backoff 5/15/60/360 then FAILED |
| `post-visit-test.ts` | notes → 58 reminders → summary |
| `cancel-test.ts` | 9 checks including cross-user 404 |
| `reschedule-test.ts` | 12 checks including records kept |
| `e2e-test.ts` | the whole journey, 16 assertions |

They run against **localhost or production** via `RACE_BASE_URL`.

### Node's TypeScript limits, learned the hard way

Node **strips** types, it does not compile them:

1. Imports need explicit extensions — `./errors` had to become `./errors.ts`
2. **Parameter properties** (`constructor(public readonly code: ...)`) need real code
   generation and fail with `ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX`. Same for `enum`,
   namespaces and decorators.

### Verify by exit code, not by grep

A lesson I learned by getting it wrong: I was checking builds with
`npm run build | grep -E 'Error:'`. The real failure read `Error occurred
prerendering` — **no colon** — so a broken build looked clean, while `Compiled
successfully` matched because compilation genuinely succeeded before the *export*
step failed.

> **A check that can pass on a broken build is worse than no check.**

---

## 14. Deployment and operations

**Vercel + Neon + cron-job.org.** `postinstall: prisma generate` runs automatically
during install so the client is built on every deploy.

### Build-time vs runtime environment variables

- `NEXT_PUBLIC_*` is **inlined into the browser bundle at build time**. Changing it
  does nothing until a rebuild, and rotating a leaked one does not retract it —
  old bundles sit in CDN and browser caches.
- Everything else is read at runtime via `process.env`.
- On Vercel both need a redeploy, because env vars bind to a deployment.

**The `NEXT_PUBLIC_` trap, proved rather than assumed:** I built the app with two
variables and grepped `.next/static`. The shipped chunk contained
`String("printed-on-menu-PUBLIC-x9y8z7")` — the variable name **compiled away**,
replaced by a string literal. The server-only one was still `String(r.env.X)`, a
lookup resolving to `undefined` in the browser.

> The prefix does not "expose the value to client code". It **publishes** it.

### Why an external scheduler

Vercel's Hobby plan runs cron **once a day**, which is useless for a retry schedule
that must fire every few minutes. cron-job.org calls the guarded endpoints every 5–15
minutes.

### Secret hygiene

`.gitignore` had `.env*`, which silently swallowed **`.env.example`** — a required
deliverable that would never have been committed. Fixed with a negation `!.env.example`
placed *after* the wildcard. Verified with `git check-ignore` in both directions, and
`git log -S` confirms no credential appears in any commit.

---

## 15. Bugs I hit and how I diagnosed them

These are the best interview material you have, because they show method.

| Bug | Symptom | Diagnosis | Lesson |
|---|---|---|---|
| **zod order** | `" a@b.com "` rejected as invalid | curl isolated it: uppercase-no-space → 409, lowercase-with-space → 400 | zod **validates first, transforms after**. Fixed with `.trim().toLowerCase().pipe(z.email())` |
| **Edge runtime** | Middleware 500 | Import trace: `middleware → auth.ts → prisma → node:crypto` | Verifying a JWT needs the secret, not the database |
| **Retired model** | HTTP 404 from Gemini | Google's own error named the replacement | Make the model an env var, not a constant |
| **Truncated JSON** | `Unterminated string at position 121` | Read `rawModelOutput` — cut off mid-sentence | Reasoning models spend output budget on thinking |
| **`timestamp` vs `timestamptz`** | Backoff showed **negative** minutes | Every value off by exactly 330 = IST offset | Prisma read UTC, raw `pg` read local |
| **Suspense** | Vercel build failed on `/_not-found` | `useSearchParams()` in root layout → pulled into a statically prerendered page | And **my grep-based check hid it** |
| **15-char password** | SMTP `535 Bad Credentials` | Gmail app passwords are exactly 16 | Count the characters |
| **Quota** | 429 on every summary | Quota detail named `…PerDay… limit=20` | Read the *detail*, not just the code |

**The method to describe:** reproduce it in isolation, read what the system actually
reports rather than what you assume, and check the boundary between two systems —
almost every one of these lived at a boundary.

---

## 16. Interview questions with model answers

**Q: Two patients click the same slot at the same millisecond. Walk me through it.**

> Both requests read availability and both see it free — that check races and I do
> not try to stop it. Both then insert. Postgres serialises on the partial unique
> index `(doctorId, startAt) WHERE status IN ('PENDING','CONFIRMED')` and rejects one
> with SQLSTATE 23505, which Prisma surfaces as P2002. I map that to 409 with a
> usable message. The database decides who wins, not my code. I measured the naive
> version first: eight of ten concurrent requests succeeded, across a 51 ms window.

**Q: Why partial and not a plain unique index?**

> A plain index would treat a cancelled row as still occupying the slot, so any
> cancelled appointment makes that time permanently unbookable. The `WHERE` clause
> drops non-live statuses out of the index, freeing the slot while preserving the
> record. I proved both directions — a second live booking is refused, and after
> cancelling, the same slot books again.

**Q: Why not `SELECT ... FOR UPDATE`?**

> It locks rows that exist, and the row I am protecting against is the one nobody
> has inserted yet. I would have to lock the doctor row or take an advisory lock,
> which serialises every booking for that doctor and holds a transaction open across
> the request — a real cost for a rare conflict. Optimistic concurrency pays only
> when there is an actual conflict.

**Q: What if the email service is down when someone books?**

> Nothing happens to the booking. The transaction only writes a Notification row
> with status PENDING — no network I/O inside a transaction, ever. A worker delivers
> it afterwards with backoff 1m/5m/15m/1h/6h, then marks FAILED so an operator can
> see it. This is not theoretical: my SMTP password was wrong by one character for a
> while, six sends failed and retried, and when I fixed the password the next run
> delivered all six. No code changed and nothing was lost.

**Q: How do you guarantee a retry doesn't send a duplicate?**

> Every notification has a deterministic `idempotencyKey` like
> `booking-confirmed:<appointmentId>:patient`, and the column is unique. Inserts use
> `skipDuplicates`, so a retried operation reuses the key and inserts nothing. I
> proved it with the reminder job: two runs, two insert attempts each, exactly two
> rows in the database.

**Q: Your slot hold expires while the patient is typing. Then what?**

> They press Confirm and the transaction's first check fails — the hold no longer
> exists or has expired — so they get a 409 with a message saying their hold expired,
> distinct from "that slot is taken", because they did nothing wrong. The UI shows a
> live countdown so it is not a surprise, and it warns at two minutes. To make it
> less bad without extending holds indefinitely, I would let them re-hold the same
> slot in one click if it is still free.

**Q: Explain the OAuth 2.0 authorisation code flow.**

> We redirect the user to Google with our client ID, the scopes, a redirect URI and a
> `state` value. They consent, and Google redirects back with a one-time code. Our
> **server** exchanges that code plus the client secret for an access token and a
> refresh token. We never see their password. `access_type=offline` is what makes
> Google return a refresh token, and `prompt=consent` forces it on re-authorisation,
> because Google only returns one on first consent otherwise. I verify `state`
> matches the signed-in user — without that, an attacker could trick a victim into
> linking the attacker's Google account.

**Q: Where do you store the refresh token, and how would you secure it?**

> In a `GoogleAccount` row, one per user. It is the high-value secret because it can
> mint access tokens indefinitely until revoked. In this build it is stored
> unencrypted, which I have documented as a limitation rather than hidden. In
> production it belongs in a KMS, or encrypted at rest with `pgcrypto` so a database
> dump is not enough to use it.

**Q: What happens if Gemini times out during booking?**

> Nothing visible. Booking commits first and generation runs after the response is
> flushed. Booking returned in 1062 ms against a 30-second model budget. The summary
> row is created PENDING inside the booking transaction, so a failure leaves a FAILED
> row with the error stored, and the doctor's page falls back to the patient's own
> words plus a Regenerate button. I tested it with no API key at all — booking still
> returns 201.

**Q: How do you handle malformed JSON from the LLM?**

> I strip code fences and any prose around the object, parse, then validate with zod.
> Twelve unit tests cover the failure modes models actually produce — fences, chatty
> preambles, lowercase enums, invented enum values, missing fields, truncation, an
> apology instead of JSON. Anything that fails becomes a FAILED row with the raw
> output stored, which is how I diagnosed a truncation as a token-limit problem
> rather than a prompt problem.

**Q: Why Postgres and not MongoDB?**

> The core requirement is preventing double-booking under concurrency, which needs a
> partial unique index and a real transaction. The data is also deeply relational —
> six of my sixteen tables are one-to-one extensions of Appointment.

**Q: What's a server component and why does it matter here?**

> It runs only on the server and ships zero JavaScript. It can query Postgres
> directly during render, so `DATABASE_URL` and API keys never reach the browser and
> there is no request waterfall. My doctor search page ships 170 bytes of JS while
> providing search and navigation. A client component runs twice — server render then
> hydration — which is why anything non-deterministic during render causes a
> hydration mismatch.

**Q: Scale this to 100,000 patients. What breaks first?**

> Connection exhaustion, which is why the app already uses the pooled endpoint. Next
> is the notification worker: it is sequential and batch-capped, which is right for
> Gmail's rate limits but becomes the bottleneck — I would move to a real queue with
> concurrent consumers. Then slot generation, which fetches a day of appointments per
> request; I would cache availability per doctor-day and invalidate on write. The
> booking guarantee itself does not change — a unique index scales with the table.

**Q: What would you do differently with two more weeks?**

> Encrypt refresh tokens at rest. Replace JWT-only sessions with a short-lived token
> plus a revocation denylist in cache, so a demoted doctor loses access immediately
> instead of within eight hours. Move registration to always return 202 and put the
> "already registered" answer in the email inbox, which closes the enumeration leak
> that still exists on that endpoint. Add optimistic locking on doctor schedules,
> because two admins editing one week is currently last-write-wins. And add an
> audit log — in healthcare, who viewed what is itself a requirement.

---

## 17. Scaling and what I would change

**Known limitations, stated honestly** — volunteering these is a strength:

| Limitation | Why it exists | The fix |
|---|---|---|
| Refresh tokens unencrypted | Time | KMS or `pgcrypto` |
| JWT cannot be revoked | Avoids a DB read per request | Short expiry + cached denylist |
| Registration reveals email existence | It must, to be usable | Always 202; answer goes to the inbox |
| `after()` is best-effort | Serverless teardown | Already backstopped by `/api/cron/summaries` |
| Last-write-wins on schedule edits | No version column | Optimistic locking |
| SMTP-accepted ≠ delivered | No bounce handling | Webhook from the provider |
| Single light/dark theme, plain UI | Effort went to concurrency and reliability | — |

**The closing line to have ready:**

> A rough-looking app with bulletproof concurrency is worth more than a polished one
> that double-books. I spent my time on the four problems that actually decide
> whether a clinic can trust the system, and I have a script that proves each one.
