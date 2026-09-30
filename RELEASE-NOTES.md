# ZMuse 发布说明

## v1.0.0-beta（公测版）— 2026-09-30

ZMuse 首个公开测试版：国产版个人智能体工作台。你说目标，它规划并执行——把「AI 聊天框」升级成「会干活的电脑」。

### 核心能力

- **图形化云桌面** —— 应用内直接操作完整 Linux 桌面：Xfce + Firefox（中文环境，内置 fcitx5 拼音输入法，分辨率自适应），画面实时可见，noVNC 仅绑定本机回环
- **真实浏览委托** —— 智能体用真实 Chromium 打开网页搜集信息，过程内嵌对话流，随时接管
- **持久任务** —— 委托任务后台持久执行：计划、断点、租约、崩溃恢复；关窗缩到托盘，任务继续跑
- **人工审批** —— 发邮件、改日历、删事件等敏感动作零自动执行，必须逐条人工确认
- **Linux 终端与文件工作区** —— 有界命令（单条 30 秒上限）、`/workspace` 持久化；容器禁网、非 root、只读根文件系统，与浏览器相互隔离
- **目标监控** —— 定时盯网页变化、文字出现、价格阈值
- **全中文** —— 界面与云桌面环境全站中文化（Noto CJK + zh_CN），文档与提示均为中文
- **模型接入自由** —— 任意 OpenAI 兼容端点，`AgentRouter` / `OpenRouter` / 自建中转在 `.env` 里四个变量切换，无需改代码

### 已知边界（公测期）

- **单用户** —— 共享访问口令模式，不是多租户认证系统
- **需要 Docker Desktop** —— 图形化云桌面与终端/文件容器依赖本机 Docker
- **Intelligence 云依赖** —— 对话持久化与回放依赖 CopilotKit Intelligence 项目密钥（`CPK_INTELLIGENCE_API_KEY`），是当前唯一的外部云依赖，本地化在路线图中
- **Windows 桌面壳** —— `StartOpenMuse.cmd` 与托盘仅适配 Windows 10/11；其他平台可用开发三件套运行后端

### 安装方式

**方式 A：Windows 桌面程序（推荐）** —— 克隆仓库、`pnpm install`、构建前后端与两个 Docker 镜像，复制 `.env.example` 为 `.env` 填入密钥，双击 `StartOpenMuse.cmd`。桌面壳托管 API、浏览器 worker 与中文界面，子进程崩溃 3 秒自愈，退出走优雅关停。详见 [README 快速开始](README.md#-快速开始)。

**方式 B：开发三件套**

```sh
pnpm dev            # API 8787
pnpm dev:browser    # 浏览器 worker 8790
pnpm dev:web        # Web 8081
```

### 致谢

ZMuse 基于 [CopilotKit/OpenMuse](https://github.com/CopilotKit/OpenMuse)（MIT）构建：任务引擎、审批流、目标监控与 AG-UI 集成均来自上游。感谢 [CopilotKit](https://github.com/CopilotKit/CopilotKit)、[noVNC](https://github.com/novnc/noVNC) 与 [Xfce](https://xfce.org/)。

公测期间发现问题欢迎提 [issue](https://github.com/xuboboo/zmuse/issues)。
