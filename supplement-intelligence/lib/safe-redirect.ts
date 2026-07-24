// ── safeRedirectTarget — open-redirect guard for ?next= query params ──────
// Shared by middleware.ts (server-side, req.nextUrl.origin) and
// app/login/page.tsx (client-side, window.location.origin) — a single
// implementation, not two copies, after a security-compliance-agent review
// (2026-07-24) found a real bypass in the first version: a raw-string
// check (`startsWith('/') && !startsWith('//') && !includes('://')`)
// validates the INPUT string, but WHATWG URL parsing normalizes things
// like backslashes and stripped control characters (\t \r \n) AFTER that
// check runs — "/\\evil.com" or "/\t/evil.com" pass the string check but
// resolve to "https://evil.com/" once parsed. The fix: parse the candidate
// first, then compare the PARSED result's origin against the real origin
// — validating what a browser will actually navigate to, not pattern-
// matching untrusted input.
export function safeRedirectTarget(rawNext: string | null, origin: string, fallback: string): string {
  if (!rawNext) return fallback
  try {
    const parsed = new URL(rawNext, origin)
    if (parsed.origin === origin && rawNext.startsWith('/') && !rawNext.startsWith('//')) {
      return rawNext
    }
  } catch {
    // fall through to fallback — an unparseable `next` is never trusted
  }
  return fallback
}
