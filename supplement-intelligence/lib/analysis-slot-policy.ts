// ROOT CAUSE (found 2026-06-28 production audit): in app/api/generate/
// route.ts, the timeout and API-error failure paths already `return
// err(...)` before ever reaching slot consumption ("no slot used" in their
// own error messages) — but a request that falls through to
// buildSkipMemo() (json_parse_failure or incomplete_memo, skipReason set)
// had no such protection and consumed a slot identically to a real, usable
// analysis. CONFIRMED VIA LIVE CALL: "berberine" exhausted all 3
// generation attempts on incomplete_memo, got a real Apify/Keepa/
// DataForSEO-backed SKIP memo with zero usable content, and still cost the
// user one of their limited beta slots.
//
// Extracted to its own module (rather than an inline condition at the call
// site) specifically so this policy can be asserted directly in a test —
// see scripts/test-slot-fairness.ts — without needing to trigger a real,
// non-deterministic LLM failure end-to-end. Next.js App Router route files
// only permit a fixed set of named exports (GET/POST/config), so a plain
// helper function can't live in route.ts itself.
export function shouldConsumeSlot(skipReason: string | null, devUnlimited: boolean): boolean {
  return !devUnlimited && !skipReason
}
