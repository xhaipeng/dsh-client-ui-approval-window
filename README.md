# dsh-client-ui-approval-window

A DeepSeek Harness plugin that grants a session a configurable, time-bounded
"approval easing" window: inside the window, low/medium-risk tool calls are
auto-approved (no prompt), while high-risk calls that could damage the system or
destroy data are always routed to a human confirmation with a strong warning.
Mounted without any DSH source change.

## What it does

- Per-session trust window. A session header button arms/disarms a window of
  5m / 15m / 30m / 60m (or a custom duration).
- Risk gate at `tools/pre-execute`. Inside an active window the gate auto-allows
  calls whose tool name + arguments do not match a destructive pattern, and
  returns an `ask` (confirmation) for calls that do: recursive deletion
  (`rm -rf`), dangerous git (force push, `reset --hard`, `clean -fd`), database
  destruction (`DROP`/`TRUNCATE`/`DELETE` without `WHERE`), overwriting critical
  config/credentials, and system/service/process operations (`kill -9`,
  recursive `chmod`/`chown`).
- Widens access, not judgement. Arming sets the session sandbox mode to
  `danger-full-access` while keeping the approval policy at `ask`, so low/medium
  risk runs without friction but high-risk still demands a human decision.
- Durable state. The window survives a host restart until its deadline, and
  restores the pre-window sandbox mode on expiry/disarm.
- Custom risk rules. Extra destructive patterns can be added via plugin config
  (`riskRules`).

## Requirements

- DeepSeek Harness (dsh) web profile.
- Node 22.19+ or 24+.

## Install

```sh
dsh plugin --profile web add github:<owner>/dsh-client-ui-approval-window
```

## Host API (same-origin)

- `GET /api/approval-window/state?sessionId=...` - window snapshot.
- `POST /api/approval-window/action` - `{ action: 'arm'|'disarm', sessionId, durationMs }`.
- `SSE /api/approval-window/events` - change pushes.

All requests are gated by a loopback trust fence.

## Security model

The window is a user-level grant to a specific session; it widens access but
never the judgement of a destructive action. High-risk calls are always
confirmed by the user. The approval policy stays `ask` (auto-reject is never
used), so a destructive action can only run after an explicit human decision.
