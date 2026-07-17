---
name: confidence-tiered-extraction
description: Enforces the Constitution's Truth Over Confidence, No Revenue Predictions, No Probability of Success, and No ROI Predictions laws on any prompt, extraction, or interpretation-formatting work. Every user-facing claim, score, or verdict must carry an explicit CONFIRMED/INDICATED/LIMITED confidence tier; revenue, ROI, and success-probability language are forbidden anywhere in generated output.
when_to_use: Use before writing or editing an Anthropic prompt string, an extraction pipeline, or any code that formats a verdict, score, or interpretation shown to a founder. Do not use for provider fetch logic with no interpretive output, UI copy unrelated to scoring, or test-only diffs that assert existing behavior.
paths: lib/science-engine/**, lib/regulatory-engine/**, lib/ai-interpretation/**, lib/prompts/**, lib/consumer-intelligence/**, lib/thesis-engine/**, lib/verdict-matrix.ts, lib/scoring.ts, supplement-intelligence/lib/science-engine/**, supplement-intelligence/lib/regulatory-engine/**, supplement-intelligence/lib/ai-interpretation/**, supplement-intelligence/lib/prompts/**, supplement-intelligence/lib/consumer-intelligence/**, supplement-intelligence/lib/thesis-engine/**, supplement-intelligence/lib/verdict-matrix.ts, supplement-intelligence/lib/scoring.ts
disallowed-tools: Agent
---

# Confidence-Tiered Extraction

A procedure, not a decision-maker. It does not invoke other Skills, spawn Agents, or route work — it only states what a compliant prompt or interpretation output must contain, per `docs/CONSTITUTION.md` Laws 1–4.

## Before writing or editing any prompt, extraction rule, or interpretation-formatting code, confirm

1. **Every claim carries a tier.** Every signal, score, or conclusion shown to a user states CONFIRMED, INDICATED, or LIMITED — inline, not behind a tooltip or info icon.
2. **Weak evidence is stated plainly**, not smoothed over. If a corpus was excluded or a signal is thin, say so in plain language on the first screen, not buried in an evidence view.
3. **No revenue or market-size language.** No TAM/SAM, no "$X market," no volume × price framed as revenue, no "if you capture N% of this market."
4. **No success-probability language.** No "likely to succeed," no "founders like you typically...," no score named "Opportunity Score" or "Success Score."
5. **No ROI/payback/margin-projection language.** No estimated ROI, no break-even, no payback period, no net-margin range that assumes a revenue figure.

## Correct

> "Consumer pain is validated by 340 complaints across a 2,100-review corpus (CONFIRMED). Search volume: 45,200/month — evidence of demand strength, not a revenue estimate."

## Incorrect

> "This is a $34M annual opportunity with an estimated ROI of 280% — founders like you typically succeed in this category."

## Scope

Applies only to content and code that produces or formats a user-facing claim. It does not review security, billing, or infrastructure code — that belongs to `security-review`. It does not review code quality or simplification — that is `code-review`'s job, owned by `independent-reviewer-agent`. This Skill never delegates to another Agent; if the work needs a different specialist, stop and let the Planner reassign it.
