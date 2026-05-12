/**
 * T-MCP-8: API key resolved at every tool call (not cached at startup).
 *
 * Round-7 hardening: also covers all-whitespace key rejection and the
 * HTTPS-only base URL guard.
 */

import { describe, expect, it } from 'vitest'

import {
  InvalidApiBaseUrlError,
  MissingApiKeyError,
  resolveApiBaseUrl,
  resolveApiKey,
} from '../src/lib/auth.js'

describe('resolveApiKey', () => {
  it('reads from process.env at call time', () => {
    const env: NodeJS.ProcessEnv = { ...process.env, BAVIMAIL_API_KEY: 'key-A' }
    expect(resolveApiKey(env)).toBe('key-A')
  })

  it('throws MissingApiKeyError when env var is unset', () => {
    const env: NodeJS.ProcessEnv = { ...process.env }
    delete env.BAVIMAIL_API_KEY
    expect(() => resolveApiKey(env)).toThrow(MissingApiKeyError)
  })

  it('throws when env var is empty string', () => {
    const env: NodeJS.ProcessEnv = { ...process.env, BAVIMAIL_API_KEY: '' }
    expect(() => resolveApiKey(env)).toThrow(MissingApiKeyError)
  })

  it('throws when env var is all whitespace (round-7 hardening)', () => {
    const env: NodeJS.ProcessEnv = { ...process.env, BAVIMAIL_API_KEY: '   \t\n ' }
    expect(() => resolveApiKey(env)).toThrow(MissingApiKeyError)
  })

  it('trims surrounding whitespace from the key', () => {
    const env: NodeJS.ProcessEnv = { ...process.env, BAVIMAIL_API_KEY: '  bvm_live_abc  ' }
    expect(resolveApiKey(env)).toBe('bvm_live_abc')
  })

  it('reflects env updates between calls (rotation support)', () => {
    const env: NodeJS.ProcessEnv = { ...process.env, BAVIMAIL_API_KEY: 'key-A' }
    expect(resolveApiKey(env)).toBe('key-A')
    env.BAVIMAIL_API_KEY = 'key-B'
    expect(resolveApiKey(env)).toBe('key-B')
  })
})

describe('resolveApiBaseUrl', () => {
  it('defaults to https://api.bavimail.com', () => {
    const env: NodeJS.ProcessEnv = { ...process.env }
    delete env.BAVIMAIL_API_BASE_URL
    expect(resolveApiBaseUrl(env)).toBe('https://api.bavimail.com')
  })

  it('honors BAVIMAIL_API_BASE_URL HTTPS override', () => {
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      BAVIMAIL_API_BASE_URL: 'https://api.staging.bavimail.com',
    }
    expect(resolveApiBaseUrl(env)).toBe('https://api.staging.bavimail.com')
  })

  it('treats empty/whitespace-only override as default', () => {
    expect(
      resolveApiBaseUrl({ ...process.env, BAVIMAIL_API_BASE_URL: '' }),
    ).toBe('https://api.bavimail.com')
    expect(
      resolveApiBaseUrl({ ...process.env, BAVIMAIL_API_BASE_URL: '   ' }),
    ).toBe('https://api.bavimail.com')
  })

  it('rejects http:// override (would leak API key over plaintext)', () => {
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      BAVIMAIL_API_BASE_URL: 'http://localhost:3000',
    }
    expect(() => resolveApiBaseUrl(env)).toThrow(InvalidApiBaseUrlError)
  })

  it('rejects schemeless override', () => {
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      BAVIMAIL_API_BASE_URL: 'api.bavimail.com',
    }
    expect(() => resolveApiBaseUrl(env)).toThrow(InvalidApiBaseUrlError)
  })

  it('rejects ftp:// or other non-HTTPS schemes', () => {
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      BAVIMAIL_API_BASE_URL: 'ftp://api.bavimail.com',
    }
    expect(() => resolveApiBaseUrl(env)).toThrow(InvalidApiBaseUrlError)
  })

  it('accepts case-insensitive HTTPS scheme', () => {
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      BAVIMAIL_API_BASE_URL: 'HTTPS://api.staging.bavimail.com',
    }
    expect(resolveApiBaseUrl(env)).toBe('HTTPS://api.staging.bavimail.com')
  })
})
