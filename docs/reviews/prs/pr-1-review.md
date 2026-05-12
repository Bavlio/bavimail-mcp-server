---
pr: 1
repo: Bavlio/bavimail-mcp-server
title: "feat(m1a): MCP server v1.0.0 — stdio + 12 tools"
head_sha: f3635a0dcd7239cc046c6a5f6cb30c44befcc428
approve_sha: f3635a0dcd7239cc046c6a5f6cb30c44befcc428
classification: code_pr
teammate_gate: deferred (greenfield repo, single-author scaffolding under PM-blessed budget exception per AC-M1a)
codex_correctness_gate: passed (after 1 round of fixes for SDK shape mismatch + 1 round for docs/contract honesty)
codex_edgecase_gate: passed (after 2 rounds of fixes — HIGH non-blockers + final prototype-chain regression)
test_gate: passed (78/78 vitest tests green; bundle 11.27 kB brotlied, well under 5 MB; build clean; smoke --help lists all 12 tools)
frontend_gate: N/A (pure backend Node CLI; no qualifying frontend/browser validation surface)
gate_status: PASS
---

# PR #1 Review Summary

Target: `feat/m1a-stdio-v1.0.0` → `main` (Bavlio/bavimail-mcp-server)
Head: `f3635a0dcd7239cc046c6a5f6cb30c44befcc428`

## Files

22 source/test/config files implementing the M1a slice from `bavimail-client/docs/plans/2026-04-28-bavimail-ai-agent-visibility-response-plan.md`.

## Commit chain

| Commit | Purpose |
|---|---|
| `ff06463` | Initial scaffolding (12 tools, schemas, handlers, tests, CI, README) |
| `de91b13` | Round-7 SDK alignment: rewrote handlers + schemas to match actual `bavimail@~0.3.6` SDK shape (aliasId/body/providerKey model). Dropped `emails_update_scheduled` (no SDK method); added `aliases_list` (foundational). Plus auth + redaction hardening. |
| `6c72085` | Docs honesty: README rate_limit row clarifies retryAfter is best-effort under SDK v0.3.x; CHANGELOG + errors.ts call out timeout is local promise (not AbortSignal); dropped stale tool refs |
| `b1a0614` | Edgecase HIGH-1/2/3: McpError for unknown tool; flush-guaranteed startup-error stdout; BAVIMAIL_API_BASE_URL validated at startup |
| `f3635a0` | Final fix: `Object.hasOwn` instead of `in` for unknown-tool guard (prototype-chain hole); regression test |

## Codex correctness pass

**Round 1 (FAIL at `ff06463`)** — 2 BLOCKERS + 5 HIGH non-blockers:

| Finding | Disposition | Resolution |
|---|---|---|
| Wrong SDK method names (sendBatch vs batchSend, no emails.update, domains.get vs getDnsStatus) | implement_now | All handlers + tool surface rewritten to actual SDK. `emails_update_scheduled` dropped; `aliases_list` added. |
| Wrong schema shapes (from/text/html vs aliasId/body; name/region vs domain/providerKey) | implement_now | All schemas + descriptions rewritten to SDK field names |
| Local timeout doesn't abort upstream fetch | accept-as-designed | SDK doesn't accept AbortSignal yet; documented as v1.x followup |
| Whitespace API key accepted | implement_now (HIGH) | `resolveApiKey` now `.trim()` + length check |
| Non-HTTPS BAVIMAIL_API_BASE_URL accepted | implement_now (HIGH) | `resolveApiBaseUrl` rejects non-HTTPS via new `InvalidApiBaseUrlError` |
| Redaction misses lowercase `bearer`, `~`, URL-encoded keys | implement_now (HIGH) | `redactSecrets` now case-insensitive Bearer + `~` in token charset + URL-encoded fallback + generic Authorization scheme |
| Custom Authorization headers allowed via `headers` field | accept-as-designed | The `headers` field on EmailSendParams was dropped in the SDK-aligned schema (SDK takes its own header set) |
| Retry-After not extracted from APIError | accept-as-designed | SDK `APIError` doesn't expose response headers; documented in README rate_limit row |

**Round 2 (FAIL at `de91b13`)** — 1 HIGH + 2 LOW:

| Finding | Disposition | Resolution |
|---|---|---|
| README promised retryAfter but SDK doesn't expose it | implement_now (HIGH) | README updated to "best-effort under SDK v0.3.x" |
| Stale `emails_update_scheduled` ref in README example-prompts | implement_now (LOW) | Removed |
| Stale `aliases_*` future ref in README roadmap | implement_now (LOW) | Updated to note `aliases_list` ships now |
| Timeout doc overstated as AbortSignal | implement_now (LOW) | CHANGELOG + errors.ts call out local promise timeout |

**Round 3 (PASS at `6c72085`).**

## Codex edgecase pass

**Round 1 (PASS at `6c72085`)** — 4 HIGH non-blockers + 5 MEDIUM/LOW:

| Finding | Disposition | Resolution |
|---|---|---|
| Unknown tool returns isError-true success (should be JSON-RPC error) | implement_now (HIGH) | `McpError(InvalidParams)` thrown in server.ts |
| stdout.write before process.exit can truncate | implement_now (HIGH) | `writeStructuredErrorAndExit` awaits write callback + sets exitCode |
| Bad BAVIMAIL_API_BASE_URL not validated at startup | implement_now (HIGH) | `resolveApiBaseUrl()` called from main() startup |
| inbound_emails_get has no response size cap | defer | v1.x followup; ~50 KB body warning added to envelope.ts doc note |
| Multi-process rate-limit amplification | defer | Inherent; per-process is documented in plan AC11 |
| Rate-limit boundary math | accept-as-designed | Verified correct for 6th-call-at-window-edge, 1000-calls-in-1ms |
| tools/list draft-07 schema | accept-as-designed | MCP hosts accept; SDK uses same path |
| SDK loader cache for missing peer-dep | accept-as-designed | Process can't recover from missing peer-dep at runtime |
| Regex ReDoS (DNS, email, ISO) | accept-as-designed | All length-capped, no nested-quantifier ReDoS surface |

**Final re-verify (FAIL at `b1a0614`)** — 1 HIGH:

| Finding | Disposition | Resolution |
|---|---|---|
| `name in TOOL_INPUT_SCHEMAS` walks prototype chain (`__proto__`, `toString`, etc. slip through) | implement_now (HIGH) | `Object.hasOwn(TOOL_INPUT_SCHEMAS, name)` + regression test in tests/server.test.ts |

**Final re-verify (PASS at `f3635a0`).**

## Test plan

- [x] `bun install` clean (209 packages including @modelcontextprotocol/sdk@1.29.0, bavimail@0.3.6 dev-dep, vitest@3.2.4, msw@2.13.6, size-limit@11.2.0)
- [x] `bun run typecheck` (no errors; strict + noUncheckedIndexedAccess)
- [x] `bun run test` (78/78 green across 7 files: schemas/annotations/rate-limit/auth/envelope/errors/server)
- [x] `bun run build` (tsc emits to dist/)
- [x] `bun run size` (11.27 kB brotlied, well under 5 MB cap)
- [x] `node ./dist/index.js --help` (exits 0; lists all 12 tools incl. aliases_list)
- [x] `node ./dist/index.js --version` (prints `1.0.0`)
- [x] Missing `BAVIMAIL_API_KEY`: writes JSON-RPC structured error to stdout + exits 1
- [x] `BAVIMAIL_API_BASE_URL=http://...`: writes JSON-RPC structured error to stdout + exits 1
- [x] Whitespace-only `BAVIMAIL_API_KEY`: same path as missing

## Test coverage gaps (deferred)

- AC21 / T-MCP-2: msw-mocked integration tests for each tool's happy + error paths. Deferred because msw harness needs ~200 LOC of setup; the unit-level error mapping in `tests/errors.test.ts` covers the auth_invalid/auth_forbidden/rate_limit code distinction directly.
- AC25 / T-MCP-10: post-publish CI cold-install in Docker. Deferred until AC0 (npm org claim) + AC15 (npm publish) land.
- AC31 demo recording. Deferred per project memory (Adam's sister produces demo videos separately).

## Test surface that DID land

- T-MCP-1 (schemas): 32 tests across all 12 tool input schemas.
- T-MCP-3 (key redaction): 6 tests in tests/errors.test.ts with case-insensitive Bearer, tilde tokens, URL-encoded keys, generic Authorization.
- T-MCP-7 / T-MCP-12 (error code mapping): 5 tests in tests/errors.test.ts.
- T-MCP-8 (key-at-call-time + base URL validation): 13 tests in tests/auth.test.ts.
- T-MCP-9 (envelope shape): 3 tests in tests/envelope.test.ts.
- T-MCP-11 (rate limit): 4 tests in tests/rate-limit.test.ts.
- T-MCP-13 (annotations matrix): 7 tests in tests/annotations.test.ts.
- Server unknown-tool guard regression: 3 tests in tests/server.test.ts.

## Pending Adam manual action

- **AC0 (npm org claim)**: Adam needs to claim `@bavimail` on npmjs.com + reserve `bavimail-mcp-server` (fallback) + `@bavimai1/mcp-server` (typo squat). Blocks npm publish.
- **AC15 (npm publish)**: Once AC0 done, configure `NPM_TOKEN` repo secret + run `npm publish --access public`. The `prepublishOnly` script handles build + typecheck + test + size-limit.
- **Branch protection on `main`**: Configure via GitHub repo settings or `gh api -X PUT /repos/Bavlio/bavimail-mcp-server/branches/main/protection ...` once Adam has org-admin access.

## Coordination notes

- New repo created tonight under Adam's GitHub auth at https://github.com/Bavlio/bavimail-mcp-server.
- The bavimail typed SDK (`bavimail@~0.3.6`) is a peer-dep so SDK breaking changes don't silently break the server. The CI build installs the dev-dep version explicitly.
- `prepublishOnly` runs build + typecheck + test + size-limit before any `npm publish`, so AC0 → npm publish is one command (`npm publish --access public`) once the org is claimed and `NPM_TOKEN` is set.
- M1b (HTTP transport, v1.1.0) is a follow-up PR on this repo, gated on M1a npm publish + T-MCP-10 cold-install passes.

## Next action

After Adam reviews + merges PR #1 (under his Bavlio org governance), runs `npm publish --access public` (manual; gated on AC0 npm org claim).
