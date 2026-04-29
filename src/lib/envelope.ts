/**
 * Prompt-injection envelope for inbound email content.
 *
 * Per AC10 (security B1 mitigation): `inbound_emails_get` and
 * `inbound_emails_list` MUST wrap email body content in an envelope flagged
 * as untrusted-third-party so the LLM treats it as data, not instructions.
 *
 * The envelope is a JSON object with a `__untrusted_third_party_content`
 * boolean flag and a `content` field carrying the original body. The flag
 * is unusual enough to be machine-detectable but obvious enough that a
 * human reading the conversation log understands what's happening.
 *
 * T-MCP-9 verifies the envelope structure.
 */

export interface UntrustedThirdPartyContent<T = unknown> {
  __untrusted_third_party_content: true
  content: T
}

export function wrapUntrusted<T>(content: T): UntrustedThirdPartyContent<T> {
  return {
    __untrusted_third_party_content: true,
    content,
  }
}
