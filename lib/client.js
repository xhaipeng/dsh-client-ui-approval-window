window.__ModuleLoader__.load({
	id: "@xuhai/dsh-client-ui-approval-window",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region src/client/host-api.ts
		/**
		* Same-origin transport for the approval-window host API. Mirrors the
		* dsh-task-board pattern: plain `fetch` for state/action and an SSE stream for
		* change pushes, sharing the trust fence the host enforces on `/api/...`.
		* @module @xuhai/dsh-approval-window/host-api
		*/
		/** Base path on the host. */
		const BASE_PATH = "/api/approval-window";
		/** Fetch the JSON body via the host's same-origin route. */
		async function getJson(url) {
			const response = await fetch(url, { headers: { Accept: "application/json" } });
			if (!response.ok) throw new Error(`approval-window: ${response.status} ${response.statusText}`);
			return response.json();
		}
		/** Post a JSON action and return the resulting snapshot. */
		async function postAction(sessionId, body) {
			const response = await fetch(`${BASE_PATH}/action`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Accept: "application/json"
				},
				body: JSON.stringify({
					...body,
					sessionId
				})
			});
			if (!response.ok) throw new Error(`approval-window: ${response.status} ${response.statusText}`);
			return response.json();
		}
		/** Build the inject-face transport bound to the host routes. */
		function createApprovalWindowHostApi() {
			return {
				snapshot: (sessionId) => getJson(`${BASE_PATH}/state?sessionId=${encodeURIComponent(sessionId)}`),
				arm: (sessionId, durationMs) => postAction(sessionId, {
					action: "arm",
					durationMs
				}),
				disarm: (sessionId) => postAction(sessionId, { action: "disarm" }),
				subscribe: (sessionId, onEvent) => {
					const source = new EventSource(`${BASE_PATH}/events`);
					const onMessage = (event) => {
						try {
							if (JSON.parse(event.data).sessionId === sessionId) onEvent(sessionId);
						} catch {}
					};
					source.addEventListener("message", onMessage);
					return () => {
						source.removeEventListener("message", onMessage);
						source.close();
					};
				}
			};
		}
		//#endregion
		//#region src/client/ApprovalWindowButton.tsx
		/** One-click preset durations in minutes. */
		const PRESET_MINUTES = [
			5,
			15,
			30,
			60
		];
		/** Minutes to milliseconds. */
		function minutesToMs(minutes) {
			return Math.round(minutes * 60 * 1e3);
		}
		/**
		* Session-header control: shows the current window state and arms/disarms it.
		* Owns one same-origin host transport (created once) and keeps only its own
		* countdown; every data read goes through the transport, never ctx.
		*/
		function ApprovalWindowButton({ sessionId, t }) {
			const [host] = (0, react.useState)(() => createApprovalWindowHostApi());
			const [snapshot, setSnapshot] = (0, react.useState)(null);
			const [now, setNow] = (0, react.useState)(() => Date.now());
			(0, react.useEffect)(() => {
				let cancelled = false;
				host.snapshot(sessionId).then((value) => {
					if (!cancelled) setSnapshot(value);
				}).catch(() => {});
				const unsubscribe = host.subscribe(sessionId, () => {
					host.snapshot(sessionId).then((value) => {
						if (!cancelled) setSnapshot(value);
					}).catch(() => {});
				});
				return () => {
					cancelled = true;
					unsubscribe();
				};
			}, [sessionId, host]);
			(0, react.useEffect)(() => {
				if (snapshot === null) return;
				setNow(Date.now());
				const timer = setInterval(() => setNow(Date.now()), 1e3);
				return () => {
					clearInterval(timer);
				};
			}, [snapshot]);
			const remaining = (0, react.useMemo)(() => {
				if (snapshot?.armed !== true || snapshot.until === null) return null;
				return Math.max(0, Math.floor((snapshot.until - now) / 1e3));
			}, [snapshot, now]);
			const onArm = (minutes) => {
				host.arm(sessionId, minutesToMs(minutes)).then(setSnapshot).catch(() => {});
			};
			const onDisarm = () => {
				host.disarm(sessionId).then(setSnapshot).catch(() => {});
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", { children: snapshot?.armed === true && remaining !== null ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
				type: "button",
				onClick: onDisarm,
				title: t("status.remaining", { seconds: String(remaining) }),
				children: [
					t("status.armed"),
					" (",
					t("status.remaining", { seconds: String(remaining) }),
					")"
				]
			}) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("status.idle") }), PRESET_MINUTES.map((minutes) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
				type: "button",
				onClick: () => onArm(minutes),
				children: t("preset.minutes", { minutes: String(minutes) })
			}, minutes))] }) });
		}
		//#endregion
		//#region src/client/locales.ts
		/**
		* Approval-window header-action copy.
		* @module @xuhai/dsh-approval-window/locales
		*/
		const NS = "approval-window";
		/** Simplified Chinese copy. */
		const zh = {
			"action.arm": "开启",
			"action.disarm": "关闭",
			"preset.minutes": "{minutes} 分钟",
			"preset.custom": "自定义",
			"status.armed": "审批放行中",
			"status.idle": "审批放行",
			"status.remaining": "剩余 {seconds} 秒"
		};
		/** English copy. */
		const en = {
			"action.arm": "Enable",
			"action.disarm": "Disable",
			"preset.minutes": "{minutes} min",
			"preset.custom": "Custom",
			"status.armed": "Approval easing",
			"status.idle": "Approval easing",
			"status.remaining": "{seconds}s left"
		};
		//#endregion
		//#region src/client/index.ts
		/** Required services for locale registration and header-slot contribution. */
		const inject = [
			"sessions",
			"slots",
			"locale"
		];
		/**
		* Client plugin body: register the dictionary and the header action.
		* @param ctx - client root context.
		*/
		function apply(ctx) {
			ctx.effect(() => ctx.locale.register(NS, {
				zh,
				en
			}), "approval-window: dictionaries");
			ctx.slots.inject("conversation.session.header.actions", () => ctx.slots.register({
				name: "conversation.session.header.actions",
				id: "approval-window",
				order: 30,
				locale: NS
			}, ApprovalWindowButton));
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map