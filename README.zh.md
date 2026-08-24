# dsh-client-ui-approval-window

一个 DeepSeek Harness 插件：为某个会话开启一段可配置、限时长的"审批放行"窗口。窗口期内低/中风险工具调用自动放行（不弹审批），而可能损坏系统/丢失数据的高风险调用 always 交由人工确认并给出强警告。全程不修改 DSH 源码。

## 功能

- 按会话的信任窗口。会话头部按钮开启/关闭 5/15/30/60 分钟（或自定义时长）窗口。
- `tools/pre-execute` 风险门。窗口内，工具名+参数未命中破坏性模式的调用自动放行（allow）；命中的返回 ask（确认）当用户确认：递归删除（`rm -rf`）、危险 git（force push / `reset --hard` / `clean -fd`）、数据库破坏（`DROP`/`TRUNCATE`/无 `WHERE` 的 `DELETE`）、覆盖关键配置/凭证、系统/服务/进程操作（`kill -9`、递归 `chmod`/`chown`）。
- 放宽访问，不放宽判断。arm 把会话沙盒模式切到 `danger-full-access`，但审批策略保持 `ask`——低/中风险无摩擦运行，高风险仍要人决断。
- 状态持久化。窗口重启后仍生效直到到期；到期/关闭恢复窗口前沙盒模式。
- 可扩展风险规则。通过插件配置（`riskRules`）增加额外破坏性模式。

## 要求

- DeepSeek Harness（dsh）web profile。
- Node 22.19+ 或 24+。

## 安装

```sh
dsh plugin --profile web add github:<owner>/dsh-client-ui-approval-window
```

## 同源 API

- `GET /api/approval-window/state?sessionId=...` — 窗口快照。
- `POST /api/approval-window/action` — `{ action: 'arm'|'disarm', sessionId, durationMs }`。
- `SSE /api/approval-window/events` — 变更推送。

所有请求经 loopback 信任栅栏校验。

## 安全模型

窗口是对某会话的用户级授权：放宽访问，但绝不放宽对破坏性动作的判断。高风险调用 always 由用户确认；审批策略保持 `ask`（从不用自动拒绝），所以破坏性动作只能经人工明确决断后执行。
