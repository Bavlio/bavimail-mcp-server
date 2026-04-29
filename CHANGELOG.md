# Changelog

All notable changes to `@bavimail/mcp-server` are documented here. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this
project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

> Note: security fixes are carved out of the SemVer stability guarantee.
> When a security issue requires a behavior change, the patch version bumps
> and the change is called out explicitly under "Security" below.

## [Unreleased]

## [1.0.0] — 2026-04-29

### Added
- Stdio transport for MCP-compatible AI agents (Claude Desktop, Cursor, Cline).
- 12 tools covering the modal send/receive/domain agent loop:
  - `emails_send`, `emails_send_batch`, `emails_update_scheduled`, `emails_cancel`,
    `emails_get`, `emails_list_recent`
  - `inbound_emails_list`, `inbound_emails_get`
  - `domains_create`, `domains_list`, `domains_get_dns_status`, `domains_verify`
- MCP tool annotations on every tool (`readOnlyHint`, `destructiveHint`,
  `idempotentHint`, `openWorldHint`) per the MCP specification.
- Per-process rate limit on `emails_send_batch` (5 calls per rolling 60s
  window) as an LLM-spam guardrail.
- Prompt-injection envelope (`__untrusted_third_party_content`) wrapping all
  inbound email content surfaced to the LLM.
- Distinct error codes (`auth_invalid`, `auth_forbidden`, `rate_limit`,
  `client_rate_limit`, `timeout`, `validation`, `upstream`).
- 30s `AbortSignal` timeout on every Bavimail API call.
- Built on the official `bavimail` typed SDK as a peer dependency.
- README with Claude Desktop, Cursor, and Cline configuration snippets.

### Security
- API key is read from `BAVIMAIL_API_KEY` at every tool call (not cached at
  startup) to support key rotation without restart.
- API key value + `Bearer <token>` substrings are redacted from any error
  message before reaching the MCP transport.

### Roadmap
- v1.1.0 will add Streamable HTTP transport (single-tenant only) for hosted
  agent platforms. Stdio users on v1.0.0 are not impacted; HTTP is purely
  additive.
- `webhooks_*` tools land in a future minor release once the Bavimail
  backend ships SSRF defense at webhook URL registration AND dispatch time.
