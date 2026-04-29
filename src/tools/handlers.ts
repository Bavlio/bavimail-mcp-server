/**
 * Tool handlers — dispatch from MCP `tools/call` to the Bavimail SDK.
 *
 * Per AC13: uses the official `bavimail` typed SDK (peer-dep), NOT raw
 * fetch.
 *
 * Per AC8: API key resolved at every call (not cached).
 *
 * Per AC11: emails_send_batch is wrapped in the per-process rate limit.
 *
 * Per AC10: inbound_emails_* responses are wrapped in the
 * `__untrusted_third_party_content` envelope.
 *
 * Per AC6 + AC7: returns are uniformly { ok: true, data } | { ok: false,
 * code, message, retryAfter? }; no error collapses to an empty array.
 *
 * Round-7 SDK alignment: method names + param shapes match
 * `bavimail@~0.3.6` exactly (Bavimail / domains / aliases / emails /
 * inboundEmails resources). The `EmailSendParams` shape uses the SDK's
 * aliasId/body/toEmails model directly.
 */

import { resolveApiBaseUrl, resolveApiKey } from '../lib/auth.js'
import { wrapUntrusted } from '../lib/envelope.js'
import { MCPUpstreamError, mapHttpStatusToCode, redactSecrets } from '../lib/errors.js'
import { recordBatchSendOrThrow } from '../lib/rate-limit.js'
import { TOOL_INPUT_SCHEMAS, type ToolName } from './schemas.js'

const TIMEOUT_MS = 30_000

export interface ToolResultOk {
  ok: true
  data: unknown
}

export interface ToolResultErr {
  ok: false
  code: string
  message: string
  retryAfter?: number
}

export type ToolResult = ToolResultOk | ToolResultErr

interface SdkErrorLike {
  status?: number
  statusCode?: number
  response?: { status?: number; headers?: Record<string, string | undefined> | Headers }
  headers?: Record<string, string | undefined> | Headers
  message?: string
}

function isHeaders(h: unknown): h is Headers {
  return typeof Headers !== 'undefined' && h instanceof Headers
}

function readHeader(
  headers: Record<string, string | undefined> | Headers | undefined,
  name: string,
): string | undefined {
  if (!headers) return undefined
  if (isHeaders(headers)) return headers.get(name) ?? undefined
  return headers[name] ?? headers[name.toLowerCase()]
}

function tryMapSdkError(err: unknown): MCPUpstreamError | null {
  if (!err || typeof err !== 'object') return null
  const e = err as SdkErrorLike
  // bavimail SDK throws APIError subclasses with `statusCode` per
  // node_modules/bavimail/dist/index.d.ts (APIError class). Fallbacks
  // handle older SDK builds + generic HTTP error shapes.
  const status = e.statusCode ?? e.status ?? e.response?.status
  if (typeof status !== 'number') return null
  const code = mapHttpStatusToCode(status)
  const headers = e.response?.headers ?? e.headers
  const retryAfterHeader = readHeader(headers, 'retry-after')
  const retryAfter = retryAfterHeader !== undefined ? Number(retryAfterHeader) : undefined
  return new MCPUpstreamError(
    code,
    e.message ?? `Bavimail API returned HTTP ${status}`,
    retryAfter !== undefined && Number.isFinite(retryAfter) && retryAfter >= 0
      ? Math.floor(retryAfter)
      : undefined,
  )
}

/**
 * Coerces any thrown value into a ToolResultErr with redaction applied.
 * The API key is removed from message text before it leaves this module.
 */
function toErrorResult(err: unknown, apiKey: string | undefined): ToolResultErr {
  if (err instanceof MCPUpstreamError) {
    const result: ToolResultErr = {
      ok: false,
      code: err.code,
      message: redactSecrets(err.message, apiKey),
    }
    if (err.retryAfter !== undefined) result.retryAfter = err.retryAfter
    return result
  }
  if (err instanceof Error) {
    if (err.name === 'AbortError' || /timeout/i.test(err.message)) {
      return { ok: false, code: 'timeout', message: 'Bavimail API call exceeded 30s timeout' }
    }
  }
  const text = err instanceof Error ? err.message : String(err)
  return {
    ok: false,
    code: 'upstream',
    message: redactSecrets(`Unexpected upstream error: ${text}`, apiKey),
  }
}

/**
 * Dynamic import of the SDK so the server starts even when the SDK has
 * not been installed (peer-dep convention). Tests can stub this module.
 */
let cachedSdkPromise: Promise<unknown> | undefined
function loadSdk(): Promise<unknown> {
  if (!cachedSdkPromise) {
    cachedSdkPromise = import('bavimail').catch((err: unknown) => {
      throw new MCPUpstreamError(
        'upstream',
        `Failed to load 'bavimail' SDK as peer dependency: ${(err as Error).message}. ` +
          `Install with: npm install bavimail@~0.3.6`,
      )
    })
  }
  return cachedSdkPromise
}

/** Subset of the bavimail SDK surface this server uses. The real SDK
 *  exports `Bavimail` as the top-level class; we type-pick only what we
 *  call so a future SDK addition doesn't widen this contract. */
interface BavimailSdkLike {
  emails: {
    send: (params: unknown) => Promise<unknown>
    batchSend: (emails: unknown[]) => Promise<unknown>
    cancel: (emailId: string) => Promise<unknown>
    get: (emailId: string) => Promise<unknown>
    list: (options?: unknown) => Promise<unknown>
  }
  inboundEmails: {
    list: (options?: unknown) => Promise<unknown>
    get: (emailId: string) => Promise<unknown>
  }
  aliases: {
    list: (options?: unknown) => Promise<unknown>
  }
  domains: {
    create: (params: unknown) => Promise<unknown>
    list: () => Promise<unknown>
    getDnsStatus: (domainId: string, options?: { forceRefresh?: boolean }) => Promise<unknown>
    verify: (domainId: string, options?: { force?: boolean }) => Promise<unknown>
  }
}

interface BavimailCtor {
  new (opts: { apiKey: string; baseUrl?: string }): BavimailSdkLike
}

async function client(): Promise<BavimailSdkLike> {
  const sdkModule = (await loadSdk()) as { Bavimail?: BavimailCtor; default?: BavimailCtor }
  const Ctor = sdkModule.Bavimail ?? sdkModule.default
  if (typeof Ctor !== 'function') {
    throw new MCPUpstreamError(
      'upstream',
      "'bavimail' SDK does not export a `Bavimail` constructor",
    )
  }
  const apiKey = resolveApiKey()
  const baseUrl = resolveApiBaseUrl()
  return new Ctor({ apiKey, baseUrl })
}

/**
 * NOTE on timeouts: the bavimail SDK does not currently accept an
 * AbortSignal on its request methods, so this wrapper only races the
 * promise resolution. The underlying fetch may still complete server-side
 * after the local timeout fires. Future SDK release should add an
 * AbortSignal pass-through; tracked as v1.x follow-up.
 */
function withTimeout<T>(p: Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new MCPUpstreamError('timeout', `Bavimail API call exceeded ${TIMEOUT_MS / 1000}s`))
    }, TIMEOUT_MS)
    p.then(
      (v) => {
        clearTimeout(timer)
        resolve(v)
      },
      (e) => {
        clearTimeout(timer)
        const mapped = tryMapSdkError(e)
        reject(mapped ?? e)
      },
    )
  })
}

/**
 * Normalize an SDK list response into the shape the LLM consumes.
 * Per AC6: distinguish empty (count:0, items:[]) from error.
 */
function normalizeList(raw: unknown): { count: number; items: unknown[] } {
  if (Array.isArray(raw)) return { count: raw.length, items: raw }
  return { count: 0, items: [] }
}

export async function callTool(name: ToolName, rawInput: unknown): Promise<ToolResult> {
  let apiKey: string | undefined
  try {
    apiKey = resolveApiKey()
  } catch {
    return {
      ok: false,
      code: 'auth_invalid',
      message: 'BAVIMAIL_API_KEY is not set; the server cannot authenticate to the Bavimail API.',
    }
  }
  const schema = TOOL_INPUT_SCHEMAS[name]
  if (!schema) {
    return { ok: false, code: 'validation', message: `Unknown tool: ${name}` }
  }
  // MCP host MAY send `arguments` as undefined for zero-arg / all-optional
  // tools; coerce to {} so Zod's safeParse handles the empty-object case.
  const parsed = schema.safeParse(rawInput ?? {})
  if (!parsed.success) {
    return {
      ok: false,
      code: 'validation',
      message: parsed.error.issues
        .map((iss) => `${iss.path.join('.') || '<root>'}: ${iss.message}`)
        .join('; '),
    }
  }
  try {
    const data = await withTimeout(invoke(name, parsed.data))
    return { ok: true, data }
  } catch (err) {
    return toErrorResult(err, apiKey)
  }
}

async function invoke(name: ToolName, input: unknown): Promise<unknown> {
  const sdk = await client()
  switch (name) {
    case 'emails_send':
      return await sdk.emails.send(input)
    case 'emails_send_batch': {
      recordBatchSendOrThrow()
      const i = input as { emails: unknown[] }
      return await sdk.emails.batchSend(i.emails)
    }
    case 'emails_cancel': {
      const i = input as { emailId: string }
      return await sdk.emails.cancel(i.emailId)
    }
    case 'emails_get': {
      const i = input as { emailId: string }
      return await sdk.emails.get(i.emailId)
    }
    case 'emails_list_recent':
      return normalizeList(await sdk.emails.list(input))
    case 'inbound_emails_list': {
      const list = normalizeList(await sdk.inboundEmails.list(input))
      return wrapUntrusted(list)
    }
    case 'inbound_emails_get': {
      const i = input as { emailId: string }
      return wrapUntrusted(await sdk.inboundEmails.get(i.emailId))
    }
    case 'aliases_list':
      return normalizeList(await sdk.aliases.list(input))
    case 'domains_create':
      return await sdk.domains.create(input)
    case 'domains_list':
      return normalizeList(await sdk.domains.list())
    case 'domains_get_dns_status': {
      const i = input as { domainId: string; forceRefresh?: boolean }
      const opts = i.forceRefresh !== undefined ? { forceRefresh: i.forceRefresh } : undefined
      return await sdk.domains.getDnsStatus(i.domainId, opts)
    }
    case 'domains_verify': {
      const i = input as { domainId: string; force?: boolean }
      const opts = i.force !== undefined ? { force: i.force } : undefined
      return await sdk.domains.verify(i.domainId, opts)
    }
  }
}
