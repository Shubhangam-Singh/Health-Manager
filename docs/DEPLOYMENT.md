# Deployment guide

Three tasks, in this order. The order matters: Google needs your production URL, and
you do not have one until Vercel has deployed.

```
Step 0  Push to GitHub
Step 1  Google Cloud OAuth        (localhost first)
Step 2  Deploy to Vercel          (gives you the production URL)
Step 3  Point Google at production
Step 4  cron-job.org              (needs the production URL)
```

> **Every secret below is written as a placeholder.** Read the real values from your
> local `.env`, which is gitignored and must stay that way. Never paste a real
> credential into this file — it is committed and public.
>
> ```bash
> cat .env        # your values live here
> ```

---

## Step 0 — Push your work to GitHub

Vercel deploys from GitHub, so it must be up to date.

```bash
cd ~/Downloads/USolutions
git status          # must say: nothing to commit, working tree clean
git push origin main
```

If it asks for a password, use a **Personal Access Token**, not your GitHub password:
GitHub → avatar → **Settings** → **Developer settings** → **Personal access tokens** →
**Tokens (classic)** → **Generate new token** → tick **repo** → copy it and paste it as
the password.

**Check:** open your repository page and confirm the latest commit is there, and that
**`.env` is NOT listed** — only `.env.example` should be.

---

## Step 1 — Google Cloud OAuth

Roughly 20 minutes. You are creating an app that may ask *your users* for permission to
write to their Google Calendar.

### 1.1 Create a project

1. Go to **https://console.cloud.google.com**
2. Sign in with the Google account you will demo with.
3. Top-left, click the **project dropdown** → **NEW PROJECT**.
4. Project name: `Health Manager` → **CREATE**.
5. Wait for the notification, then **select that project**. Everything below must
   happen inside it — check the dropdown before each step.

### 1.2 Enable the Calendar API

1. Left menu (☰) → **APIs & Services** → **Library**.
2. Search `Google Calendar API`.
3. Click it → **ENABLE**.

> Skip this and everything appears to work until runtime, where event creation fails
> with *"Google Calendar API has not been used in project…"*.

### 1.3 Configure the consent screen ("Google Auth Platform")

Google renamed this area. If your left menu shows **Overview / Branding / Audience /
Clients / Data access / Verification centre**, you are on the new UI — follow this.
(The old UI called the whole thing "OAuth consent screen".)

Left menu (☰) → **APIs & Services** → **OAuth consent screen**, or go directly to
**https://console.cloud.google.com/auth/overview**.

**a) Branding** (was "App information")

- App name: `Health Manager`
- User support email: your email
- Leave logo, app domain and links empty
- Developer contact information: your email
- **SAVE**

**b) Audience** (was "User type" and "Test users")

- User type: **External**
- Publishing status stays **Testing** — *In production* triggers Google's
  verification review, which takes weeks and is not needed here
- **Test users** → **+ ADD USERS** → your Google account → **SAVE**

  > In Testing, **only these accounts can consent.** Everyone else sees
  > *"Access blocked: has not completed the Google verification process."* Add every
  > account that will try it, including an evaluator's.

**c) Data access** (was "Scopes")

- **ADD OR REMOVE SCOPES** → filter and tick exactly:
  - `https://www.googleapis.com/auth/calendar.events`
  - `https://www.googleapis.com/auth/userinfo.email`
- **UPDATE** → **SAVE**

  > Only these two. `calendar.events` covers creating and deleting the events we
  > created; it does **not** grant read access to the rest of someone's calendar.

### 1.4 Create the OAuth client

**Clients** in the left menu → **+ CREATE CLIENT**
(or the **Create OAuth client** button on the Overview page).

1. Application type: **Web application**
2. Name: `Health Manager Web`
3. **Authorised JavaScript origins** → **+ ADD URI**:
   ```
   http://localhost:3000
   ```
4. **Authorised redirect URIs** → **+ ADD URI**:
   ```
   http://localhost:3000/api/google/callback
   ```
   The production URI comes in Step 3, once the URL exists.
5. **CREATE** → copy the **Client ID** and **Client secret**.

> The redirect URI must match **character for character** — `http` vs `https`, the
> port, and no trailing slash. A mismatch gives `Error 400: redirect_uri_mismatch`,
> and that error page prints exactly what was sent, so compare it with what is
> registered.

### 1.5 Add them to `.env`

```bash
GOOGLE_CLIENT_ID="paste-client-id-here"
GOOGLE_CLIENT_SECRET="paste-client-secret-here"
GOOGLE_REDIRECT_URI="http://localhost:3000/api/google/callback"
```

Restart — environment variables are read at startup:

```bash
pkill -f "next dev"; rm -rf .next; npm run dev
```

### 1.6 Test locally

1. **http://localhost:3000** → sign in as a **patient**.
2. **Calendar** in the nav. The amber "not configured" banner should be gone and
   **Connect Google Calendar** enabled.
3. Click it → pick your account.
4. **"Google hasn't verified this app"** is expected in Testing:
   **Advanced** → **Go to Health Manager (unsafe)**.
5. Grant permission → you return to the Calendar page showing **Connected**.
6. Book an appointment, then run the sync job (secret from your `.env`):
   ```bash
   curl -H "Authorization: Bearer $CRON_SECRET" \
        http://localhost:3000/api/cron/calendar
   ```
   Expect `{"ok":true,"configured":true,"created":1,...}` and the event in
   **calendar.google.com**.

   > `created` counts only people who connected a calendar. The doctor account has
   > not, so its row is skipped — intended, not a failure.

---

## Step 2 — Deploy to Vercel

### 2.1 Import the repository

1. **https://vercel.com** → log in → **Continue with GitHub**.
2. **Add New…** → **Project**.
3. Find **Health-Manager** → **Import**. If it is missing, click
   **Adjust GitHub App Permissions** and grant access.
4. Framework Preset auto-detects **Next.js**. Leave build settings alone.
5. **Do not click Deploy yet** — add the environment variables first, or the first
   build fails and you redeploy anyway.

### 2.2 Add environment variables

Expand **Environment Variables**. Add each of these, ticking **all three**
environments (Production, Preview, Development). Copy the values from your `.env`.

| Name | Where the value comes from |
|---|---|
| `DATABASE_URL` | `.env` — the **pooled** Neon URL (host contains `-pooler`) |
| `DIRECT_URL` | `.env` — the **direct** Neon URL |
| `AUTH_SECRET` | `.env` |
| `CRON_SECRET` | `.env` |
| `GEMINI_API_KEY` | `.env` |
| `GEMINI_MODEL` | `gemini-3.6-flash` |
| `LLM_TIMEOUT_MS` | `30000` |
| `GMAIL_USER` | `.env` |
| `GMAIL_APP_PASSWORD` | `.env` — 16 characters, no spaces |
| `MAIL_FROM` | `.env` |
| `GOOGLE_CLIENT_ID` | Step 1.4 |
| `GOOGLE_CLIENT_SECRET` | Step 1.4 |
| `AUTH_URL` | *set in 2.4, after you have the URL* |
| `NEXT_PUBLIC_APP_URL` | *set in 2.4* |
| `GOOGLE_REDIRECT_URI` | *set in 2.4* |

> **Paste values without the surrounding quotes.** The quotes in `.env` are shell
> syntax; Vercel's form stores the raw string, so `"abc"` would include the quote
> characters.

### 2.3 Deploy

**Deploy**, then wait 2–4 minutes. `prisma generate` runs automatically through the
`postinstall` script.

If the build fails, read the first red line:

| Message | Cause |
|---|---|
| `Environment variable not found: DATABASE_URL` | Missing or misspelled variable |
| `Can't reach database server` | Wrong connection string, or quotes were included |
| `@prisma/client did not initialize` | `postinstall` did not run — check `package.json` was pushed |

### 2.4 Set the URL variables and redeploy

Vercel now shows a URL like `https://health-manager-xyz123.vercel.app`.

1. **Settings** → **Environment Variables** → add (all three environments):

   | Name | Value |
   |---|---|
   | `AUTH_URL` | `https://YOUR-URL.vercel.app` |
   | `NEXT_PUBLIC_APP_URL` | `https://YOUR-URL.vercel.app` |
   | `GOOGLE_REDIRECT_URI` | `https://YOUR-URL.vercel.app/api/google/callback` |

2. **Deployments** → top deployment → **⋯** → **Redeploy**.

   > Required, not optional. Environment variables are bound to a deployment when it
   > is built, so changing them does nothing to a deployment that already exists. And
   > `NEXT_PUBLIC_APP_URL` is **inlined into the browser bundle at build time**, so it
   > genuinely cannot change without a rebuild.

### 2.5 Database

Production uses the same Neon database, so migrations and seed data are already
applied. Confirm from your laptop:

```bash
npx prisma migrate status     # "Database schema is up to date!"
npm run seed                  # only if you want to reset the demo data
```

### 2.6 Test the deployment

1. Open the Vercel URL → landing page loads.
2. Sign in as `asha@example.test` / `patient12345`.
3. Book an appointment end to end.
4. Trigger the worker:
   ```bash
   curl -H "Authorization: Bearer $CRON_SECRET" \
        https://YOUR-URL.vercel.app/api/cron/notifications
   ```
   Expect `"sent":2` and two emails.

---

## Step 3 — Point Google at production

1. **Google Cloud Console** → **APIs & Services** → **Credentials** →
   **Health Manager Web**.
2. **Authorised JavaScript origins** → **+ ADD URI**:
   ```
   https://YOUR-URL.vercel.app
   ```
3. **Authorised redirect URIs** → **+ ADD URI**:
   ```
   https://YOUR-URL.vercel.app/api/google/callback
   ```
   Keep the localhost entries so local development still works.
4. **SAVE**. Propagation takes a minute or two.
5. On the deployed site: sign in → **Calendar** → **Connect** → consent →
   **Connected**.

---

## Step 4 — cron-job.org

Vercel's Hobby plan runs cron **once a day**, which is useless for retries that must
fire every few minutes. An external scheduler calls the guarded endpoints instead.

### 4.1 Account

**https://console.cron-job.org** → sign up → verify email → log in.

### 4.2 First job

1. **CREATE CRONJOB**
2. **Title:** `Health Manager — notifications`
3. **URL:** `https://YOUR-URL.vercel.app/api/cron/notifications`
4. **Execution schedule:** **Every 5 minutes** (or *Custom* → minutes `*/5`)
5. Turn **Save responses in job history** ON — it is off by default, and without it
   a failing job shows a status code with no body to diagnose from.
6. **ADVANCED** tab:
   - **Request method:** `GET`
   - **Headers** → add one:
     - Key: `Authorization`
     - Value: `Bearer YOUR_CRON_SECRET`

     > One space after `Bearer`. Without this header every call returns **401** and
     > nothing is ever delivered. That is deliberate: an unguarded cron endpoint is an
     > open mail relay, billed to you and damaging your sending reputation.
7. **CREATE**

### 4.3 The other three

Identical steps and header, different URL and interval:

| Title | URL suffix | Interval |
|---|---|---|
| Health Manager — reminders | `/api/cron/reminders` | every 5 minutes |
| Health Manager — calendar | `/api/cron/calendar` | every 5 minutes |
| Health Manager — cleanup holds | `/api/cron/cleanup-holds` | every 15 minutes |

### 4.4 Verify

1. **TEST RUN** on each job.
2. Healthy response is **200** with a body like:
   ```json
   {"ok":true,"considered":0,"sent":0,"retryScheduled":0,"gaveUp":0,
    "transport":"gmail smtp as you@gmail.com"}
   ```
3. **401** means the header is missing, or the secret does not match Vercel's.
4. Leave them running, book on the live site, and the confirmation arrives within five
   minutes with nobody touching anything.

---

## Final checklist

- [ ] GitHub has the latest commit, and no `.env`
- [ ] Vercel build succeeded
- [ ] Landing page loads on the Vercel URL
- [ ] Sign in works in production
- [ ] Booking works end to end in production
- [ ] Confirmation email arrives
- [ ] Google Calendar connects and an event appears
- [ ] All four cron jobs return 200 on **TEST RUN**
- [ ] The Vercel URL is in your submission

---

## After submitting: rotate every credential

These have been handled during development and should not outlive the assignment.

- **Neon** → Roles → reset the `neondb_owner` password → update both URLs
- **Google AI Studio** → delete and recreate the Gemini API key
- **Google Account** → App passwords → revoke `Health Manager`
- **Google Cloud** → Credentials → reset the OAuth client secret
- `npx auth secret` for a new `AUTH_SECRET`
- `openssl rand -hex 32` for a new `CRON_SECRET`

Update Vercel's environment variables and redeploy afterwards.
