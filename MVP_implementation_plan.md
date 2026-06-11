# MVP IMPLEMENTATION PLAN
## Supplement Intelligence Engine — Beta v0.1
**Goal:** 5 external beta testers within 7 days  
**Date:** June 2026

---

## PRODUCT DEFINITION (ONE SENTENCE)

> Type any supplement idea. Get a full investor-grade analysis — scores, market gaps, formula, financial projections, and a BUILD / SKIP decision — in under 60 seconds.

---

## TECH STACK (CHOSEN FOR SPEED, NOT SCALE)

| Layer | Choice | Why |
|---|---|---|
| Frontend | Next.js 14 (App Router) | Fastest DX, Vercel deploys in 1 click |
| Styling | Tailwind CSS | No design system needed; utility-first |
| Backend | Next.js API Routes | No separate server needed for MVP |
| Auth | Supabase Auth | Free tier, email + Google, RLS built in |
| Database | Supabase (PostgreSQL) | Free tier, pairs with auth, real-time |
| AI | Claude API (claude-sonnet-4-6) | Best structured output; 60s generation |
| Deployment | Vercel | Free tier, instant deploys from GitHub |
| Email | Resend | Free tier, 100 emails/day, simple API |

**Total infrastructure cost: $0/month for first 50 users**

---

## 1. USER FLOW

```
LANDING PAGE
    │
    ▼
[Enter email → Get beta access]
    │
    ▼
EMAIL CONFIRMATION
    │
    ▼
DASHBOARD (empty state)
    │
    ├── [New Analysis] button
    │
    ▼
INPUT SCREEN
  - Type your idea: e.g. "stress and bloating supplement for women"
  - Optional: add context (target audience, price point)
  - [Generate Investment Memo] CTA
    │
    ▼
GENERATING SCREEN (15–30 seconds)
  - Animated progress
  - "Analyzing market conditions..."
  - "Scoring 6 dimensions..."
  - "Building formula recommendation..."
    │
    ▼
MEMO OUTPUT SCREEN
  - Opportunity Score (prominent, top)
  - BUILD NOW / VALIDATE FURTHER / SKIP badge
  - All 14 sections (scrollable)
  - [Export PDF] / [Copy Link] / [Share]
    │
    ▼
DASHBOARD (with memo saved)
  - History list
  - Leaderboard tab
  - [New Analysis] persistent
```

### Edge States
- **Empty input:** Inline validation, "Please describe a supplement idea"
- **Non-supplement input:** Graceful handling: "This appears to be outside the supplement/wellness category. Continue anyway?"
- **Generation error:** "Something went wrong. Try again." + retry button
- **Rate limit:** "You've used your 3 free analyses. Invite a friend for 3 more." (beta limit)

---

## 2. INPUT FIELDS

### Primary Input Screen

**Field 1: Category / Idea** (required)
```
Label: "What supplement idea do you want to analyze?"
Type: text / textarea
Placeholder: "e.g. stress and hair loss supplement for women"
Max length: 200 characters
Helper text: "Be specific. 'Stress hair loss' scores better than 'hair supplement'."
```

**Field 2: Target Audience** (optional)
```
Label: "Who is this for? (optional)"
Type: text input
Placeholder: "e.g. women 30-45 with hormonal issues"
Max length: 100 characters
```

**Field 3: Price Point** (optional)
```
Label: "Intended price point (optional)"
Type: select dropdown
Options: Under $30/mo | $30–50/mo | $50–75/mo | $75+/mo | Not sure
```

**Field 4: Context** (optional, collapsible)
```
Label: "Additional context (optional)"
Type: textarea
Placeholder: "Anything else that should inform the analysis: unique ingredient, existing competitor insight, your background..."
Max length: 500 characters
```

### Generate Button
```
Text: "Generate Investment Memo →"
State: disabled until Field 1 has content
Loading state: "Generating..." with spinner
```

---

## 3. OUTPUT SCREENS

### Screen A: Generating (Loading)

```
┌─────────────────────────────────────────────┐
│                                             │
│   Analyzing: "stress hair loss women"       │
│                                             │
│   ████████████░░░░░░  65%                  │
│                                             │
│   ✓ Market conditions mapped               │
│   ✓ Competition landscape scored           │
│   ◷ Building formula recommendation...     │
│   ○ Financial projections                  │
│   ○ Final verdict                          │
│                                             │
│   ~15 seconds remaining                    │
│                                             │
└─────────────────────────────────────────────┘
```

### Screen B: Memo Output

**Header Block** (sticky, above the fold)
```
┌─────────────────────────────────────────────────────┐
│  STRESS HAIR LOSS — WOMEN'S SUPPLEMENT              │
│                                                     │
│  OPPORTUNITY SCORE: 72/100    [🟢 BUILD NOW]        │
│                                                     │
│  ↓ Export PDF    ↓ Copy Link    ↓ Share             │
└─────────────────────────────────────────────────────┘
```

**Score Row** (visual, scannable)
```
DEMAND    COMPETITION    VIRALITY    SUBSCRIPTION    MFG    DEFENSIBILITY
  8/10       3/10          8/10         10/10       7/10       7/10
```

**Section 1: Executive Summary**
```
[Collapsible section]
Headline text paragraph.
"Is this worth building? YES / MAYBE / NO"
```

**Sections 2–13: Each collapsible**
```
[+] MARKET GAPS (10 found)
    1. The biotin counter-narrative is unclaimed...
    2. The ferritin threshold gap is underdressed...
    [see all 10]

[+] BRAND POSITIONING ANGLES (10 found)
    1. "Biotin works for 38% of women..."
    ...

[+] CUSTOMER LANGUAGE
    Frustrations | Desires | Fears | Ad Phrases

[+] FORMULA RECOMMENDATION
    [Table: Ingredient | Dose | Role | Evidence]
    COGS: $5–9 | Retail: $47–55 | Margin: 72–80%

[+] FINANCIAL PROJECTIONS
    $10k/mo: 70% probability
    $100k/mo: 60% probability
    $1M/mo: 28% probability

[+] BUILD DECISION
    [🟢 BUILD NOW]
    Full explanation paragraph...
```

**Footer CTA Block**
```
┌──────────────────────────────────────────┐
│  Ready to analyze your next idea?        │
│  [→ New Analysis]   [← Back to History] │
└──────────────────────────────────────────┘
```

### Screen C: Dashboard / History

```
┌─────────────────────────────────────────────────┐
│  Your Analyses                    [+ New]       │
├─────────────────────────────────────────────────┤
│  Stress Hair Loss – Women    72/100  🟢  Jun 8  │
│  Hormonal Acne + Gut         77/100  🟢  Jun 7  │
│  Bloating + Fatigue          80/100  🟢  Jun 6  │
│                                                 │
│  ─────────────────────────────────────────────  │
│  LEADERBOARD  (28 categories ranked)            │
│  1. Bloating + Fatigue          80  🟢          │
│  2. Bloating Relief             78  🟢          │
│  3. Hormonal Acne + Gut         77  🟢          │
│     [View full leaderboard]                     │
└─────────────────────────────────────────────────┘
```

### Screen D: Leaderboard (full view)

```
┌─────────────────────────────────────────────────────────────┐
│  LEADERBOARD — All Analyzed Categories                      │
│  Sort by: [Score ▼] [Date] [Decision]                       │
├─────────────────────────────────────────────────────────────┤
│  Rank  Category              Score  Decision   Competitor   │
│  1     Bloating + Fatigue    80     🟢 BUILD   Arrae       │
│  2     Bloating Relief       78     🟢 BUILD   Arrae       │
│  3     Hormonal Acne + Gut   77     🟢 BUILD   CLEARSTEM   │
│  ...                                                        │
│  [Your analyses highlighted in blue]                        │
└─────────────────────────────────────────────────────────────┘
```

---

## 4. DATABASE STRUCTURE

```sql
-- ============================================================
-- USERS (managed by Supabase Auth — no custom table needed)
-- auth.users is auto-created

-- ============================================================
-- USER PROFILES (extended user data)
CREATE TABLE public.profiles (
  id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email         TEXT,
  full_name     TEXT,
  beta_tier     TEXT DEFAULT 'free',    -- 'free' | 'pro' | 'team'
  analyses_used INTEGER DEFAULT 0,
  analyses_limit INTEGER DEFAULT 3,     -- beta: 3 free analyses
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Auto-create profile on user signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email)
  VALUES (NEW.id, NEW.email);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================================
-- ANALYSES (each generated investment memo)
CREATE TABLE public.analyses (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),

  -- Input
  raw_input       TEXT NOT NULL,
  category_name   TEXT NOT NULL,         -- normalized from AI
  target_audience TEXT,
  price_point     TEXT,
  extra_context   TEXT,

  -- Scores (stored individually for leaderboard queries)
  score_demand         NUMERIC(3,1),
  score_competition    NUMERIC(3,1),
  score_virality       NUMERIC(3,1),
  score_subscription   NUMERIC(3,1),
  score_manufacturing  NUMERIC(3,1),
  score_defensibility  NUMERIC(3,1),
  opportunity_score    NUMERIC(5,1),

  -- Build decision
  build_decision  TEXT CHECK (build_decision IN ('BUILD_NOW','VALIDATE_FURTHER','SKIP')),
  build_verdict   TEXT CHECK (build_verdict IN ('YES','MAYBE','NO')),

  -- Full memo stored as JSONB (all 14 sections)
  memo_data       JSONB NOT NULL,

  -- Biggest competitor (denormalized for leaderboard)
  biggest_competitor_name     TEXT,
  biggest_competitor_revenue  TEXT,
  market_size                 TEXT,
  sub_ltv                     TEXT,
  gross_margin                TEXT,

  -- Metadata
  generation_time_ms  INTEGER,
  model_version       TEXT DEFAULT 'claude-sonnet-4-6',
  is_public           BOOLEAN DEFAULT FALSE,
  is_archived         BOOLEAN DEFAULT FALSE
);

-- Index for user history queries
CREATE INDEX idx_analyses_user_id ON public.analyses(user_id, created_at DESC);

-- Index for leaderboard queries
CREATE INDEX idx_analyses_opportunity_score ON public.analyses(opportunity_score DESC);

-- ============================================================
-- LEADERBOARD (global — best score per category)
-- This is updated after every analysis
CREATE TABLE public.leaderboard (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_name    TEXT UNIQUE NOT NULL,
  opportunity_score NUMERIC(5,1),
  build_decision   TEXT,
  biggest_competitor TEXT,
  market_size      TEXT,
  sub_ltv          TEXT,
  analysis_count   INTEGER DEFAULT 1,
  best_analysis_id UUID REFERENCES public.analyses(id),
  last_analyzed    TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- FEEDBACK
CREATE TABLE public.feedback (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES auth.users(id),
  analysis_id UUID REFERENCES public.analyses(id),
  rating      INTEGER CHECK (rating BETWEEN 1 AND 5),
  comment     TEXT,
  category    TEXT,  -- 'accuracy' | 'usefulness' | 'ui' | 'other'
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- ROW LEVEL SECURITY
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analyses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;

-- Users can only read/write their own data
CREATE POLICY "Users own their profiles"
  ON public.profiles FOR ALL
  USING (auth.uid() = id);

CREATE POLICY "Users own their analyses"
  ON public.analyses FOR ALL
  USING (auth.uid() = user_id);

CREATE POLICY "Public analyses are readable by all"
  ON public.analyses FOR SELECT
  USING (is_public = TRUE OR auth.uid() = user_id);

-- Leaderboard is readable by all authenticated users
ALTER TABLE public.leaderboard ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Leaderboard readable by authenticated"
  ON public.leaderboard FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Users can submit feedback"
  ON public.feedback FOR INSERT
  WITH CHECK (auth.uid() = user_id);
```

---

## 5. AUTHENTICATION SYSTEM

### Method: Supabase Auth (Magic Link + Email/Password)

**Sign Up Flow:**
```
1. User enters email on landing page / signup page
2. Supabase sends magic link to email
3. User clicks link → auto-authenticated
4. Profile auto-created via database trigger
5. User lands on Dashboard (empty state)
```

**Alternative:** Email + Password (simpler for non-technical testers)
```
1. Enter email + password (min 8 chars)
2. Email verification sent
3. Click verify link
4. Profile created
5. Redirect to Dashboard
```

**Recommendation for beta:** Magic link only. Fewer friction points. Beta users are early adopters who understand the pattern.

### Session Management
```javascript
// middleware.ts (Next.js)
import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs'
import { NextResponse } from 'next/server'

export async function middleware(req) {
  const res = NextResponse.next()
  const supabase = createMiddlewareClient({ req, res })
  const { data: { session } } = await supabase.auth.getSession()

  // Protect /dashboard/* routes
  if (!session && req.nextUrl.pathname.startsWith('/dashboard')) {
    return NextResponse.redirect(new URL('/login', req.url))
  }
  return res
}

export const config = {
  matcher: ['/dashboard/:path*', '/api/generate/:path*']
}
```

### Beta Access Control
```javascript
// Check analysis limit before generating
async function checkAnalysisLimit(userId) {
  const { data: profile } = await supabase
    .from('profiles')
    .select('analyses_used, analyses_limit')
    .eq('id', userId)
    .single()

  if (profile.analyses_used >= profile.analyses_limit) {
    throw new Error('LIMIT_REACHED')
  }
}
```

**Beta limits:**
- 3 free analyses per account
- Referral code unlocks 3 more (optional, adds virality)
- No payment system needed for beta

---

## 6. CORE API: MEMO GENERATION

### Endpoint: POST /api/generate

```typescript
// app/api/generate/route.ts

import Anthropic from '@anthropic-ai/sdk'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'

const client = new Anthropic()

const SYSTEM_PROMPT = `You are a VC analyst specializing in supplement and consumer wellness brands.

When given a supplement/wellness product idea, you generate a complete Investment Memo.

OUTPUT RULES:
- Return ONLY valid JSON matching the schema below
- All scores are integers 0–10
- opportunity_score = (sum of 6 scores / 60) * 100, rounded to nearest integer
- build_decision: "BUILD_NOW" if opportunity_score >= 65, "VALIDATE_FURTHER" if 50–64, "SKIP" if below 50
- Be skeptical. Do not inflate scores to make categories look attractive.
- Market gaps and brand angles must be SPECIFIC and ACTIONABLE, not generic.
- Formula must include actual ingredients with actual doses and evidence tiers.

OUTPUT SCHEMA:
{
  "category_name": "clean category name",
  "executive_summary": "2–3 sentence overview",
  "build_verdict": "YES|MAYBE|NO",
  
  "scores": {
    "demand": { "score": 0, "notes": "why" },
    "competition": { "score": 0, "notes": "why" },
    "virality": { "score": 0, "notes": "why" },
    "subscription": { "score": 0, "notes": "why" },
    "manufacturing": { "score": 0, "notes": "why" },
    "defensibility": { "score": 0, "notes": "why" }
  },
  
  "opportunity_score": 0,
  "build_decision": "BUILD_NOW|VALIDATE_FURTHER|SKIP",
  "build_explanation": "2–3 sentence explanation of decision",
  
  "biggest_competitor": {
    "name": "brand name",
    "revenue": "estimated revenue",
    "gap": "what they're missing"
  },
  
  "market_size": "$XB (year)",
  "sub_ltv": "$XXX",
  "gross_margin": "XX–XX%",
  
  "market_gaps": [
    "Specific gap 1",
    "Specific gap 2",
    "...10 total"
  ],
  
  "brand_opportunities": [
    "Specific angle 1",
    "Specific angle 2",
    "...10 total"
  ],
  
  "customer_language": {
    "frustrations": ["quote 1", "quote 2", "quote 3"],
    "desires": ["desire 1", "desire 2"],
    "fears": ["fear 1", "fear 2"],
    "ad_phrases": [
      {"they_say": "...", "use_in_copy": "..."},
      {"they_say": "...", "use_in_copy": "..."}
    ]
  },
  
  "product_recommendation": {
    "format": "capsule|powder|gummy|liquid",
    "dosing": "X capsules/day with food",
    "formula": [
      {
        "ingredient": "name",
        "dose": "Xmg",
        "role": "what it does",
        "evidence": "★★★★★|★★★★|★★★|★★|★"
      }
    ],
    "avoid": ["ingredient to avoid + why"],
    "cogs_estimate": "$X–Y per unit",
    "retail_price": "$XX–XX/month subscribe, $XX one-time",
    "gross_margin": "XX–XX%"
  },
  
  "financial_projections": {
    "10k_month_probability": "XX%",
    "100k_month_probability": "XX%",
    "1m_month_probability": "XX%",
    "gross_margin": "XX–XX%",
    "net_margin_at_scale": "XX–XX%",
    "subscription_ltv": "$XXX",
    "path_to_10m": "2–3 sentence description"
  }
}`

export async function POST(req: Request) {
  const supabase = createRouteHandlerClient({ cookies })
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  // Check limit
  const { data: profile } = await supabase
    .from('profiles')
    .select('analyses_used, analyses_limit')
    .eq('id', user.id)
    .single()
  
  if (profile.analyses_used >= profile.analyses_limit) {
    return Response.json({ error: 'LIMIT_REACHED' }, { status: 429 })
  }

  const { input, targetAudience, pricePoint, context } = await req.json()
  
  const userMessage = [
    `Supplement idea: "${input}"`,
    targetAudience ? `Target audience: ${targetAudience}` : '',
    pricePoint ? `Intended price point: ${pricePoint}` : '',
    context ? `Additional context: ${context}` : ''
  ].filter(Boolean).join('\n')

  const startTime = Date.now()

  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userMessage }]
  })

  const generationTime = Date.now() - startTime
  const memoData = JSON.parse(message.content[0].text)

  // Save to database
  const { data: analysis } = await supabase
    .from('analyses')
    .insert({
      user_id: user.id,
      raw_input: input,
      category_name: memoData.category_name,
      target_audience: targetAudience,
      price_point: pricePoint,
      extra_context: context,
      score_demand: memoData.scores.demand.score,
      score_competition: memoData.scores.competition.score,
      score_virality: memoData.scores.virality.score,
      score_subscription: memoData.scores.subscription.score,
      score_manufacturing: memoData.scores.manufacturing.score,
      score_defensibility: memoData.scores.defensibility.score,
      opportunity_score: memoData.opportunity_score,
      build_decision: memoData.build_decision,
      build_verdict: memoData.build_verdict,
      memo_data: memoData,
      biggest_competitor_name: memoData.biggest_competitor?.name,
      biggest_competitor_revenue: memoData.biggest_competitor?.revenue,
      market_size: memoData.market_size,
      sub_ltv: memoData.sub_ltv,
      gross_margin: memoData.gross_margin,
      generation_time_ms: generationTime
    })
    .select()
    .single()

  // Increment usage
  await supabase
    .from('profiles')
    .update({ analyses_used: profile.analyses_used + 1 })
    .eq('id', user.id)

  // Upsert leaderboard
  await supabase
    .from('leaderboard')
    .upsert({
      category_name: memoData.category_name,
      opportunity_score: memoData.opportunity_score,
      build_decision: memoData.build_decision,
      biggest_competitor: memoData.biggest_competitor?.name,
      market_size: memoData.market_size,
      sub_ltv: memoData.sub_ltv,
      best_analysis_id: analysis.id,
      last_analyzed: new Date().toISOString()
    }, { onConflict: 'category_name', ignoreDuplicates: false })

  return Response.json({ analysisId: analysis.id, memo: memoData })
}
```

---

## 7. LANDING PAGE COPY

### Hero Section
```
HEADLINE:
"Know if your supplement idea is worth building.
Before you spend $50,000 on inventory."

SUBHEADLINE:
Type any supplement category. Get a complete investor-grade analysis —
market gaps, competitor intelligence, formula recommendation, financial 
projections, and a BUILD / SKIP decision — in 60 seconds.

CTA: [Get Early Access →]
SECONDARY: "Free during beta · No credit card"
```

### Social Proof Bar
```
"Powered by the same framework used to analyze 28+ supplement categories 
including the markets that built Nutrafol ($3.5B), Arrae ($100M), and Seed."
```

### Problem Section
```
HEADLINE: "Most supplement brands fail before they launch."

The problem isn't execution. It's that founders pick the wrong category.

They spend 6 months and $40K testing a product in a market that's either
too crowded, too niche, or too dependent on a trend that's already peaked.

Then they wonder why it didn't work.
```

### Solution Section
```
HEADLINE: "The intelligence layer you're missing."

[Icon] MARKET GAPS
Find the 10 specific things competitors are missing in any category.

[Icon] VALIDATED SCORING
Six-dimension scoring system, historically validated against 13 real brands.
Not ChatGPT. Not vibes. Calibrated against real outcomes.

[Icon] FORMULA RECOMMENDATION
Exact ingredient stack, doses, evidence tiers, COGS estimate, and 
ingredients to avoid — for every category analyzed.

[Icon] FINANCIAL PROJECTIONS  
$10k/month, $100k/month, and $1M/month probability estimates.
LTV, gross margin, and subscription mechanics quantified.

[Icon] BUILD DECISION
🟢 BUILD NOW / 🟡 VALIDATE FURTHER / 🔴 SKIP
One clear output. No ambiguity.
```

### How It Works
```
HEADLINE: "Three steps."

1️⃣ TYPE YOUR IDEA
Enter any supplement concept: "stress and bloating for women" 
or as specific as "cortisol support for women 35–50 experiencing hair loss"

2️⃣ WAIT 60 SECONDS
The engine scores demand, competition, virality, retention, 
manufacturing difficulty, and defensibility simultaneously.

3️⃣ GET YOUR ANSWER
A complete investment memo. Market gaps. Formula. Financial model. 
Build decision. Ready to use in a pitch deck or product brief.
```

### Example Output Teaser
```
HEADLINE: "Here's what you get."

[Screenshot of memo with score: 80/100 🟢 BUILD NOW]

Category: Bloating + Fatigue Supplement
Opportunity Score: 80/100
Decision: 🟢 BUILD NOW

"The gut-energy connection is the most documented unowned mechanism 
in the $14.4B gut health supplement market. Arrae built $100M on 
bloating alone — never claiming the energy benefit. That gap is yours."
```

### Target Audience Section
```
HEADLINE: "Built for founders, not analysts."

FOR SUPPLEMENT FOUNDERS
Stop wasting months on the wrong idea. Know within 60 seconds 
whether your category is worth pursuing.

FOR DTC ENTREPRENEURS
Moving into wellness? Start with the categories that have 
proven mechanics, not the ones that sound good on TikTok.

FOR INVESTORS AND ADVISORS
Rapid due diligence on any wellness category. 
Consistent framework. Comparable scores across ideas.
```

### Beta CTA Section
```
HEADLINE: "Get access this week."

We're onboarding 25 beta testers. Free access. 
Your feedback shapes the product.

[Your email address]
[→ Request Access]

"Join founders already analyzing ideas like: 
Perimenopause Support · PCOS Weight Loss · Postpartum Recovery · 
Cortisol Support · Hormonal Acne"
```

### FAQ
```
Q: How is this different from asking ChatGPT?
A: ChatGPT gives you information. This gives you a decision framework — 
consistently scored, historically validated against 13 real brands, 
with specific formula recommendations and financial projections.

Q: What does "historically validated" mean?
A: We retroactively ran the framework against 13 successful supplement 
brands (Nutrafol, Arrae, Seed, Bloom, Ritual, LMNT, and others) 
to calibrate the scoring thresholds against real-world outcomes.

Q: Is the formula recommendation actually usable?
A: Yes. Each recommendation includes exact ingredients, doses, 
evidence tiers, estimated COGS, and a list of ingredients to avoid — 
ready to take to a contract manufacturer.

Q: How many analyses can I run?
A: 3 free during beta. More coming.

Q: Is my data private?
A: Your analyses are private by default. You can choose to make them 
public to contribute to the shared leaderboard.
```

---

## 8. BETA TESTING PLAN

### Goal
5 qualified users actively testing within 7 days.  
"Qualified" = has a supplement idea they're seriously considering building.

### Target Beta User Profile
- Founder or aspiring founder in CPG/supplement/wellness space
- OR investor / advisor who evaluates wellness brands
- OR marketing/product professional at a supplement company
- Has a specific product idea they're trying to evaluate
- Comfortable with early software (no hand-holding needed)

### Day-by-Day Plan

**DAY 1 (Build Start) — Internal**
- [ ] Set up GitHub repo, Vercel project, Supabase project
- [ ] Deploy skeleton (login + empty dashboard)
- [ ] Set up domain (or use Vercel preview URL for beta)
- [ ] Begin recruiting list (identify 20 target testers)

**DAY 2–4 (Build)**
- [ ] Core generation endpoint working
- [ ] Memo output screen built
- [ ] History + leaderboard pages
- [ ] Error states handled

**DAY 5 (Beta Prep)**
- [ ] Landing page live
- [ ] Magic link auth working end-to-end
- [ ] Record 5-minute Loom walkthrough
- [ ] Prepare beta invitation email
- [ ] Create feedback form (Tally or Typeform)

**DAY 6 (Outreach)**
- [ ] Send 20 personalized LinkedIn DMs (template below)
- [ ] Post on LinkedIn (template below)
- [ ] Tweet (if active on X)
- [ ] Post in 2 relevant Slack/Discord communities

**DAY 7 (Target: 5 Active Users)**
- [ ] Follow up on non-replies
- [ ] Onboard first 5 users personally
- [ ] Schedule 15-min onboarding call with each
- [ ] In-app feedback enabled

---

### Recruitment Templates

**LinkedIn DM (personalized)**
```
Hi [Name],

I'm building a tool that generates investment-grade analysis for any supplement 
idea — market gaps, formula, financial projections, and a BUILD/SKIP score — 
in 60 seconds.

I've analyzed 28 supplement categories and validated the framework against 
brands like Nutrafol, Arrae, and Seed before they were successful.

You're building in this space. Would you try it on one of your current ideas 
and give me 10 minutes of feedback? Free access, no strings.

Link: [URL]

— [Name]
```

**LinkedIn Post**
```
I spent the last 2 weeks building a research engine for supplement founders.

You type an idea. In 60 seconds you get:
• Market gaps (10 specific ones)
• Competitor intelligence
• Formula recommendation with exact doses and COGS
• Financial projections ($10k / $100k / $1M/month probability)
• BUILD NOW / VALIDATE FURTHER / SKIP decision

Validated against 13 real brands (Nutrafol, Arrae, Seed, Bloom, Ritual, LMNT).

Looking for 5 founders in supplement/wellness/DTC to beta test this week.

Reply "beta" or DM me and I'll send you access.

What categories are you analyzing right now?
```

**Target Communities to Post In:**
- r/supplements (Reddit)
- DTC Slack communities (DTC Newsletter Slack, Shopify Founders)
- Natural Products / Supplement founder Facebook groups
- IndieHackers.com
- Twitter #CPG #supplements #DTC #healthfounder

---

### Onboarding Flow for Beta Users

**Email Sequence:**

Email 1 (immediate): Access granted
```
Subject: You're in — here's your access

Hey [name],

Your beta access is live: [link]

Watch this 5-minute walkthrough before you start: [Loom link]

Your first 3 analyses are free. Type anything — even your wildest 
supplement idea. The system handles the rest.

One favor: After your first analysis, click the feedback button 
inside the app. Even one sentence helps enormously.

Talk soon,
[Your name]
```

Email 2 (Day 3 if no analysis): Nudge
```
Subject: Quick question

Hey [name] — did you get a chance to try it?

If you're stuck on what to analyze, here are ideas other founders 
are running right now:
• Perimenopause weight gain
• PCOS supplement
• Cortisol + sleep (women)
• Post-workout recovery for women 35+

Takes 60 seconds. Access: [link]
```

Email 3 (Day 7): Feedback request
```
Subject: 10-minute feedback call?

Hey [name],

You've had access for a week. I'd love to jump on a 15-min call 
to hear what worked, what didn't, and what you'd want built next.

[Calendly link]

Or just reply here with your honest take — 2 sentences is enough.

Either way, thank you for being part of this early.
```

---

### Success Metrics for Beta Week

| Metric | Target | How to measure |
|---|---|---|
| Beta users signed up | 5 | Supabase auth dashboard |
| Analyses completed | 5 | Analyses table count |
| Time-to-first-memo (from signup) | < 5 min | created_at delta |
| Repeat usage (≥2 analyses) | 3/5 users | Analyses per user_id |
| Feedback submitted | 3/5 users | Feedback table count |
| NPS > 7 | 3/5 users | Feedback rating field |
| Founder would pay for this | 2/5 users | Feedback comment |

---

### Feedback Collection (In-App)

After every memo, show a small widget:
```
─────────────────────────────────────
Was this analysis useful?
[★★★★★] [★★★★] [★★★] [★★] [★]

What was most useful?
○ Market gaps
○ Formula recommendation  
○ Financial projections
○ The BUILD/SKIP decision
○ Customer language

One thing to improve:
[text field, optional]

[Submit feedback]
─────────────────────────────────────
```

---

## 9. FILE STRUCTURE

```
supplement-intelligence/
├── app/
│   ├── (auth)/
│   │   ├── login/page.tsx
│   │   └── signup/page.tsx
│   ├── (dashboard)/
│   │   ├── layout.tsx
│   │   ├── dashboard/page.tsx
│   │   ├── analyze/page.tsx
│   │   ├── memo/[id]/page.tsx
│   │   └── leaderboard/page.tsx
│   ├── api/
│   │   ├── generate/route.ts       ← Core AI endpoint
│   │   ├── analyses/route.ts
│   │   └── leaderboard/route.ts
│   ├── layout.tsx
│   └── page.tsx                    ← Landing page
├── components/
│   ├── MemoDisplay.tsx             ← Full memo component
│   ├── ScoreRow.tsx
│   ├── BuildDecisionBadge.tsx
│   ├── FormulaTable.tsx
│   ├── MarketGapsList.tsx
│   ├── FinancialProjections.tsx
│   ├── FeedbackWidget.tsx
│   └── Leaderboard.tsx
├── lib/
│   ├── supabase/
│   │   ├── client.ts
│   │   └── server.ts
│   └── prompts/
│       └── memo-system-prompt.ts   ← The AI prompt
├── types/
│   └── memo.ts                     ← TypeScript types for memo
├── supabase/
│   └── migrations/
│       └── 001_initial_schema.sql
├── .env.local
├── middleware.ts
└── package.json
```

---

## 10. ENVIRONMENT VARIABLES

```bash
# .env.local
NEXT_PUBLIC_SUPABASE_URL=https://[project].supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
ANTHROPIC_API_KEY=sk-ant-...
NEXT_PUBLIC_APP_URL=https://yourdomain.com
RESEND_API_KEY=re_...  # For transactional email
```

---

## 11. BUILD TIMELINE

| Day | Developer Hours | What Gets Built |
|---|---|---|
| **Day 1** | 3h | Repo setup, Supabase schema, Vercel deploy, env vars |
| **Day 2** | 5h | AI endpoint + prompt engineering + JSON parsing |
| **Day 3** | 5h | Memo output screen (all sections), loading screen |
| **Day 4** | 4h | Dashboard, history list, leaderboard |
| **Day 5** | 4h | Landing page, auth flow, email setup |
| **Day 6** | 2h | Bug fixes, mobile responsiveness, feedback widget |
| **Day 7** | 2h | Beta recruitment, first user onboarding |
| **Total** | **25h** | Fully deployed, 5 users testing |

**This is a solo developer build.** 25 hours over 7 days = 3.5 hours/day.

---

## 12. WHAT THIS IS NOT

To ship in 7 days, explicitly exclude:

- ❌ Payment / billing (no Stripe)
- ❌ Team / collaboration features
- ❌ PDF export (show as styled web page only)
- ❌ API access for third parties
- ❌ Custom branding/white-label
- ❌ Mobile app
- ❌ Advanced filtering / search
- ❌ Comparison between two memos side-by-side
- ❌ Email newsletters / drip campaigns
- ❌ Complex onboarding wizard

The product is: **type input → see memo → done.** Everything else is post-beta.

---

## 13. MINIMUM VIABLE DEFINITION OF DONE

Beta is ready when a stranger can:
1. Find the landing page and understand what the product does in 10 seconds
2. Sign up with their email and receive an access link
3. Type a supplement idea and click Generate
4. See a complete memo within 60 seconds
5. Scroll through all sections without confusion
6. Submit a feedback rating
7. Run a second analysis

If all 7 work — ship it.
