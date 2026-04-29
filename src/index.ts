#!/usr/bin/env node
/**
 * Bavimail MCP server — bin entrypoint.
 *
 * v1.0.0 ships stdio transport only. Per AC9: missing BAVIMAIL_API_KEY at
 * startup writes a structured MCP error to stdout (so the host surfaces
 * it to the user) and exits 1.
 */

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'

import {
  InvalidApiBaseUrlError,
  MissingApiKeyError,
  resolveApiBaseUrl,
  resolveApiKey,
} from './lib/auth.js'
import { createServer, SERVER_VERSION, SERVER_NAME } from './server.js'
import { TOOL_NAMES } from './tools/annotations.js'

const HELP_TEXT = `${SERVER_NAME} v${SERVER_VERSION}

A Model Context Protocol (MCP) server for the Bavimail email API.

Usage:
  ${SERVER_NAME}                    Start MCP server on stdio (default).
  ${SERVER_NAME} --help             Show this message + the tool list.
  ${SERVER_NAME} --version          Print version and exit.

Required environment variables:
  BAVIMAIL_API_KEY                  Your Bavimail API key. Get one at
                                    https://bavimail.com/dashboard/api-keys.

Optional environment variables:
  BAVIMAIL_API_BASE_URL             Override the API base URL. Defaults to
                                    https://api.bavimail.com.

Available tools (12):
${TOOL_NAMES.map((n) => `  - ${n}`).join('\n')}

Documentation:
  https://github.com/Bavlio/bavimail-mcp-server#readme

For end-to-end setup with Claude Desktop, Cursor, or Cline, see the README.
`

/**
 * Write a JSON-RPC structured error to stdout and resolve only after the
 * write callback fires. Per Node docs, `process.exit()` immediately
 * after `process.stdout.write` on a piped stdout can truncate the
 * payload before delivery; awaiting the write callback prevents that.
 */
function writeStructuredErrorAndExit(message: string): Promise<never> {
  return new Promise((resolve, reject) => {
    const payload = {
      jsonrpc: '2.0',
      error: { code: -32099, message },
    }
    process.stdout.write(JSON.stringify(payload) + '\n', (err) => {
      if (err) {
        reject(err)
        return
      }
      // Set exitCode + return so the event loop drains naturally; do
      // not call process.exit() because that bypasses pending writes.
      process.exitCode = 1
      // Resolve after a microtask so any in-flight stderr writes also
      // drain. The `as never` is a Promise narrowing convenience —
      // callers always exit.
      queueMicrotask(() => resolve(undefined as never))
    })
  })
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)

  if (args.includes('--help') || args.includes('-h')) {
    process.stdout.write(HELP_TEXT)
    process.exit(0)
  }
  if (args.includes('--version') || args.includes('-v')) {
    process.stdout.write(`${SERVER_VERSION}\n`)
    process.exit(0)
  }

  // Per AC9 (round-7 expanded): fail-fast at startup for any
  // configuration error that would make the first tool call fail
  // confusingly. Currently catches MissingApiKeyError (no key) +
  // InvalidApiBaseUrlError (non-HTTPS BAVIMAIL_API_BASE_URL).
  try {
    resolveApiKey()
    resolveApiBaseUrl()
  } catch (err) {
    if (err instanceof MissingApiKeyError || err instanceof InvalidApiBaseUrlError) {
      await writeStructuredErrorAndExit(err.message)
      return
    }
    throw err
  }

  const server = createServer()
  const transport = new StdioServerTransport()
  await server.connect(transport)
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err)
  process.stderr.write(`bavimail-mcp-server: fatal: ${message}\n`)
  process.exit(1)
})
