# Security & Reliability Checklist
**Supplement Intelligence — Beta v0.1**
Audited: 2026-06-09

---

## Summary

| # | Check | Result | Fixed |
|---|---|---|---|
| 1 | No API keys exposed to browser | PASS | — |
| 2 | Supabase RLS on all tables | FAIL → FIXED | `002_security_fixes.sql` |
| 3 | Users can only see their own analyses | PASS | — |
| 4 | Feedback cannot edit other users' data | PARTIAL | See note |
| 5 | Rate limit: max 3 analyses per user | FAIL → FIXED | `generate/route.ts` |
| 6 | Server-side input validation | FAIL → FIXED | `generate/route.ts` |
| 7 | Claude API server-side only | PASS | — |
| 8 | `.env.local` not committed | PASS | — |
| 9 | Production build passes | UNTESTED | `node_modules` not installed |
| 10 | `allowedOrigins` blocking production | FAIL → FIXED | `next.config.mjs` |

---

## Detailed Results

---

### 1. API keys not exposed to browser — PASS

`ANTHROPIC_API_KEY` is used only in `app/api/generate/route.ts` as `process.env.ANTHROPIC_API_KEY` (no `NEXT_PUBLIC_` prefix). It is never bundled into the client.

The only `NEXT_PUBLIC_` variables are:
- `NEXT_PUBLIC_SUPABASE_URL` — intentionally public (Supabase anon clients require it)
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — intentionally public (design of Supabase auth; protected by RLS)
- `NEXT_PUBLIC_APP_URL` — non-sensitive

`SUPABASE_SERVICE_ROLE_KEY` is declared in `.env.example` for future use and is NOT referenced anywhere in code yet.

**No action needed.**

---

### 2. Supabase RLS on all tables — FAIL (now fixed)

**Tables and policies before fix:**

| Table | RLS Enabled | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|---|
| `profiles` | ✅ | owner only | ❌ (trigger only) | owner only | ❌ |
| `analyses` | ✅ | owner (via `for all`) | owner | owner | owner |
| `leaderboard` | ✅ | authenticated | ❌ MISSING | ❌ MISSING | ❌ |
| `feedback` | ✅ | owner only | owner only | ❌ | ❌ |

**Problem:** `leaderboard` had no INSERT or UPDATE policy. The generate API route calls
`sb.from('leaderboard').insert(...)` and `sb.from('leaderboard').update(...)` using the user's
Supabase session (anon key + JWT). These writes were silently failing on every generation.
Every user analysis was saved to `analyses` correctly, but the leaderboard never updated.

**Fix applied:** `supabase/migrations/002_security_fixes.sql`
```sql
create policy "authenticated insert leaderboard" on public.leaderboard
  for insert with check (auth.role() = 'authenticated');

create policy "authenticated update leaderboard" on public.leaderboard
  for update using (auth.role() = 'authenticated');
```

**⚠ Action required:** Run `002_security_fixes.sql` in Supabase SQL editor before deploying.

---

### 3. Users can only see their own analyses — PASS

The `analyses` table uses a single `FOR ALL` policy:
```sql
create policy "owner all" on public.analyses
  for all using (auth.uid() = user_id);
```

`FOR ALL` covers SELECT, INSERT, UPDATE, and DELETE. No user can read, write, or delete
another user's rows. Verified: the API route always inserts `user_id: user.id` and
the memo page verifies `a.user_id !== user.id` before rendering.

**No action needed.**

---

### 4. Feedback cannot edit other users' data — PARTIAL

**What is protected:** The RLS policy enforces that `user_id = auth.uid()` on INSERT, preventing
a user from attributing feedback to another user.

**What is not protected:** The `analysis_id` field is not verified server-side. An authenticated
user can POST `{ analysis_id: <someone_else's_uuid>, rating: 1, ... }` to `/api/feedback`
and the insert will succeed — the feedback row will reference another user's analysis.

**Severity:** Low. Feedback is not displayed to analysis owners and contains no PII.
A malicious user gains nothing — they cannot read back the feedback they wrote on
someone else's analysis (the SELECT policy blocks that too).

**Recommended fix (post-beta):** In `app/api/feedback/route.ts`, verify analysis ownership:
```typescript
const { data: analysis } = await client
  .from('analyses')
  .select('id')
  .eq('id', body.analysis_id)
  .eq('user_id', user.id)
  .single()

if (!analysis) return NextResponse.json({ error: 'Analysis not found' }, { status: 404 })
```

**Not fixed now** — non-blocking for beta.

---

### 5. Rate limit: max 3 analyses per beta user — FAIL (now fixed)

**Problem — TOCTOU race condition:**

The original code had a read-then-update pattern:
```
Request A reads:  analyses_used = 2  → passes check (2 < 3)
Request B reads:  analyses_used = 2  → passes check (2 < 3)
Request A writes: analyses_used = 3  → ok
Request B writes: analyses_used = 4  → limit bypassed!
```

A user sending two simultaneous requests could burn double slots per pair.

**Fix applied:** Replaced read-then-update with an atomic database function:
```sql
-- In 002_security_fixes.sql
create or replace function public.consume_analysis_slot(p_user_id uuid)
returns boolean language plpgsql security definer as $$
declare rows_updated int;
begin
  update public.profiles
  set analyses_used = analyses_used + 1
  where id = p_user_id and analyses_used < analyses_limit;
  get diagnostics rows_updated = row_count;
  return rows_updated > 0;
end; $$;
```

The `UPDATE ... WHERE analyses_used < analyses_limit` is a single atomic operation.
Two concurrent requests cannot both succeed — Postgres row-level locking ensures
one will see the already-incremented value and get zero rows updated.

**Side effect to be aware of:** The slot is consumed **before** calling Claude.
If Claude returns an error (rate limited, timeout, etc.), the user loses that slot.
This is the correct trade-off for security — it prevents retry-loop slot abuse.
Acceptable for a 3-slot beta.

**⚠ Action required:** Run `002_security_fixes.sql` in Supabase SQL editor before deploying.

---

### 6. Server-side input validation — FAIL (now fixed)

**Problem:** The original route only checked `if (!input?.trim())`.
No max-length enforcement existed server-side. Frontend `maxLength` attributes
are trivially bypassed — a direct `curl` or Postman request could send
a 1MB `context` field, which would be forwarded to Claude and inflate API costs.

**Fix applied** in `app/api/generate/route.ts`:
```typescript
const MAX_INPUT    = 500   // frontend is 200; server gives 2.5× headroom
const MAX_AUDIENCE = 200
const MAX_CONTEXT  = 1000
const VALID_PRICES = new Set(['', 'under-30', '30-50', '50-75', '75-plus'])

if (input.trim().length > MAX_INPUT)         → 400
if (targetAudience > MAX_AUDIENCE)           → 400
if (context > MAX_CONTEXT)                   → 400
if (pricePoint not in VALID_PRICES)          → 400
```

Limits are set slightly above the UI limits to avoid false rejections from edge
cases, while still bounding maximum payload size.

**No action required** — code fix is already applied.

---

### 7. Claude API is server-side only — PASS

`@anthropic-ai/sdk` is imported in exactly one file: `app/api/generate/route.ts`.
This file is a Next.js Route Handler — it runs exclusively on the server.
It is never imported by any client component or page.

Verified by grep:
```
grep -rn "from.*@anthropic" app/ components/ lib/
→ Only: app/api/generate/route.ts
```

**No action needed.**

---

### 8. `.env.local` is gitignored and not committed — PASS

Verified two ways:

1. `git check-ignore -v supplement-intelligence/.env.local`
   → `.gitignore:27:.env.local` (root-level `.gitignore` covers it)

2. A new `.gitignore` was added inside `supplement-intelligence/` for safety if
   the project is ever extracted to its own repository.

The file `.env.local` does not exist in the project (only `.env.example` does),
so there is nothing to accidentally commit.

**No action needed.**

---

### 9. Production build passes — UNTESTED

`node_modules` has not been installed. `npm run build` cannot be run.

**Known potential TypeScript issues to verify when installing:**
- `components/AnalysisCard.tsx` and `components/BuildDecisionBadge.tsx` import
  from `@/types/memo` (not `@/types/index`). These components are not imported
  by any current page — they're dead code from the deleted route group.
  TypeScript will still type-check them; they should pass but have not been verified.
- Two type files exist with overlapping but divergent `Analysis` interfaces:
  `types/index.ts` (`biggest_competitor`) vs `types/memo.ts` (`biggest_competitor_name`).
  Pages use `types/index.ts` which matches the DB schema. The `types/memo.ts` is
  legacy from the deleted route group.

**Action required before deploy:**
```bash
npm install
npm run build
```
Fix any TypeScript errors that surface.

---

### 10. `allowedOrigins` blocking server actions in production — FAIL (now fixed)

**Problem:** `next.config.mjs` contained:
```js
experimental: {
  serverActions: {
    allowedOrigins: ['localhost:3000'],
  },
},
```

The signout button is a `<form action="/auth/signout" method="post">` — a Server Action.
When deployed to Vercel, the production domain (e.g. `supplement-intel.vercel.app`)
is not in the `allowedOrigins` list. Next.js rejects the request with 403.
**Signout would silently fail for all production users.**

**Fix applied:** Removed `allowedOrigins` entirely. Server Actions will accept
requests from the same origin by default, which is correct behavior.

**No action required** — code fix is already applied.

---

## Required Actions Before Deployment

In order of priority:

1. **Run `002_security_fixes.sql`** in Supabase SQL editor
   - Adds leaderboard INSERT/UPDATE policies
   - Adds `consume_analysis_slot()` function
   - Without this: leaderboard never updates, rate limit is race-vulnerable

2. **`npm install && npm run build`** — confirm no TypeScript errors

3. **Set all env vars in Vercel dashboard**
   ```
   NEXT_PUBLIC_SUPABASE_URL
   NEXT_PUBLIC_SUPABASE_ANON_KEY
   ANTHROPIC_API_KEY
   NEXT_PUBLIC_APP_URL          ← set to your production domain
   ```

4. **Update Supabase Auth redirect URLs** to include production domain:
   - Site URL: `https://yourdomain.vercel.app`
   - Redirect URLs: `https://yourdomain.vercel.app/auth/callback`

5. **Upgrade to Vercel Pro** ($20/month) OR rewrite the generate route to use
   streaming responses — the current `maxDuration = 60` exceeds the 10-second
   free plan function timeout. Every generation will time out on the free plan.

---

## Post-Beta Improvements (Not Blocking)

- Add analysis ownership check in feedback route (see item 4 above)
- Add `SUPABASE_SERVICE_ROLE_KEY` usage for leaderboard writes instead of user-session policies
- Consider decrementing slot on Claude API failure to improve UX
- Add request-level CSRF protection if moving beyond magic-link auth
