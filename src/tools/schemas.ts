/**
 * Zod input schemas for the 12 tools.
 *
 * Per AC5 (learnings M6 + critical-pattern Number.isFinite):
 *   - WHITELIST character sets for any string that becomes a URL path,
 *     header, filter, or DNS name. NEVER blacklist.
 *   - LENGTH CAPS on every string field.
 *   - z.number().finite() for every numeric field (rejects NaN + Infinity).
 *
 * The schemas describe the LLM-facing contract; transport coercion (e.g.
 * trimming whitespace, lowercasing) happens here so the SDK call is fed
 * canonical values.
 */

import { z } from 'zod'

// ----- Common atoms -----

/** RFC 5321 length cap (320) on email addresses. Permissive char set; the
 *  upstream API performs the canonical RFC 5322 validation. */
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

/** DNS-name shape for `domains_*` tools. RFC 1035 says max 253 chars, max
 *  63 per label, ASCII letters/digits/hyphen, no leading/trailing hyphen. */
const dnsName = z
  .string()
  .min(1)
  .max(253)
  .regex(
    /^(?=.{1,253}$)(?:(?!-)[A-Za-z0-9-]{1,63}(?<!-)\.)+[A-Za-z]{2,63}$/,
    'must be a valid DNS name (RFC 1035)',
  )

/** ISO 8601 datetime with Z suffix (UTC). Used for scheduled-send. */
const iso8601Z = z
  .string()
  .min(20)
  .max(30)
  .regex(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/,
    'must be an ISO 8601 UTC datetime (e.g. 2026-04-29T13:00:00Z)',
  )

/** Bavimail tag shape: lowercase alphanumeric + dash, 1-32 chars. */
const tag = z
  .string()
  .min(1)
  .max(32)
  .regex(/^[a-z0-9-]+$/, 'tag must match [a-z0-9-]')

const subject = z.string().min(1).max(998) // RFC 5322 §2.1.1
const bodyText = z.string().min(1).max(1_048_576) // 1 MiB cap
const bodyHtml = z.string().min(1).max(1_048_576)

const attachments = z
  .array(
    z.object({
      filename: z
        .string()
        .min(1)
        .max(255)
        .regex(/^[^/\x00]+$/, 'filename must not contain "/" or NUL'),
      content: z.string().min(1).max(10_485_760), // 10 MiB base64
      contentType: z
        .string()
        .min(1)
        .max(127)
        .regex(/^[a-zA-Z0-9!#$&\-^_+.]+\/[a-zA-Z0-9!#$&\-^_+.]+$/, 'must be RFC 6838 media type')
        .optional(),
    }),
  )
  .max(20)

const headers = z
  .record(
    z.string().min(1).max(76).regex(/^[A-Za-z][A-Za-z0-9-]*$/, 'invalid header name'),
    z.string().min(1).max(998),
  )
  .refine((obj) => Object.keys(obj).length <= 25, 'max 25 custom headers')

// ----- Per-tool schemas -----

export const emailsSendInput = z.object({
  from: emailAddress,
  to: emailAddressList,
  cc: emailAddressList.optional(),
  bcc: emailAddressList.optional(),
  reply_to: emailAddress.optional(),
  subject,
  text: bodyText.optional(),
  html: bodyHtml.optional(),
  attachments: attachments.optional(),
  headers: headers.optional(),
  tags: z.array(tag).max(10).optional(),
  scheduled_at: iso8601Z.optional(),
}).refine(
  (v) => v.text !== undefined || v.html !== undefined,
  { message: 'must provide at least one of `text` or `html`' },
)

export const emailsSendBatchInput = z.object({
  emails: z.array(emailsSendInput).min(1).max(100),
})

export const emailsUpdateScheduledInput = z.object({
  email_id: uuid,
  scheduled_at: iso8601Z,
})

export const emailsCancelInput = z.object({
  email_id: uuid,
})

export const emailsGetInput = z.object({
  email_id: uuid,
})

export const emailsListRecentInput = z.object({
  limit: z.number().int().finite().min(1).max(100).optional(),
  status: z.enum(['queued', 'sent', 'delivered', 'bounced', 'complained', 'failed']).optional(),
  before: iso8601Z.optional(),
})

export const inboundEmailsListInput = z.object({
  limit: z.number().int().finite().min(1).max(100).optional(),
  inbox_address: emailAddress.optional(),
  before: iso8601Z.optional(),
})

export const inboundEmailsGetInput = z.object({
  inbound_email_id: uuid,
})

export const domainsCreateInput = z.object({
  name: dnsName,
  region: z.enum(['us-east-1', 'us-west-2', 'eu-west-1']).optional(),
})

export const domainsListInput = z.object({
  limit: z.number().int().finite().min(1).max(100).optional(),
})

export const domainsGetDnsStatusInput = z.object({
  domain_id: uuid,
})

export const domainsVerifyInput = z.object({
  domain_id: uuid,
})

export const TOOL_INPUT_SCHEMAS = {
  emails_send: emailsSendInput,
  emails_send_batch: emailsSendBatchInput,
  emails_update_scheduled: emailsUpdateScheduledInput,
  emails_cancel: emailsCancelInput,
  emails_get: emailsGetInput,
  emails_list_recent: emailsListRecentInput,
  inbound_emails_list: inboundEmailsListInput,
  inbound_emails_get: inboundEmailsGetInput,
  domains_create: domainsCreateInput,
  domains_list: domainsListInput,
  domains_get_dns_status: domainsGetDnsStatusInput,
  domains_verify: domainsVerifyInput,
} as const

export type ToolName = keyof typeof TOOL_INPUT_SCHEMAS
