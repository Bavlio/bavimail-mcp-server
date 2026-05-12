/**
 * API key + base URL resolution for the Bavimail MCP server.
 *
 * Per AC8: read at every tool call, never cached at startup. This
 * supports key rotation without restarting the server.
 *
 * Per AC9: missing env at startup → exit 1 with structured error
 * written to stdout. The startup check is a fail-fast guardrail;
 * per-call read still applies for rotation support.
 *
 * Round-7 hardening (codex correctness pass on PR #1):
 *   - Reject all-whitespace keys (was: only checked .length > 0).
 *   - Reject non-HTTPS base URLs (was: any URL accepted; risk of
 *     plaintext API key transit).
 */

const ENV_VAR = 'BAVIMAIL_API_KEY'
const BASE_URL_VAR = 'BAVIMAIL_API_BASE_URL'
const DEFAULT_BASE_URL = 'https://api.bavimail.com'

export class MissingApiKeyError extends Error {
  override readonly name = 'MissingApiKeyError'
  constructor() {
    super(
      `${ENV_VAR} environment variable is not set. ` +
        `The Bavimail MCP server requires an API key to call the Bavimail REST API. ` +
        `Get a key at https://bavimail.com/dashboard/api-keys and add it to your MCP host's configuration ` +
        `(e.g. Claude Desktop config file). See README for details.`,
    )
  }
}

export class InvalidApiBaseUrlError extends Error {
  override readonly name = 'InvalidApiBaseUrlError'
  constructor(value: string) {
    super(
      `${BASE_URL_VAR}=${JSON.stringify(value)} must use HTTPS. ` +
        `The MCP server refuses to send the API key over plain HTTP. ` +
        `If you need a localhost-only override for development, use https:// with a self-signed cert ` +
        `or unset ${BASE_URL_VAR} to use the default ${DEFAULT_BASE_URL}.`,
    )
  }
}

export function resolveApiKey(env: NodeJS.ProcessEnv = process.env): string {
  const raw = env[ENV_VAR]
  if (!raw) throw new MissingApiKeyError()
  const trimmed = raw.trim()
  if (trimmed.length === 0) throw new MissingApiKeyError()
  return trimmed
}

export function resolveApiBaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  const raw = env[BASE_URL_VAR]
  if (!raw) return DEFAULT_BASE_URL
  const trimmed = raw.trim()
  if (trimmed.length === 0) return DEFAULT_BASE_URL
  if (!trimmed.toLowerCase().startsWith('https://')) {
    throw new InvalidApiBaseUrlError(trimmed)
  }
  return trimmed
}
