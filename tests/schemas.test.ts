/**
 * T-MCP-1: Zod schema validation for every tool's input shape.
 *
 * Per AC20 + AC5: every string has a length cap, every numeric uses
 * z.number().finite() (so NaN + Infinity are rejected), email/UUID/DNS-name
 * fields use whitelist regexes, and required fields fail validation when
 * missing.
 */

import { describe, expect, it } from 'vitest'

import { TOOL_INPUT_SCHEMAS } from '../src/tools/schemas.js'

describe('emails_send', () => {
  const schema = TOOL_INPUT_SCHEMAS.emails_send

  it('accepts a minimal valid input', () => {
    const r = schema.safeParse({
      from: 'noreply@example.com',
      to: ['user@example.com'],
      subject: 'Hi',
      text: 'Hello',
    })
    expect(r.success).toBe(true)
  })

  it('rejects when neither text nor html is provided', () => {
    const r = schema.safeParse({
      from: 'noreply@example.com',
      to: ['user@example.com'],
      subject: 'Hi',
    })
    expect(r.success).toBe(false)
  })

  it('rejects malformed `to` addresses', () => {
    const r = schema.safeParse({
      from: 'noreply@example.com',
      to: ['not-an-email'],
      subject: 'Hi',
      text: 'Hello',
    })
    expect(r.success).toBe(false)
  })

  it('caps `to` list length at 50 recipients', () => {
    const r = schema.safeParse({
      from: 'noreply@example.com',
      to: Array.from({ length: 51 }, (_, i) => `u${i}@example.com`),
      subject: 'Hi',
      text: 'Hello',
    })
    expect(r.success).toBe(false)
  })

  it('rejects subject longer than RFC 5322 998-char cap', () => {
    const r = schema.safeParse({
      from: 'noreply@example.com',
      to: ['u@example.com'],
      subject: 'x'.repeat(999),
      text: 'Hello',
    })
    expect(r.success).toBe(false)
  })

  it('rejects scheduled_at without ISO 8601 Z suffix', () => {
    const r = schema.safeParse({
      from: 'noreply@example.com',
      to: ['u@example.com'],
      subject: 'Hi',
      text: 'Hello',
      scheduled_at: '2026-04-29T13:00:00+00:00',
    })
    expect(r.success).toBe(false)
  })
})

describe('emails_send_batch', () => {
  it('rejects empty batch', () => {
    const r = TOOL_INPUT_SCHEMAS.emails_send_batch.safeParse({ emails: [] })
    expect(r.success).toBe(false)
  })

  it('caps batch at 100 emails', () => {
    const sample = {
      from: 'noreply@example.com',
      to: ['u@example.com'],
      subject: 'Hi',
      text: 'Hello',
    }
    const r = TOOL_INPUT_SCHEMAS.emails_send_batch.safeParse({
      emails: Array.from({ length: 101 }, () => sample),
    })
    expect(r.success).toBe(false)
  })
})

describe('emails_list_recent', () => {
  const schema = TOOL_INPUT_SCHEMAS.emails_list_recent

  it('rejects NaN limit (Number.isFinite guard)', () => {
    const r = schema.safeParse({ limit: Number.NaN })
    expect(r.success).toBe(false)
  })

  it('rejects Infinity limit', () => {
    const r = schema.safeParse({ limit: Number.POSITIVE_INFINITY })
    expect(r.success).toBe(false)
  })

  it('rejects unknown status values', () => {
    const r = schema.safeParse({ status: 'unknown' })
    expect(r.success).toBe(false)
  })

  it('accepts an empty input (all fields optional)', () => {
    const r = schema.safeParse({})
    expect(r.success).toBe(true)
  })
})

describe('domains_create', () => {
  const schema = TOOL_INPUT_SCHEMAS.domains_create

  it('accepts a valid DNS name', () => {
    const r = schema.safeParse({ name: 'mail.example.com' })
    expect(r.success).toBe(true)
  })

  it('rejects names with leading hyphen labels', () => {
    const r = schema.safeParse({ name: '-bad.example.com' })
    expect(r.success).toBe(false)
  })

  it('rejects names with NUL bytes', () => {
    const r = schema.safeParse({ name: 'x\x00y.example.com' })
    expect(r.success).toBe(false)
  })

  it('rejects unknown regions', () => {
    const r = schema.safeParse({ name: 'mail.example.com', region: 'mars' })
    expect(r.success).toBe(false)
  })
})

describe('emails_get / domains_get_dns_status (UUID schemas)', () => {
  it('rejects non-UUID identifiers', () => {
    const r1 = TOOL_INPUT_SCHEMAS.emails_get.safeParse({ email_id: 'not-a-uuid' })
    expect(r1.success).toBe(false)
    const r2 = TOOL_INPUT_SCHEMAS.domains_get_dns_status.safeParse({ domain_id: '123' })
    expect(r2.success).toBe(false)
  })

  it('accepts canonical UUID v4', () => {
    const r = TOOL_INPUT_SCHEMAS.emails_get.safeParse({
      email_id: '550e8400-e29b-41d4-a716-446655440000',
    })
    expect(r.success).toBe(true)
  })
})
