/**
 * Structured error codes returned to MCP hosts.
 *
 * Per AC7: distinct codes so the LLM (and the human who reads the
 * conversation log) can reason about WHY a call failed. Codes map from
 * upstream HTTP statuses + local timeouts + Zod validation failures.
 *
 * Per AC6: tools never collapse an error into an empty array. The shape
 * of a tool result is always one of:
 *   - { ok: true, data: ... }
 *   - { ok: false, code: '...', message: '...', retryAfter?: number }
 *
 * Per AC22 / T-MCP-3: error messages MUST NEVER contain the API key value
 * or a Bearer-prefixed substring. The redaction helpers below enforce this
 * on every value that reaches the MCP transport.
 */

export const ERROR_CODES = [
  'auth_invalid', // upstream 401
  'auth_forbidden', // upstream 403
  'rate_limit', // upstream 429
  'client_rate_limit', // local emails_send_batch cap
  'timeout', // local 30s AbortSignal fired
  'validation', // Zod parse failed
  'upstream', // any other upstream 5xx / unexpected
  'ignored_header', // HTTP transport received unsupported Authorization header
] as const

export type ErrorCode = (typeof ERROR_CODES)[number]

export class MCPUpstreamError extends Error {
  override readonly name = 'MCPUpstreamError'
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly retryAfter?: number,
  ) {
    super(message)
  }
}

export function mapHttpStatusToCode(status: number): ErrorCode {
  if (status === 401) return 'auth_invalid'
  if (status === 403) return 'auth_forbidden'
  if (status === 429) return 'rate_limit'
  return 'upstream'
}

export function parseRetryAfterSeconds(headerValue: string | null | undefined): number | undefined {
  if (!headerValue) return undefined
  const asNumber = Number(headerValue)
  if (Number.isFinite(asNumber) && asNumber >= 0) return Math.floor(asNumber)
  // RFC 7231 also allows an HTTP-date format; not handled here. Defer to undefined.
  return undefined
}

/**
 * Redact API key + Bearer-prefixed substrings from any string before
 * it's surfaced to the MCP host. T-MCP-3 asserts no such substring
 * appears in any tool response.
 *
 * Coverage:
 * - Exact apiKey occurrences (literal AND URL-encoded).
 * - `Bearer <token>` (case-insensitive; token char set includes
 *   alphanumerics + `~`, `.`, `_`, `-`, `+`, `/`, `=`).
 * - `Authorization: <scheme> <token>` (case-insensitive scheme,
 *   any non-whitespace token).
 */
export function redactSecrets(text: string, apiKey: string | undefined): string {
  let out = text
  if (apiKey && apiKey.length > 0) {
    out = out.split(apiKey).join('[REDACTED_API_KEY]')
    const encoded = encodeURIComponent(apiKey)
    if (encoded !== apiKey) out = out.split(encoded).join('[REDACTED_API_KEY]')
  }
  // Case-insensitive Bearer-prefix redaction; token char set covers
  // base64url + `~` + `.` (JWT segments use these) + `=` padding.
  out = out.replace(/(\bbearer\s+)([A-Za-z0-9._~\-+/]+=*)/gi, '$1[REDACTED]')
  // Generic Authorization header redaction (any scheme).
  out = out.replace(/(\bauthorization\s*:\s*\S+\s+)(\S+)/gi, '$1[REDACTED]')
  return out
}
