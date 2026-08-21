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
