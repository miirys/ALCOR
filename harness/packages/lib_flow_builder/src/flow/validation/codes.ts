/**
 * Stable identifier codes for {@link FlowValidationIssue}.
 *
 * Codes are the contract; messages are the rendered string. UI may swap copy
 * keyed on the code without churning the validator. Telemetry counts code
 * frequencies to surface which rules trip users up most.
 *
 * Naming convention: `<domain>.<rule>`, lowercase, dot-separated. Future
 * domains include `agent.*`, `tool.*`, `edge.*`, `binding.*`.
 */
export const FlowValidationCode = {
  // ── Schema / semantic validation ─────────────────────────────────
  /** Zod schema parse failure for a v1 flow. */
  Schema: 'flow.schema',
  /** Higher-level semantic check failure (entry point, router refs, …). */
  Semantic: 'flow.semantic',
  /** Conversion threw before reaching the schema parse. */
  Conversion: 'flow.conversion',

  // ── Persistence ──────────────────────────────────────────────────
  /** YAML parse / serialize failure. */
  Format: 'flow.format',
  /** Filesystem or network IO failure. */
  Io: 'flow.io',
  /** Flow at the requested URI does not exist. */
  NotFound: 'flow.not_found',
  /** Malformed or unsupported URI. */
  Uri: 'flow.uri',
  /** Catalog backend (GraphQL) rejected the request. */
  Catalog: 'flow.catalog',
} as const;

export type FlowValidationCode = (typeof FlowValidationCode)[keyof typeof FlowValidationCode];
