/**
 * Zod input schemas for the 12 tools (round-7 SDK alignment).
 *
 * Per AC5 (learnings M6 + critical-pattern Number.isFinite):
 *   - WHITELIST character sets for any string that becomes a URL path,
 *     header, filter, or DNS name. NEVER blacklist.
 *   - LENGTH CAPS on every string field.
 *   - z.number().finite() for every numeric field (rejects NaN +
 *     Infinity).
 *
 * The schemas describe the LLM-facing contract, then map to the
 * `bavimail` SDK's actual `EmailSendParams` / `DomainCreateParams` /
 * etc. shape inside `handlers.ts`. Field names use the SDK's
 * conventions directly (aliasId, body, providerKey) so the LLM-facing
 * docs are honest about what the API expects.
 */

import { z } from 'zod'

// ----- Common atoms -----

/** RFC 5321 length cap (320) on email addresses. Permissive char set;
 *  the upstream API performs the canonical RFC 5322 validation. */
const emailAddress = z
  .string()
  .min(3, 'email address must be at least 3 characters')
  .max(320, 'email address exceeds RFC 5321 length cap (320)')
  .regex(/^[^\s<>"]+@[^\s<>"]+\.[^\s<>"]+$/, 'email address has invalid format')

const emailAddressList = z.array(emailAddress).min(1).max(50)

/** UUID v4-shaped identifier (Bavimail uses standard UUIDs throughout). */
const uuid = z
  .string()
  .min(36)
  .max(36)
  .regex(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    'must be a UUID',
  )

/** DNS-name shape for `domains_*` tools. RFC 1035 says max 253 chars,
 *  max 63 per label, ASCII letters/digits/hyphen, no leading/trailing
 *  hyphen. */
const dnsName = z
  .string()
  .min(1)
  .max(253)
  .regex(
    /^(?=.{1,253}$)(?:(?!-)[A-Za-z0-9-]{1,63}(?<!-)\.)+[A-Za-z]{2,63}$/,
    'must be a valid DNS name (RFC 1035)',
  )

/** ISO 8601 datetime with Z suffix (UTC). Used for scheduled-send.
 *  Allows up to 6 fractional digits (ECMAScript Date.toISOString uses 3,
 *  but PG/asyncpg can serialize up to 6). */
const iso8601Z = z
  .string()
  .min(20)
  .max(33)
  .regex(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/,
    'must be an ISO 8601 UTC datetime (e.g. 2026-04-29T13:00:00Z or with up to 6 fractional digits)',
  )

/** IANA timezone name shape. SDK accepts IANA names alongside ISO 8601 UTC for `sendAtTimezone`. */
const ianaTimezone = z
  .string()
  .min(3)
  .max(64)
  .regex(/^[A-Za-z0-9+\-_/]+$/, 'must be an IANA timezone name (e.g. America/New_York, UTC)')

const subject = z.string().min(1).max(998) // RFC 5322 §2.1.1

/** Email body. The SDK takes a single `body` field (not split text/html);
 *  if the body parses as HTML, the SDK extracts a text fallback
 *  automatically. Cap at 1 MiB (post-quoted-printable encoding). */
const body = z.string().min(1).max(1_048_576)

/** Reference to a previously-uploaded attachment by ID. The bavimail SDK
 *  takes attachment references (not raw bytes) on EmailSendParams; uploads
 *  go through a separate `attachments.upload` endpoint not exposed in v1.0. */
const attachmentRef = z.object({
  attachmentId: uuid,
  isInline: z.boolean().optional(),
})

const attachments = z.array(attachmentRef).max(20)

// ----- Per-tool schemas -----

export const emailsSendInput = z
  .object({
    aliasId: uuid,
    toEmail: emailAddress.optional(),
    toEmails: emailAddressList.optional(),
    ccEmails: emailAddressList.optional(),
    bccEmails: emailAddressList.optional(),
    subject,
    body,
    trackOpens: z.boolean().optional(),
    trackClicks: z.boolean().optional(),
    conversationId: uuid.optional(),
    inReplyTo: z.string().min(1).max(998).optional(),
    sendAt: iso8601Z.optional(),
    sendAtTimezone: ianaTimezone.optional(),
    attachments: attachments.optional(),
  })
  .refine(
    (v) => v.toEmail !== undefined || (v.toEmails !== undefined && v.toEmails.length > 0),
    { message: 'must provide at least one of `toEmail` or `toEmails`' },
  )

export const emailsSendBatchInput = z.object({
  emails: z.array(emailsSendInput).min(1).max(100),
})

export const emailsCancelInput = z.object({
  emailId: uuid,
})

export const emailsGetInput = z.object({
  emailId: uuid,
})

export const emailsListRecentInput = z.object({
  aliasId: uuid.optional(),
  limit: z.number().int().finite().min(1).max(100).optional(),
  offset: z.number().int().finite().min(0).max(10_000).optional(),
})

export const inboundEmailsListInput = z.object({
  aliasId: uuid.optional(),
  domainId: uuid.optional(),
  conversationId: uuid.optional(),
  limit: z.number().int().finite().min(1).max(100).optional(),
  offset: z.number().int().finite().min(0).max(10_000).optional(),
  includeWarmup: z.boolean().optional(),
})

export const inboundEmailsGetInput = z.object({
  emailId: uuid,
})

export const aliasesListInput = z.object({
  domainId: uuid.optional(),
})

export const domainsCreateInput = z.object({
  domain: dnsName,
  providerKey: z.literal('AWS'),
  inboundEnabled: z.boolean().optional(),
  extraRetainedHeaders: z
    .array(z.string().min(1).max(76).regex(/^[A-Za-z][A-Za-z0-9-]*$/, 'invalid header name'))
    .max(10)
    .optional(),
})

export const domainsListInput = z.object({}).strict()

export const domainsGetDnsStatusInput = z.object({
  domainId: uuid,
  forceRefresh: z.boolean().optional(),
})

export const domainsVerifyInput = z.object({
  domainId: uuid,
  force: z.boolean().optional(),
})

export const TOOL_INPUT_SCHEMAS = {
  emails_send: emailsSendInput,
  emails_send_batch: emailsSendBatchInput,
  emails_cancel: emailsCancelInput,
  emails_get: emailsGetInput,
  emails_list_recent: emailsListRecentInput,
  inbound_emails_list: inboundEmailsListInput,
  inbound_emails_get: inboundEmailsGetInput,
  aliases_list: aliasesListInput,
  domains_create: domainsCreateInput,
  domains_list: domainsListInput,
  domains_get_dns_status: domainsGetDnsStatusInput,
  domains_verify: domainsVerifyInput,
} as const

export type ToolName = keyof typeof TOOL_INPUT_SCHEMAS
