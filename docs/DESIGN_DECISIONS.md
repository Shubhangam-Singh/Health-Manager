# Design Decisions

Every non-obvious choice, the alternatives considered, and the trade-off accepted.
This document is the raw material for the final 800-word system design write-up.

---

## D1 — Next.js full-stack instead of React + separate Express API

**Decision:** single Next.js 15 App Router project serving UI and API from one
codebase.

**Alternatives considered:**

- *React SPA + Express backend.* The conventional split. Two `package.json` files,
  two deploy targets, CORS configuration, and shared TypeScript types either
  duplicated or extracted into a third package.
- *Express-only with server-rendered templates.* Fewer moving parts, but throws away
  the React component model the rest of the UI needs.

**Why chosen:** one repo, one language, one deploy — which matters against a
three-day budget where infrastructure plumbing earns zero marks. Next route
handlers receive a `Request` and return a `Response`, so the backend stays ordinary
Node rather than framework magic.

**Trade-off accepted:** coupling the frontend and backend release cycle, and tying
deployment to a Next-aware host. Mitigated by the thin-API/fat-service rule in
`CLAUDE.md`: all business logic lives in `src/server/services/*` as plain functions
that never touch `req`/`res`, so porting to Express or Nest would mean rewriting
only the controller layer.

---

## D2 — Pinned Next.js 15, not the latest 16

**Decision:** installed Next.js `15.5.23` even though `16.3.1` is the current
`latest` tag.

**Alternatives considered:** track `latest` and get the newest features and fixes.

**Why chosen:** the stack was locked to 15 before work started. Auth.js v5, Prisma
and the `googleapis` integrations all need to work together, and a major-version
bump mid-project risks burning debugging time on ecosystem incompatibilities rather
than on the graded concurrency and notification problems.

**Trade-off accepted:** missing Next 16 improvements, and a future upgrade to
perform. Acceptable for a three-day scope where predictability beats novelty.

---

## D3 — Deferred `git init` to Step 5

**Decision:** scaffolded with `--disable-git` rather than letting `create-next-app`
initialise the repository and make its own first commit.

**Why chosen:** the commit history is itself evidence of how this project was built,
and the first commit should carry the correct author identity. Setting
`user.name`/`user.email` before `git init` guarantees no tool-default or
wrong-identity commit ever enters the history.

**Trade-off accepted:** a few untracked files existing before version control
starts.

---

## D4 — Pinned `outputFileTracingRoot` in `next.config.ts`

**Decision:** explicitly set the workspace root to the project directory.

**Context:** Next infers the project root by walking upward looking for a lockfile.
An unrelated `package-lock.json` in the home directory caused it to select the home
directory as the root.

**Why chosen:** `outputFileTracingRoot` determines which files are bundled into the
deployment artifact. An incorrect root ships the wrong file set — a failure that
appears only at deploy time, not in local development, and is therefore expensive to
diagnose later.

**Trade-off accepted:** none of consequence; one explicit line replaces an
inference that happened to be wrong.

---

## D5 — Server Components as the default; `"use client"` only where forced

**Decision:** every component is a Server Component unless it demonstrably needs the
browser. `"use client"` is added at the smallest possible leaf, never at a page or
layout level.

**Alternatives considered:**

- *Mark pages as client components and fetch via `useEffect`.* The familiar SPA
  pattern, and the path of least resistance coming from plain React.
- *`"use client"` at the layout level.* Convenient, but it drags the entire subtree
  into the browser bundle, since the directive is a boundary that propagates through
  imports.

**Why chosen:** three reasons that matter specifically for this project.

1. **Secrets.** Server Components never reach the browser, so a component may hold
   `DATABASE_URL`, the Gemini API key, or a Google refresh token without exposure.
   In the `useEffect` model every piece of data needs a public API endpoint, which
   widens the attack surface for no benefit.
2. **No request waterfall.** A Server Component queries Postgres directly during
   render. The SPA alternative is: download JS → render empty shell → fetch → render
   again. The doctor's pre-visit view and the patient's slot grid are both read-heavy
   and benefit directly.
3. **Bundle size.** Zero JS for anything non-interactive.

**Trade-off accepted:** a mental model that inverts normal React, and a real
correctness hazard — Client Components render **twice** (once server-side to produce
HTML, once in the browser on hydration). Any non-deterministic value computed during
render differs between the two passes and triggers a hydration mismatch. Practical
rule adopted: **timestamps and randomness are computed in Server Components, or
inside `useEffect`, never during a Client Component's render.**

This decision directly supports the thin-API/fat-service rule in D1: pages read data
through server-side service calls, and API route handlers exist for *mutations* and
for genuine client-side needs, not as a data-plumbing layer for every page.

---

## D6 — Real path segments for portals, route group only for auth

**Decision:** `/patient/*`, `/doctor/*`, `/admin/*` are real directories.
`(auth)` — holding login and register — is the only route group.

**Alternatives considered:**

- *Route groups for all four,* as originally sketched. But a route group contributes
  nothing to the URL, and the middleware in Step 8 authorises by URL prefix. Keeping
  both would mean `(patient)/patient/dashboard/` — the segment named twice.
- *No grouping at all,* with login and register as plain top-level routes. Loses the
  shared centred-card layout, or duplicates it in two files.

**Why chosen:** the URL should encode the role boundary, because that boundary is
what middleware matches on. `/admin/doctors` is self-describing and greppable.
Meanwhile login and register genuinely want a shared shell without a shared prefix —
which is exactly the problem route groups solve.

**Trade-off accepted:** two different organising conventions in one `app/` directory,
which needs a sentence of explanation to a reader. Worth it, because the alternative
is either a doubled folder name or a middleware matcher that cannot see its targets.

---

## D7 — Thin route handlers, fat services

**Decision:** every file under `app/api/**/route.ts` stays under ~25 lines and does
four things only: parse input, authorise, call a service, shape the response. All
domain logic lives in `src/server/services/*.ts` as plain functions that never touch
`Request` or `NextResponse`.

**Alternatives considered:**

- *Logic inside route handlers,* the default Next tutorial style. Fine for a
  single-caller endpoint; wrong here.
- *A full repository/controller/use-case layering.* More ceremony than a three-day
  project can justify, and the extra indirection would not earn marks.

**Why chosen:** booking logic has **three** callers — the patient booking endpoint,
the admin leave-cancellation flow, and the cron worker. Logic embedded in an HTTP
handler can only be reached by making an HTTP request, so the server would end up
calling its own endpoint, or the logic would be copy-pasted and drift. Services are
also directly unit-testable without constructing a fake `Request`, which is what
makes `generateSlots()` testable in Step 12.

**Trade-off accepted:** one extra file per feature, and a layer that looks like
overkill for genuinely trivial endpoints (`health.service.ts` returns a literal).
The consistency is the point — the boundary holds precisely because there are no
exceptions to argue about.

**Interview line:** domain logic is framework-agnostic; porting to Express or Nest
would mean rewriting the controller layer only.

---

## D8 — `cuid()` primary keys instead of auto-incrementing integers

**Decision:** every table uses a string `cuid()` primary key.

**Alternatives considered:** `@default(autoincrement())` integers — smaller, faster
to index, easier to read in logs. UUID v4 — unguessable, but random ordering hurts
B-tree index locality on insert.

**Why chosen:** sequential integers are enumerable. `/appointments/41` implies
`/appointments/42` exists, and any authorisation gap turns into a walkable index of
every patient record — an IDOR vulnerability with real consequences in a healthcare
context. `cuid()` is collision-resistant and roughly time-ordered, so it keeps
index locality without being guessable.

**Trade-off accepted:** wider keys, therefore larger indexes and slightly slower
joins. Irrelevant at this scale, and defence-in-depth on object references is worth
more than the bytes.

---

## D9 — One `User` table for all three roles

**Decision:** patients, doctors and admins share a single `User` table
discriminated by a `Role` enum, with role-specific data in satellite tables such as
`DoctorProfile`.

**Alternatives considered:** separate `Patient`, `Doctor` and `Admin` tables. That
duplicates the login flow three times, splits email uniqueness across three
namespaces — so one person could register as both a patient and a doctor with the
same address — and forces every foreign key to answer "which table?" first.

**Why chosen:** one authentication path, one uniqueness constraint on email, one
target for foreign keys. `Appointment.patientId` and `Appointment.doctorId` both
reference `User.id`.

**Trade-off accepted:** the `User` table holds columns irrelevant to some roles, and
"is this user actually a doctor?" becomes a check rather than a guarantee of the type
system. Mitigated by `DoctorProfile` existing only for doctors, so a missing profile
is itself a signal.

---

## D10 — Pooled connection for the app, direct connection for migrations

**Decision:** `.env` holds two URLs for the same Neon database. `DATABASE_URL` points
at the pooled endpoint and is used by the application at runtime. `DIRECT_URL` points
at the direct endpoint and is what `prisma.config.ts` gives the CLI.

**Why chosen:** two independent constraints.

- *Runtime:* serverless functions are short-lived and each cold start wants its own
  connection, while Postgres enforces a hard `max_connections`. Neon's PgBouncer
  multiplexes many client connections onto few server ones. Without it, traffic
  exhausts the pool and requests fail with connection errors under exactly the
  concurrent load this project is graded on.
- *Migrations:* PgBouncer in transaction mode cannot hold session state, so advisory
  locks and `CREATE TYPE` — both of which Prisma migrations use — fail against it.

**Trade-off accepted:** two secrets to manage instead of one, and a real deployment
footgun if the wrong one is set in Vercel. Documented in `.env` itself with the
reason inline, so the distinction is visible where it is used rather than only here.

**Interview line:** the pooled endpoint is about connection *scarcity* at runtime;
the direct endpoint is about session *capability* at migration time.

---

## D11 — Secrets stay server-side; `NEXT_PUBLIC_` is treated as publication

**Decision:** only `NEXT_PUBLIC_APP_URL` carries the public prefix. Every credential
— database URLs, `AUTH_SECRET`, `GEMINI_API_KEY`, Gmail app password, Google OAuth
client secret, `CRON_SECRET` — is server-only, and any code needing them runs in a
Server Component, a route handler, or a service.

**Alternatives considered:** calling the Gemini API directly from the browser, which
is simpler and removes a server hop. It also requires shipping the API key to every
visitor, so it was never viable.

**Why chosen:** verified empirically rather than assumed — building the app and
grepping `.next/static` showed a `NEXT_PUBLIC_` value inlined as a **string literal**
in a downloadable chunk, with the variable name compiled away entirely. The prefix
does not "expose the value to client code"; it *publishes* it.

**Trade-off accepted:** every third-party call needs a server-side route or service,
which is more code than calling the API from the browser. That cost is already paid
by the thin-API/fat-service structure in D7, and it buys rate limiting and auditing
at the same boundary.

**Operational consequence worth stating in an interview:** `NEXT_PUBLIC_` values are
inlined at **build** time, not read at runtime. Changing one in the hosting dashboard
has no effect without a rebuild, and rotating a leaked one does not invalidate
bundles already cached in CDNs and browsers.

---

## D12 — `.env.example` committed via an explicit gitignore negation

**Decision:** `.gitignore` keeps the broad `.env*` wildcard and adds `!.env.example`
immediately after it.

**Context:** the wildcard alone matched the template too, so a required deliverable
would silently never have been committed — the kind of failure noticed only when
someone clones the repository and finds nothing documenting the configuration.

**Alternatives considered:** narrowing the wildcard to `.env` and `.env.local`. That
re-opens the door to a future `.env.production` or `.env.backup` being committed by
accident, which is the failure mode with real consequences.

**Why chosen:** keep the deny-by-default wildcard and carve out the one file
explicitly. Safe by default, with a single visible exception.

**Trade-off accepted:** negation patterns are easy to get wrong — they must follow
the pattern they override, and git cannot re-include a file whose parent directory is
excluded. Verified with `git check-ignore` in both directions rather than assumed.

---

## D13 — bcrypt at cost 10, with the password length capped at 72 bytes

**Decision:** passwords are hashed with bcrypt at cost factor 10. The input schema
rejects anything longer than 72 bytes.

**Alternatives considered:** argon2id, the current recommendation, which resists
GPU and ASIC attacks better through memory-hardness — but it needs a native module,
which is friction on serverless. SHA-256 with a manual salt, which is wrong here:
being fast is the entire problem. Plain SHA-256 unsalted, which is indefensible.

**Why chosen:** bcrypt is pure JavaScript via `bcryptjs`, so it deploys anywhere with
no build step, and it is deliberately slow with a tunable cost. Cost 10 is roughly
100 ms — unnoticeable on login, prohibitive for brute force. The cost is embedded in
the hash string, so it can be raised later without invalidating existing hashes:
old ones keep verifying at their original cost and get re-hashed on next login.

**Why the 72-byte cap matters:** bcrypt *silently truncates* beyond 72 bytes. Without
the cap, a 200-character passphrase and its first 72 characters produce the same
hash and both authenticate — the user believes they have far more entropy than they
do. Rejecting the input is honest; silently ignoring the remainder is not.

**Trade-off accepted:** argon2id would be stronger, and bcryptjs is slower than a
native binding for the same cost. Both acceptable at this scale, and the deployment
simplicity is worth more than the margin.

---

## D14 — Insert first and catch `P2002`, rather than checking then inserting

**Decision:** registration does not query for an existing email before creating the
user. It attempts the insert and translates the unique-constraint violation
(`P2002`) into a `409 CONFLICT` naming the `email` field.

**Alternatives considered:** `findUnique` first, then `create`. It reads more
naturally and gives a friendlier message — and it is **not sufficient on its own**.

**Why chosen:** the check-then-write pattern has a **TOCTOU** window — *time of check
to time of use*. Between the read returning "available" and the insert executing,
another request can claim the same email. The check was true when made and stale when
used. The database constraint has no such window because it is evaluated atomically
as part of the write.

Given the constraint must exist and `P2002` must be handled regardless, the prior read
buys only a marginally nicer path for the common case at the cost of an extra round
trip and the illusion that it provides safety.

**Trade-off accepted:** `P2002` identifies the violated constraint rather than
carrying a human-readable message, so the service maps it explicitly. With several
unique constraints on one table that mapping needs care — inspect
`e.meta.target` to distinguish them.

**This is deliberately the same shape as the booking fix.** `(doctorId, startAt)`
replaces `email`, a partial unique index replaces the plain one, and `409 Slot just
got taken` replaces the email message. Establishing the pattern on something simple
means Step 15 introduces only the partial index, not the whole idea.

---

## D15 — `role` is never accepted from client input

**Decision:** the registration schema has no `role` field, and the service hardcodes
the omission so the column falls to its database default of `PATIENT`.

**Why chosen:** spreading request data into a create call — `data: { ...input }` — is
**mass assignment**, and it lets a caller set any column the ORM will accept,
including `role: "ADMIN"`. In an app where role *is* the authorisation boundary, that
single line is full privilege escalation from an unauthenticated endpoint.

Two independent barriers: zod strips unknown keys, so `role` never reaches the
service; and the service names every field it writes, so it could not pass one
through even if the schema changed. Verified with curl — a request asking for
`ADMIN` produced a `PATIENT` row.

**Trade-off accepted:** doctors and admins cannot self-register and must be created
by an admin (Step 11) or the seed script (Step 38). That is the correct behaviour
for a clinic anyway: a doctor account is a claim about the real world that a
registration form has no way to verify.

---

## D16 — JWT sessions rather than database sessions

**Decision:** `session: { strategy: "jwt", maxAge: 8h }`. No session table. The
token carries `id` and `role`, copied in by the `jwt` callback at creation.

**Alternatives considered:** database sessions via the Prisma adapter. They give
instant revocation — delete the row and the user is out — which is genuinely
valuable for a healthcare app. The cost is a database read on **every** authenticated
request, including every page load of every portal.

**Why chosen:** the deployment target is serverless on a free tier, where each
request may be a cold start and the database is remote. Adding an unavoidable round
trip to every request is the wrong trade when the same information can travel inside
a signed, encrypted cookie. Carrying `role` in the token also lets middleware
authorise `/admin/*` without touching Postgres.

**Trade-off accepted, and this is the honest weakness:** a JWT **cannot be revoked**.
A stolen token is valid until expiry, and a role change does not take effect until the
token refreshes. Mitigated by an 8-hour `maxAge` rather than the common 30 days.

**What I would do differently at scale:** keep JWTs but add a small
denylist of revoked token ids checked from cache, which restores revocation without
a per-request database read.

**Detail worth stating precisely in an interview:** Auth.js v5 issues a **JWE**, not a
plain JWS. The cookie has five segments with `alg: dir, enc: A256CBC-HS512`, so the
payload is encrypted rather than merely base64-encoded. The usual advice "never put
anything sensitive in a JWT because anyone can read it" does not describe this setup —
though the token is still a bearer credential, so it must not be exposed regardless.

---

## D17 — Authentication failures are indistinguishable by message and by timing

**Decision:** `verifyCredentials` returns `null` for every failure and never
indicates whether the email existed. When no user is found it still runs
`bcrypt.compare` against a constant `DUMMY_HASH`.

**Alternatives considered:** returning "no account with that email" versus "incorrect
password", which is friendlier and is what many production sites do. Rejected because
the endpoint is unauthenticated: anyone can submit a list of addresses and learn which
have accounts. Knowing that a person is a patient at a clinic is itself sensitive
health information, so this matters more here than on a typical consumer site.

**Why the dummy hash is required:** identical *messages* are not enough. Without it,
"no such user" returns after one indexed lookup (~5 ms) while "wrong password" pays
for bcrypt (~170 ms). That 30× gap is trivially measurable and is a working
enumeration oracle. Verified by measurement: 176 / 171 ms for wrong passwords against
174 / 174 ms for nonexistent users.

**Trade-off accepted:** worse UX — a user who mistypes their email sees "invalid
credentials" rather than "no such account". Every failed login also burns ~100 ms of
CPU, which is a small denial-of-service lever; rate limiting is the answer there, not
removing the defence.

**Consistency requirement:** registration *does* reveal that an email is taken, since
it must. The mitigations for that path are rate limiting and CAPTCHA rather than a
vague error, because a registration form that will not say "you already have an
account" is close to unusable.

---

## D18 — Split auth config so middleware can run on the Edge runtime

**Decision:** `auth.config.ts` holds everything edge-safe — session strategy, pages,
the jwt/session callbacks, and `authorized()` — with `providers: []`. `auth.ts`
spreads that config and adds the Credentials provider, which is the only piece that
imports Prisma and bcryptjs. Middleware imports **auth.config**, never **auth**.

**Alternatives considered:** forcing middleware onto the Node runtime, which loses
the latency benefit of running at the edge and is not universally supported. Or
dropping middleware entirely and authorising in every page — which is precisely the
"one page where someone forgets" failure mode.

**Why chosen:** this is not a stylistic split, it is a hard constraint discovered by
running it. Importing `@/auth` into middleware fails at build with
`UnhandledSchemeError: Reading from "node:crypto" is not handled`, traced through
`auth.service → prisma client → @prisma/client/runtime → node:crypto`, plus `pg`
requiring the native `pg-native` addon.

The insight that makes the split work: **verifying a JWT needs only the secret, not
the database.** Signing in needs Prisma and bcrypt; checking an already-issued token
does not. So the expensive dependencies belong only on the sign-in path.

**Trade-off accepted:** the config exists in two files and the callbacks must be
kept in the edge-safe one, which is a real footgun — adding a database call to `jwt()`
would break middleware at build time rather than at review time. Documented with a
comment at the top of `auth.config.ts` stating the rule.

---

## D19 — Every API route authorises itself; middleware is navigation only

**Decision:** `requireAuth()` and `requireRole(...roles)` are called inside route
handlers. The middleware matcher covers only `/patient/*`, `/doctor/*` and
`/admin/*`, and `/api/*` is deliberately excluded.

**Alternatives considered:** extending the matcher to `/api/*` and letting middleware
authorise everything. It would work for coarse role checks and would still be wrong
as the *only* defence, for two reasons: middleware cannot do per-resource checks
("is this *your* appointment?") without database access it does not have on Edge, and
security that lives in a matcher config is invisible at the point it matters.

**Why chosen — demonstrated rather than argued.** An "admin-only" endpoint written
without a guard returned **HTTP 200 with its payload to a request carrying no
cookie**. Adding `requireRole("ADMIN")` produced 401 anonymous, 403 patient, 200
admin. Reading the route handler now tells you what it requires; previously the
answer lived in a different file.

**Trade-off accepted:** one repeated line per handler, and a real risk of omission.
Mitigated by keeping handlers thin enough that a missing guard is visible on sight,
and by the guard throwing `AppError` so `toErrorResponse` maps it consistently.

**Status codes, stated precisely:** 401 means the caller is unidentified — sign in
and retry. 403 means the caller is identified and still refused — retrying with the
same credentials will never succeed.

**Interview line:** middleware is a convenience for page navigation. An attacker
does not browse to `/admin/doctors`; they curl `POST /api/doctors`.

---

## D20 — Working hours as rows, with times as minutes since midnight

**Decision:** `WorkingHour` is a table with one row per continuous shift, holding
`dayOfWeek` (0–6) and `startMinute`/`endMinute` as integers counting from midnight in
clinic local time. `(doctorId, dayOfWeek)` is deliberately not unique.

**Alternatives considered:**

- *A JSON column on `DoctorProfile`,* e.g. `{"tue":[["09:00","13:00"]]}`. Fewer tables
  and trivially editable as a whole. Rejected: Postgres cannot index inside it
  usefully, cannot constrain it, and cannot answer "which cardiologists work Tuesday
  morning?" in SQL — that filtering moves into JavaScript, fetching every doctor to
  find three.
- *`DateTime` or `@db.Time` columns.* Rejected on conceptual grounds: a working hour
  is **not an instant**, it is a recurring wall-clock time. "Opens at 9" holds every
  week regardless of date or daylight saving. A `DateTime` forces an arbitrary date
  onto it and invites timezone conversion that must not happen.
- *Strings like `"09:00"`.* Readable and sortable when zero-padded, but every
  arithmetic operation needs parsing first, and nothing prevents `"25:00"`.

**Why chosen:** integers make slot generation arithmetic rather than parsing —
`start`, `start + slotDurationMin`, repeat until `endMinute`. They sort naturally,
compare cheaply, and accept a CHECK constraint bounding them to a real day.

**Trade-off accepted:** `540` is not human-readable, so display needs a formatter and
the seed data needs a comment. Accepted because the value is read by code far more
often than by people, and the alternative pushes complexity into the hot path.

**Split shifts drove the uniqueness decision:** a doctor working 09:00–13:00 and
17:00–20:00 on a Tuesday is two rows. A unique constraint on `(doctorId, dayOfWeek)`
would have made that arrangement impossible to express.

---

## D21 — Invariants the ORM cannot express are written as raw SQL CHECK constraints

**Decision:** a hand-written migration adds CHECK constraints for weekday range,
minute range with `startMinute < endMinute`, and a positive slot duration.

**Alternatives considered:** relying on the zod schemas that already validate the
same rules at the API boundary. That is necessary but not sufficient — zod guards
exactly one path. A seed script, a manual correction in the SQL editor, a background
job, or a future endpoint written in a hurry all write directly to the table and
bypass it entirely.

**Why chosen:** the database is the one component every writer must pass through, so
invariants that must never be violated belong there. Constraints are also
self-documenting: `startMinute < endMinute` states the rule permanently, next to the
data, where a reader will find it.

`slotDurationMin > 0` is not decorative — a zero or negative duration makes the
Step 12 slot-generation loop fail to terminate. A CHECK turns a potential hang into a
rejected write.

**Trade-off accepted:** hand-written migrations are not reflected in
`schema.prisma`, so the file no longer tells the whole story and a reader must also
consult `prisma/migrations/`. Mitigated with an explanatory comment in the migration
and by documenting the constraints in the README's schema section.

**This is the same technique Step 15 needs.** The partial unique index preventing
double-booking is likewise inexpressible in Prisma. Establishing the
`migrate dev --create-only` workflow here means the graded step introduces only the
new idea, not the mechanics.

---

## D22 — Doctor creation is one transaction across three tables

**Decision:** `createDoctor` opens a `prisma.$transaction` and writes `User`,
`DoctorProfile` and the `WorkingHour` rows inside it. Password hashing happens
**before** the transaction opens.

**Alternatives considered:** three sequential writes with no transaction, relying on
them all succeeding. They usually do — until a unique-constraint violation on the
second write leaves a `User` with role DOCTOR and no profile: an account that can log
in and see nothing, which no code path knows how to repair.

**Why chosen:** these three rows are one fact — "this person is a doctor here". A
partial write is not a smaller version of that fact, it is a corrupt one.

**Why bcrypt is outside the transaction:** hashing costs ~100 ms of CPU and touches
no database state. Holding a pooled connection open during it multiplies the
transaction's lifetime for no reason, and connections are the scarce resource on a
serverless free tier. Same rule as forbidding network I/O inside a transaction: **do
slow, unrelated work first, then open the transaction and keep it short.**

**Trade-off accepted:** if the request dies between hashing and the transaction, the
hash is discarded and the work is wasted. Wasted CPU is strictly preferable to a
half-created account.

---

## D23 — PATCH schemas are declared from scratch, never derived from create schemas

**Decision:** `updateDoctorSchema` is written out explicitly with every field
optional and **no defaults**, rather than derived via
`createDoctorSchema.pick().partial()`.

**Context — this was a live data-corruption bug, not a theoretical one.** The derived
version looked correct and passed type checking. `PATCH {}` returned 200 and reset
`slotDurationMin` from 45 to 30, a field the request never mentioned. `.pick()` and
`.partial()` both **preserve `.default(30)`**, so an empty body parsed to
`{ slotDurationMin: 30 }`; the "at least one field" guard counted one key and passed;
the service wrote it.

**Why chosen:** PATCH means "change exactly what I named". A default converts absence
into an instruction, which inverts that meaning. The two schemas share field names but
have genuinely different semantics, so sharing a definition couples things that must
differ.

**Trade-off accepted:** the validation rules for each field are stated twice, and they
can drift. Accepted because the alternative silently overwrites data — a bug that
surfaces as "the system changed a value nobody edited", which is close to
untraceable in a live system.

**Generalised rule:** any schema reachable by a partial update must contain no
`.default()`. Defaults belong on create, where absence genuinely does mean "use the
standard value".

---

## D24 — Working hours replaced wholesale via PUT, not edited individually

**Decision:** `PUT /api/admin/doctors/:id/working-hours` takes the doctor's entire
week and replaces it — delete-all then insert-all, inside one transaction. There is
no endpoint to add or remove a single shift.

**Alternatives considered:** REST-purist per-shift resources (`POST`, `DELETE
/working-hours/:whId`). More granular, and a poor fit for the actual interaction: an
admin edits a weekly schedule as one form and saves it once. Per-shift endpoints would
mean the UI computing a diff and issuing several requests, with a half-applied
schedule if one failed.

**Why chosen:** the unit of change *is* the week. One request, one transaction, and
the schedule is never partially applied. It is also genuinely idempotent — verified by
sending the same payload three times and getting three identical results — so a retry
after a timeout is always safe.

**Trade-off accepted:** the whole week travels on every save, and two admins editing
simultaneously means last-write-wins with no warning. At clinic scale the payload is
trivial; concurrent schedule edits would need optimistic locking via a version column,
which is noted as the scale-up path rather than built.

---

## D25 — Slot generation is a pure function with `now` injected

**Decision:** `generateSlots()` lives in `slot.core.ts`, takes every input as an
argument — including the current time — and imports nothing at all. A separate
`slot.service.ts` reads the database and calls it.

**Alternatives considered:** the natural version, where the function queries
appointments and leave itself and calls `Date.now()`. It reads well and is
effectively untestable: it needs a live database in a known state, and any assertion
about past slots passes today and fails tomorrow.

**Why chosen:** this is the most logic-dense function in the project — weekday
matching, timezone conversion, exclusions, boundary handling — and it is exactly the
kind of code an interviewer probes with edge cases. Purity means every one of those
cases is a test that runs in under a millisecond with no fixtures.

**Enforced structurally, not by discipline.** The first attempt kept both halves in
one file, and the tests immediately failed with `Cannot find package '@/server'` —
importing the "pure" function pulled in Prisma. A module with **zero imports** cannot
acquire a dependency by accident, and the test suite fails loudly if anyone adds one.

**Trade-off accepted:** the caller must assemble the inputs, so the database query
lives one level up and the two must agree on shape. Worth it — the coupling is
explicit and visible in the type signature.

---

## D26 — `DoctorProfile.timezone`, and two-pass wall-clock conversion

**Decision:** each doctor carries an IANA timezone. Converting a wall-clock time to a
UTC instant computes the zone offset twice — once at a guessed instant, once at the
corrected one.

**Context:** `WorkingHour` stores minutes since midnight in clinic local time;
`Appointment.startAt` stores a UTC instant. Without a timezone field, "09:00" is not
a point in time at all, and the two tables cannot be reconciled.

**Alternatives considered:** a single hardcoded clinic timezone, which fails the
moment the clinic has a second location or a doctor consults remotely. Or storing a
fixed numeric offset such as `+5:30`, which is wrong in any zone observing daylight
saving — the offset is a property of an *instant*, not of a place.

**Why two passes:** the offset depends on the instant, and the instant is what we are
solving for. One pass is wrong for times near a DST boundary. Verified with
America/New_York across the March 2026 transition: the identical schedule row
resolves to 13:00 UTC in July and 14:00 UTC in November.

**Trade-off accepted:** two `Intl.DateTimeFormat` constructions per slot, which is
measurable but negligible at a day's worth of slots. A library such as Luxon would be
faster and is the answer if this ever appears in a hot path.

**Known edge case, deliberately not handled:** wall-clock times that do not exist,
such as 02:30 on a spring-forward day. The conversion resolves them to the following
real instant rather than rejecting them. Clinic hours in the seeded zones never fall
inside a transition window, so the case is documented rather than coded around.

---

## D27 — Reads go through Server Components; API routes exist for interactions

**Decision:** patient pages call services directly during server render.
`GET /api/doctors` and `GET /api/doctors/:id/slots` exist alongside them, calling the
same services, for callers that are not our own pages.

**Alternatives considered:** the conventional SPA arrangement where every page is a
Client Component that fetches from an API on mount. It is the familiar pattern and it
costs a request waterfall — HTML, then JavaScript, then data, then a re-render — plus
a loading state for every page and a public endpoint for every read.

**Why chosen:** a read-only page has nothing a round trip through HTTP adds. Calling
the service in the component removes the endpoint, the fetch, the loading state and
the client bundle. Measured: `/patient/doctors` ships 170 B of JavaScript while
providing search, filter chips and date navigation.

The API routes are not redundant. Step 17 needs the browser to place a slot hold
*after* the page has rendered, and that requires a real endpoint. Building the read
endpoints now keeps the documented API surface complete for the README, which is a
graded deliverable.

**Trade-off accepted:** two callers per service — a page and a route — so a change in
return shape must satisfy both. Contained because both call the same function rather
than duplicating the query.

---

## D28 — Per-audience projections chosen in the service layer

**Decision:** `listDoctors` (admin) returns each doctor's email and phone;
`searchDoctors` (patient) returns name, specialisation, slot duration, bio and
timezone, and nothing else.

**Alternatives considered:** one query returning everything, with the UI rendering
only what it should show. Common, and wrong: the data still crosses the network and
sits in the HTML payload, so "not displayed" is not "not disclosed". A reader of the
page source sees every doctor's personal phone number.

**Why chosen:** the narrowest projection that satisfies the caller is both a
performance decision and a privacy one, and it belongs where the query is written.
Leaving it to the UI means the protection depends on every future component
remembering.

**Trade-off accepted:** near-duplicate query functions that must both be updated when
a field is added. Accepted deliberately — the duplication is the point, because the
two audiences should be free to diverge.

**Extends to slots:** the slots endpoint returns only `startAt` and `endAt`. It never
reveals who booked the surrounding slots, which would leak that a specific person has
an appointment with a specific doctor.

---

## D29 — Double-booking prevented by a partial unique index, not by application code

**Decision:** a hand-written migration creates

```sql
CREATE UNIQUE INDEX appointment_slot_unique
  ON "Appointment" ("doctorId", "startAt")
  WHERE status IN ('PENDING', 'CONFIRMED');
```

The booking service still checks availability first, then catches `P2002` and returns
`409`.

**Alternatives considered:**

- *Check-then-insert in application code.* Built deliberately in Step 14 and measured:
  10 concurrent requests produced **8 successful bookings for one slot**, created
  across a 51 ms window. The check is truthful when made and stale when used — TOCTOU
  again. No additional application code closes the gap, because the gap sits *between*
  statements rather than inside one.
- *Pessimistic locking with `SELECT … FOR UPDATE`.* The textbook answer, and a poor
  fit here: `FOR UPDATE` locks rows that **exist**, and the row we are protecting
  against is the one nobody has inserted yet. Making it work needs a lock on something
  else — the doctor row, or an advisory lock on a hashed key — which serialises every
  booking for that doctor and holds a transaction open across the whole request. That
  is a real cost for a conflict that is rare.
- *A plain (non-partial) unique index.* Simpler, and wrong: a CANCELLED row keeps
  occupying the key, so any cancelled slot becomes permanently unbookable.
- *Serializable isolation.* Correct, and it converts the problem into serialisation
  failures the application must detect and retry — more machinery for the same
  outcome.

**Why chosen:** the database is the only component every request passes through. On
serverless, application-level coordination is not merely fragile, it is impossible —
each instance has its own memory. The index makes the invariant true by construction
rather than by care, and it costs nothing on the happy path: no locks held, no
transaction spanning the request, no retries.

**Optimistic, not pessimistic, and deliberately so.** Two patients wanting the same
slot at the same moment is rare. Optimistic concurrency assumes success, verifies at
commit, and pays only when there is an actual conflict.

**Trade-off accepted:** the loser learns they lost only *after* attempting the write,
so the UI must handle a 409 at the final step. The slot-hold mechanism in Step 17
exists precisely to make that outcome rare in practice.

**Measured result:** 10 concurrent → 1 × 201 and 9 × 409. 25 concurrent → 1 × 201 and
24 × 409. Four consecutive runs, exactly one winner each time.

---

## D30 — Constraint migrations repair data before they constrain it

**Decision:** the migration that adds `appointment_slot_unique` first cancels the
duplicate bookings, in the same file and the same transaction.

**Context:** the first attempt to create the index failed —
*"could not create unique index … is duplicated"*. Postgres will not build a unique
index over rows that already violate it, so the constraint could not be added at all
until the existing data conformed.

**Alternatives considered:** deleting the losing rows, which is simpler and destroys
medical records that patients were told were confirmed. Or repairing manually before
deploying, which does not survive being replayed on another environment — and a
migration that only works on one database is not a migration.

**Why chosen:** first come, first served is a defensible, explainable rule, and
CANCELLED preserves the row so the affected patients remain notifiable — which the
Step 23 outbox will need. Doing it inside the migration means any environment
replaying the history lands in the same state.

**Trade-off accepted:** the repair rule is a policy judgement baked into a migration,
where it is easy to overlook later. Mitigated by a comment stating the policy and its
reasoning at the point of the change.

**Generalises:** adding a constraint to a populated table is always two problems —
the constraint, and the data that predates it. The second is usually the harder one.
