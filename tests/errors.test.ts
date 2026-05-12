/**
 * T-MCP-3 + T-MCP-7 + T-MCP-12: error code mapping + redaction.
 *
 * AC7 distinct codes: auth_invalid, auth_forbidden, rate_limit, timeout,
 * validation, upstream, client_rate_limit, ignored_header.
 *
 * AC22 / T-MCP-3 round-7 expansion:
 * - Case-insensitive Bearer redaction (lowercase `bearer` covered).
 * - Tilde + URL-encoded API key forms covered.
 * - Generic Authorization header redaction covered.
 *
 * Performance NB3 / T-MCP-12: parseRetryAfterSeconds reads RFC 7231
 * numeric Retry-After (HTTP-date format intentionally not handled).
 */

import { describe, expect, it } from 'vitest'

import {
  ERROR_CODES,
  mapHttpStatusToCode,
  parseRetryAfterSeconds,
  redactSecrets,
} from '../src/lib/errors.js'

describe('mapHttpStatusToCode', () => {
  it('maps 401 → auth_invalid', () => expect(mapHttpStatusToCode(401)).toBe('auth_invalid'))
  it('maps 403 → auth_forbidden', () => expect(mapHttpStatusToCode(403)).toBe('auth_forbidden'))
  it('maps 429 → rate_limit', () => expect(mapHttpStatusToCode(429)).toBe('rate_limit'))
  it('maps 500 → upstream', () => expect(mapHttpStatusToCode(500)).toBe('upstream'))
  it('maps 502 → upstream', () => expect(mapHttpStatusToCode(502)).toBe('upstream'))
})

describe('ERROR_CODES contract', () => {
  it('includes all 8 distinct codes documented in AC7 + AC4c + AC11', () => {
    expect(new Set(ERROR_CODES)).toEqual(
      new Set([
        'auth_invalid',
        'auth_forbidden',
        'rate_limit',
        'client_rate_limit',
        'timeout',
        'validation',
        'upstream',
        'ignored_header',
      ]),
    )
  })
})

describe('parseRetryAfterSeconds', () => {
  it('parses a numeric Retry-After header', () => {
    expect(parseRetryAfterSeconds('30')).toBe(30)
    expect(parseRetryAfterSeconds('0')).toBe(0)
    expect(parseRetryAfterSeconds('120')).toBe(120)
  })

  it('returns undefined for non-numeric (HTTP-date) headers', () => {
    expect(parseRetryAfterSeconds('Wed, 21 Oct 2026 07:28:00 GMT')).toBeUndefined()
  })

  it('returns undefined for null/undefined/empty', () => {
    expect(parseRetryAfterSeconds(null)).toBeUndefined()
    expect(parseRetryAfterSeconds(undefined)).toBeUndefined()
    expect(parseRetryAfterSeconds('')).toBeUndefined()
  })

  it('rejects negative values', () => {
    expect(parseRetryAfterSeconds('-1')).toBeUndefined()
  })
})

describe('redactSecrets', () => {
  const KEY = 'bvm_live_abcdef1234567890'

  it('replaces literal API key occurrences with [REDACTED_API_KEY]', () => {
    const text = `request failed with header Authorization: Bearer ${KEY}`
    const out = redactSecrets(text, KEY)
    expect(out).not.toContain(KEY)
  })

  it('replaces URL-encoded API key occurrences (round-7 hardening)', () => {
    const keyWithSpecial = 'bvm/live=abc def'
    const encoded = encodeURIComponent(keyWithSpecial)
    const text = `error from upstream: ?key=${encoded}&other=1`
    const out = redactSecrets(text, keyWithSpecial)
    expect(out).not.toContain(encoded)
    expect(out).toContain('[REDACTED_API_KEY]')
  })

  it('redacts case-insensitive Bearer prefix (lowercase `bearer` covered)', () => {
    const out1 = redactSecrets('Authorization: Bearer abc.def-gh+ij/kl=mno', undefined)
    const out2 = redactSecrets('authorization: bearer abc.def_gh-ij', undefined)
    expect(out1).toContain('Bearer [REDACTED]')
    expect(out2).toContain('bearer [REDACTED]')
  })

  it('redacts Bearer tokens containing tilde (round-7 hardening)', () => {
    const out = redactSecrets('Authorization: Bearer abc~defSECRET', undefined)
    expect(out).not.toContain('SECRET')
    expect(out).toContain('Bearer [REDACTED]')
  })

  it('redacts generic Authorization headers (any scheme)', () => {
    const out = redactSecrets('authorization: Token abc-def-ghi', undefined)
    expect(out).not.toContain('abc-def-ghi')
  })

  it('does not modify text that contains neither the key nor a Bearer token', () => {
    expect(redactSecrets('plain message', 'key')).toBe('plain message')
  })
})
