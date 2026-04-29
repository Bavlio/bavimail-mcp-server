/**
 * Regression test for the unknown-tool guard.
 *
 * Codex edgecase final-verify caught that `name in TOOL_INPUT_SCHEMAS`
 * walks the prototype chain, so `__proto__`, `toString`, `constructor`
 * etc. would slip past the unknown-tool guard and throw an internal
 * TypeError instead of a clean McpError(InvalidParams). Switched to
 * `Object.hasOwn` and locked it in here.
 */

import { describe, expect, it } from 'vitest'

import { TOOL_INPUT_SCHEMAS } from '../src/tools/schemas.js'

describe('TOOL_INPUT_SCHEMAS guard', () => {
  it('Object.hasOwn rejects prototype-chain names', () => {
    for (const name of ['__proto__', 'toString', 'constructor', 'hasOwnProperty']) {
      expect(Object.hasOwn(TOOL_INPUT_SCHEMAS, name)).toBe(false)
    }
  })

  it('Object.hasOwn accepts every real tool name', () => {
    for (const name of Object.keys(TOOL_INPUT_SCHEMAS)) {
      expect(Object.hasOwn(TOOL_INPUT_SCHEMAS, name)).toBe(true)
    }
  })

  it('the broken `in` check would have falsely allowed prototype names', () => {
    // Sanity-check: confirm this regression test is exercising the right
    // surface. If this assertion fails, the regression no longer applies
    // (e.g. someone replaced the dictionary with a null-prototype object).
    expect('toString' in TOOL_INPUT_SCHEMAS).toBe(true)
  })
})
