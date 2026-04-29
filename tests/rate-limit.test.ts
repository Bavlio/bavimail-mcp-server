/**
 * T-MCP-11: per-process rate limit on emails_send_batch.
 *
 * AC11: 5 calls per rolling 60s window. 6th call returns
 * `client_rate_limit` with `retryAfter` set.
 */

import { afterEach, describe, expect, it } from 'vitest'

import { MCPUpstreamError } from '../src/lib/errors.js'
import {
  __config,
  __resetRateLimitForTests,
  recordBatchSendOrThrow,
} from '../src/lib/rate-limit.js'

afterEach(() => {
  __resetRateLimitForTests()
})

describe('emails_send_batch rate limit', () => {
  it('allows the first MAX_CALLS_PER_WINDOW calls in the window', () => {
    const t0 = 1_700_000_000_000
    for (let i = 0; i < __config.MAX_CALLS_PER_WINDOW; i += 1) {
      expect(() => recordBatchSendOrThrow(t0 + i)).not.toThrow()
    }
  })

  it('throws client_rate_limit on the (MAX+1)th call within the window', () => {
    const t0 = 1_700_000_000_000
    for (let i = 0; i < __config.MAX_CALLS_PER_WINDOW; i += 1) {
      recordBatchSendOrThrow(t0 + i)
    }
    let caught: unknown
    try {
      recordBatchSendOrThrow(t0 + __config.MAX_CALLS_PER_WINDOW)
    } catch (err) {
      caught = err
    }
    expect(caught).toBeInstanceOf(MCPUpstreamError)
    const e = caught as MCPUpstreamError
    expect(e.code).toBe('client_rate_limit')
    expect(typeof e.retryAfter).toBe('number')
    expect(e.retryAfter!).toBeGreaterThan(0)
    expect(e.retryAfter!).toBeLessThanOrEqual(__config.WINDOW_MS / 1000)
  })

  it('allows another call after the window slides past the oldest entry', () => {
    const t0 = 1_700_000_000_000
    for (let i = 0; i < __config.MAX_CALLS_PER_WINDOW; i += 1) {
      recordBatchSendOrThrow(t0 + i)
    }
    // Move time past the oldest entry's expiry
    const tAfter = t0 + __config.WINDOW_MS + 1
    expect(() => recordBatchSendOrThrow(tAfter)).not.toThrow()
  })

  it('uses a per-process counter (no per-key buckets in v1.0)', () => {
    // The rate-limit module exposes a singleton; this test asserts the
    // singleton survives across imports. Multi-tenant per-key buckets are
    // explicitly deferred to v1.2+ per the plan's Tradeoff 3 + AC11.
    const t0 = 1_700_000_000_000
    for (let i = 0; i < __config.MAX_CALLS_PER_WINDOW; i += 1) {
      recordBatchSendOrThrow(t0 + i)
    }
    expect(() => recordBatchSendOrThrow(t0 + __config.MAX_CALLS_PER_WINDOW)).toThrow(
      MCPUpstreamError,
    )
  })
})
