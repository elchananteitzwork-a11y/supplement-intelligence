import { describe, it, expect } from 'vitest'
import { nextScheduledRecheck, RECHECK_CRON_HOUR_UTC, RECHECK_CRON_WEEKDAY } from '../schedule'

describe('nextScheduledRecheck', () => {
  it('rolls forward to the coming Monday 10:00 UTC when now is mid-week', () => {
    // Wednesday 2026-07-08 12:00 UTC
    const now = new Date('2026-07-08T12:00:00.000Z')
    const next = nextScheduledRecheck(now)
    expect(next.toISOString()).toBe('2026-07-13T10:00:00.000Z')
    expect(next.getUTCDay()).toBe(RECHECK_CRON_WEEKDAY)
    expect(next.getUTCHours()).toBe(RECHECK_CRON_HOUR_UTC)
  })

  it('returns later today when now is Monday before 10:00 UTC', () => {
    const now = new Date('2026-07-13T08:00:00.000Z')
    const next = nextScheduledRecheck(now)
    expect(next.toISOString()).toBe('2026-07-13T10:00:00.000Z')
  })

  it('rolls forward a full week when now is Monday after 10:00 UTC', () => {
    const now = new Date('2026-07-13T11:00:00.000Z')
    const next = nextScheduledRecheck(now)
    expect(next.toISOString()).toBe('2026-07-20T10:00:00.000Z')
  })

  it('rolls forward exactly to next Monday when now is Monday at exactly 10:00:00 UTC', () => {
    const now = new Date('2026-07-13T10:00:00.000Z')
    const next = nextScheduledRecheck(now)
    expect(next.toISOString()).toBe('2026-07-20T10:00:00.000Z')
  })

  it('handles a month boundary correctly', () => {
    // Sunday 2026-08-30 23:00 UTC -> next day is Monday 2026-08-31
    const now = new Date('2026-08-30T23:00:00.000Z')
    const next = nextScheduledRecheck(now)
    expect(next.toISOString()).toBe('2026-08-31T10:00:00.000Z')
  })
})
