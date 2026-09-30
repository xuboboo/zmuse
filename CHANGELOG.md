# Changelog

## 1.0.1 — 2026-09-30

ZMuse 全面审计收口：界面零英文残留。

- 清剿最后 16 处用户可见英文串：通知标题（任务需要关注 / 待你审阅 / 需要你补充信息）、任务结果事件（任务已完成 / 已批准的操作已完成）、监控计划步骤与状态（检查来源 / 监控中，将按计划再次检查）、浏览器工具页「返回应用」。
- 新建对话的窗口标题由「侧聊」改为「新对话」，从会话列表选中未命名会话仍显示「侧聊」。
- 全套实机截图换新至当前侧栏布局 UI；官网 `website/` 首次入库（四图版）。
- 回归：215 项单测 0 失败，typecheck 通过，端到端真实浏览委托（Hacker News）全链路中文验证。

## 0.1.0-alpha — 2026-09-15

Initial public OpenMuse alpha.

- Native/web interface using CopilotKit React Native and AG-UI.
- Persistent browser computer, inline PDFs, structured artifacts, and optional Rich Threads integration.
- Durable delegated tasks, reviews/receipts, Ideas, Goals, Tracking, and editable memory.
- Google adapters, supported PDF workflows, and CSV spending summaries.
- Disabled, contract-tested OpenBot adapter for future backend integration.
- Native walkthrough recording, contributor docs, and CI for tests, builds, and real Chromium.
- Fixed Ideas suggesting sent replies or already completed matching work; restored task delegation in the persistent menu.

See [verification](docs/VERIFICATION.md) for actual coverage and [roadmap](ROADMAP.md) for incomplete integrations.
