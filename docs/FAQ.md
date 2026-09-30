# 常见问题（公测版）

以下 10 个问题按「症状 → 原因 → 解决」组织，命令均可直接复制到 Windows 命令提示符（cmd）执行。所有路径均以仓库真实代码为准。

## 双击 StartOpenMuse.cmd 后弹出「API 在 90 秒内未就绪」

**症状** 双击 `StartOpenMuse.cmd` 后，窗口长时间不开，最后弹出「API 在 90 秒内未就绪」，并提示查看 `apps/desktop-app/logs/api.log`。

**原因** 桌面壳最多等 API 健康检查 90 秒（`apps/desktop-app/main.js:334`），超时弹窗（`main.js:337-340`）。最常见的两个原因正是弹窗里写的：`.env` 缺 `CPK_INTELLIGENCE_API_KEY`（API 启动即退出，见 `apps/server/src/config.ts:120`，进程反复崩溃 3 次后桌面壳放弃拉起，`main.js:104-107`），或 Docker Desktop 未启动（云桌面/终端功能依赖 Docker）。

**解决**

```bat
type apps\desktop-app\logs\api
docker info
```

- 日志末尾若出现 `OpenMuse requires CPK_INTELLIGENCE_API_KEY`：按提示在仓库根目录执行 `npx copilotkit@latest login` 和 `npx copilotkit@latest project select` 生成密钥，填入 `.env` 的 `CPK_INTELLIGENCE_API_KEY=`（`.env.example:51-53`）。
- `docker info` 报错：先启动 Docker Desktop，等它就绪。
- 改完 `.env` 后**重新双击 `StartOpenMuse.cmd`**（连续崩溃 3 次后本进程内不再自动拉起）。
- 小提示：弹窗里写的 `logs\api.log` 是旧文件名，现行版本写入的日志文件是无扩展名的 `apps\desktop-app\logs\api`（`main.js:97-98`）。

## 提示「端口 8081 已被占用」，界面打不开

**症状** 启动后弹出「端口 8081 已被占用（可能是开发用的 Metro 还在运行）。关闭它之后重新启动 ZMuse。」

**原因** 桌面壳要在 8081 端口伺服中文界面（`apps/desktop-app/main.js:16,325-330`）。你之前跑过 `pnpm dev:web`（Metro 开发服务器，同样监听 8081，`apps/mobile/package.json:8`），那个终端还没关。

**解决** 关掉运行 Metro 的那个终端窗口；找不到就用：

```bat
netstat -ano | findstr :8081 | findstr LISTENING
taskkill /PID 上面最后一列的数字 /F
```

然后重新双击 `StartOpenMuse.cmd`。

## 界面能打开，但提示浏览器功能暂不可用（worker 未就绪）

**症状** 主界面正常，但真实浏览/接管浏览器不可用，日志里有「worker 未就绪（浏览器功能暂不可用），界面仍会打开」。

**原因** 浏览器 worker 是独立子进程，监听 8790（`apps/worker/src/index.ts:12-13`），桌面壳只等它 60 秒（`main.js:335,342`），超时不影响界面。常见原因：worker 反复崩溃（60 秒内退出 3 次后停止自动拉起，`main.js:104-107`）或 8790 被其他程序占用。

**解决**

```bat
type apps\desktop-app\logs\worker
netstat -ano | findstr :8790 | findstr LISTENING
```

按日志末尾的错误处理；若 8790 被占用，结束占用进程（同上 `taskkill`）。之后**托盘图标右键退出、再双击 `StartOpenMuse.cmd`** 重新拉起。日志文件是无扩展名的 `apps\desktop-app\logs\worker`（`main.js:97-98`）。

## 想用自己的模型中转，`.env` 怎么配

**症状** 不用海外直连，想接国内中转或其他 OpenAI 兼容网关。

**原因** 后端按 `MODEL` 字符串里的「厂商/模型」解析模型（`apps/server/src/engine/tanstack-agent.ts:19-31`），`openai` 厂商会把请求发往 `OPENAI_BASE_URL`；网关自带的厂商前缀要原样保留（`tanstack-agent.ts:54-64` 对识别不了的厂商会给出同样提示）。

**解决** 在 `.env` 里写四行（预设表见 `README.md` 「模型接入预设」，`.env.example:12-23` 同款说明）：

```dotenv
AGENT_BACKEND=model
MODEL=openai/你的模型id
OPENAI_API_KEY=sk-xxx
OPENAI_BASE_URL=https://你的中转/v1
```

- 中转的模型 id 若自带厂商前缀，例如 `deepseek/deepseek-chat`，就写成 `MODEL=openai/deepseek/deepseek-chat`。
- 常用预设：AgentRouter `https://agentrouter.org/v1`，OpenRouter `https://openrouter.ai/api/v1`。
- 改完重启 `StartOpenMuse.cmd` 生效。

## 云桌面里打不出中文

**症状** 图形化云桌面（Xfce）里无法输入中文，或切不出拼音。

**原因** 中文输入法已内置在桌面镜像里：`apps/desktop/start-desktop.sh:24-27` 会启动 fcitx5 拼音，注释写明「Ctrl+Space 切换（经 noVNC 键盘事件透传可用）」；镜像内安装了 `fcitx5`、`fcitx5-chinese-addons` 并预设 `zh_CN.UTF-8`（`apps/desktop/Dockerfile:3,14-15`）。

**解决** 先点一下云桌面窗口让它获得焦点，然后按 **Ctrl+Space** 在中/英之间切换。若仍不行，说明容器还是旧镜像：按下一节重建桌面镜像并重启桌面。

## 云桌面里复制粘贴不通（剪贴板不通）

**症状** 在本机复制的内容粘贴不进云桌面，或反过来。

**原因** 剪贴板靠桌面壳每 1.5 秒轮询容器内的 `xclip` 完成双向同步（`apps/desktop-app/desktop-bridge.js:113-129`，轮询间隔见 `main.js:308-317`）。旧镜像里没有 `xclip` 时桥会静默失效（`xclip` 由 `apps/desktop/Dockerfile:21` 安装）。

**解决** 重建带 `xclip` 的镜像，删掉旧容器，再让桌面服务用新镜像重建（服务发现容器用的就是下面这个过滤条件，`desktop-bridge.js:77`）：

```bat
docker build -t openmuse-desktop:local apps/desktop
docker ps --filter "label=dev.openmuse.managed=desktop-v1" --format "{{.Names}}"
docker rm -f 上一步输出的容器名
```

然后重新打开云桌面（或重启 `StartOpenMuse.cmd`）。注意：只重建镜像、不删旧容器是不够的——桌面服务重启时只会把旧容器 `start` 回来（`apps/server/src/desktop.ts:163-169`），不会换镜像。

## 窗口打开后白屏或界面显示异常

**症状** ZMuse 窗口开了，但内容一片白，或界面缺图缺字、行为异常。

**原因** 界面是预导出的 Web 静态产物（`apps/mobile/dist/web`，由 `main.js:14` 指定并在 `main.js:20-22` 检查）。Metro 的打包缓存损坏或产物过期时会加载异常。

**解决** 清缓存重新导出，再重启桌面程序：

```bat
pnpm --dir apps/mobile exec expo export --platform web --clear --output-dir dist/web
```

`--clear` 清 bundler 缓存。`--output-dir dist/web` 不能省：仓库的 `build:web` 脚本就是导出到 `dist/web`（`apps/mobile/package.json:9`），而 expo 默认输出目录是 `dist`，不指定会导错位置、桌面壳读到的仍是旧产物。若启动时直接弹「缺少 Web 产物」，说明还没导出过，先在仓库根目录跑 `pnpm build:web`。

## 控制台中文乱码，或双击启动器报「找不到路径」

**症状** 在 cmd 里 `type` 日志时中文全是乱码；或双击 `StartOpenMuse.cmd` 报「系统找不到指定的路径」后闪退。

**原因** 中文 Windows 的 cmd 默认 GBK（代码页 936），而程序日志按 UTF-8 写入（`apps/desktop-app/main.js:68,97-98`，日志文件实测为 UTF-8），显示必然乱码。另外 `StartOpenMuse.cmd` 用 `%~dp0` 相对定位再启动（`StartOpenMuse.cmd:5-6`），仓库路径含中文或特殊字符容易让这一步失败（该脚本本身是纯 ASCII 文件，不要用会改编码的编辑器改它）。

**解决** 把仓库放在纯英文、不含空格的路径（如 `E:\openmuse`）后重新双击启动器。需要看日志时先切换代码页再查看：

```bat
chcp 65001
type apps\desktop-app\logs\api
```

## 对话历史丢失或数据异常

**症状** 打开后会话列表为空、历史丢失，或日志出现数据库相关报错。

**原因** 全部本地数据（会话、任务、审批活动）存在 `.openmuse` 目录的内嵌 PGlite 数据库里（`apps/server/src/index.ts:8` 用 `.openmuse/postgres`，`apps/server/src/db.ts:131`；目录名由 `.env` 的 `DATA_DIR` 决定，默认 `.openmuse`，`.env.example:9`），浏览器配置另存于 `.openmuse\browser-profiles`（`apps/worker/src/index.ts:8`）。进程被强杀（任务管理器结束进程、直接关机）可能损坏数据文件。

**解决** 平时只用托盘「退出（停止后台任务）」退出——它会先调用 API 的优雅关停接口（`main.js:146-150` → `apps/server/src/index.ts:29-34`）落盘再退。已经异常时，按顺序隔离恢复：

```bat
xcopy /e /i /h .openmuse .openmuse-backup
ren .openmuse\postgres postgres.broken
```

然后重新启动 `StartOpenMuse.cmd`：应用会重建一个空库（`db.ts:138-140`），旧数据保留在 `.openmuse-backup` 里备查。另外，重启后「执行中」的审批动作会被标记为 `outcome_unknown`（`db.ts:91-95`），请到对应服务商核对动作是否已发出，再决定是否重发。

## 任务通知里的「待你审阅」是什么

**症状** 任务通知或活动记录里出现「待你审阅」，任务停在中间不再往下走。

**原因** 这不是故障，是人工审批机制：发邮件、建/改/删日历这四类敏感动作零自动执行（`README.md`「安全与隐私」；动作类型定义在 `packages/domain/src/index.ts:117-131`）。智能体只能生成「提案」，提案进入 `awaiting_review` 状态并写入一条「待你审阅」活动（`apps/server/src/actions.ts:76,99`），任务随之转为 `waiting_approval` 并推送同名通知（`apps/server/src/engine/service.ts:877`）。

**解决** 到对应任务下点「等待你审阅」卡片里的**审阅操作**按钮（`apps/mobile/src/agent-ui.tsx:454-462`），核对操作内容与账户后批准或拒绝；拒绝则不产生任何变更，批准后立即执行（`actions.ts:161-165`）。注意提案 **30 分钟**过期（`actions.ts:88`），过期后批准会提示重新发起（`actions.ts:134`）。
