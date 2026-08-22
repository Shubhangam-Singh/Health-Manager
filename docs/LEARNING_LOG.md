# Learning Log

Running record of what was built and which concepts showed up, step by step.

---

## Step 1 — What Next.js is, and project init

**Built:** Next.js 15.5.23 scaffold with TypeScript, Tailwind v4, App Router, `src/`
directory and the `@/*` import alias. Dev server confirmed booting on port 3000.

**Concepts that appeared:**

- **React vs Next.js.** React only renders UI — it has no router, no server, no
  database access. Next.js is the chassis around it: routing, bundling, a server
  and an API layer, pre-assembled. Analogy: React is the engine, Next is the car.
- **Why one framework instead of React + Express.** Two separate projects means two
  deploys, two `package.json` files and CORS between them. One repo, one language,
  one deploy — and route handlers stay plain Node functions, so nothing becomes
  magic I can't explain.
- **File-based routing.** The *filename* creates the URL. `src/app/page.tsx` → `/`.
  A folder without a `page.tsx` produces no route at all.
- **Layout vs page.** `layout.tsx` renders `<html>`/`<body>` and wraps every page
  via its `{children}` slot — nav bars and session providers live there. `page.tsx`
  is the content for one specific URL.
- **`metadata` export.** Next sets `<title>` from an exported object, so no
  `react-helmet`-style library is needed.
- **Fast Refresh.** Editing a file updates the browser without a manual reload.
- **Lockfiles decide the project root.** Next walks upward looking for a lockfile.
  A stray `package-lock.json` in my home directory made it infer the wrong root,
  which would ship the wrong file set at deploy time.

**Problems hit:**

- npm rejects package names containing capital letters, so `USolutions` could not be
  scaffolded directly — created in a subfolder and moved the contents up.
- Disk was 100% full mid-install and npm failed with `ENOSPC`, leaving a corrupt
  `node_modules`. Freed space, then wiped `node_modules` and reinstalled cleanly
  rather than trusting a partial install.

**Deliberately not done yet:** `git init`. Step 5 sets my git identity first so the
first commit in the history is mine, not a tool default.

---

## Step 2 — Routing, layouts, and the server/client split

**Built:** `src/app/demo/` — a Server Component page, a `"use client"` Counter, and a
nested layout, purely to make the split visible. Also deliberately broke a page to
see the error Next throws.

**Concepts that appeared:**

- **Server Components are the default.** No directive needed. The code runs on the
  server, renders to HTML, and **ships zero JavaScript** to the browser. You opt out
  with `"use client"`, you never opt in.
- **Proving where code runs.** `console.log` lands in whichever environment executed
  it. `process` is a Node global that does not exist in browsers — rendering
  `process.version` is proof the code ran server-side.
- **`"use client"` is a boundary, not a label.** It must be the first line of the
  file, before imports, and everything the file imports is pulled into the browser
  bundle too.
- **Direction of imports.** A Server Component may render a Client Component. A
  Client Component may *not* import a Server Component — the browser cannot run
  server code.
- **The correction that mattered most:** "Client Component" means *also* runs in the
  browser, not *only*. I confirmed from the raw HTML that the counter button and
  `Count: 0` were server-rendered. The real lifecycle is two passes — a server
  pre-render that produces HTML, then hydration in the browser that attaches the
  `onClick`. Between those two moments the button is visible but dead.
- **Hydration mismatch.** Because a Client Component renders twice, anything
  non-deterministic (`new Date()`, `Math.random()`) produces different output on each
  pass and React errors. This is why the timestamp lives in the Server Component.
- **The real difference is what gets shipped,** not where it runs: zero JS versus a
  full component bundle, and direct DB access versus none.
- **Layouts nest, they do not replace.** Root layout wraps `demo/layout.tsx` wraps
  `page.tsx`, each via its own `{children}`. On client-side navigation layouts stay
  mounted and only the page swaps — so nav state and scroll position survive.

**Bug I was shown on purpose:** `useState` in a file without `"use client"` →
HTTP 500 at compile time, with the message *"This React Hook only works in a Client
Component."* Compile-time, not runtime — Next catches it while building.

**Note:** `src/app/demo/` is scaffolding for learning and gets deleted in Step 3.

---

## Step 3 — Folder structure and route groups

**Built:** deleted the `demo/` scaffolding and laid down the real skeleton — `(auth)`
route group with a shared card layout, `patient/` `doctor/` `admin/` portal segments,
`api/health` plus the three `api/cron/*` folders, and `src/server/{services,llm,lib,
validation}`.

**Concepts that appeared:**

- **Route groups.** A folder in parentheses is invisible to the URL.
  `app/(auth)/login/page.tsx` serves `/login`, and `/auth/login` returns 404 —
  verified both. The point is grouping by *shared layout* rather than by URL path.
- **`route.ts` vs `page.tsx`.** Same file-based routing rule, different keyword:
  `page.tsx` makes a URL render HTML, `route.ts` makes it an API endpoint. They
  cannot both live in one folder.
- **HTTP verbs are named exports.** `export async function GET()` — Next wires it up
  by the function name. Adding POST/PATCH/DELETE means adding more exports to the
  same file. This replaces Express's `app.get("/health", handler)`.
- **Thin API, fat services.** The route handler only calls the service and shapes the
  HTTP response. `health.service.ts` contains no `Request`, no `NextResponse`, no
  status codes — just a plain function returning a plain object.
- **Why that matters concretely:** the cron worker in Step 25 imports the same
  services with no HTTP involved. Logic living inside a route handler would have to
  be duplicated, or the server would end up calling its own HTTP endpoint.
- **Git tracks files, not directories.** Empty folders need a `.gitkeep` or they
  vanish from the repo.
- **`.next/` is build cache.** After deleting `demo/`, `tsc` still reported errors
  from generated types in `.next/types` pointing at files that no longer existed.
  Deleting the stale cache cleared them — the source was never wrong.

**Divergence from the plan, and the reason:** `CLAUDE.md` sketches `(patient)`,
`(doctor)`, `(admin)` as route groups. I used real segments instead, because Step 8's
middleware protects `/patient/*`, `/doctor/*`, `/admin/*` by URL prefix — and a route
group produces no URL to match. The literal reading would have required
`(patient)/patient/dashboard/`. `(auth)` stays a route group because login and
register genuinely want a shared layout without a shared prefix.

---

## Step 4 — Postgres on Neon + Prisma

**Built:** Neon project (AWS Singapore, free tier), Prisma 7 installed and
initialised, `User` model defined, first migration applied, client generated.

**Concepts that appeared:**

- **What an ORM saves you from.** Hand-written SQL means string concatenation (the
  road to SQL injection), manual row-to-object mapping, and column renames that break
  silently at runtime instead of loudly at compile time.
- **A migration is a permanent, ordered record of one schema change.** Prisma diffed
  my `schema.prisma` against the live database and emitted the SQL itself — I wrote
  none of it. Replaying the folder on an empty Postgres reproduces the schema
  exactly. This is why migrations are committed to git.
- **`cuid()` over auto-increment integers.** Sequential ids leak row counts and are
  guessable, so `/patient/2` → `/patient/3` reads someone else's record. That is an
  IDOR vulnerability, and it matters more in healthcare than almost anywhere.
- **`@unique` is the same mechanism as the double-booking fix.** It becomes a real
  Postgres `UNIQUE` constraint. Two simultaneous registrations with one email can
  both pass an application-level check, but the database accepts exactly one and
  raises `P2002` for the other. Step 15 applies the identical idea to
  `(doctorId, startAt)`.
- **Enums are real Postgres types.** `CREATE TYPE "Role" AS ENUM (...)` — the
  database itself rejects an invalid role. Defaulting to `PATIENT` means a bug in
  registration can never mint an admin.
- **Indexes are the book-index analogy.** Without one, "find all doctors" reads every
  row. They cost write speed and disk, so they go where queries actually are.
- **One `User` table for all three roles** — one login flow, one namespace for email
  uniqueness, one target for foreign keys. Role-specific fields go in
  `DoctorProfile` via a one-to-one relation in Step 10.
- **Pooled vs direct connection.** Same database, two endpoints. The app uses the
  pooled one because serverless opens many short-lived connections against a hard
  Postgres cap. Migrations must use the direct one, because a transaction-mode
  pooler cannot do advisory locks or `CREATE TYPE`.
- **`updatedAt` has no SQL default.** Prisma writes it from the client on every
  update, so a raw `UPDATE` in the SQL editor will not touch it.

**Prisma 7 differences from most tutorials online:**

- The connection string lives in `prisma.config.ts`, not in the `datasource` block.
- `prisma.config.ts` accepts only `url` and `shadowDatabaseUrl` — there is no
  `directUrl` field as there was in Prisma 5/6, so the CLI is pointed at
  `DIRECT_URL` directly.
- The client generates into `src/generated/prisma` as TypeScript, so imports come
  from there rather than from `@prisma/client`.

**Mistake made and fixed:** `prisma init` installed AI-assistant docs into
`.agents/`, `.windsurf/` and `.claude/` — and `.claude/skills/*` were *symlinks* into
`.agents/`. Deleting `.agents/` left committed dangling symlinks (git mode `120000`).
Removed all of it; `prisma init` can regenerate it if ever needed.

**Security check performed:** confirmed `.env` is untracked and appears in no commit.
`.gitignore` line 34 (`.env*`) covers it. The repo already has a public remote
(`Shubhangam-Singh/Health-Manager`), so this mattered.

---

## Step 5 — Environment variables and secrets

**Built:** `.env.example` documenting all 13 keys, generated `AUTH_SECRET` and
`CRON_SECRET`, fixed a `.gitignore` bug, verified no secret is in git history.

**Concepts that appeared:**

- **An env var is what differs between machines while the code stays identical.**
  Laptop and Vercel run the same build against different databases.
- **Why secrets never enter git.** History is permanent. Committing a key then
  deleting it in the next commit leaves it in the old commit forever, and if pushed
  it is scraped within minutes. The only real remedy is rewriting history *and*
  rotating the key.
- **`NEXT_PUBLIC_` is a decision, not a convenience.** I proved this rather than
  taking it on trust: built the app with two vars and grepped `.next/static`, which
  is what browsers download. The shipped chunk contained
  `String("printed-on-menu-PUBLIC-x9y8z7")` — the variable name **gone**, replaced by
  a string literal at build time. The server-only var was still
  `String(r.env.DEMO_SERVER_ONLY)`, a lookup that resolves to `undefined` in the
  browser. The value never left the server.
- **Three consequences of build-time inlining:** changing a `NEXT_PUBLIC_` var in
  Vercel does nothing until a rebuild; rotating a leaked one is not enough because
  old bundles sit in CDN and browser caches; and adding the prefix is an explicit
  statement that the value may be public.
- **The failure mode to watch for:** a client component needs a key, gets
  `undefined`, and someone "fixes" it by adding `NEXT_PUBLIC_`. It works — and the
  key is now public and billable by strangers.

**Bug found and fixed:** `.gitignore` contained `.env*`, whose wildcard also matched
**`.env.example`** — a required deliverable that would silently never have been
committed. Likely only discovered when a reviewer cloned the repo and found nothing
to configure. Fixed with a negation: `!.env.example` after the wildcard. Git
negations must come *after* the pattern they override.

**Verification performed:** `git check-ignore` confirms `.env` ignored and
`.env.example` committable; `git log -S` on the database password returns nothing, so
it exists in no commit; `git status` before committing showed `.env` absent from the
staged set.

**Already done ahead of the plan:** git identity was set
(`Shubhangam-Singh` / `shubhangam2005singh@gmail.com`) and the repository already has
commits and a GitHub remote.

---

## Step 6 — Registration: first API route, first service

**Built:** `POST /api/auth/register` — zod schema, `auth.service.ts`, Prisma
singleton, shared `AppError`. Tested entirely with curl; no UI exists yet.

**Concepts that appeared:**

- **Hashing is not encryption.** Encryption is reversible by design; hashing is
  one-way. Logging in means hashing the attempt and comparing hashes — the plaintext
  is never recovered, so stealing the database does not hand over passwords.
- **What a salt does, demonstrated not asserted.** Registered two users with the
  identical password `identicalpassword` and read the rows back: completely different
  hashes. A salt makes precomputed rainbow tables useless and hides the fact that two
  users share a password.
- **The bcrypt string is self-describing:** `$2b$` variant, `$10$` cost factor, 22
  characters of salt, then the hash. The salt is stored in the open, which is fine —
  a salt is not a secret, its job is uniqueness. Storing the cost is what allows
  raising it later: old hashes keep verifying at cost 10 while new ones use 12.
- **bcrypt is deliberately slow,** roughly 100 ms at cost 10 — invisible when logging
  in, ruinous when brute-forcing. Fast hashes like SHA-256 are the wrong tool here
  because a GPU computes billions per second.
- **bcrypt truncates at 72 bytes,** so the schema caps password length there.
  Without the cap, a 200-character password and its first 72 characters hash
  identically and both would log in.
- **Mass assignment.** `data: { ...input }` would let anyone POST `role: "ADMIN"`.
  Verified the defence with curl: the request asked for ADMIN and the row came back
  PATIENT. Two independent barriers — the schema does not accept `role`, and the
  service does not pass it.
- **`select` excludes `passwordHash`** so it cannot leak into a response by accident.
- **No pre-check before insert.** Attempt the write, catch `P2002`. One round trip
  and no TOCTOU window. Same shape as the booking fix in Step 15.
- **A route handler is just `Request` in, `Response` out** — an Express controller
  with a different wrapper. Next wires it by the exported function name.

**Bug found and fixed — validation vs transformation order.** I wrote
`z.email().toLowerCase().trim()`. zod validates FIRST and transforms after, so
`"  shubh@test.com  "` was rejected as an invalid email before `trim()` ran. Curl
isolated it: uppercase without spaces returned 409 correctly, lowercase with spaces
returned 400. Fixed with `z.string().trim().toLowerCase().pipe(z.email())`, which
forces normalise-then-validate. Not academic — mobile keyboards append spaces
constantly, and the user would have seen "invalid email" for an email that is fine.

**Prisma 7 surprise:** `new PrismaClient({ datasourceUrl })` does not exist. Prisma 7
removed the Rust query engine and **requires a driver adapter** —
`new PrismaPg({ connectionString })` from `@prisma/adapter-pg` over the `pg` driver.
Upside worth stating in an interview: no native binary means smaller serverless
bundles and faster cold starts.

**Why the Prisma singleton exists:** Next hot-reloads modules on every save, and a
plain `new PrismaClient()` at module scope would open a fresh connection pool each
time until Neon refuses connections. Caching on `globalThis` survives hot reload.
Production evaluates the module once, so the cache is dev-only.

**Curl results:** 201 valid · 409 duplicate · 409 duplicate with different case and
whitespace · 400 per-field validation errors · 201-with-PATIENT for the ADMIN
attempt · 400 for malformed JSON instead of a crash.

---

## Step 7 — Auth.js v5: credentials and role in the session

**Built:** `src/auth.ts` with a Credentials provider, `verifyCredentials()` in the
auth service, the `[...nextauth]` catch-all route, and module augmentation so
`session.user.role` typechecks. Whole login flow tested with curl.

**Concepts that appeared:**

- **Sessions vs JWTs.** A database session is a cloakroom ticket — meaningless
  alone, the server holds the data, and logging out means deleting a row. A JWT
  carries the data itself and is verified by signature, so no storage and no DB read
  per request.
- **The trade-off to state in an interview: a JWT cannot be revoked.** There is no
  row to delete, so a stolen token stays valid until it expires. That is exactly why
  `maxAge` is 8 hours rather than 30 days.
- **Why `role` goes in the token:** `/admin/*` can be authorised without a database
  round trip on every page load. The cost is staleness — promote a user and their
  existing token still says PATIENT until it refreshes.
- **The `authorize` callback returns a user or `null`.** Throwing would leak the
  reason to the client, so it never throws.
- **Catch-all route segments.** `[...nextauth]` matches `/api/auth/signin`,
  `/callback/credentials`, `/session`, `/csrf` and the rest from one file. Verified
  that our own `/api/auth/register` still wins, because a static segment beats a
  catch-all.
- **Module augmentation.** `session.user.role` is a TypeScript error until you
  `declare module "next-auth"` and extend `Session`, `User` and `JWT`. The library
  cannot know what we chose to put in.

**Correction to what I first wrote:** I said a JWT's contents are "readable by
anyone". That is true of a standard JWT (JWS — three parts, base64 payload) but
**not of ours**. Decoding the cookie showed **five** parts and a header of
`{"alg":"dir","enc":"A256CBC-HS512"}` — this is a **JWE**, so Auth.js v5 *encrypts*
the payload by default, not merely signs it. Part four is binary ciphertext.
Signing proves nobody altered it; encryption means nobody can read it either.

**Timing attacks and user enumeration — measured, not assumed.** If a missing email
returns in ~5 ms while a wrong password takes ~170 ms (the cost of bcrypt), the
difference is a working oracle for which emails have accounts — sensitive on its own
for a healthcare platform. Fix: when no user is found, still run `bcrypt.compare`
against a `DUMMY_HASH` of a random string, so both paths do identical work.

Measured: wrong password 176 / 171 ms, nonexistent user 174 / 174 ms — a 2 ms spread
that is just noise. Identical error codes and redirects in every failure case, and no
session cookie issued in any of them.

**The login flow in full, as exercised by curl:** `GET /api/auth/csrf` returns a
token and cookie → `POST /api/auth/callback/credentials` with that token plus
credentials → 302 with an `authjs.session-token` cookie → `GET /api/auth/session`
returns `{ user: { id, email, name, role }, expires }`.

---

## Step 8 — Middleware and route protection

**Built:** split auth config (`auth.config.ts` edge-safe, `auth.ts` Node-only),
`middleware.ts` protecting the three portals by role, `/unauthorized` page,
`requireAuth`/`requireRole` guards, and `toErrorResponse` for error mapping.

**Concepts that appeared:**

- **Middleware is a checkpoint that runs before the page** — the security desk in
  the hospital lobby, checking badges before anyone reaches the ward.
- **It runs on the Edge runtime,** a stripped-down JS environment with no Node APIs.
  No filesystem, no TCP sockets, no `node:crypto`.
- **The failure, seen rather than described.** Importing `@/auth` into middleware
  gave HTTP 500 and an import trace that reads like a proof:
  `middleware → src/auth.ts → auth.service.ts → generated/prisma/client.ts →
  @prisma/client/runtime → node:crypto`. A second error showed `pg` reaching for
  `pg-native`, a compiled C addon. Neither can exist on Edge.
- **The fix is the split config.** `auth.config.ts` holds session strategy, pages,
  the jwt/session callbacks and `authorized()` — and `providers: []`. `auth.ts`
  spreads that config and adds the Credentials provider, which is the only part that
  touches Prisma and bcrypt. Middleware constructs its own `NextAuth(authConfig)`
  instance, which can still verify and read the JWT — all route protection needs.
- **Three distinct outcomes, not two.** Not signed in → 307 to `/login` with a
  `callbackUrl`. Signed in but wrong portal → 302 to `/unauthorized`. Correct role →
  200. Bouncing an already-authenticated user to a login page is confusing, so
  `authorized()` returns a `Response.redirect` for that case instead of `false`.

**The lesson this step exists for — proved with curl.** I wrote an "admin-only"
endpoint with no authorisation check, trusting middleware. With no cookie at all it
returned **HTTP 200 and the data**. Two reasons: the matcher does not list `/api/*`,
so middleware never ran; and more importantly, an endpoint whose security depends on
a matcher config is one edit away from being public.

After adding `requireRole("ADMIN")`: anonymous → 401, patient → 403, admin → 200.

> **Middleware guards navigation. It is not a security boundary. Every route
> handler must authorise itself.** An attacker does not browse to `/admin/doctors`;
> they curl `POST /api/doctors`.

**401 vs 403 matters:** 401 means "I do not know who you are" (sign in and retry);
403 means "I know exactly who you are and the answer is still no". Retrying 403 with
the same credentials will never help.

**Consequence of the Step 6 mass-assignment defence, felt for real:** I could not
create an admin through `/api/auth/register`, because the endpoint refuses to set
`role`. The test admin had to be inserted directly via SQL. That is the design
working as intended — a doctor or admin account is a claim about the real world that
a public registration form cannot verify. Step 38's seed script does this properly.

---

## Step 9 — Login page, redirect by role, first end-to-end flow

**Built:** the login form, `/` as a role-routing server component, three dashboards
rendering real session data, and a sign-out button. Phase 1 complete.

**Concepts that appeared:**

- **Forms need the browser,** so the login page is a Client Component — it holds
  typed text in state and handles a submit event.
- **`e.preventDefault()`** stops the browser's own full-page form POST so React can
  handle the submit instead.
- **`signIn(..., { redirect: false })`.** The default bounces the whole page on
  failure, producing a reload with `?error=` in the URL and losing whatever the user
  typed. Returning the result instead lets the error render inline above the form.
- **`router.refresh()` after a successful login.** The cookie exists immediately, but
  already-rendered Server Component output is still the cached logged-out version.
  Without the refresh you log in and the page still looks logged out.
- **Where the redirect rule lives.** Rather than reading the role in the browser and
  pushing to a portal, everyone goes to `/`, and `/` is a Server Component that calls
  `auth()` and redirects. One rule in one place, no client JavaScript, and nothing to
  keep in sync.
- **`redirect()` throws internally** to halt rendering, so nothing after it runs and
  no `break` is needed inside the switch.
- **Server Components can read the session directly** with `await auth()` — the
  dashboards need no props, no fetch, and no API endpoint to show who is signed in.
- **The error message stays vague** — "Invalid email or password" — preserving the
  non-enumeration property from D17. A friendlier "no account with that email" would
  undo the DUMMY_HASH work from Step 7 at the UI layer.

**Debugging note worth remembering.** After building the page, a logged-in request to
`/` returned 200 instead of redirecting, which looked like the `auth()` call failing
in a Server Component. It was not a code bug: `/api/auth/session` returned `null`,
so the cookie jar saved during the Step 8 tests had gone stale. A fresh login gave
307 → `/patient/dashboard` and 307 → `/admin/dashboard` immediately. **Check whether
the credential is still valid before suspecting the code that reads it.**

**The full round trip, now working end to end:**

1. Browser loads `/login` — server sends HTML, then hydrates the form.
2. Submit → `signIn()` → `POST /api/auth/callback/credentials`.
3. Auth.js runs `authorize()` → `verifyCredentials()` → Prisma reads `User` →
   `bcrypt.compare`.
4. On success the `jwt` callback copies `id` and `role` into the token, which is
   encrypted and set as the `authjs.session-token` cookie.
5. `router.push("/")` → the Server Component calls `auth()`, decrypts the cookie,
   reads the role, and redirects to the matching portal.
6. Middleware intercepts that request, verifies the token on the Edge runtime, and
   confirms the role matches the path.
7. The dashboard Server Component calls `auth()` again and renders the user's name,
   email, role and id.

Verified by curl: patient sees `Patient dashboard / Shubhangam / you@test.com /
PATIENT`, admin sees `Admin dashboard / Test Admin / admin@test.com / ADMIN`, and a
patient requesting `/admin/dashboard` still gets 302 to `/unauthorized`.

**Not built yet:** the registration *page*. `POST /api/auth/register` works and is
curl-tested, but there is no form for it, so `/register` is still a placeholder.

---

## Step 10 — Doctor-side schema: profiles, working hours, leave

**Built:** `DoctorProfile`, `WorkingHour`, `LeaveDay`, plus a hand-written migration
adding CHECK constraints. Phase 2 begins.

**Concepts that appeared:**

- **A relation is a foreign key** — a column holding another row's id.
- **One-to-one is created by `@unique` on the foreign key.** `DoctorProfile.userId`
  is unique, so one user cannot own two profiles. Remove the `@unique` and the same
  columns become one-to-many. That single keyword is the whole difference.
- **The optional back-relation carries meaning.** `User.doctorProfile` is
  `DoctorProfile?`, so a patient simply has none — the *absence* of a profile is the
  signal that a user is not a doctor, which pairs with the single-User-table decision
  from D9.
- **Cascade delete suits owned configuration, not history.** Deleting a doctor should
  remove their working hours, which mean nothing without them. It must never remove
  appointments — those are medical records. Appointments will use a different rule.
- **Why rows and not a JSON blob.** Postgres cannot index inside JSON usefully,
  cannot constrain it, and cannot answer "which cardiologists work Tuesday morning?"
  in SQL. With JSON, filtering moves into JavaScript and you fetch every doctor to
  find three. Rows give indexes, constraints and queryability.
- **Split shifts drove a real schema choice.** `(doctorId, dayOfWeek)` is deliberately
  NOT unique, because a doctor working 09:00–13:00 and 17:00–20:00 on a Tuesday is
  two rows. Making it unique would have silently made split shifts impossible.

**The most defensible decision in this step — working hours as integers.**
`startMinute`/`endMinute` hold minutes since midnight in clinic local time.
**A working hour is not an instant, it is a recurring wall-clock time.** "The clinic
opens at 9" is true every week regardless of date or daylight saving. Storing it as a
`DateTime` would force an arbitrary date onto it and invite timezone conversion that
must never happen. Integers also make slot arithmetic trivial: `start`,
`start + duration`, repeat. `540 = 09:00`.

Same reasoning for `LeaveDay.date` using `@db.Date`: a calendar date with no time and
no timezone, so "on leave 12 March" cannot mean different things on servers in
different zones.

**Prisma's limits, met for the first time.** Prisma cannot express CHECK constraints,
so a migration was created with `--create-only` and the SQL written by hand — the
same technique Step 15 uses for the partial unique index. Verified all four fire:

- `dayOfWeek = 9` → rejected by `WorkingHour_dayOfWeek_range`
- end before start → rejected by `WorkingHour_minutes_valid`
- `endMinute = 2000` → rejected by `WorkingHour_minutes_valid`
- `slotDurationMin = 0` → rejected by `DoctorProfile_slotDuration_positive`

Worth stating clearly: zod already validates these on the API path, but zod guards
**only that path**. A seed script, a manual fix in the SQL editor, or a future
endpoint written in a hurry all bypass it. A CHECK constraint binds every writer.

**Cascade proved, not assumed.** Created a temporary doctor with a profile, two
working hours and one leave day, then deleted only the `User` row. All five rows
disappeared — cascading two levels, User → DoctorProfile → WorkingHour/LeaveDay,
with no application code involved.

---

## Step 11 — Admin doctor CRUD

**Built:** five endpoints under `/api/admin/doctors`, `doctor.service.ts`, and
validation schemas. First real use of `requireRole("ADMIN")`, and the app's first
database transaction.

**Concepts that appeared:**

- **REST: URLs name things, verbs say what you do to them.** `POST /doctors`, not
  `POST /createDoctor` — the verb is already in the request.
- **PUT vs PATCH.** PUT *replaces* the whole resource; PATCH *modifies* named
  fields. PUT is idempotent — sending it five times leaves the same state as once.
  Proved it: the same working-hours payload sent three times returned 3 rows every
  time.
- **Status codes as a vocabulary.** 201 with a `Location` header on create, 204 with
  no body on delete, 400 malformed input, 401 unidentified, 403 identified and
  refused, 404 missing, 409 conflicts with current state. All verified by curl.
- **`params` is a Promise in Next 15** and must be awaited. It used to be a plain
  object; forgetting the `await` hands you a Promise where a string was expected.
- **The first transaction.** Creating a doctor writes to three tables — User,
  DoctorProfile, WorkingHour. A User with role DOCTOR but no profile would be a
  broken account that can log in and see nothing, so all three succeed or none do.
- **bcrypt runs BEFORE the transaction opens.** Hashing costs ~100 ms of CPU, and
  holding a database connection open during unrelated work starves the pool. Same
  principle as never doing network I/O inside a transaction — the rule that matters
  in Step 18.
- **Filtering happens in SQL,** with `contains` + `mode: "insensitive"`, not by
  fetching every doctor and filtering in JavaScript.
- **Services throw domain errors, routes map them.** `getDoctor` throws
  `AppError("NOT_FOUND")`; the route turns that into a 404 via `toErrorResponse`.
  The service still knows nothing about HTTP.

**Two bugs found by testing, both worth remembering.**

*1. Stale Prisma client behind the singleton.* The first admin request 500'd with
`Cannot read properties of undefined (reading 'findMany')`. The `globalThis` cache
from Step 6 survives hot reload — which is the point — but it also survives
`prisma generate`, so the running server still held a client built from the old
schema with no `doctorProfile` model. A full restart fixed it. **After changing the
schema, restart the dev server; hot reload is not enough.**

*2. An empty PATCH silently corrupted data.* `PATCH {}` returned 200 and reset
`slotDurationMin` from 45 to 30 — a field the request never mentioned. Cause:
`updateDoctorSchema` was derived with `createDoctorSchema.pick().partial()`, and
**both `.pick()` and `.partial()` preserve `.default(30)`**. So `{}` parsed to
`{ slotDurationMin: 30 }`, the "at least one field" guard saw one key and passed, and
the service wrote it. Fixed by declaring the PATCH schema from scratch with no
defaults anywhere.

> **A default turns "not mentioned" into "set it to this", which is the exact
> opposite of PATCH semantics.**

**Also improved:** zod 4's default message is a bare `"Invalid input"`, which tells an
API client nothing. Every field now carries an explicit message, so a 400 response
names what is wrong per field.

**Noted for later:** `deleteDoctor` currently deletes the User and cascades away the
profile, hours and leave. Once `Appointment` exists this becomes unsafe — medical
records must survive a doctor leaving the clinic. That relation needs `Restrict`, and
this turns into a soft delete. A comment in the service records this.

---

## Step 12 — generateSlots(), a pure function with unit tests

**Built:** `slot.core.ts` (pure, zero imports, 16 unit tests), `slot.service.ts`
(the database shell), and `DoctorProfile.timezone`.

**Concepts that appeared:**

- **A pure function's output depends only on its arguments and it changes nothing
  outside itself.** Same inputs, same output, forever.
- **Why `now` is a parameter.** The tempting version calls `Date.now()` internally.
  That function cannot be tested: any assertion about "past slots are excluded"
  passes today and fails tomorrow. Injecting `now` makes "it is 12:00 on 25 August
  2026" just another argument.
- **Functional core, imperative shell.** All the logic worth testing lives in a
  function that needs no database; the database work is left trivial enough that it
  needs no test.
- **The timezone trap, and the schema gap it exposed.** `startMinute = 540` means
  09:00 *clinic time*; `Appointment.startAt` will be a UTC instant. Converting
  between them requires the clinic's zone, which the schema could not answer — this
  was exactly the gap Step 10's second question pointed at. Added
  `DoctorProfile.timezone`.
- **Rule: store UTC, render local.**
- **Why the conversion needs two passes.** A zone's offset depends on the instant,
  and we are trying to *find* the instant. The first guess lands close enough that a
  second offset lookup is correct even across a DST boundary. A naive
  "subtract a fixed offset" gets one side of a DST change wrong.
- **Slot boundary rule:** the loop condition tests the slot's END against closing
  time, so 09:00–10:00 with 45-minute slots yields one slot, not two.

**The bug that forced a better design.** After adding the database wrapper to the
same file as the pure function, every test failed with
`Cannot find package '@/server'`. Node has no idea what `@/` means — it is a
TypeScript/bundler alias. The comment in that file claimed "functional core,
imperative shell", but they were in one module, so importing the core dragged Prisma
in with it.

Splitting them into `slot.core.ts` (zero imports) and `slot.service.ts` made the
separation real rather than aspirational. **A pure module that imports nothing cannot
accidentally acquire a dependency** — and the test suite proves it on every run.

**Tests: 16 passing, no test framework.** Node 24 runs `.ts` files natively, so
`node --test` needed no vitest, jest or ts-node. Covered: slot spacing, wrong
weekday, leave days, busy starts, past slots, minimum notice, split shifts, slots
overrunning closing time, duplicates from overlapping shifts, and four DST cases.

**The DST tests are the ones worth showing an interviewer.** A doctor's schedule row
for "Monday 09:00" is identical all year, yet Monday 6 July resolves to 13:00 UTC and
Monday 2 November to 14:00 UTC in New York. Also tested Asia/Kathmandu at UTC+5:45,
which catches any code assuming whole-hour offsets.

---

## Step 13 — Patient doctor search and slot grid

**Built:** `/patient/doctors` (search) and `/patient/doctors/[id]` (availability),
patient-facing service functions, and two API routes. Phase 2 complete.

**Concepts that appeared:**

- **A Server Component can call a service directly — no API route needed.** A page
  that only reads data can `await` the service during render and send finished HTML.
  The API route is a phone line between two rooms; standing in the kitchen, you do
  not phone the kitchen.
- **So why build the API routes at all?** For callers that are not our own
  server-rendered pages, and for anything the browser must do *after* the page
  loads — placing a hold, refreshing availability. Reads go direct; interactions get
  an endpoint.
- **Filter in SQL, not in JavaScript.** Fetching every doctor and calling `.filter()`
  works at 20 doctors and fails at 5,000: every row crosses the network to be
  discarded, and the `specialisation` index from Step 10 goes unused. `contains` with
  `mode: "insensitive"` becomes `ILIKE` and the database does the work.
- **`DISTINCT` also belongs in SQL.** The specialisation filter list uses Prisma's
  `distinct`, not a JavaScript `Set` over every row.
- **`searchParams` is a Promise in Next 15,** exactly like `params`.
- **`Promise.all` avoids a waterfall.** Awaiting the two queries one after the other
  would make the page wait for the sum of both round trips instead of the longer one.
- **Different audiences get different projections.** `listDoctors` (admin) returns
  email and phone; `searchDoctors` (patient) does not. That decision lives in the
  service, not in the UI's memory.
- **Store UTC, render local — seen working.** The API returns
  `2026-08-29T03:30:00.000Z` and the page displays `09:00`, converted through
  `DoctorProfile.timezone` with `Intl.DateTimeFormat`.

**The result worth noticing:** `/patient/doctors` ships **170 B** of JavaScript. It
has a search box, filter chips and navigation, and sends essentially no JS, because
every interactive-looking element is a plain `<form>` or `<Link>`. A GET form sets
`?q=…` and the server re-renders.

**A moment that looked like a bug and was not.** Dr Priya works Saturday 09:00–11:00,
and her page showed "no slots available" on a Saturday. The server clock read 12:12
IST — every slot that day had already passed, and the past-slot filter from Step 12
correctly removed them. The following Saturday showed exactly 8 slots, 09:00 to 10:45
at 15-minute spacing, with nothing overrunning the 11:00 close.

**Verified:** search lists 4 doctors, `?q=derm` narrows to Dr Anita Rao, an
unauthenticated request redirects to `/login`, the slots API returns 400 for a
malformed date, 404 for an unknown doctor, and 401 with no session.

---

## Step 14 — Watching it double-book (the bug, deliberately unfixed)

**Built:** the `Appointment` model, a naive check-then-insert booking service,
`POST /api/appointments`, and `scripts/race-test.ts`. Phase 3 begins.

**Concepts that appeared:**

- **A race condition is two things happening in an order nobody planned for.**
  The booking flow is: read availability, check the slot is free, insert. Between
  the read and the insert there is a gap of real milliseconds in which another
  request can run its own read, get the same answer, and insert too.
- **TOCTOU again** — time of check to time of use, the same flaw as the email check
  in Step 6. The check is truthful when made and stale by the time it is used.
- **No amount of application code closes it.** Re-checking just before the insert
  only narrows the window. The gap is *between* statements, not inside one, so there
  is no last line of JavaScript that fixes it.
- **An index is not a constraint.** `@@index([doctorId, startAt])` makes lookups
  fast. It does not make them exclusive. This distinction is the whole step.
- **`onDelete: Restrict` on Appointment, not Cascade.** Appointments are medical
  records and must outlive a doctor's employment, so Postgres refuses the delete
  rather than removing history. This answers the question Step 10 raised: the third
  option beyond cascade and error is a soft delete, which is what `deleteDoctor`
  becomes.
- **Cancelled appointments do not block their slot.** `getAvailableSlots` filters to
  `PENDING` and `CONFIRMED`, so a cancellation frees the time again. That is exactly
  the reasoning that makes the Step 15 index *partial*.
- **`patientId` comes from the session, never the request body.** Accepting it from
  the body would let anyone book in someone else's name — the same class of bug as
  the `role` mass assignment in Step 6.
- **The day query is bounded by a `startAt` range** so the `(doctorId, startAt)`
  index is used, rather than fetching a doctor's whole history to find one day.

**THE RESULT — 10 simultaneous requests at one slot:**

```
  HTTP 201 × 8
  HTTP 409 × 2
  rows in the database for that slot: 8
```

Eight different patients booked the same twenty-minute appointment. The creation
timestamps span **51 milliseconds** — 01:31:57.783 through 01:31:57.834. That number
is the race window, measured rather than imagined.

The two that returned 409 were simply slow enough that a row existed by the time they
checked. That is the naive code "working", and it is pure luck of timing.

**What this looks like in the real world:** eight people arrive at the clinic at
09:00 on Monday for the same appointment. The system told every one of them it was
confirmed.

**Deliberately not fixed.** The broken implementation is committed as its own step so
the history shows the problem before the solution. Step 15 fixes it in the database,
which is the only place it can be fixed.

---

## Step 15 — The fix: a partial unique index ⭐

**Built:** a hand-written migration that repairs the duplicate data and then creates
`appointment_slot_unique`, plus P2002 handling in the booking service.

**Concepts that appeared:**

- **Only the database can settle this, because only the database sees every
  request.** The Node process may be one of several on Vercel, each with its own
  memory. A JavaScript lock, a mutex or a "currently booking" set is invisible to the
  others. Postgres is the single thing every request must pass through.
- **A UNIQUE constraint is not a check performed for you — it is a promise
  enforced.** Two inserts on the same key are serialised internally and the loser is
  rejected. There is no window, because the check and the write are one operation.
- **Why the index must be PARTIAL.** A plain unique index on `(doctorId, startAt)`
  means "at most one appointment ever at this time", cancelled ones included. A
  patient cancels Monday 09:00 and that slot becomes permanently unbookable, because
  the cancelled row still occupies the key. `WHERE status IN ('PENDING','CONFIRMED')`
  drops non-live rows out of the index entirely.
- **You cannot add a constraint to a table whose data already violates it.** The
  first attempt was refused: *"could not create unique index — Key ("doctorId",
  "startAt")=(…, 2026-08-24 03:30:00) is duplicated."* Real migrations adding
  constraints to live tables always face this. The constraint is the easy half; the
  data repair is the hard half.
- **The repair policy matters.** Earliest booking wins, later ones are CANCELLED
  rather than deleted — an appointment is a medical record, and those patients still
  need notifying. Written as a `ROW_NUMBER() OVER (PARTITION BY …)` window function
  in the same migration, so repair and constraint apply atomically.
- **The pre-check stays, with a different job.** It answers "is this even a real
  slot?" — inside working hours, not a leave day, not in the past — which an index
  cannot answer, and it produces a readable message. The step 14 bug was never
  "we checked first"; it was **"checking was all we did"**.

> **A check is a courtesy. A constraint is a promise.**

- **P2002** is Prisma's code for a unique violation (Postgres SQLSTATE 23505).
  Catching it and returning 409 is how losing the race becomes a normal outcome
  rather than a 500.

**THE RESULT — same test, same concurrency, fixed database:**

```
  10 concurrent → HTTP 201 × 1, HTTP 409 × 9   → 1 row   ✅
  10 concurrent → HTTP 201 × 1, HTTP 409 × 9   → 1 row   ✅
  10 concurrent → HTTP 201 × 1, HTTP 409 × 9   → 1 row   ✅
  25 concurrent → HTTP 201 × 1, HTTP 409 × 24  → 1 row   ✅
```

Before the fix, the same script produced **8 winners out of 10**.

**Proof the WHERE clause does what it claims:** inserting a second live row for a
booked slot was refused with `23505: appointment_slot_unique`. After cancelling that
appointment, the identical slot was booked again successfully, leaving 1 CONFIRMED and
1 CANCELLED row for the same time. History preserved, slot reusable.

**Bonus observation during cleanup:** deleting the test patients was blocked by
`23001: Appointment_patientId_fkey` until their appointments were removed first —
`onDelete: Restrict` protecting medical records, working exactly as intended.

---

## Step 16 — Prisma errors and HTTP semantics

**Built:** `db-errors.ts` (one translator, 10 unit tests) and a rewritten
`toErrorResponse`. Every route now maps errors the same way.

**Concepts that appeared:**

- **Status codes divide errors by whose problem it is and what to do next.**
  400 — the request is malformed, fix it and retry; retrying unchanged never works.
  409 — the request is valid but conflicts with current state; retrying unchanged
  might work later, or never. 500 — our problem, the client did nothing wrong.
- **Why P2002 is 409, not 400.** Losing the booking race means the request was
  flawless — the slot genuinely was free when it was asked about. Nothing about the
  *request* was wrong; the world changed. 400 blames the client for something they
  could not have known.
- **Why it is not 500 either,** and this is the operational argument: 500s should
  page someone at 3am. Losing a race is a planned, normal outcome. If it emits 500s,
  the alerting drowns in noise and people stop looking at it.
- **Error mapping belongs in one place.** Three services each caught `P2002` and
  *assumed* which constraint had fired. That assumption becomes silently wrong the
  moment a table gains a second unique constraint. The translator identifies the
  constraint by name.
- **Unknown database errors return `undefined` and are rethrown,** so they become
  500s. Swallowing what you do not recognise is how real bugs go silent.
- **Responses carry a machine-readable `code`.** Clients branch on
  `code: "CONFLICT"`, never on message text — messages get reworded, and any client
  parsing English breaks without warning.
- **Error text is not returned to the client.** Database messages leak table names,
  query fragments and file paths. The detail is logged; the client gets
  "Something went wrong".

**Prisma 7 gotcha worth remembering.** Every tutorial reads `e.meta.target` to find
which constraint failed. With driver adapters **that field does not exist**. Probing a
real database showed the detail lives at
`meta.driverAdapterError.cause.constraint`, as `{ fields: ["email"] }` or
`{ index: "appointment_slot_unique" }`. Both shapes plus the classic `meta.target`
are handled, so swapping the adapter will not break it.

Observed codes: 23505 unique → `P2002`; 23503 foreign key → `P2003`; 23514 check →
`P2039`; missing row on update/delete → `P2025`.

**Second Node gotcha, hit twice in one step.** Node runs `.ts` files by **stripping
types, not compiling them**:

1. Imports need explicit extensions — `./errors` had to become `./errors.ts` — because
   Node's ESM loader resolves real files while webpack and tsc do not require it.
2. `AppError` used TypeScript **parameter properties**
   (`constructor(public readonly code: ...)`), which need real code generation and
   fail with `ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX`. Rewritten as explicit field
   declarations. The same limitation applies to `enum`, namespaces and decorators.

**Tests use error shapes captured from a real database,** not invented ones. A
fixture I made up would test my imagination rather than Prisma's actual behaviour —
and given `meta.target` turned out not to exist, an invented fixture would have
passed while the production code failed.

---

## Step 17 — Slot hold mechanism ⭐

**Built:** `SlotHold`, `hold.service.ts`, `POST/GET /api/holds`,
`DELETE /api/holds/:id`, and `scripts/hold-test.ts`. Graded problem 2.

**The problem it solves, stated as UX:** a patient picks 10:00, spends two or three
minutes on the symptom form, presses Confirm, and is told the slot was just taken.
They typed all of that for nothing, and the system behaved *correctly*. That is the
worst kind of correct.

**Concepts that appeared:**

- **A hold is a short-lived reservation** — the seat timer on a cinema booking site.
  Ten minutes, then the slot goes back.
- **Why Postgres and not Redis with a TTL.** Redis is the textbook answer and is
  genuinely good: automatic expiry, very fast. It also means a second datastore to
  deploy and pay for, and — the deciding argument — the hold and the appointment
  would live in **different systems**, so converting one into the other could no
  longer be a single atomic transaction. Postgres gives the same exclusivity inside
  the same transaction as the booking. Redis is the scale-up path, not the start.
- **The thing Redis does for free and we must do ourselves: expiry.** A row whose
  `expiresAt` has passed is still a row, and still occupies the unique key.
  **An expired hold that nobody deletes locks that slot forever.**
- **Two cleanup paths, deliberately.** Lazy expiry inside `createHold` deletes a dead
  hold on the slot being claimed; the cron sweep in Step 37 catches slots nobody
  retries. Lazy alone leaves an untouched slot invisible indefinitely.
- **Reads must not write.** `getAvailableSlots` filters holds by `expiresAt > now`
  rather than deleting them. A GET that mutates is surprising, and it would make an
  availability check take a write lock.
- **Plain unique here, partial for Appointment — and the contrast is the point.**
  Appointments keep cancelled rows forever because they are medical records, so the
  index must exclude them. A hold is ephemeral and is deleted, so nothing lingers in
  the key and a plain constraint is correct.
- **One live hold per patient.** Creating a hold deletes the patient's previous one.
  That matches the UX (selecting a new slot abandons the old) and prevents one user
  holding every slot a doctor has — which would otherwise be a trivial denial of
  service.
- **Re-holding your own slot returns the existing hold** instead of erroring. A
  double-click must not be a failure.
- **`releaseHold` returns 404, not 403, for someone else's hold.** A 403 would
  confirm that the hold exists — that is, that some other patient is booking that
  slot. Same non-disclosure reasoning as D17.

**Verified by `scripts/hold-test.ts`:**

```
  1. two patients race        → 201 and 409  ✅
  2. slot hidden from others  → yes ✅
  3. release (204) returns it → yes ✅
  4. once expired, reappears  → yes ✅
     another patient claims it → yes ✅
     rows on that slot: 1 (not 2) ✅
```

**Mistake caught in my own test script:** check 4 originally printed "invisible to
others: yes" when the slot had in fact become *visible* — the label was inverted, so a
passing test read as though it were asserting the opposite. Corrected to "once
expired, slot reappears in availability". A test whose output misdescribes what it
checked is worse than no test.

---

## Steps 18–21 — Booking transaction, symptom form, LLM integration

> Built as a batch at Shubhangam's request. **Revisit before the interview** —
> Step 18 underpins graded problem 4 and Steps 20–21 are the LLM failure handling,
> both explicitly on the grading list.

### Step 18 — the booking transaction

- **One `prisma.$transaction` does four things or none:** verify hold ownership and
  expiry, delete the hold, create the appointment, queue notification rows.
- **THE GOLDEN RULE: no network I/O inside a transaction.** No email is sent and no
  calendar API is called there. Sending inside would mean a mail server hiccup
  **rolls back a valid appointment**, and it holds a database connection open for
  however long the network takes.
- **The outbox pattern in miniature.** The transaction writes `Notification` rows
  with `status: PENDING`. A worker delivers them later. The appointment commits
  whether or not email works.
- **`idempotencyKey` is deterministic** — `booking-confirmed:{appointmentId}:patient`
  — so retrying a booking can never queue a second copy of the same email.
- **The payload is captured at write time,** not re-queried at send time, so editing
  an appointment later cannot change the contents of an already-queued message.
- An expired hold gets its own message: the patient did nothing wrong, their time
  ran out.

### Step 19 — symptom form gated by a hold

- **The form is written in the same transaction as the appointment,** so there can
  never be an appointment without symptoms, nor a form orphaned by an abandoned
  booking.
- **Two gates, deliberately.** `/patient/book` redirects away without a live hold,
  *and* the booking transaction re-checks. The UI check is a courtesy to honest
  users; the transaction check is the rule — a hold can expire between render and
  submit.
- **`SlotPicker` is the first real client island** — the answer to the question asked
  back in Step 2. The page stays a Server Component that queries Postgres; only the
  clickable grid ships JavaScript. Dates cross the boundary as ISO strings, because
  only JSON-serialisable values may be passed as props.
- **`listPatientAppointments` scopes by `patientId` in the query itself.** Resource
  ownership enforced in the WHERE clause is much harder to get wrong than a
  conditional after the fetch.

### Step 20 — the Gemini client

- **`AbortController` is what actually stops a request.** Without it `fetch` can hang
  far longer than any nominal timeout. 15 seconds here.
- **One retry, and only for 5xx or 429.** A 4xx means our request is wrong, so
  retrying just sends the same wrong request. A missing API key is a config error and
  is never retried.
- **The client returns a discriminated union rather than throwing,** because "the
  model did not answer" is a normal outcome the caller must handle, not an exception.
- **Temperature 0.2** — this is extraction, not creative writing.
- **Prompts are versioned exported constants,** and every summary stores its
  `promptVersion`, so when output quality changes you can tell whether the model
  moved or the prompt did.
- **The assignment's baseline prompt was kept and improved:** explicit role, exact
  JSON schema with key names, a no-markdown-fences instruction, enum spellings that
  match what is stored, length caps, a do-not-diagnose safety boundary, structured
  context fields rather than prose alone, and an explicit rule against inventing
  detail the patient never reported.

### Step 21 — validation and the three states

- **Prompting for a shape is a request, not a guarantee.** Models wrap JSON in
  ```json fences, add a sentence before it, return `"high"` instead of `"HIGH"`,
  invent extra keys, or apologise instead of answering.
- `parseModelJson` strips fences and surrounding prose, then zod validates. **12 unit
  tests cover exactly those failure modes.**
- **Three states: PENDING | READY | FAILED.** The PENDING row is created inside the
  booking transaction so a doctor can tell "not ready yet" from "nobody tried".
- **`rawModelOutput` is stored on failure** — you cannot fix a prompt whose output you
  cannot see.
- **Generation never blocks booking.** It runs in `after()`, once the response is
  flushed. **Measured: booking returned in 1062 ms while the LLM timeout is
  15 000 ms.**
- **Regeneration checks resource ownership, not just role.** Being a doctor is not
  enough — it must be *this appointment's* doctor.

**Failure path verified with no API key set:** booking 201, appointment CONFIRMED,
symptom form stored, summary `FAILED` with `lastError: "GEMINI_API_KEY is not set"`.
Nothing crashed and the appointment is real.
