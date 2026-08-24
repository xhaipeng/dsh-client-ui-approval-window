/**
 * Wire-safe types for the risk classifier, free of host/client imports so both
 * halves of the plugin can consume them.
 * @module @xuhai/dsh-approval-window/risk-types
 */
/** Closed risk-level vocabulary. `high` always requires human confirmation. */
export type RiskLevel = 'high' | 'none';
/** The decision the classifier returns for one tool call. */
export interface RiskDecision {
    readonly risk: RiskLevel;
    /** Human-readable reason naming the destructive pattern, present only for `high`. */
    readonly reason?: string;
}
/** The classifier's input: one tool call identity (name + parsed model arguments). */
export interface RiskRuleInput {
    readonly toolName: string;
    readonly args?: Record<string, unknown> | null;
}
/** A user-configurable extra risk pattern entry (tool-optional; matches on the whole args). */
export interface RiskRule {
    /** Optional tool-name filter; when omitted the rule applies to every tool. */
    toolName?: string;
    /** Regular-expression source, matched (case-insensitive) against the serialised args. */
    pattern: string;
    /** Human-readable reason surfaced to the confirmation prompt. */
    reason: string;
}
