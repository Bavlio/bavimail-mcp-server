/**
 * Bavimail MCP server registration.
 *
 * Exposes the 12 tools listed in `tools/annotations.ts` to any MCP host
 * (Claude Desktop, Cursor, Cline, etc.) over a chosen transport.
 *
 * v1.0.0: stdio only (this file). HTTP transport ships in v1.1.0 (M1b).
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js'
import { zodToJsonSchema } from 'zod-to-json-schema'

import { TOOL_ANNOTATIONS, TOOL_NAMES } from './tools/annotations.js'
import { TOOL_DESCRIPTIONS } from './tools/descriptions.js'
import { callTool } from './tools/handlers.js'
import { TOOL_INPUT_SCHEMAS, type ToolName } from './tools/schemas.js'

export const SERVER_NAME = 'bavimail-mcp-server'
export const SERVER_VERSION = '1.0.0'

export function createServer(): Server {
  const server = new Server(
    { name: SERVER_NAME, version: SERVER_VERSION },
    { capabilities: { tools: {} } },
  )

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: TOOL_NAMES.map((name) => ({
        name,
        description: TOOL_DESCRIPTIONS[name] ?? '',
        inputSchema: zodToJsonSchema(TOOL_INPUT_SCHEMAS[name as ToolName]),
        annotations: TOOL_ANNOTATIONS[name],
      })),
    }
  })

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const name = request.params.name
    if (!(name in TOOL_INPUT_SCHEMAS)) {
      // Per MCP spec: unknown tool is a JSON-RPC protocol error, not a
      // successful tool result with `isError: true`. Throwing McpError
      // surfaces -32602 InvalidParams to the host.
      throw new McpError(ErrorCode.InvalidParams, `Unknown tool: ${name}`)
    }
    const result = await callTool(name as ToolName, request.params.arguments)
    if (result.ok) {
      return {
        content: [{ type: 'text', text: JSON.stringify(result.data) }],
      }
    }
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            code: result.code,
            message: result.message,
            ...(result.retryAfter !== undefined ? { retryAfter: result.retryAfter } : {}),
          }),
        },
      ],
    }
  })

  return server
}
