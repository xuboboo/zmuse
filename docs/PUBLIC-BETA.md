# ZMuse 公测公告

ZMuse（OpenMuse 中文版）想让 AI 拥有一台自己的电脑：一个运行在 Windows 上的中文个人智能体，MIT 开源。它把「AI 聊天框」升级成「会干活的电脑」——你说目标，它规划并执行。当前公测版本为 v1.0.1，代码与文档全部开放，欢迎试用与反馈。

## 公测版能做什么

- **图形化云桌面** —— 应用内直接操作完整 Linux 桌面（Xfce + Firefox，中文环境，可上网），内置 fcitx5 拼音输入法，分辨率自适应已随 v1.0 交付；宿主与桌面之间有剪贴板双向桥，文本往返不必绕路。画面实时呈现，你随时可以亲手接管。
- **真实浏览委托** —— 智能体用真实 Chromium 打开网页搜集信息，浏览过程内嵌对话流、实时可见，看不对就随时接管。浏览器与终端相互隔离，浏览会话与智能体共享同一套持久浏览器。
- **持久任务引擎** —— 任务后台持久执行：计划、断点、租约、崩溃恢复。关窗缩到托盘继续跑，子进程崩溃 3 秒自愈。
- **敏感动作人工审批** —— 发邮件、改日历、删事件等敏感动作零自动执行，必须逐条人工确认后才执行。

## 三步上手

前置要求：Windows 10/11、Node.js 22+、pnpm 10+、Docker Desktop；一个 CopilotKit Intelligence 项目密钥，以及任意 OpenAI 兼容模型密钥（海外直连或国内中转均可）。

**第一步：克隆并构建**（需 Docker Desktop 已启动）

```bat
git clone https://github.com/xuboboo/zmuse.git
cd zmuse
pnpm install --frozen-lockfile
pnpm build:server & pnpm build:web
docker build -t openmuse-computer:local apps/computer
docker build -t openmuse-desktop:local  apps/desktop
```

**第二步：配置 .env**

复制 `.env.example` 为 `.env` 并填入密钥。模型接入走 OpenAI 兼容协议，四个变量即可切换任意中转，无需改代码：

```dotenv
AGENT_BACKEND=model
MODEL=openai/你的模型id
OPENAI_API_KEY=sk-xxx
OPENAI_BASE_URL=https://你的中转/v1
```

常见预设：AgentRouter（`https://agentrouter.org/v1`，GitHub 登录注册，有开发者免费额度）、OpenRouter（`https://openrouter.ai/api/v1`，全球聚合，模型最全），或任意 OpenAI 兼容网关填其 `/v1` 地址。

**第三步：双击 `StartOpenMuse.cmd`**

自动拉起 API、浏览器 worker 与中文界面；关窗缩到托盘，后台任务继续；托盘退出走优雅关停，不伤数据。如需开机自动启动，把 `StartOpenMuse.cmd` 的快捷方式放入开始菜单「启动」文件夹即可。

## 公测须知

- **单用户版**：面向个人部署（共享访问口令模式），不是多租户认证系统。
- **Windows 优先**：一键启动与桌面集成目前面向 Windows 10/11，其他平台暂未适配。
- **接口可能调整**：公测期间配置项与内部接口仍可能变动，升级前请留意更新日志。
- **数据存本地**：运行数据存放在本地 `.openmuse` 目录（含浏览器 profile 等），凭据只进 `.env`；请把这两处当作私密数据保管，勿提交到仓库。
- **安全边界**：图形桌面与 noVNC 仅绑定本机回环；Linux 终端容器禁网、非 root、只读根文件系统。网站、邮件与文档内容对智能体而言是证据而非行动许可，请勿将本项目用于违反当地法律法规的用途。

## 反馈渠道

问题与建议请提交到 GitHub Issues：<https://github.com/xuboboo/zmuse/issues>。报障时请附上复现步骤、`StartOpenMuse.cmd` 的日志输出，以及所用模型预设（密钥脱敏后）。功能建议与缺陷报告同样欢迎，公测期的多数接口调整都来自这类反馈。

## 相关链接

- 官网：<https://xuboboo.github.io/zmuse/>
- Release v1.0.1：<https://github.com/xuboboo/zmuse/releases/tag/v1.0.1>
- 许可：[MIT](https://github.com/xuboboo/zmuse/blob/main/LICENSE)。ZMuse 改造部分同样以 MIT 发布
- 致谢：本项目基于上游 [CopilotKit/OpenMuse](https://github.com/CopilotKit/OpenMuse)（MIT）构建，任务引擎、审批流与 AG-UI 集成均来自它；同时感谢 CopilotKit、noVNC、Xfce 等开源项目。
