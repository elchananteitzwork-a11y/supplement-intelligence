# Final Launch Checklist
## Supplement Intelligence — Beta v0.1
**From current state to public beta. Every step in order.**

---

## Prerequisites

Before starting, confirm you have:
- [ ] A GitHub account with this repository pushed to it
- [ ] A credit card (required by Supabase and Vercel even for free tiers)
- [ ] Access to the email inbox for your admin account
- [ ] The project folder open: `supplement-intelligence/`

Estimated time to complete: **60–90 minutes**

---

## Phase 1 — Supabase Setup

### Step 1.1 — Create a Supabase account

1. Go to **https://supabase.com**
2. Click **Start your project** (top right)
3. Click **Sign up** → choose **Continue with GitHub** (fastest)
4. Authorize Supabase to access your GitHub account
5. **Expected result:** You land on the Supabase dashboard at `https://supabase.com/dashboard`

---

### Step 1.2 — Create a new project

1. On the dashboard, click **New project**
2. Fill in:
   - **Organization:** your personal org (auto-created)
   - **Project name:** `supplement-intelligence`
   - **Database password:** generate a strong password — **save it somewhere safe** (you will not need it again unless you access the DB directly, but losing it is irreversible)
   - **Region:** pick the region closest to your users (US East for North America)
   - **Pricing plan:** Free tier is fine to start
3. Click **Create new project**
4. **Expected result:** Supabase shows a loading screen for ~2 minutes while the project provisions. Wait until it fully completes before continuing.

---

### Step 1.3 — Copy your project credentials

1. In the Supabase dashboard, click your project name
2. In the left sidebar, click **Project Settings** (gear icon, bottom left)
3. Click **API** in the settings submenu
4. You will see two values you need — copy both somewhere temporary:

   **Value 1 — Project URL**
   - Label: `Project URL`
   - Looks like: `https://abcdefghijklmn.supabase.co`
   - This becomes `NEXT_PUBLIC_SUPABASE_URL`

   **Value 2 — Anon/Public key**
   - Label: `anon` `public`
   - A long `eyJ...` string
   - This becomes `NEXT_PUBLIC_SUPABASE_ANON_KEY`

5. **Do not copy the `service_role` key yet** — you will not need it for this beta
6. **Expected result:** Both values copied. The URL ends in `.supabase.co`. The anon key starts with `eyJ`.

---

### Step 1.4 — Run the database schema (Migration 001)

1. In the left sidebar, click **SQL Editor** (the `>_` icon)
2. Click **New query** (top left of the SQL editor)
3. Open the file `supabase/migrations/001_schema.sql` from your project folder
4. Copy its **entire contents** and paste into the SQL editor
5. Click **Run** (the green play button, or `Cmd+Enter`)
6. **Expected result:** The results panel at the bottom shows:
   ```
   Success. No rows returned.
   ```
   If you see any red error text, stop and read the error before continuing.

7. Verify the tables were created:
   - In the left sidebar, click **Table Editor**
   - You should see 4 tables: `profiles`, `analyses`, `leaderboard`, `feedback`
   - Click `leaderboard` — you should see 28 pre-seeded rows (Bloating + Fatigue, Hormonal Acne + Gut, etc.)
8. **Expected result:** 4 tables exist, leaderboard has 28 rows.

---

### Step 1.5 — Run the security migration (Migration 002)

1. In the SQL Editor, click **New query** again
2. Open `supabase/migrations/002_security_fixes.sql` from your project folder
3. Copy the entire contents and paste into the SQL editor
4. Click **Run**
5. **Expected result:** `Success. No rows returned.`

6. Verify the function was created:
   - In the left sidebar, click **Database**
   - Click **Functions**
   - You should see a function named `consume_analysis_slot`
7. **Expected result:** `consume_analysis_slot` appears in the functions list.

> **Why this matters:** Without this migration, the leaderboard never updates when users
> generate analyses, and the 3-analysis rate limit has a race condition that can be bypassed.

---

### Step 1.6 — Configure Supabase Auth settings

1. In the left sidebar, click **Authentication**
2. Click **URL Configuration** in the auth submenu
3. Set the following fields:

   **Site URL**
   - Clear the current value
   - Enter: `http://localhost:3000`
   - *(You will update this to your production URL in Phase 6)*

   **Redirect URLs**
   - Click **Add URL**
   - Enter: `http://localhost:3000/auth/callback`
   - Click **Add URL** again
   - Enter: `http://localhost:3000/**`

4. Click **Save**
5. **Expected result:** The page shows a green "Saved successfully" confirmation.

---

### Step 1.7 — Configure Auth email template

1. Still in **Authentication**, click **Email Templates**
2. Click the **Magic Link** template
3. Review the template — the default is fine for beta
4. Scroll to the bottom and confirm **Confirm email** is set to the correct redirect
5. No changes needed unless you want to customize the email subject/body
6. **Expected result:** Magic link template exists and is enabled.

---

## Phase 2 — Anthropic API Setup

### Step 2.1 — Create an Anthropic account

1. Go to **https://console.anthropic.com**
2. Click **Sign up** if you don't have an account, or **Log in**
3. Complete email verification if prompted
4. **Expected result:** You land on the Anthropic Console dashboard.

---

### Step 2.2 — Add billing (required to use the API)

1. In the top navigation, click your organization name or **Settings**
2. Click **Billing**
3. Click **Add payment method**
4. Enter a credit card
5. **Recommended:** Set a spending limit — click **Spending Limits** and set:
   - **Soft limit:** $10 (you'll receive an email warning)
   - **Hard limit:** $25 (API stops at this amount)
   - For 5 beta users running 3 analyses each = 15 total calls. At ~$0.05–0.15 per call, budget is < $3.
6. **Expected result:** Payment method saved, limits set.

---

### Step 2.3 — Create an API key

1. In the left sidebar, click **API Keys**
2. Click **Create Key**
3. Name: `supplement-intelligence-beta`
4. Click **Create Key**
5. **IMPORTANT:** Copy the key immediately. It starts with `sk-ant-api03-`. You cannot view it again after closing this dialog.
6. Save it somewhere secure (1Password, etc.)
7. This becomes `ANTHROPIC_API_KEY`
8. **Expected result:** Key created and copied. It will show as `sk-ant-api03-...` partially masked in the key list.

---

## Phase 3 — Local Environment Setup

### Step 3.1 — Create your local `.env.local` file

1. Open Terminal
2. Navigate to the project folder:
   ```
   cd "/Users/elchananteitz/marketing/marker reserch/supplement-intelligence"
   ```
3. Run:
   ```
   cp .env.example .env.local
   ```
4. Open `.env.local` in your editor (VS Code: `code .env.local`)
5. Fill in every value:

   ```
   NEXT_PUBLIC_SUPABASE_URL=         ← paste from Step 1.3 (Value 1)
   NEXT_PUBLIC_SUPABASE_ANON_KEY=    ← paste from Step 1.3 (Value 2)
   SUPABASE_SERVICE_ROLE_KEY=        ← leave blank for now (not used in beta code)
   ANTHROPIC_API_KEY=                ← paste from Step 2.3
   NEXT_PUBLIC_APP_URL=http://localhost:3000
   RESEND_API_KEY=                   ← leave blank for now (email not wired up)
   ```

6. Save the file
7. **Expected result:** `.env.local` exists with all required values filled in. No placeholder text remains in the values you use.

---

### Step 3.2 — Install dependencies

1. In Terminal, still in the `supplement-intelligence/` directory:
   ```
   npm install
   ```
2. Wait for installation to complete (1–3 minutes)
3. **Expected result:** A `node_modules/` folder appears. No `npm ERR!` lines in the output. A `package-lock.json` file is created or updated.

---

### Step 3.3 — Run the local build test

1. In Terminal:
   ```
   npm run build
   ```
2. Wait for the build to complete (1–2 minutes)
3. **Expected result:** The output ends with:
   ```
   ✓ Compiled successfully
   Route (app)   ...
   ○ /
   ○ /login
   ƒ /analyze
   ƒ /dashboard
   ƒ /memo/[id]
   ƒ /leaderboard
   ```
   No red `Type error:` or `Build failed` messages.

4. **If you see TypeScript errors:** Read each one carefully. The most likely issues are in unused component files (`AnalysisCard.tsx`, `BuildDecisionBadge.tsx`). These were not imported by any page but TypeScript still checks them. Fix or delete them before proceeding.

---

### Step 3.4 — Smoke test locally

1. In Terminal:
   ```
   npm run dev
   ```
2. Open **http://localhost:3000** in a browser
3. Verify the landing page loads with the green score card preview
4. Click **Get Early Access →** — should redirect to `/login`
5. Enter your email address and click **Send magic link →**
6. Check your inbox — you should receive an email from Supabase within 30 seconds
7. Click the magic link in the email
8. **Expected result:** You land on `/dashboard` with empty state ("Run your first analysis")

9. Click **+ New Analysis**
10. Type `stress and hair loss supplement for women 35+` in the idea field
11. Click **Generate Investment Memo →**
12. Wait ~30–45 seconds
13. **Expected result:** You are redirected to `/memo/[id]` with a full analysis including score, sections, formula table, financials.

14. Go to `/leaderboard`
15. **Expected result:** Your new category appears in the leaderboard (either as a new row or updating an existing one). If it does NOT appear, the migration in Step 1.5 was not run correctly.

16. Run `npm run dev` with `Ctrl+C` to stop before deploying.

---

## Phase 4 — Vercel Deployment

### Step 4.1 — Push your code to GitHub

1. In Terminal, from inside the `supplement-intelligence/` folder:
   ```
   git init
   git add .
   git commit -m "Initial deploy: Supplement Intelligence beta v0.1"
   ```
2. Go to **https://github.com/new**
3. Repository name: `supplement-intelligence`
4. Visibility: **Private** (beta — keep it private until you're ready)
5. Do NOT initialize with README (you already have files)
6. Click **Create repository**
7. Copy the commands GitHub shows under "push an existing repository" and run them in Terminal
8. **Expected result:** Your code is visible on GitHub at `https://github.com/yourusername/supplement-intelligence`

---

### Step 4.2 — Create a Vercel account

1. Go to **https://vercel.com**
2. Click **Sign Up** → choose **Continue with GitHub**
3. Authorize Vercel
4. **Expected result:** You land on the Vercel dashboard.

---

### Step 4.3 — Upgrade to Vercel Pro (required)

> **Why required:** The Claude API call takes 20–45 seconds. Vercel's free plan caps
> serverless functions at 10 seconds. Every analysis generation will timeout and fail
> on the free plan. Pro ($20/month) raises the cap to 60 seconds, which matches
> `maxDuration = 60` set in `app/api/generate/route.ts`.

1. In the Vercel dashboard, click your account name (top left)
2. Click **Settings**
3. Click **Billing**
4. Click **Upgrade to Pro**
5. Enter payment details and confirm
6. **Expected result:** Your account shows "Pro" tier.

> **Alternative if you want to avoid the $20/month:** Rewrite the generate route to use
> streaming responses (keep the connection alive while streaming). This is a code change —
> document it and do it post-beta if cost is a concern.

---

### Step 4.4 — Import project to Vercel

1. On the Vercel dashboard, click **Add New** → **Project**
2. Under "Import Git Repository", find `supplement-intelligence` and click **Import**
3. On the configuration screen:
   - **Framework Preset:** Next.js (auto-detected)
   - **Root Directory:** leave as `/` (the project root is already `supplement-intelligence/`)
   - **Build Command:** leave as default (`next build`)
   - **Output Directory:** leave as default (`.next`)
4. **Do NOT click Deploy yet** — you must set environment variables first (next step)

---

### Step 4.5 — Set environment variables in Vercel

Still on the Vercel project configuration screen (before first deploy):

1. Scroll down to **Environment Variables**
2. Add each variable one at a time:

   | Name | Value | Environments |
   |---|---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | your Supabase project URL | Production, Preview, Development |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | your Supabase anon key | Production, Preview, Development |
   | `ANTHROPIC_API_KEY` | your Anthropic API key (`sk-ant-...`) | Production, Preview, Development |
   | `NEXT_PUBLIC_APP_URL` | `https://supplement-intelligence.vercel.app` *(or your custom domain — you can update this after deploy)* | Production |
   | `NEXT_PUBLIC_APP_URL` | `http://localhost:3000` | Development |

   For each variable:
   - Type the name in the **Key** field
   - Paste the value in the **Value** field
   - Select the correct environments
   - Click **Add**

3. **Expected result:** 5 environment variable entries are shown in the list.

---

### Step 4.6 — Deploy

1. Click **Deploy**
2. Vercel will build your project — watch the build log
3. Build takes 1–3 minutes
4. **Expected result:** Build log ends with:
   ```
   ✓ Build Completed
   ```
   And Vercel shows a green "Congratulations!" screen with your deployment URL.

5. Your app is now live at something like `https://supplement-intelligence-abc123.vercel.app`
6. Copy this URL — you need it for the next phase.
7. **If the build fails:** Click **View Build Logs**, find the first red error, fix it in your code, push to GitHub, and Vercel will automatically redeploy.

---

## Phase 5 — Production URL Configuration

### Step 5.1 — Get your production URL

1. On the Vercel project page, click **Domains** in the top navigation
2. Copy your deployment URL. It will be either:
   - The auto-generated URL: `supplement-intelligence-xyz.vercel.app`
   - Or a custom domain if you added one
3. This is your `PRODUCTION_URL`

---

### Step 5.2 — Update Supabase Auth redirect URLs

1. Go back to **https://supabase.com/dashboard**, open your project
2. Click **Authentication** in the left sidebar
3. Click **URL Configuration**
4. Update **Site URL**:
   - Change from `http://localhost:3000`
   - To: `https://YOUR_PRODUCTION_URL` (e.g. `https://supplement-intelligence.vercel.app`)
5. Under **Redirect URLs**, click **Add URL** and add:
   - `https://YOUR_PRODUCTION_URL/auth/callback`
   - `https://YOUR_PRODUCTION_URL/**`
6. Keep the `localhost:3000` entries too (needed for local development)
7. Click **Save**
8. **Expected result:** Saved successfully. You now have both local and production URLs in the list.

---

### Step 5.3 — Update `NEXT_PUBLIC_APP_URL` in Vercel

1. Go to your Vercel project → **Settings** → **Environment Variables**
2. Find `NEXT_PUBLIC_APP_URL` (the Production one)
3. Click **Edit**
4. Update the value to your exact production URL: `https://supplement-intelligence.vercel.app`
5. Click **Save**
6. **Trigger a redeploy** so the new value takes effect:
   - Go to **Deployments** tab
   - Click the three dots on your latest deployment
   - Click **Redeploy**
   - Confirm
7. **Expected result:** New deployment succeeds with the updated env var.

---

## Phase 6 — Final Security Verification

Run these tests on your **live production URL** before inviting beta users.

### Step 6.1 — Verify unauthenticated routes are blocked

1. Open an incognito/private browser window
2. Navigate directly to `https://YOUR_PRODUCTION_URL/dashboard`
3. **Expected result:** Redirected to `/login`. NOT able to see the dashboard.
4. Navigate directly to `https://YOUR_PRODUCTION_URL/analyze`
5. **Expected result:** Redirected to `/login`.
6. Navigate directly to `https://YOUR_PRODUCTION_URL/leaderboard`
7. **Expected result:** Redirected to `/login`.

---

### Step 6.2 — Verify the full auth flow

1. Still in the incognito window, go to the production URL (home page `/`)
2. Click **Get Early Access →**
3. Enter your email and click **Send magic link →**
4. **Expected result:** "Check your email" confirmation screen appears.
5. Check your inbox — Supabase magic link email arrives within 60 seconds
6. Click the magic link
7. **Expected result:** You land on `/dashboard`. URL is your production URL, not localhost. You did NOT get a "redirect URI mismatch" error.
8. **If you got a redirect error:** Go back to Step 5.2 and verify the exact production URL is in the Supabase redirect list.

---

### Step 6.3 — Verify analysis generation works end-to-end

1. Logged into production, click **+ New Analysis**
2. Type: `PCOS weight loss supplement for women`
3. Click **Generate Investment Memo →**
4. Watch the loading screen — steps should animate through
5. **Expected result within 60 seconds:** Redirected to `/memo/[id]` with a full analysis
6. **If you get a timeout error:** The function exceeded 60 seconds. Check your Vercel account is actually on Pro. Check the Vercel function logs under Deployments → your deployment → Functions.

---

### Step 6.4 — Verify the leaderboard updates

1. After generating the analysis in Step 6.3, go to `/leaderboard`
2. Look for "PCOS Weight Loss" (or similar — Claude normalizes the category name)
3. **Expected result:** The category appears in the leaderboard with your analysis score.
4. **If it does NOT appear:** The `002_security_fixes.sql` migration was not run. Go back to Step 1.5 and run it now.

---

### Step 6.5 — Verify the rate limit

1. Go to `/analyze`
2. Generate a second analysis (e.g. `cortisol support for women`)
3. Generate a third analysis (e.g. `bloating relief supplement`)
4. After the third, go to `/dashboard`
5. **Expected result:** The **+ New Analysis** button is replaced with "No analyses left". The usage bar shows 3/3.
6. Go back to `/analyze` directly via URL
7. **Expected result:** The Generate button is disabled or the page shows the limit message. Even if you try to call the API directly, it returns 429.

---

### Step 6.6 — Verify signout works

1. Click **Sign out** (top right of dashboard)
2. **Expected result:** Redirected to `/login`. Session is cleared.
3. Try navigating to `/dashboard` directly
4. **Expected result:** Redirected to `/login` (session is gone).
5. **If signout does nothing:** The `allowedOrigins` fix in `next.config.mjs` was not deployed. Verify the file contains only `const nextConfig = {}` and redeploy.

---

## Phase 7 — Create Test Accounts

### Step 7.1 — Create your personal admin test account

1. Log in to production with your own email
2. Go to Supabase dashboard → **Table Editor** → `profiles`
3. Find your row (matching your email)
4. Click **Edit row**
5. Set `analyses_limit` to `99`
6. Click **Save**
7. **Expected result:** Your account now has 99 analyses for ongoing testing. Beta users still get 3.

---

### Step 7.2 — Create a clean beta tester account to verify the flow

1. Open a new incognito window
2. Sign up with a secondary email (e.g. a Gmail alias)
3. Verify the magic link works
4. Confirm the account starts with `analyses_used = 0` and `analyses_limit = 3`
   - Check in Supabase → Table Editor → `profiles`
5. Run one analysis through to completion
6. Verify the memo renders correctly
7. Submit feedback (click the stars at the bottom of the memo)
8. Verify the feedback appears in Supabase → Table Editor → `feedback`
9. **Expected result:** Full flow works end-to-end for a brand-new account.

---

## Phase 8 — Beta Launch

### Step 8.1 — Prepare your beta invitation

Before sending any links, confirm you have in hand:
- [ ] The production URL is live and tested
- [ ] The full generation flow works (Phase 6.3 passed)
- [ ] The rate limit is enforced (Phase 6.5 passed)
- [ ] Signout works (Phase 6.6 passed)
- [ ] You have a Loom recording or short walkthrough (optional but recommended)
- [ ] A feedback form URL (Tally.so or Typeform — create a free one)

---

### Step 8.2 — For each beta tester, pre-create their account (optional but recommended)

If you want to ensure each tester gets a seamless first-time experience:

1. Go to Supabase → **Authentication** → **Users**
2. Click **Invite user**
3. Enter their email address
4. Click **Send invitation**
5. **Expected result:** Supabase sends them a magic link immediately.
   Their row in `profiles` is auto-created by the database trigger.

Alternatively, send them your production URL and let them sign up themselves.

---

### Step 8.3 — Send the beta invitation

Use this format (personalize per recipient):

```
Subject: Your beta access is live — Supplement Intelligence

Hey [name],

Your access is ready: https://YOUR_PRODUCTION_URL

You have 3 free analyses. Type any supplement idea and get a full
investment memo in ~60 seconds — market gaps, formula, financials,
and a BUILD / SKIP verdict.

If you have a specific category you've been thinking about building,
that's the best first thing to analyze.

One ask: after your first analysis, click the feedback button at the
bottom of the memo. Even a star rating takes 5 seconds and helps a lot.

[Add Loom link if you made one]
[Add feedback form link]

Thanks for testing this.
— [Your name]
```

---

### Step 8.4 — Monitor the first 24 hours

Watch these in real time as testers use the app:

**Supabase → Table Editor → `analyses`**
- New rows appear as users generate
- Confirm `memo_data` column is populated (not null)
- Confirm `opportunity_score` is a reasonable number (0–100)

**Supabase → Table Editor → `leaderboard`**
- New category rows appear after each generation
- `analysis_count` increments for repeated categories

**Supabase → Table Editor → `feedback`**
- Star ratings and comments arrive

**Vercel → Project → Functions (in Deployments)**
- Check function duration on the generate route
- If any calls are timing out, they appear here with error logs

**Anthropic Console → Usage**
- Monitor API spend
- Confirm it matches your expected ~$0.10–0.15 per generation

---

## Quick Reference — All Critical URLs

| Resource | URL |
|---|---|
| Supabase dashboard | `https://supabase.com/dashboard/project/[your-project-id]` |
| Supabase SQL editor | `https://supabase.com/dashboard/project/[your-project-id]/sql` |
| Supabase Auth settings | `https://supabase.com/dashboard/project/[your-project-id]/auth/url-configuration` |
| Supabase users | `https://supabase.com/dashboard/project/[your-project-id]/auth/users` |
| Anthropic console | `https://console.anthropic.com` |
| Anthropic API keys | `https://console.anthropic.com/settings/keys` |
| Vercel dashboard | `https://vercel.com/dashboard` |
| Your live app | `https://supplement-intelligence.vercel.app` *(update with real URL)* |
| Your local app | `http://localhost:3000` |

---

## Quick Reference — All Environment Variables

| Variable | Where to get it | Where to set it |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API → Project URL | `.env.local` and Vercel |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Project Settings → API → anon/public key | `.env.local` and Vercel |
| `ANTHROPIC_API_KEY` | Anthropic Console → API Keys | `.env.local` and Vercel |
| `NEXT_PUBLIC_APP_URL` | Your Vercel deployment URL | `.env.local` (`localhost:3000`) and Vercel (production URL) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API → service_role key | Not needed for beta — leave blank |
| `RESEND_API_KEY` | resend.com | Not needed for beta — leave blank |

---

## If Something Goes Wrong

| Symptom | Likely cause | Fix |
|---|---|---|
| Magic link redirects to wrong URL or shows error | Supabase redirect URL not set | Step 5.2 |
| Analysis generates but leaderboard doesn't update | `002_security_fixes.sql` not run | Step 1.5 |
| Generation times out after 10 seconds | Vercel not on Pro plan | Step 4.3 |
| Sign out does nothing | Old `next.config.mjs` deployed | Verify `next.config.mjs` is just `const nextConfig = {}` and redeploy |
| "Unauthorized" on analyze page | Session cookie not being set | Check Supabase URL and anon key are correct in Vercel env vars |
| Rate limit not working (user gets >3 analyses) | `002_security_fixes.sql` not run | Step 1.5 |
| Build fails with TypeScript error | Type mismatch in dead code components | Delete `components/AnalysisCard.tsx` and `components/BuildDecisionBadge.tsx` if TypeScript errors reference them |
| Feedback form submits but nothing saved | RLS policy blocking insert | Verify user is authenticated when submitting; check Supabase logs |
