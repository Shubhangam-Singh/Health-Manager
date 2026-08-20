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
