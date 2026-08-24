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

import type { RiskRule, RiskRuleInput, RiskDecision, RiskLevel } from './risk.types.ts'

type Matcher = (input: Readonly<RiskRuleInput>) => boolean

interface Category {
  readonly reason: string
  readonly matches: Matcher
}

/** Tools whose args carry a shell command string. */
const SHELL_TOOLS: ReadonlySet<string> = new Set(['bash', 'pwsh', 'powershell', 'cmd'])

/** Specialize a per-tool predicate only to the tools it targets; others fall through. */
function whenTools(tools: ReadonlySet<string>, match: Matcher): Matcher {
  return input => tools.has(input.toolName) && match(input)
}

/** Read the shell command string from args, or an empty string when absent. */
function commandOf(input: Readonly<RiskRuleInput>): string {
  const raw = input.args?.command
  return typeof raw === 'string' ? raw : ''
}

/** Read a filesystem path from args (write/edit/editor tools differ in field name). */
function pathOf(input: Readonly<RiskRuleInput>): string {
  const raw = input.args?.file_path ?? input.args?.path ?? input.args?.target
  return typeof raw === 'string' ? raw : ''
}

/** File/directory destruction — `rm` with recursive (-r) and usually force (-f). */
function fileDirDestruction(input: Readonly<RiskRuleInput>): boolean {
  const command = commandOf(input)
  if (command === '') return false
  const hasRm = /(?:\s|^|['"\);|&])\s*rm(\s|$|[.\w])/i.test(command)
  if (!hasRm) return false
  // rm -rf / rm -fr / rm --recursive / rm -r (recursive deletion).
  return /(?:^|[\s;|&])rm\s+-[a-zA-Z]*r[a-zA-Z]*f[a-zA-Z]*/i.test(command)
    || /(?:^|[\s;|&])rm\s+-[a-zA-Z]*f[a-zA-Z]*r[a-zA-Z]*/i.test(command)
    || /(?:^|[\s;|&])rm\s+--recursive/i.test(command)
    || /(?:^|[\s;|&])rm\s+-r\b/i.test(command)
    || /(?:^|[\s;|&])rm\s+-[a-zA-Z]*r[a-zA-Z]*$/i.test(command)
}

/** Dangerously rewriting git history / force-pushing. */
function gitDestruction(input: Readonly<RiskRuleInput>): boolean {
  const command = commandOf(input)
  if (command === '') return false
  return /git\s+(?:push\s+[^\n;]*(?:--(?:force-with-lease|force)(?:\s|$)))/i.test(command)
    || /git\s+reset\s+--hard/i.test(command)
    || /git\s+clean\s+-[a-zA-Z]*f[a-zA-Z]*/i.test(command)
    || /git\s+rebase\s+--onto/i.test(command)
    || /git\s+filter-branch/i.test(command)
}

/** Database destruction — DROP / TRUNCATE / DELETE without a WHERE. */
function databaseDestruction(input: Readonly<RiskRuleInput>): boolean {
  const command = commandOf(input)
  if (command === '') return false
  if (/\bDROP\s+(?:DATABASE|TABLE|SCHEMA|USER)\b/i.test(command)) return true
  if (/\bTRUNCATE\s+(?:TABLE\s+)?[\w."`\[\]]+/i.test(command)) return true
  // DELETE FROM <tbl> with no WHERE clause in the same statement — a full table wipe.
  const deleteMatch = /\bDELETE\s+FROM\b[\s\S]*?(?:;|$)/i.exec(command)
  if (deleteMatch !== null && !/\bwhere\b/i.test(deleteMatch[0])) return true
  return false
}

/** System / service / process destruction. */
function systemServiceProcess(input: Readonly<RiskRuleInput>): boolean {
  const command = commandOf(input)
  if (command === '') return false
  return /\bkill\s+-(?:9|SIGKILL)\b/i.test(command)
    || /\b(?:chmod|chown)\s+-R\b/i.test(command)
    || /\bpoweroff\b|\breboot\b/i.test(command)
    || /\b(?:format|mkfs)\b/i.test(command)
}

/** Overwriting a critical configuration / credential file via an fs write/edit tool. */
function overwriteCriticalConfig(input: Readonly<RiskRuleInput>): boolean {
  const path = pathOf(input)
  if (path === '') return false
  const normalized = path.replace(/\\/g, '/').toLowerCase()
  // Sensitive filename fragments (credentials, env, secrets, keys, config) and
  // system-owner directories are treated as high-risk write targets.
  return /(?:credentials|\.env(?:\.|$)|secret|token|\.ssh|id_rsa|\.pem|\.key(?:$|\.)|\.gnupg)/.test(normalized)
    || /(?:^|\/)(?:etc|windows\s*\/system32|var\s*\/lib|program\s*files)(?:\/|$)/.test(normalized)
}

/** Built-in categories, evaluated in order; the first hit wins. */
const CATEGORIES: readonly Category[] = [
  { reason: '文件/目录破坏：递归删除 (rm -rf/-r)', matches: whenTools(SHELL_TOOLS, fileDirDestruction) },
  { reason: 'git 危险操作：force push / reset --hard / clean -fd', matches: whenTools(SHELL_TOOLS, gitDestruction) },
  { reason: '数据库破坏：DROP / TRUNCATE / DELETE 无 WHERE', matches: whenTools(SHELL_TOOLS, databaseDestruction) },
  { reason: '系统/服务/进程：kill -9 / 递归 chmod·chown / 重启', matches: whenTools(SHELL_TOOLS, systemServiceProcess) },
  { reason: '覆盖关键配置文件/凭证', matches: overwriteCriticalConfig },
]

/** Whether a user-supplied {@link RiskRule} matches this call. */
function ruleMatches(rule: RiskRule, input: Readonly<RiskRuleInput>): boolean {
  if (rule.toolName !== undefined && rule.toolName !== input.toolName) return false
  return new RegExp(rule.pattern, 'i').test(JSON.stringify(input.args ?? {}))
}

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
export function classifyRisk(input: Readonly<RiskRuleInput>, options?: { readonly rules?: readonly RiskRule[] }): RiskDecision {
  for (const rule of options?.rules ?? []) {
    if (ruleMatches(rule, input)) return { risk: 'high', reason: rule.reason }
  }
  for (const category of CATEGORIES) {
    if (category.matches(input)) return { risk: 'high', reason: category.reason }
  }
  return { risk: 'none' }
}

/** The closed risk-level vocabulary, for option advertisement and runtime validation. */
export const RISK_LEVELS: readonly RiskLevel[] = ['high', 'none']
