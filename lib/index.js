import { Service } from "@deepseek-ai/cordis";
import z from "schemastery";
import { SessionId } from "@deepseek-ai/dsh-session";
import { effectiveSandboxMode, setSandboxMode } from "@deepseek-ai/dsh-sandbox-policy";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
//#region src/core/risk.ts
/** Tools whose args carry a shell command string. */
const SHELL_TOOLS = /* @__PURE__ */ new Set([
	"bash",
	"pwsh",
	"powershell",
	"cmd"
]);
/** Specialize a per-tool predicate only to the tools it targets; others fall through. */
function whenTools(tools, match) {
	return (input) => tools.has(input.toolName) && match(input);
}
/** Read the shell command string from args, or an empty string when absent. */
function commandOf(input) {
	const raw = input.args?.command;
	return typeof raw === "string" ? raw : "";
}
/** Read a filesystem path from args (write/edit/editor tools differ in field name). */
function pathOf(input) {
	const raw = input.args?.file_path ?? input.args?.path ?? input.args?.target;
	return typeof raw === "string" ? raw : "";
}
/** File/directory destruction — `rm` with recursive (-r) and usually force (-f). */
function fileDirDestruction(input) {
	const command = commandOf(input);
	if (command === "") return false;
	if (!/(?:\s|^|['"\);|&])\s*rm(\s|$|[.\w])/i.test(command)) return false;
	return /(?:^|[\s;|&])rm\s+-[a-zA-Z]*r[a-zA-Z]*f[a-zA-Z]*/i.test(command) || /(?:^|[\s;|&])rm\s+-[a-zA-Z]*f[a-zA-Z]*r[a-zA-Z]*/i.test(command) || /(?:^|[\s;|&])rm\s+--recursive/i.test(command) || /(?:^|[\s;|&])rm\s+-r\b/i.test(command) || /(?:^|[\s;|&])rm\s+-[a-zA-Z]*r[a-zA-Z]*$/i.test(command);
}
/** Dangerously rewriting git history / force-pushing. */
function gitDestruction(input) {
	const command = commandOf(input);
	if (command === "") return false;
	return /git\s+(?:push\s+[^\n;]*(?:--(?:force-with-lease|force)(?:\s|$)))/i.test(command) || /git\s+reset\s+--hard/i.test(command) || /git\s+clean\s+-[a-zA-Z]*f[a-zA-Z]*/i.test(command) || /git\s+rebase\s+--onto/i.test(command) || /git\s+filter-branch/i.test(command);
}
/** Database destruction — DROP / TRUNCATE / DELETE without a WHERE. */
function databaseDestruction(input) {
	const command = commandOf(input);
	if (command === "") return false;
	if (/\bDROP\s+(?:DATABASE|TABLE|SCHEMA|USER)\b/i.test(command)) return true;
	if (/\bTRUNCATE\s+(?:TABLE\s+)?[\w."`\[\]]+/i.test(command)) return true;
	const deleteMatch = /\bDELETE\s+FROM\b[\s\S]*?(?:;|$)/i.exec(command);
	if (deleteMatch !== null && !/\bwhere\b/i.test(deleteMatch[0])) return true;
	return false;
}
/** System / service / process destruction. */
function systemServiceProcess(input) {
	const command = commandOf(input);
	if (command === "") return false;
	return /\bkill\s+-(?:9|SIGKILL)\b/i.test(command) || /\b(?:chmod|chown)\s+-R\b/i.test(command) || /\bpoweroff\b|\breboot\b/i.test(command) || /\b(?:format|mkfs)\b/i.test(command);
}
/** Overwriting a critical configuration / credential file via an fs write/edit tool. */
function overwriteCriticalConfig(input) {
	const path = pathOf(input);
	if (path === "") return false;
	const normalized = path.replace(/\\/g, "/").toLowerCase();
	return /(?:credentials|\.env(?:\.|$)|secret|token|\.ssh|id_rsa|\.pem|\.key(?:$|\.)|\.gnupg)/.test(normalized) || /(?:^|\/)(?:etc|windows\s*\/system32|var\s*\/lib|program\s*files)(?:\/|$)/.test(normalized);
}
/** Built-in categories, evaluated in order; the first hit wins. */
const CATEGORIES = [
	{
		reason: "文件/目录破坏：递归删除 (rm -rf/-r)",
		matches: whenTools(SHELL_TOOLS, fileDirDestruction)
	},
	{
		reason: "git 危险操作：force push / reset --hard / clean -fd",
		matches: whenTools(SHELL_TOOLS, gitDestruction)
	},
	{
		reason: "数据库破坏：DROP / TRUNCATE / DELETE 无 WHERE",
		matches: whenTools(SHELL_TOOLS, databaseDestruction)
	},
	{
		reason: "系统/服务/进程：kill -9 / 递归 chmod·chown / 重启",
		matches: whenTools(SHELL_TOOLS, systemServiceProcess)
	},
	{
		reason: "覆盖关键配置文件/凭证",
		matches: overwriteCriticalConfig
	}
];
/** Whether a user-supplied {@link RiskRule} matches this call. */
function ruleMatches(rule, input) {
	if (rule.toolName !== void 0 && rule.toolName !== input.toolName) return false;
	return new RegExp(rule.pattern, "i").test(JSON.stringify(input.args ?? {}));
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
function classifyRisk(input, options) {
	for (const rule of options?.rules ?? []) if (ruleMatches(rule, input)) return {
		risk: "high",
		reason: rule.reason
	};
	for (const category of CATEGORIES) if (category.matches(input)) return {
		risk: "high",
		reason: category.reason
	};
	return { risk: "none" };
}
//#endregion
//#region src/core/window.ts
/** A same-process, in-memory window ledger keyed by session id. */
var ApprovalWindow = class {
	entries = /* @__PURE__ */ new Map();
	/**
	* Arm (or re-arm, overwriting) a session's window.
	* @param sessionId - the session being granted the window.
	* @param durationMs - how long the window stays active.
	* @param priorSandboxMode - the sandbox mode to restore on disarm/expiry.
	* @returns the recorded entry.
	*/
	arm(sessionId, durationMs, priorSandboxMode) {
		const entry = {
			until: Date.now() + durationMs,
			durationMs,
			priorSandboxMode
		};
		this.entries.set(sessionId, entry);
		return entry;
	}
	/** Clear a session's window (idempotent). */
	disarm(sessionId) {
		this.entries.delete(sessionId);
	}
	/**
	* Rebuild a session's window from a persisted entry, using the exact stored
	* deadline rather than recomputing from now (restart replay).
	* @param sessionId - the session being restored.
	* @param until - the persisted absolute deadline (epoch ms).
	* @param durationMs - the granted duration (for display and persistence).
	* @param priorSandboxMode - the sandbox mode to restore on disarm/expiry.
	*/
	restore(sessionId, until, durationMs, priorSandboxMode) {
		this.entries.set(sessionId, {
			until,
			durationMs,
			priorSandboxMode
		});
	}
	/** Read a session's window entry, regardless of expiry. */
	get(sessionId) {
		return this.entries.get(sessionId);
	}
	/** Whether a session's window is armed and not yet expired. */
	isActive(sessionId, now = Date.now()) {
		const entry = this.entries.get(sessionId);
		return entry !== void 0 && entry.until > now;
	}
	/** Remaining ms until expiry, or `null` when the session has no active window. */
	remainingMs(sessionId, now = Date.now()) {
		const entry = this.entries.get(sessionId);
		if (entry === void 0 || entry.until <= now) return null;
		return entry.until - now;
	}
	/** Session ids whose windows are armed and active right now. */
	activeIds(now = Date.now()) {
		const result = [];
		for (const [id, entry] of this.entries) if (entry.until > now) result.push(id);
		return result;
	}
};
//#endregion
//#region src/host-routes.ts
/** Base path shared by the three routes. */
const BASE_PATH = "/api/approval-window";
/** Whether the request's socket is one of the local addresses. */
function isLoopback(address) {
	return address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1" || address === "localhost";
}
/**
* Trust fence: only a loopback caller with a local Host (and, when an Origin is
* present, a local origin) may reach the window API. Loopback is the safety
* baseline; the Host/Origin checks are a defensive tripwire against a
* misdirected local request.
*/
function trusted(req) {
	if (!isLoopback(req.socket.remoteAddress)) return false;
	const host = req.headers.host ?? "";
	if (host !== "" && !/^(?:127\.0\.0\.1|localhost)(?::\d+)?$/.test(host)) return false;
	const origin = req.headers.origin;
	if (origin !== void 0 && origin !== "" && !/^https?:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?$/.test(origin)) return false;
	return true;
}
/** Read and JSON-parse the request body, rejecting oversized or malformed bodies. */
async function readJson(req) {
	let raw = "";
	for await (const chunk of req) {
		const text = String(chunk);
		if (raw.length + text.length > 64 * 1024) throw new Error("body too large");
		raw += text;
	}
	if (raw === "") return {};
	return JSON.parse(raw);
}
/** Write a JSON response with the given status. */
function json(res, status, value) {
	const body = JSON.stringify(value);
	res.writeHead(status, {
		"Content-Type": "application/json; charset=utf-8",
		"Content-Length": Buffer.byteLength(body)
	});
	res.end(body);
}
/** Resolve a sessionId string to a live session, else `undefined`. */
function sessionOf(window, sessionId) {
	if (typeof sessionId !== "string" || sessionId === "") return void 0;
	return window.session(sessionId);
}
/**
* Build the three routes for the window service.
* @param window - the approval-window service.
* @returns the route table to pass to `ctx.webServer.register`.
*/
function makeApprovalWindowRoutes(window) {
	const snapshot = (session) => {
		const remaining = window.remainingMs(session);
		const now = Date.now();
		const active = remaining !== null && remaining > 0;
		return {
			sessionId: session.id,
			armed: active,
			until: active && window.remainingMs(session) !== null ? now + window.remainingMs(session) : null,
			durationMs: active ? window.duration(session) : null,
			remainingMs: remaining
		};
	};
	return [
		{
			kind: "exact",
			path: `${BASE_PATH}/state`,
			handler: (req, res) => {
				if (!trusted(req)) {
					json(res, 403, { error: "untrusted" });
					return;
				}
				const session = sessionOf(window, new URL(req.url ?? "/", "http://127.0.0.1").searchParams.get("sessionId"));
				if (session === void 0) {
					json(res, 400, { error: "missing or invalid sessionId" });
					return;
				}
				json(res, 200, snapshot(session));
			}
		},
		{
			kind: "exact",
			path: `${BASE_PATH}/action`,
			handler: async (req, res) => {
				if (!trusted(req)) {
					json(res, 403, { error: "untrusted" });
					return;
				}
				let body;
				try {
					body = await readJson(req);
				} catch {
					json(res, 400, { error: "invalid body" });
					return;
				}
				const session = sessionOf(window, body.sessionId);
				if (session === void 0) {
					json(res, 400, { error: "missing or invalid sessionId" });
					return;
				}
				const kind = body.action;
				if (kind === "disarm") {
					window.disarm(session);
					json(res, 200, snapshot(session));
					return;
				}
				if (kind === "arm") {
					const durationMs = Number(body.durationMs);
					if (!Number.isFinite(durationMs) || durationMs <= 0) {
						json(res, 400, { error: "invalid durationMs" });
						return;
					}
					window.arm(session, durationMs);
					json(res, 200, snapshot(session));
					return;
				}
				json(res, 400, { error: `unknown action "${String(kind)}"` });
			}
		},
		{
			kind: "exact",
			path: `${BASE_PATH}/events`,
			handler: (req, res) => {
				if (!trusted(req)) {
					json(res, 403, { error: "untrusted" });
					return;
				}
				res.writeHead(200, {
					"Content-Type": "text/event-stream",
					"Cache-Control": "no-cache",
					"Connection": "keep-alive"
				});
				res.write("retry: 3000\n\n");
				const unsubscribe = window.onChange((sessionId) => {
					res.write(`data: ${JSON.stringify({ sessionId })}\n\n`);
				});
				req.on("close", () => unsubscribe());
			}
		}
	];
}
//#endregion
//#region src/core/persist.ts
/**
* Durable ledger for the approval-window state, so an armed window survives a
* host restart until its deadline. A plain JSON file keyed per session (the
* dsh-task-board ledger pattern); the host owns the path via config.
* @module @xuhai/dsh-approval-window/persist
*/
/** Read the ledger, tolerating a missing or malformed file (fail-open to empty). */
function readLedger(path) {
	try {
		const raw = readFileSync(path, "utf8");
		const parsed = JSON.parse(raw);
		if (!Array.isArray(parsed)) return [];
		return parsed.filter(isLedgerEntry);
	} catch {
		return [];
	}
}
/** Write the ledger; a bad parent directory is created. */
function writeLedger(path, entries) {
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, JSON.stringify(entries, null, 2), "utf8");
}
/** Shape guard for an untrusted ledger file. */
function isLedgerEntry(value) {
	if (typeof value !== "object" || value === null) return false;
	const entry = value;
	return typeof entry.sessionId === "string" && typeof entry.until === "number" && typeof entry.durationMs === "number" && (entry.priorSandboxMode === null || typeof entry.priorSandboxMode === "string");
}
//#endregion
//#region src/index.ts
/**
* Host approval-window plugin: a per-session time-windowed "trust grant". While
* a session's window is armed, the risk gate on `tools/pre-execute` auto-allows
* low/medium-risk calls and routes high-risk calls to a human confirmation; the
* session's sandbox mode is widened to `danger-full-access` for the window but
* its approval policy stays `ask` (never auto-rejected).
*
* @module @xuhai/dsh-approval-window
*/
/** Default one-click presets (minutes). */
const PRESET_MINUTES = [
	5,
	15,
	30,
	60
];
/**
* Host approval-window service. Requires a confining `ctx.shell` (to read the
* pre-window sandbox mode) and the `tools/pre-execute` seam (the risk gate).
*/
var ApprovalWindowService = class extends Service {
	config;
	static Config = z.object({
		riskRules: z.array(z.object({
			toolName: z.string(),
			pattern: z.string(),
			reason: z.string()
		})),
		ledgerPath: z.string()
	});
	static inject = ["shell", "sessions"];
	window = new ApprovalWindow();
	listeners = /* @__PURE__ */ new Set();
	constructor(ctx, config) {
		super(ctx, "approvalWindow");
		this.config = config;
		ctx.on("tools/pre-execute", (exec, next) => {
			return this.gate(exec, next);
		}, { prepend: true });
		ctx.inject(["webServer"], (webCtx) => {
			for (const route of makeApprovalWindowRoutes(this)) webCtx.webServer.register(route);
		});
		if (this.config.ledgerPath !== void 0) for (const entry of readLedger(this.config.ledgerPath)) this.replay(entry);
		ctx.on("session/created", (session) => {
			const entry = this.window.get(session.id);
			if (entry !== void 0 && entry.until > Date.now() && this.effectiveSandbox(session) !== "danger-full-access") setSandboxMode(session, "danger-full-access");
		});
	}
	/**
	* The risk gate (one execution). Armed + not expired → classify and
	* auto-allow (low/medium) or ask (high); unarmed/expired → delegate to the
	* default pipeline. Expiry lazily clears the window and restores the prior
	* sandbox mode.
	*/
	async gate(exec, next) {
		const agent = exec.agent;
		if (agent === void 0) return next();
		const session = agent.session;
		const now = Date.now();
		if (!this.window.isActive(session.id, now)) {
			if (this.window.get(session.id) !== void 0) {
				this.restoreSandboxAndClear(session);
				return next();
			}
			return next();
		}
		const decision = classifyRisk({
			toolName: exec.name,
			args: exec.arguments
		}, { rules: this.config.riskRules });
		if (decision.risk === "high") return {
			kind: "ask",
			reason: `⚠️ 高风险 (${decision.reason})：窗口已放行常规审批，但此动作可能损坏系统/丢失数据，请确认后执行。`
		};
		return { kind: "allow" };
	}
	/**
	* Arm (or re-arm) a session's window: record the pre-window sandbox mode,
	* widen it to full access, and keep the approval policy unchanged (still
	* `ask`, so the high-risk gate keeps prompting).
	* @param session - the session being granted the window.
	* @param durationMs - window length in ms.
	*/
	arm(session, durationMs) {
		const prior = this.effectiveSandbox(session);
		if (prior !== "danger-full-access") setSandboxMode(session, "danger-full-access");
		this.window.arm(session.id, durationMs, prior);
		this.persist();
		this.notify(session.id);
	}
	/** Disarm (idempotent): restore the pre-window sandbox mode and clear the window. */
	disarm(session) {
		const entry = this.window.get(session.id);
		if (entry !== void 0 && entry.priorSandboxMode !== null && entry.priorSandboxMode !== "danger-full-access") setSandboxMode(session, entry.priorSandboxMode);
		this.window.disarm(session.id);
		this.persist();
		this.notify(session.id);
	}
	/** Whether a session's window is currently active. */
	isActive(session) {
		return this.window.isActive(session.id);
	}
	/** Remaining ms until expiry, or `null` when no active window. */
	remainingMs(session) {
		return this.window.remainingMs(session.id);
	}
	/** The armed window's granted duration in ms, or `null` when none is active. */
	duration(session) {
		const entry = this.window.get(session.id);
		return entry === void 0 || entry.until <= Date.now() ? null : entry.durationMs;
	}
	/** Resolve a session id to a live session, else `undefined`. */
	session(sessionId) {
		return this.ctx.sessions.get(SessionId(sessionId));
	}
	/** Subscribe to arm/disarm changes; returns the unsubscribe disposer. */
	onChange(listener) {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	}
	notify(sessionId) {
		for (const listener of this.listeners) listener(sessionId);
	}
	/** The session's effective sandbox mode (its own fold, else the shell default). */
	effectiveSandbox(session) {
		return effectiveSandboxMode(session.events) ?? this.ctx.shell.sandboxMode ?? null;
	}
	/** Restore a persisted window entry into the live window and re-widen a live session. */
	replay(entry) {
		if (entry.until <= Date.now()) return;
		this.window.restore(entry.sessionId, entry.until, entry.durationMs, entry.priorSandboxMode);
		const session = this.session(entry.sessionId);
		if (session !== void 0 && this.effectiveSandbox(session) !== "danger-full-access") setSandboxMode(session, "danger-full-access");
	}
	/** Persist every active window entry to the ledger (no-op without a path). */
	persist() {
		if (this.config.ledgerPath === void 0) return;
		const entries = this.window.activeIds().map((id) => {
			const entry = this.window.get(id);
			if (entry === void 0) throw new Error("approval-window: active entry missing");
			return {
				sessionId: id,
				until: entry.until,
				durationMs: entry.durationMs,
				priorSandboxMode: entry.priorSandboxMode
			};
		});
		writeLedger(this.config.ledgerPath, entries);
	}
	/** Immediate-expiry path: restore the prior sandbox, clear the window, persist. */
	restoreSandboxAndClear(session) {
		const entry = this.window.get(session.id);
		if (entry !== void 0 && entry.priorSandboxMode !== null && entry.priorSandboxMode !== "danger-full-access") setSandboxMode(session, entry.priorSandboxMode);
		this.window.disarm(session.id);
		this.persist();
		this.notify(session.id);
	}
};
//#endregion
export { ApprovalWindowService, ApprovalWindowService as default, PRESET_MINUTES };
