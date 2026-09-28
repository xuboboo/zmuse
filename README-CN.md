# OpenMuse 国产版 · v1 交付说明

> 定位：**国产化 personal-agent 工作台，第一版面向单用户**。
> 在上游 CopilotKit/OpenMuse（MIT）基础上完成：图形化云桌面（单用户 VM 编排）、全新中文界面、
> 国产可用的模型接入（OpenAI 兼容中转）与中文桌面环境。

## 架构总览

```
浏览器（中文 UI，localhost:8081）
  ├── 对话/任务/目标/文档 —— AG-UI → API 服务器（Hono + CopilotKit Runtime，8787）
  │        ├── 持久任务引擎（SQL 租约，可崩溃恢复）
  │        ├── 审批流（发邮件/改日历需人工 review）
  │        ├── 浏览器 worker（8790，真实 Chromium，可接管）
  │        ├── Linux 电脑容器（终端 + 文件，禁网，30s 命令上限）
  │        └── 图形化桌面容器（Xfce4 + Firefox，noVNC 6080，仅本机回环）
  ├── 模型：任意 OpenAI 兼容中转（OPENAI_BASE_URL + OPENAI_API_KEY）
  └── 会话持久化：CopilotKit Intelligence 云（v2 计划替换为本地实现）
```

## 快速启动

### 方式 A：Windows 桌面程序（推荐，一键启动）

```sh
pnpm install --frozen-lockfile
pnpm build:server              # API 产物
pnpm build:web                 # 中文界面产物（apps/mobile/dist/web）
```

双击仓库根目录的 **启动OpenMuse.cmd**（或 `cd apps/desktop-app && npx electron .`）。

桌面壳会自动：拉起 API 与浏览器 worker、在本机 8081 端口伺服中文界面并开窗；
关窗缩到托盘（后台任务继续）；子进程崩溃 3 秒内自动重启（自愈守护）；
托盘"退出"走优雅关停（停止任务 → 关闭数据库），不会留下需要恢复的数据库。
日志在 `apps/desktop-app/logs/`。注意：使用桌面版时请关闭 `pnpm dev:web`，
避免 8081 端口冲突。

### 方式 B：手动三件套（开发模式）

```sh
pnpm dev                    # 终端1：API 8787
pnpm dev:browser            # 终端2：浏览器 worker 8790
pnpm dev:web                # 终端3：Web 8081
```

## v1 功能矩阵（全部经过端到端验证）

| 能力 | 状态 | 验证 |
| --- | --- | --- |
| 中文界面（导航/首页/输入区/电脑面板/菜单） | ✅ | webui-e2e「中文界面」 |
| 真实模型对话往返（gpt-6-luna 经中转） | ✅ | webui-e2e |
| 会话云持久化与刷新回放（Rich Threads） | ✅ | webui-e2e |
| 智能体真实浏览（Chromium + 内联画面 + 接管） | ✅ | HN 委托实测 |
| **图形化云桌面（Xfce + Firefox，应用内实时画面）** | ✅ | webui-e2e + 截图 |
| Linux 终端 + 文件工作区（禁网，卷持久） | ✅ | test:computer 冒烟 |
| 委托任务/审批/监控告警/文档表单/财务 | ✅ | API 级全流程实测 |
| 单元回归 206 例 / typecheck / lint | ✅ 0 挂 | 与基线一致 |

验收脚本：`bash artifacts/e2e/post-key-check.sh`（5 项）与
`node artifacts/e2e/webui-e2e.mjs`（4 项）。

## 与官方 OpenMuse 的差异

- 新增官方没有的**图形化云桌面**（上游 ROADMAP 的 future work，此处已实现单用户版）
- 全新中文 UI 与中文桌面环境（Noto CJK / zh_CN locale / Firefox 起始页）
- 模型层支持任意 OpenAI 兼容中转，无需海外直连
- 其余继承上游：MIT 协议、任务引擎、审批流、AG-UI 协议

## 已知边界（诚实清单）

- **单用户**：一个部署一个主人（共享访问口令模式）；v2 再做多人
- 桌面容器**可上网**（桌面浏览是其用途），与终端容器的禁网边界是两套独立环境
- 桌面内中文输入：用 noVNC 侧栏文本框（Unicode 透传）；桌面内 IME 未配置
- 终端非交互 PTY：只有有界一次性命令，不支持全屏程序
- **会话持久化依赖 CopilotKit 云**（海外服务）：v2 国产化的头号改造点
- 邮件/日历深处的个别动态拼接文案仍有少量英文（主界面已全中文）

## v2 方向（国产化路线）

1. 会话持久化本地化：以本地 thread store 替换 Intelligence 云依赖（接口边界已清晰，测试已有 mock 先例）
2. 多用户 VM 编排：容器/微 VM 按用户隔离，配额与网络策略
3. 国产模型直连适配（通义/智谱/DeepSeek 等，当前中转方案已兼容 OpenAI 协议）
4. 桌面体验增强：桌面内 IME、分辨率自适应、音频
5. 输入法级中文体验与残余动态文案补全
