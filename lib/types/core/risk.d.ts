/**
 * Risk classification for the approval-window risk gate.
 *
 * A pure, dependency-free function: given a tool call identity (name + parsed
 * model arguments) it decides whether the call is HIGH-risk and must always be
 * human-confirmed, or NONE (safe to auto-allow inside an armed window). The
 * classifier only ever *flags* danger; it never rejects — the gate decides
 * what to do with a `high'` verdict.
 * @module @xuhai/dsh-approval-window/risk
 */
import type { RiskRule, RiskRuleInput, RiskDecision, RiskLevel } from './risk.types.ts';
/**
 * Classify one tool call's risk.
 *
 * @param input - the tool identity (name) and parsed model arguments.
 * @param options - optional user-supplied risk rules, evaluated before the
 *   built-in categories; the first match wins.
 * @returns {@link RiskDecision} with `risk: 'high'` and a readable reason when a
 *   customized or built-in destructive pattern matches, else `risk: 'none'`.
 * @remarks The classifier is fail-open: an unrecognised tool or a missing
 *   command/path yields `'none'`, so an armed window auto-allows it. It only
 *   *labels* danger; the risk gate enforces the human-confirm behaviour.
 */
export declare function classifyRisk(input: Readonly<RiskRuleInput>, options?: {
    readonly rules?: readonly RiskRule[];
}): RiskDecision;
/** The closed risk-level vocabulary, for option advertisement and runtime validation. */
export declare const RISK_LEVELS: readonly RiskLevel[];
