# Skill: find-products-under-budget

## Command
`/find-products-under-budget <budget>`

## Description
Filter and rank product opportunities that a new seller can realistically launch within a given startup budget. Surfaces the best opportunities available at the specified spend level, adds a Budget Efficiency Score, flags near-miss products just above the ceiling, and tells the user exactly what they can and cannot afford.

---

## Parameters

| Parameter | Type | Required | Example |
|-----------|------|----------|---------|
| `budget`  | integer (USD) | Yes | `3000`, `5000`, `10000` |

---

## Execution Pipeline

### Step 1 — Resolve the Product Pool

Check whether a prior analysis is available in the current session:

**Case A — `opportunity-ranking.md` exists in the working directory:**
- Read the file and extract all scored products (both ranked and disqualified).
- Use this as the product pool. Skip to Step 2.

**Case B — A `/product-hunt` was run earlier in the current session:**
- Use the product data already in context.
- Skip to Step 2.

**Case C — No prior analysis available:**
- Ask the user: *"No product analysis found. Which niche would you like me to research? (e.g. 'silicone kitchen tools', 'pet accessories')"*
- Once the user provides a niche, run the full `/product-hunt` pipeline for that niche.
- Then continue to Step 2.

---

### Step 2 — Apply the Budget Filter

For each product in the pool, compare `startup_budget.total_minimum` against `<budget>`.

Classify every product into one of three buckets:

| Bucket | Condition | Action |
|--------|-----------|--------|
| **Within Budget** | `total_minimum <= budget` | Include in ranked results |
| **Near Miss** | `budget < total_minimum <= budget × 1.25` | Show separately as stretch opportunities |
| **Out of Range** | `total_minimum > budget × 1.25` | Exclude from output |

Also exclude all previously disqualified products (patent risk, dangerous, restricted, etc.) — they remain disqualified regardless of budget.

---

### Step 3 — Compute Budget Efficiency Score

For each Within Budget product, compute:

```
Budget Efficiency Score = Final Opportunity Score / (total_minimum / 100)
```

This rewards products that deliver high opportunity per dollar spent.
- A product with Opportunity Score 72 and a $1,200 budget has efficiency of 72 / 12 = **6.0**
- A product with Opportunity Score 75 and a $3,800 budget has efficiency of 75 / 38 = **1.97**

Round to two decimal places.

---

### Step 4 — Rank Within-Budget Products

Sort by **Final Opportunity Score** descending (primary sort).
Use **Budget Efficiency Score** as the tiebreaker (higher = better).

Cap output at 10 products. If fewer than 10 survive the filter, show all that qualify.

---

### Step 5 — Determine Budget Tier Label

Assign a label to the user's budget to set expectations:

| Budget | Tier Label | Expected Pool Quality |
|--------|------------|----------------------|
| < $1,000 | Micro Budget | Very limited; only the simplest commodity products; lower margins likely |
| $1,000–$2,499 | Starter Budget | Solid options for simple private-label products |
| $2,500–$4,999 | Growth Budget | Most mid-range opportunities accessible; some competitive niches viable |
| $5,000–$9,999 | Established Budget | Strong access to high-margin and brand-building products |
| $10,000+ | Serious Budget | Full range of opportunities; can absorb higher-risk, higher-reward products |

---

### Step 6 — Identify Budget Upgrade Scenarios

For each Near Miss product, calculate:

```
Budget Gap = total_minimum - user_budget
Budget Gap % = (Budget Gap / user_budget) × 100
```

Show only Near Miss products where `Budget Gap % <= 25%`. These are "unlock" opportunities — a modest budget increase makes them accessible.

---

### Step 7 — Generate Report

---

## Output Format

```markdown
# Products Under Budget: $<budget>

**Budget Tier:** <Micro / Starter / Growth / Established / Serious>
**Niche:** <niche or "multiple niches">
**Products Evaluated:** <total in pool>
**Within Budget:** <count>
**Near Misses:** <count>
**Disqualified (excluded):** <count>

---

## What You Can Launch for $<budget>

### #1 — <Product Name>
| Metric                    | Value      |
|---------------------------|------------|
| Final Opportunity Score   | XX / 100   |
| Budget Efficiency Score   | X.XX       |
| Demand Score              | XX / 100   |
| Competition Score         | XX / 100   |
| Small Seller Success      | XX / 100   |
| Profit Score              | XX / 100   |
| Risk Score                | XX / 100   |
| Market Saturation         | <label>    |

**Budget Breakdown**
| Item                  | Minimum   | Recommended |
|-----------------------|-----------|-------------|
| MOQ inventory cost    | $XXX      | $XXX        |
| Inbound shipping      | $XXX      | $XXX        |
| Packaging             | $XXX      | $XXX        |
| Product photography   | $XXX      | $XXX        |
| Launch / PPC budget   | $XXX      | $XXX        |
| Miscellaneous         | $XXX      | $XXX        |
| **TOTAL**             | **$XXX**  | **$XXX**    |

**Financial Snapshot**
- Expected net margin: XX%
- Estimated monthly profit: $XXX
- Break-even: ~X months

**Recommendation: ✅ Strong Buy / ⚡ Worth Testing**
> One-sentence rationale.

---
(repeat for #2 through #10)

---

## Near Misses — Just Over Budget

> These products fall within 25% above your $<budget> ceiling.
> A small budget increase unlocks them.

| Product | Min Budget | Budget Gap | Opp. Score | Margin | Worth the Stretch? |
|---------|------------|------------|------------|--------|--------------------|
| <name>  | $X,XXX     | +$XXX (+X%)| XX         | XX%    | Yes / No           |

**Worth the Stretch?** = Yes if `final_opportunity_score >= 65` AND `profit_per_unit.expected.margin_pct >= 28%`

---

## Budget Summary

**Your $<budget> gets you:**
- <count> launchable products
- Best opportunity: <Product Name> (Score: XX)
- Highest margin: <Product Name> (XX% expected)
- Fastest break-even: <Product Name> (~X months)
- Best for small first launch: <Product Name> (min budget: $XXX)

**To unlock more options, you would need:**
- $<amount> more → unlocks <Product Name> (Score: XX)
- $<amount> more → unlocks <Product Name> (Score: XX)

---

## Ranked Summary Table

| # | Product | Opp. Score | Efficiency | Exp. Margin | Min Budget | Break-Even | Recommendation |
|---|---------|------------|------------|-------------|------------|------------|----------------|
| 1 | ...     | XX         | X.XX       | XX%         | $XXX       | X mo       | ✅ Strong Buy   |
...

---

## Recommended First Move

> Based on your $<budget> budget, the single best product to launch first is **<Product Name>**.
>
> <2–3 sentence rationale covering: why it fits the budget, why the opportunity score justifies it, and the #1 risk to manage.>
```

---

## Constraints
- Never show a disqualified product as a Within Budget or Near Miss result — disqualification is permanent regardless of budget fit.
- If zero products fit the budget, do not show an empty report. Instead:
  - State clearly how many products were evaluated and what the cheapest option costs.
  - Show the 3 cheapest disqualified-free options regardless of budget, labelled "Closest Options Available."
  - Recommend either a budget increase or a niche change.
- Budget Efficiency Score is a secondary signal — never rank a lower Opportunity Score product above a higher one purely on efficiency.
- The Recommended First Move section is mandatory — always end with a single, concrete recommendation, even if all options are "Worth Testing."
- All budget figures come directly from `profit-opportunity-analyzer` outputs — do not recalculate them.
- Always show the full 6-line budget breakdown table per product so the user understands where their money goes.
