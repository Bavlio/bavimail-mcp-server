/**
 * MCP tool annotations table for the 12 tools in v1.0.0.
 *
 * Per AC4a + Tradeoff 2 matrix (round-7 SDK alignment):
 *   - readOnlyHint: only true for read tools (`*_get`, `*_list*`, plus
 *     `aliases_list`, `domains_get_dns_status`).
 *   - destructiveHint: only true for `emails_cancel` (removes the
 *     scheduled-send state). Round-7 update: `emails_update_scheduled`
 *     dropped because the bavimail SDK has no `emails.update` method;
 *     scheduled-email mutation is cancel + resend in v0.3.x.
 *   - idempotentHint: per HTTP semantics. POST = false; PUT/DELETE +
 *     read = true.
 *   - openWorldHint: true for ALL tools (every tool wraps an external
 *     SaaS API call).
 *
 * `aliases_list` substituted for `emails_update_scheduled` in round 7
 * because aliases are the foundational primitive for Bavimail's
 * per-agent inbox identity model: the LLM needs to know which aliases
 * exist before it can pass an `aliasId` into `emails_send`.
 *
 * T-MCP-13 parses the server's `tools/list` response and asserts every
 * tool has these annotations set per this matrix.
 */

export interface ToolAnnotations {
  readonly readOnlyHint: boolean
  readonly destructiveHint: boolean
  readonly idempotentHint: boolean
  readonly openWorldHint: boolean
}

export const TOOL_ANNOTATIONS: Readonly<Record<string, ToolAnnotations>> = {
  emails_send: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
  },
  emails_send_batch: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
  },
  emails_cancel: {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: true,
    openWorldHint: true,
  },
  emails_get: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  emails_list_recent: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  inbound_emails_list: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  inbound_emails_get: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  aliases_list: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  domains_create: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
  },
  domains_list: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  domains_get_dns_status: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  domains_verify: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
} as const

export const TOOL_NAMES = Object.keys(TOOL_ANNOTATIONS) as readonly string[]
