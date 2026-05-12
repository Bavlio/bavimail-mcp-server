/**
 * Per-process rate limit for `emails_send_batch`.
 *
 * Per AC11 (security B2 mitigation): cap at 5 batch sends per rolling 60s
 * window per process. Single-tenant scope; multi-tenant per-key buckets
 * deferred to v1.2+.
 *
 * On 6th call within window, return MCPUpstreamError with code
 * `client_rate_limit` and `retryAfter` set to the seconds until the oldest
 * timestamp in the window expires.
 *
 * T-MCP-11 verifies.
 */

import { MCPUpstreamError } from './errors.js'

const WINDOW_MS = 60_000
const MAX_CALLS_PER_WINDOW = 5

class RollingWindow {
  private readonly timestamps: number[] = []

  attempt(now: number = Date.now()): { allowed: true } | { allowed: false; retryAfter: number } {
    // Drop entries outside the window
    const cutoff = now - WINDOW_MS
    while (this.timestamps.length > 0 && this.timestamps[0]! <= cutoff) {
      this.timestamps.shift()
    }
    if (this.timestamps.length >= MAX_CALLS_PER_WINDOW) {
      const oldest = this.timestamps[0]!
      const retryAfter = Math.max(1, Math.ceil((oldest + WINDOW_MS - now) / 1000))
      return { allowed: false, retryAfter }
    }
    this.timestamps.push(now)
    return { allowed: true }
  }

  /** Test-only: reset the window to empty. */
  reset(): void {
    this.timestamps.length = 0
  }
}

const batchSendWindow = new RollingWindow()

export function recordBatchSendOrThrow(now?: number): void {
  const result = batchSendWindow.attempt(now)
  if (!result.allowed) {
    throw new MCPUpstreamError(
      'client_rate_limit',
      `Local rate limit exceeded: max ${MAX_CALLS_PER_WINDOW} emails_send_batch calls per ${WINDOW_MS / 1000}s window. Retry after ${result.retryAfter}s.`,
      result.retryAfter,
    )
  }
}

export function __resetRateLimitForTests(): void {
  batchSendWindow.reset()
}

export const __config = {
  WINDOW_MS,
  MAX_CALLS_PER_WINDOW,
} as const
