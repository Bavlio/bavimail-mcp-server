/**
 * T-MCP-1: Zod schema validation for every tool's input shape.
 *
 * Per AC20 + AC5: every string has a length cap, every numeric uses
 * z.number().finite() (so NaN + Infinity are rejected), email/UUID/DNS-
 * name fields use whitelist regexes, and required fields fail validation
 * when missing.
 *
 * Round-7 SDK alignment: schemas use SDK field names (aliasId, body,
 * toEmail, providerKey).
 */

import { describe, expect, it } from 'vitest'

import { TOOL_INPUT_SCHEMAS } from '../src/tools/schemas.js'

const SAMPLE_UUID = '550e8400-e29b-41d4-a716-446655440000'

describe('emails_send', () => {
  const schema = TOOL_INPUT_SCHEMAS.emails_send

  it('accepts a minimal valid input with toEmail', () => {
    const r = schema.safeParse({
      aliasId: SAMPLE_UUID,
      toEmail: 'user@example.com',
      subject: 'Hi',
      body: 'Hello',
    })
    expect(r.success).toBe(true)
  })

  it('accepts a minimal valid input with toEmails (list)', () => {
    const r = schema.safeParse({
      aliasId: SAMPLE_UUID,
      toEmails: ['a@example.com', 'b@example.com'],
      subject: 'Hi',
      body: 'Hello',
    })
    expect(r.success).toBe(true)
  })

  it('rejects when neither toEmail nor toEmails is provided', () => {
    const r = schema.safeParse({
      aliasId: SAMPLE_UUID,
      subject: 'Hi',
      body: 'Hello',
    })
    expect(r.success).toBe(false)
  })

  it('rejects when aliasId is not a UUID', () => {
    const r = schema.safeParse({
      aliasId: 'not-a-uuid',
      toEmail: 'u@example.com',
      subject: 'Hi',
      body: 'Hello',
    })
    expect(r.success).toBe(false)
  })

  it('rejects malformed `toEmail` addresses', () => {
    const r = schema.safeParse({
      aliasId: SAMPLE_UUID,
      toEmail: 'not-an-email',
      subject: 'Hi',
      body: 'Hello',
    })
    expect(r.success).toBe(false)
  })

  it('caps `toEmails` list length at 50 recipients', () => {
    const r = schema.safeParse({
      aliasId: SAMPLE_UUID,
      toEmails: Array.from({ length: 51 }, (_, i) => `u${i}@example.com`),
      subject: 'Hi',
      body: 'Hello',
    })
    expect(r.success).toBe(false)
  })

  it('rejects subject longer than RFC 5322 998-char cap', () => {
    const r = schema.safeParse({
      aliasId: SAMPLE_UUID,
      toEmail: 'u@example.com',
      subject: 'x'.repeat(999),
      body: 'Hello',
    })
    expect(r.success).toBe(false)
  })

  it('accepts ISO 8601 UTC sendAt (no fractional)', () => {
    const r = schema.safeParse({
      aliasId: SAMPLE_UUID,
      toEmail: 'u@example.com',
      subject: 'Hi',
      body: 'Hello',
      sendAt: '2026-04-29T13:00:00Z',
    })
    expect(r.success).toBe(true)
  })

  it('accepts ISO 8601 UTC sendAt with millisecond precision', () => {
    const r = schema.safeParse({
      aliasId: SAMPLE_UUID,
      toEmail: 'u@example.com',
      subject: 'Hi',
      body: 'Hello',
      sendAt: '2026-04-29T13:00:00.123Z',
    })
    expect(r.success).toBe(true)
  })

  it('rejects sendAt without ISO 8601 Z suffix', () => {
    const r = schema.safeParse({
      aliasId: SAMPLE_UUID,
      toEmail: 'u@example.com',
      subject: 'Hi',
      body: 'Hello',
      sendAt: '2026-04-29T13:00:00+00:00',
    })
    expect(r.success).toBe(false)
  })

  it('accepts IANA timezone for sendAtTimezone', () => {
    const r = schema.safeParse({
      aliasId: SAMPLE_UUID,
      toEmail: 'u@example.com',
      subject: 'Hi',
      body: 'Hello',
      sendAt: '2026-04-29T13:00:00Z',
      sendAtTimezone: 'America/New_York',
    })
    expect(r.success).toBe(true)
  })
})

describe('emails_send_batch', () => {
  it('rejects empty batch', () => {
    const r = TOOL_INPUT_SCHEMAS.emails_send_batch.safeParse({ emails: [] })
    expect(r.success).toBe(false)
  })

  it('caps batch at 100 emails', () => {
    const sample = {
      aliasId: SAMPLE_UUID,
      toEmail: 'u@example.com',
      subject: 'Hi',
      body: 'Hello',
    }
    const r = TOOL_INPUT_SCHEMAS.emails_send_batch.safeParse({
      emails: Array.from({ length: 101 }, () => sample),
    })
    expect(r.success).toBe(false)
  })

  it('accepts a single-email batch', () => {
    const r = TOOL_INPUT_SCHEMAS.emails_send_batch.safeParse({
      emails: [
        {
          aliasId: SAMPLE_UUID,
          toEmail: 'u@example.com',
          subject: 'Hi',
          body: 'Hello',
        },
      ],
    })
    expect(r.success).toBe(true)
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

  it('rejects negative offset', () => {
    const r = schema.safeParse({ offset: -1 })
    expect(r.success).toBe(false)
  })

  it('accepts an empty input (all fields optional)', () => {
    const r = schema.safeParse({})
    expect(r.success).toBe(true)
  })

  it('accepts an aliasId filter', () => {
    const r = schema.safeParse({ aliasId: SAMPLE_UUID, limit: 25 })
    expect(r.success).toBe(true)
  })
})

describe('aliases_list', () => {
  const schema = TOOL_INPUT_SCHEMAS.aliases_list

  it('accepts an empty input', () => {
    expect(schema.safeParse({}).success).toBe(true)
  })

  it('accepts a domainId filter', () => {
    expect(schema.safeParse({ domainId: SAMPLE_UUID }).success).toBe(true)
  })

  it('rejects malformed domainId', () => {
    expect(schema.safeParse({ domainId: 'bad' }).success).toBe(false)
  })
})

describe('domains_create', () => {
  const schema = TOOL_INPUT_SCHEMAS.domains_create

  it('accepts a valid DNS name + AWS provider', () => {
    const r = schema.safeParse({ domain: 'mail.example.com', providerKey: 'AWS' })
    expect(r.success).toBe(true)
  })

  it('rejects names with leading hyphen labels', () => {
    const r = schema.safeParse({ domain: '-bad.example.com', providerKey: 'AWS' })
    expect(r.success).toBe(false)
  })

  it('rejects names with NUL bytes', () => {
    const r = schema.safeParse({ domain: 'x\x00y.example.com', providerKey: 'AWS' })
    expect(r.success).toBe(false)
  })

  it('rejects unknown providerKey values', () => {
    const r = schema.safeParse({ domain: 'mail.example.com', providerKey: 'GCP' })
    expect(r.success).toBe(false)
  })

  it('accepts inboundEnabled flag', () => {
    const r = schema.safeParse({
      domain: 'mail.example.com',
      providerKey: 'AWS',
      inboundEnabled: true,
    })
    expect(r.success).toBe(true)
  })
})

describe('emails_get / domains_get_dns_status (UUID schemas)', () => {
  it('rejects non-UUID identifiers', () => {
    expect(TOOL_INPUT_SCHEMAS.emails_get.safeParse({ emailId: 'not-a-uuid' }).success).toBe(false)
    expect(TOOL_INPUT_SCHEMAS.domains_get_dns_status.safeParse({ domainId: '123' }).success).toBe(
      false,
    )
  })

  it('accepts canonical UUID v4', () => {
    expect(TOOL_INPUT_SCHEMAS.emails_get.safeParse({ emailId: SAMPLE_UUID }).success).toBe(true)
    expect(
      TOOL_INPUT_SCHEMAS.domains_get_dns_status.safeParse({ domainId: SAMPLE_UUID }).success,
    ).toBe(true)
  })

  it('domains_get_dns_status accepts forceRefresh', () => {
    expect(
      TOOL_INPUT_SCHEMAS.domains_get_dns_status.safeParse({
        domainId: SAMPLE_UUID,
        forceRefresh: true,
      }).success,
    ).toBe(true)
  })
})

describe('domains_list / domains_verify', () => {
  it('domains_list accepts empty input only (strict)', () => {
    expect(TOOL_INPUT_SCHEMAS.domains_list.safeParse({}).success).toBe(true)
    expect(TOOL_INPUT_SCHEMAS.domains_list.safeParse({ extra: true }).success).toBe(false)
  })

  it('domains_verify requires UUID + optional force flag', () => {
    expect(TOOL_INPUT_SCHEMAS.domains_verify.safeParse({ domainId: SAMPLE_UUID }).success).toBe(
      true,
    )
    expect(
      TOOL_INPUT_SCHEMAS.domains_verify.safeParse({ domainId: SAMPLE_UUID, force: true }).success,
    ).toBe(true)
    expect(TOOL_INPUT_SCHEMAS.domains_verify.safeParse({}).success).toBe(false)
  })
})
