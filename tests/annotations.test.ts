/**
 * T-MCP-13: tool annotations match the Tradeoff 2 matrix.
 *
 * AC4a — every tool declares all 4 annotation fields and they match the
 * matrix. readOnlyHint only true for *_get / *_list*; destructiveHint
 * only true for emails_update_scheduled + emails_cancel; idempotentHint
 * per HTTP semantics; openWorldHint always true.
 */

import { describe, expect, it } from 'vitest'

import { TOOL_ANNOTATIONS, TOOL_NAMES } from '../src/tools/annotations.js'

describe('TOOL_ANNOTATIONS', () => {
  it('contains exactly 12 tools (v1.0.0 surface)', () => {
    expect(TOOL_NAMES.length).toBe(12)
  })

  it('every tool sets all 4 annotation fields', () => {
    for (const name of TOOL_NAMES) {
      const a = TOOL_ANNOTATIONS[name]
      expect(typeof a?.readOnlyHint).toBe('boolean')
      expect(typeof a?.destructiveHint).toBe('boolean')
      expect(typeof a?.idempotentHint).toBe('boolean')
      expect(typeof a?.openWorldHint).toBe('boolean')
    }
  })

  it('openWorldHint is true for every tool (every tool wraps an external SaaS API)', () => {
    for (const name of TOOL_NAMES) {
      expect(TOOL_ANNOTATIONS[name]?.openWorldHint).toBe(true)
    }
  })

  it('readOnlyHint matches the explicit read-only set from Tradeoff 2', () => {
    // The matrix is the source of truth; any tool that does not mutate
    // server state has readOnlyHint=true. Naming convention is a heuristic
    // (e.g. domains_get_dns_status is read-only but does not end in _get).
    const expectedReadOnly = new Set([
      'emails_get',
      'emails_list_recent',
      'inbound_emails_list',
      'inbound_emails_get',
      'domains_list',
      'domains_get_dns_status',
    ])
    for (const name of TOOL_NAMES) {
      expect(TOOL_ANNOTATIONS[name]?.readOnlyHint).toBe(expectedReadOnly.has(name))
    }
  })

  it('destructiveHint is true ONLY for emails_update_scheduled + emails_cancel', () => {
    const expectedDestructive = new Set(['emails_update_scheduled', 'emails_cancel'])
    for (const name of TOOL_NAMES) {
      expect(TOOL_ANNOTATIONS[name]?.destructiveHint).toBe(expectedDestructive.has(name))
    }
  })

  it('idempotentHint is false for POST-style tools (send / send_batch / domains_create)', () => {
    const nonIdempotent = new Set(['emails_send', 'emails_send_batch', 'domains_create'])
    for (const name of TOOL_NAMES) {
      const isIdempotent = TOOL_ANNOTATIONS[name]?.idempotentHint
      if (nonIdempotent.has(name)) {
        expect(isIdempotent).toBe(false)
      } else {
        expect(isIdempotent).toBe(true)
      }
    }
  })
})
