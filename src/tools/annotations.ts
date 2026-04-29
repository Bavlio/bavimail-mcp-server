/**
 * MCP tool annotations table for the 12 tools in v1.0.0.
 *
 * Per AC4a + Tradeoff 2 matrix in the plan:
 *   - readOnlyHint: only true for `*_get` and `*_list*`
 *   - destructiveHint: only true for `emails_update_scheduled` (overwrite)
 *     and `emails_cancel` (remove). Additive create/send tools are NOT
 *     destructive even though they mutate state.
 *   - idempotentHint: per HTTP semantics. POST = false; PUT/DELETE = true;
 *     GET = true.
 *   - openWorldHint: true for ALL tools (every tool wraps an external SaaS
 *     API call).
 *
 * T-MCP-13 parses the server's `tools/list` response and asserts every tool
 * has these annotations set per this matrix.
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
  emails_update_scheduled: {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: true,
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
