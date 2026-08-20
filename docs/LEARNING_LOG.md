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
