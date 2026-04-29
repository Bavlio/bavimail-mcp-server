/**
 * T-MCP-8: API key resolved at every tool call (not cached at startup).
 *
 * AC8: rotating BAVIMAIL_API_KEY between calls picks up the new value
 * without a process restart.
 *
 * Also exercises AC9 (missing-key behavior) and AC12 (BAVIMAIL_API_BASE_URL
 * default).
 */

import { describe, expect, it } from 'vitest'

import { MissingApiKeyError, resolveApiBaseUrl, resolveApiKey } from '../src/lib/auth.js'

describe('resolveApiKey', () => {
  it('reads from process.env at call time', () => {
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      BAVIMAIL_API_KEY: 'key-A',
    }
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

  it('honors BAVIMAIL_API_BASE_URL override', () => {
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      BAVIMAIL_API_BASE_URL: 'https://api.staging.bavimail.com',
    }
    expect(resolveApiBaseUrl(env)).toBe('https://api.staging.bavimail.com')
  })
})
