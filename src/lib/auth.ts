/**
 * API key resolution for the Bavimail MCP server.
 *
 * Per AC8: read at every tool call, never cached at startup. This supports
 * key rotation without restarting the server.
 *
 * Per AC9: missing env at startup → exit 1 with structured error written to
 * stdout. The startup check is a fail-fast guardrail; per-call read still
 * applies for rotation support.
 */

const ENV_VAR = 'BAVIMAIL_API_KEY'

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

export function resolveApiKey(env: NodeJS.ProcessEnv = process.env): string {
  const key = env[ENV_VAR]
  if (!key || key.length === 0) {
    throw new MissingApiKeyError()
  }
  return key
}

export function resolveApiBaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  return env.BAVIMAIL_API_BASE_URL ?? 'https://api.bavimail.com'
}
