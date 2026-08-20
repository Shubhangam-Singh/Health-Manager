# BUILD_PLAN.md — 42 micro-steps

Read `CLAUDE.md` first. One step at a time. Stop after each. Wait for `next`.

Each step must produce, in this order:
`## CONCEPT` → code in ≤40-line chunks with walkthrough → `## VERIFY` →
**2 interview questions, then stop** → append to `docs/LEARNING_LOG.md` and
`docs/DESIGN_DECISIONS.md`.

Rough split: **Day 1 → steps 1–18. Day 2 → steps 19–33. Day 3 → steps 34–42.**
Day 1 is heaviest on purpose — it contains the graded core.

---

## PHASE 0 — Next.js mental model + skeleton (steps 1–5)

**1. What Next.js actually is, and project init**
Teach: why a framework on top of React at all; server rendering vs client
rendering in plain English; App Router file-based routing; what `npm run dev`
actually starts. Then `create-next-app` with TypeScript + Tailwind + App Router.
Walk through every generated file and say what it does.

**2. Routing, layouts, and the server/client split**
Teach: `page.tsx` vs `layout.tsx`; **Server Components are the default and this is
the single biggest Next.js concept**; what `"use client"` does and when you're
forced to use it. Build one static page and one interactive counter to make the
difference visible.

**3. Folder structure and route groups**
Create the structure from `CLAUDE.md`. Teach what `(auth)` parentheses mean (route
groups — organise without affecting the URL). Explain the thin-API/fat-service rule
and why we're imposing it on ourselves.

**4. Postgres on Neon + Prisma init**
Teach: what an ORM is and what it saves you from; what a migration is and why
migrations are committed to git. Create Neon DB, `prisma init`, first `User` model,
`migrate dev`, open Prisma Studio and look at the actual table.

**5. Environment variables and secrets**
Teach: why secrets never go in git; the difference between server-only vars and
`NEXT_PUBLIC_` vars (**and why leaking a key via `NEXT_PUBLIC_` is a classic
interview trap**). Create `.env` and `.env.example`. Confirm `.gitignore`. Set git
identity (`user.name` `Shubhangam-Singh`, `user.email`
`shubhangam2005singh@gmail.com`) and make the first commit. Commit after every step
from here on.

---

## PHASE 1 — Auth and roles (steps 6–9)

**6. Registration: first real API route + first service**
Teach: what a route handler is (it's just a function that gets a Request and
returns a Response — same as Express, different wrapper); why passwords are hashed
not encrypted; what bcrypt salting does. Build: zod input schema → `auth.service.ts`
→ thin `POST /api/auth/register`. Test with curl before building any UI.

**7. Auth.js v5 with credentials + role in the session**
Teach: sessions vs JWTs, what's actually inside a JWT, why we put `role` in the
token, why a JWT can't be "logged out" server-side. Wire up the credentials
provider and the jwt/session callbacks.

**8. Middleware and route protection**
Teach: what middleware is and where it runs (before the page, on every matched
request). Protect `/patient/*`, `/doctor/*`, `/admin/*` by role. Then teach the
important bit: **middleware is a convenience, not security — every API route must
re-check authorisation itself.** Build a `requireRole()` helper.

**9. Login page + three empty dashboards**
Login form, redirect by role. Three placeholder dashboards. First end-to-end
walkthrough: browser → form → API → DB → session → protected page. Draw the flow.

---

## PHASE 2 — Doctors, schedules, slots (steps 10–13)

**10. Doctor-side schema**
`DoctorProfile`, `WorkingHour`, `LeaveDay`. Teach one-to-one vs one-to-many, foreign
keys, cascade deletes, and why working hours are separate rows instead of a JSON
blob (queryability).

**11. Admin doctor CRUD**
Full create/list/update/delete for doctor profiles including working hours and slot
duration. Teach REST resource naming and correct status codes (200/201/400/401/403/
404/409). API design is on the grading list — get the verbs and codes right.

**12. Slot generation — a pure function**
Teach: pure functions and why they're trivially testable. Build `generateSlots()`
in `slot.service.ts`: working hours + slot duration + date → slot list, minus leave
days, minus booked appointments, minus active holds, minus past times. **Write unit
tests for this one** — it's the kind of function interviewers love to poke at.
Teach the timezone trap: store UTC, render local.

**13. Patient: search doctors + view slots**
Search/filter by specialisation. Slot grid UI. Teach data fetching in a server
component vs a client component, and why filtering happens in SQL not in JavaScript.

---

## PHASE 3 — The booking core ⭐ (steps 14–18)

> This is the highest-value phase in the whole project. Slow down here.

**14. Show the race condition — write the broken version first**
Build the naive `SELECT`-then-`INSERT` booking. Then write `scripts/race-test.ts`
that fires 10 simultaneous requests at the same slot. **Show him the duplicate rows
in Prisma Studio.** Explain the race window in wall-clock terms. Do not fix it yet —
let the bug sit there for a minute.

**15. Fix it at the database level**
Teach: why the DB is the only correct place for this guarantee; unique index vs
partial unique index; why a plain unique index would permanently block cancelled
slots. Write the raw SQL migration by hand. Re-run the race test → exactly 1 success,
9 rejections. **This moment is the project.**

**16. Prisma error handling and correct HTTP semantics**
Catch `P2002`, map it to `409 Conflict` with a useful message. Teach: why 409 and
not 400 or 500; how error mapping belongs in one place, not scattered.

**17. Slot hold mechanism**
Teach the UX problem first (filling a form then getting rejected). Build `SlotHold`
with unique constraint + `expiresAt`. Hold on slot selection, convert to appointment
on confirm, release on abandon. Lazy expiry on read.

**18. Booking transaction end to end**
One `prisma.$transaction`: validate hold ownership → delete hold → create appointment
→ write notification rows (outbox — nothing is actually sent yet). Teach ACID
concretely with this exact transaction. **Teach the golden rule: no network calls
inside a transaction.** Re-run the race test. Then write the double-booking + slot
hold sections of `DESIGN_DECISIONS.md` while it's fresh.

---

## PHASE 4 — Symptom form + pre-visit LLM (steps 19–22)

**19. Symptom form, gated by an active hold**
Multi-field form. Server-side check that the caller owns a live hold. Teach: never
trust the client — validate on the server even if the UI already validated.

**20. Gemini client + prompt engineering**
Teach: what an API key is and why it stays server-side; token limits; temperature.
Build `llm/client.ts` with `AbortController` timeout + 1 retry. Put the assignment's
given prompt in `prompts.ts`, then **improve it** — add explicit JSON schema
instruction, a role, and constraints. Prompt quality is graded; explain each
improvement.

**21. Zod validation + the three-state summary**
Teach: LLMs return broken JSON regularly, so validation is mandatory. Zod-parse the
output into `PreVisitSummary` with `status: PENDING|READY|FAILED`. Generation runs
after the booking response — **booking never waits on the LLM**. Test the failure
path deliberately by using a bad API key.

**22. Doctor's pre-visit view**
Urgency badge, chief complaint, three suggested questions. On `FAILED`: show raw
symptom text + a Regenerate button. Teach graceful degradation as a design principle,
not an afterthought.

---

## PHASE 5 — Notifications and the worker (steps 23–26)

**23. The outbox pattern**
Teach it properly with the failure story: email server down → transaction rolls back
→ patient loses a valid appointment. Build the `Notification` model with `status`,
`attempts`, `lastError`, `nextRetryAt`, `idempotencyKey`. Explain idempotency with a
concrete duplicate-email example.

**24. Nodemailer + templates**
Gmail app password setup. `mailer.ts` behind an interface (so SendGrid could be
swapped in — say this in the interview). Templates for confirmation, reminder,
cancellation, leave-cancellation. Send one real email to himself.

**25. The cron endpoint and retry logic**
Build `/api/cron/notifications` guarded by a `CRON_SECRET` header. Teach why an
unprotected cron endpoint is an open relay for spam. Implement exponential backoff
(1m → 5m → 15m → 1h → 6h), max 5 attempts, then `FAILED`. Batch limit per run.

**26. Wire up cron-job.org**
Explain why Vercel Hobby's once-daily cron doesn't work for us. Register the job at
5-minute intervals with the secret header. Watch a queued email actually go out.

---

## PHASE 6 — Google Calendar + OAuth 2.0 (steps 27–30)

> Budget generously. This is where most people lose a day.

**27. OAuth 2.0 explained properly**
Teach: authorisation code flow step by step; access token vs refresh token; scopes;
consent screen; why we never see the user's Google password. Draw the full sequence.
**This is very likely to be an interview question — make sure he can narrate the
flow unprompted.**

**28. Google Cloud Console setup**
Create project, enable Calendar API, OAuth consent screen (External, Testing), add
his email as a test user, create credentials, set redirect URIs for both localhost
and the future Vercel URL. Document every click in the README as you go — the README
must contain these steps.

**29. Connect flow + token storage and refresh**
"Connect Google Calendar" button → consent → callback → store refresh token in
`GoogleAccount`. Build automatic access-token refresh on expiry. Teach why refresh
tokens are high-value secrets and how you'd encrypt them at rest in production.

**30. Event create / update / delete**
Create events for both patient and doctor on booking; update on reschedule; delete on
cancel. Store `googleEventId` in `CalendarEvent`. **Critical:** a Calendar failure
must never fail the booking — it queues as a retryable task like any notification.
Test by disconnecting mid-flow.

---

## PHASE 7 — Doctor leave conflict ⭐ (steps 31–33)

**31. Conflict detection before mutation**
Admin marks leave → system finds affected appointments → returns them → requires
explicit `confirm: true`. Teach: destructive actions need confirmation, and detection
must be separate from mutation.

**32. Cascade cancel in one transaction**
On confirm: create `LeaveDay` → cancel affected appointments with reason
`DOCTOR_LEAVE` → queue patient notifications → queue calendar deletions. All inside
one transaction; all the actual sending happens in the worker afterwards.

**33. Alternate slot suggestions**
Reuse `generateSlots()` to find the patient's 3 nearest alternatives and include them
in the cancellation email as booking links. Small feature, disproportionately good
impression. Write the leave-handling section of `DESIGN_DECISIONS.md`.

---

## PHASE 8 — Post-visit + medication reminders (steps 34–37)

**34. Visit notes + structured prescription**
`VisitNote`, `Prescription`, `PrescriptionItem` (drug, dose, frequency, duration).
Teach: why structured prescription fields beat a free-text box — because reminders
must be computed from them.

**35. Post-visit LLM summary**
Second prompt, same failure-handling pattern as step 21. Patient-friendly language,
medication schedule, follow-up steps. Reuse the client — teach why not to duplicate
the timeout/retry logic.

**36. Turn frequency into a reminder schedule**
Teach the mapping (`TWICE_DAILY` + 5 days → 10 timestamped reminders) and why we
materialise rows instead of computing on the fly (idempotency, visibility,
cancellability). Generate `MedicationReminder` rows on prescription creation.

**37. Reminder dispatch**
`/api/cron/reminders` picks up due reminders, converts them to notifications, reuses
the existing retry machinery. Teach: reuse over rebuild. Also add
`/api/cron/cleanup-holds`.

---

## PHASE 9 — Ship and prepare for the grilling (steps 38–42)

**38. Seed script + demo accounts**
`scripts/seed.ts`: 1 admin, 4 doctors across specialisations with working hours,
3 patients, a few appointments in different states. Evaluators must be able to log in
and see a populated app in 30 seconds. Put credentials in the README.

**39. Deploy to Vercel**
Connect repo, set every env var, add the production URL to Google's redirect URIs,
point cron-job.org at production. Teach build-time vs runtime env vars — a classic
first-deploy failure.

**40. README**
Setup guide, `.env.example`, **full API docs** (every endpoint: method, path, auth,
body, responses including error codes), DB schema + ER diagram, both LLM prompts
verbatim, Google Calendar setup steps, demo credentials, architecture overview.
This is a graded deliverable — treat it like one.

**41. The 800-word system design write-up**
Compile from `docs/DESIGN_DECISIONS.md`. Four sections, roughly 200 words each:
double-booking prevention, doctor leave conflict handling, slot hold mechanism,
notification failure handling. State the trade-off in each. **Hard limit 800 words —
count them.**

**42. Interview drill**
Full mock grilling. Cover: the race condition and why the DB solves it; partial
unique index reasoning; slot hold vs Redis; the outbox pattern; idempotency;
exponential backoff; OAuth 2.0 flow narrated end to end; refresh token security;
LLM failure states; server vs client components; why Next.js full-stack; what he'd
change to scale to 100k users; what he'd do differently with two more weeks.

Anything he answers weakly → go back and re-teach that step.

---

## The interview questions he must be able to answer cold

Keep these in view the whole way through:

1. Two patients click the same slot at the exact same millisecond. Walk me through
   what happens.
2. Why a partial unique index and not a plain one?
3. Why not just check availability before inserting?
4. What if the email service is down when someone books?
5. Why don't you send the email inside the transaction?
6. How do you guarantee a retry doesn't send a duplicate email?
7. Explain the OAuth 2.0 authorisation code flow.
8. Where do you store the refresh token, and how would you secure it in production?
9. What happens if Gemini times out during booking?
10. How do you handle malformed JSON from the LLM?
11. Why Postgres and not MongoDB for this?
12. What's a server component and why does it matter here?
13. Your slot hold expires while the patient is typing. Then what?
14. Scale this to 100,000 patients. What breaks first?
15. What would you build differently with two more weeks?
