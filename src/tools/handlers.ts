/**
 * Tool handlers — dispatch from MCP `tools/call` to the Bavimail SDK.
 *
 * Per AC13: uses the official `bavimail` typed SDK (peer-dep), NOT raw fetch.
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
 * The SDK's exact send/receive method shape may evolve between v0.3.x
 * patches; this module wraps the surface so a SDK bump only requires
 * updating this single file.
 */

import { resolveApiBaseUrl, resolveApiKey } from '../lib/auth.js'
import { wrapUntrusted } from '../lib/envelope.js'
import {
  MCPUpstreamError,
  mapHttpStatusToCode,
  parseRetryAfterSeconds,
  redactSecrets,
} from '../lib/errors.js'
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
  const status = e.status ?? e.statusCode ?? e.response?.status
  if (typeof status !== 'number') return null
  const code = mapHttpStatusToCode(status)
  const headers = e.response?.headers ?? e.headers
  const retryAfter = parseRetryAfterSeconds(readHeader(headers, 'retry-after'))
  return new MCPUpstreamError(code, e.message ?? `Bavimail API returned HTTP ${status}`, retryAfter)
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

interface BavimailSdkLike {
  // The 0.3.x SDK exposes a class constructor named `Bavimail`. The exact
  // method names below are best-effort and mapped to the REST endpoints in
  // a forward-compatible way; if the SDK shape diverges, only this layer
  // needs to update.
  emails: {
    send: (params: unknown) => Promise<unknown>
    sendBatch?: (params: unknown) => Promise<unknown>
    update?: (id: string, params: unknown) => Promise<unknown>
    cancel?: (id: string) => Promise<unknown>
    get: (id: string) => Promise<unknown>
    list?: (params?: unknown) => Promise<unknown>
  }
  inboundEmails?: {
    list?: (params?: unknown) => Promise<unknown>
    get?: (id: string) => Promise<unknown>
  }
  domains: {
    create: (params: unknown) => Promise<unknown>
    list?: () => Promise<unknown>
    get?: (id: string) => Promise<unknown>
    verify?: (id: string) => Promise<unknown>
  }
}

interface BavimailCtor {
  new (opts: { apiKey: string; baseUrl?: string }): BavimailSdkLike
}

async function client(): Promise<BavimailSdkLike> {
  const sdkModule = (await loadSdk()) as { Bavimail?: BavimailCtor; default?: BavimailCtor }
  const Ctor = sdkModule.Bavimail ?? sdkModule.default
  if (typeof Ctor !== 'function') {
    throw new MCPUpstreamError('upstream', "'bavimail' SDK does not export a `Bavimail` constructor")
  }
  const apiKey = resolveApiKey()
  const baseUrl = resolveApiBaseUrl()
  return new Ctor({ apiKey, baseUrl })
}

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
 * Normalize a paginated SDK response into the shape the LLM consumes.
 * Per AC6: distinguish empty (count:0, items:[]) from error.
 */
function normalizeList(raw: unknown): { count: number; items: unknown[] } {
  if (Array.isArray(raw)) return { count: raw.length, items: raw }
  if (raw && typeof raw === 'object') {
    const obj = raw as { items?: unknown; data?: unknown; count?: unknown }
    const items = Array.isArray(obj.items) ? obj.items : Array.isArray(obj.data) ? obj.data : []
    return { count: items.length, items }
  }
  return { count: 0, items: [] }
}

export async function callTool(name: ToolName, rawInput: unknown): Promise<ToolResult> {
  let apiKey: string | undefined
  try {
    apiKey = resolveApiKey()
  } catch {
    // resolveApiKey throws if missing — surface to caller as auth error.
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
  const parsed = schema.safeParse(rawInput)
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
      if (!sdk.emails.sendBatch) {
        throw new MCPUpstreamError('upstream', "SDK lacks emails.sendBatch; upgrade 'bavimail'")
      }
      return await sdk.emails.sendBatch(input)
    }
    case 'emails_update_scheduled': {
      const i = input as { email_id: string; scheduled_at: string }
      if (!sdk.emails.update) {
        throw new MCPUpstreamError('upstream', "SDK lacks emails.update; upgrade 'bavimail'")
      }
      return await sdk.emails.update(i.email_id, { scheduledAt: i.scheduled_at })
    }
    case 'emails_cancel': {
      const i = input as { email_id: string }
      if (!sdk.emails.cancel) {
        throw new MCPUpstreamError('upstream', "SDK lacks emails.cancel; upgrade 'bavimail'")
      }
      return await sdk.emails.cancel(i.email_id)
    }
    case 'emails_get': {
      const i = input as { email_id: string }
      return await sdk.emails.get(i.email_id)
    }
    case 'emails_list_recent': {
      if (!sdk.emails.list) {
        throw new MCPUpstreamError('upstream', "SDK lacks emails.list; upgrade 'bavimail'")
      }
      return normalizeList(await sdk.emails.list(input))
    }
    case 'inbound_emails_list': {
      if (!sdk.inboundEmails?.list) {
        throw new MCPUpstreamError('upstream', "SDK lacks inboundEmails.list; upgrade 'bavimail'")
      }
      const list = normalizeList(await sdk.inboundEmails.list(input))
      // Per AC10: even the metadata listing wraps content in the envelope so
      // any field carrying user-supplied text (e.g. subject, from, snippet)
      // is rendered as untrusted.
      return wrapUntrusted(list)
    }
    case 'inbound_emails_get': {
      const i = input as { inbound_email_id: string }
      if (!sdk.inboundEmails?.get) {
        throw new MCPUpstreamError('upstream', "SDK lacks inboundEmails.get; upgrade 'bavimail'")
      }
      return wrapUntrusted(await sdk.inboundEmails.get(i.inbound_email_id))
    }
    case 'domains_create':
      return await sdk.domains.create(input)
    case 'domains_list': {
      if (!sdk.domains.list) {
        throw new MCPUpstreamError('upstream', "SDK lacks domains.list; upgrade 'bavimail'")
      }
      return normalizeList(await sdk.domains.list())
    }
    case 'domains_get_dns_status': {
      const i = input as { domain_id: string }
      if (!sdk.domains.get) {
        throw new MCPUpstreamError('upstream', "SDK lacks domains.get; upgrade 'bavimail'")
      }
      return await sdk.domains.get(i.domain_id)
    }
    case 'domains_verify': {
      const i = input as { domain_id: string }
      if (!sdk.domains.verify) {
        throw new MCPUpstreamError('upstream', "SDK lacks domains.verify; upgrade 'bavimail'")
      }
      return await sdk.domains.verify(i.domain_id)
    }
  }
}
