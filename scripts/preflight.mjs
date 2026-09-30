#!/usr/bin/env node
/**
 * OpenMuse 新用户环境自检脚本
 *
 * 用法：
 *   - 命令行：在仓库根目录执行  node scripts\preflight.mjs
 *   - 双击：   双击同目录下的  preflight.cmd
 *
 * 约定：
 *   - 全部检查通过 → 退出码 0；任何一项不通过 → 退出码 1。
 *   - 输出全部为中文，✓ 表示通过，✗ 表示不通过，不通过时给出「对策」。
 *   - 对仓库根 .env 只解析键名做存在性核对，绝不读取、保存或打印任何值。
 *   - 本脚本只新增文件、只读不改仓库里的任何现有代码。
 */

import { spawnSync } from "node:child_process";
import net from "node:net";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// ── 仓库根目录：本脚本位于 <仓库根>/scripts/ 下，向上退一级即仓库根 ──
// 用 import.meta.url 定位，保证从任何工作目录运行都能找到仓库根的 .env
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const envPath = path.join(repoRoot, ".env");

// ── 检查项常量（依据 README「快速开始」与 apps/server/src/config.ts、infra/compose.yaml）──

// .env 中必须出现的键名（只核对键名是否出现，与值无关）
const REQUIRED_ENV_KEYS = [
  "CPK_INTELLIGENCE_API_KEY",
  "AGENT_BACKEND",
  "MODEL",
  "OPENAI_API_KEY",
];

// OpenMuse 各服务需要的本地端口：8081 网页界面、8787 API（config.ts 默认 PORT）、8790 浏览器 worker（compose.yaml）
const REQUIRED_PORTS = [8081, 8787, 8790];

// 必须已构建的本地 Docker 镜像与对应的构建命令（README「方式 A」原文）
const REQUIRED_IMAGES = [
  {
    image: "openmuse-desktop:local",
    build: "docker build -t openmuse-desktop:local apps/desktop",
  },
  {
    image: "openmuse-computer:local",
    build: "docker build -t openmuse-computer:local apps/computer",
  },
];

// ── 工具函数 ──

/**
 * 静默运行一条子进程命令。
 * - shell: true：Windows 上 pnpm / docker 通常是 .cmd 垫片，必须经 shell 调起才能找到。
 * - 静默失败：失败时不回显子进程的 stderr，只返回 ok: false，由调用方输出中文对策。
 */
function runCommand(command, args, timeoutMs = 30_000) {
  let r;
  try {
    r = spawnSync(command, args, {
      shell: true,
      timeout: timeoutMs,
      encoding: "utf8",
      windowsHide: true,
    });
  } catch {
    return { ok: false, output: "" };
  }
  // error 非空表示命令不存在 / 超时被杀；status 非 0 表示命令自身失败
  if (r.error || r.status !== 0) return { ok: false, output: "" };
  return { ok: true, output: (r.stdout ?? "").trim() };
}

/**
 * 用 net.createServer 试绑定 127.0.0.1:port 探测端口是否空闲：
 *   - 绑定成功（listening）→ 端口空闲，随即关闭探测用的服务端；
 *   - EADDRINUSE → 已被占用；
 *   - 其他错误（如 EACCES 无权限）→ 视为不可用，附上错误码。
 * 只探测回环地址：OpenMuse 服务都监听本机，且不会触发 Windows 防火墙弹窗。
 */
function probePort(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", (err) => {
      resolve({ free: false, code: err?.code ?? "UNKNOWN" });
    });
    server.once("listening", () => {
      server.close(() => resolve({ free: true, code: "" }));
    });
    server.listen(port, "127.0.0.1");
  });
}

/**
 * 从 .env 文本中只提取键名集合。
 * 安全约定：逐行取第一个「=」之前的部分作为键名，等号之后的值当场丢弃，
 * 不存入任何变量、不打印，因此本函数全程接触不到任何密钥值。
 */
function parseEnvKeys(text) {
  const keys = new Set();
  for (const rawLine of text.split(/\r?\n/)) {
    let line = rawLine.trim();
    if (!line || line.startsWith("#") || line.startsWith(";")) continue; // 跳过空行与注释
    if (line.startsWith("export ")) line = line.slice(7).trim(); // 兼容 export KEY=... 写法
    const eq = line.indexOf("=");
    if (eq <= 0) continue; // 没有等号、或等号前没有键名，跳过
    keys.add(line.slice(0, eq).trim()); // 只留键名；等号右边的值直接被丢弃
  }
  return keys;
}

// ── 检查项 ──

// 1) Node ≥ 22（读 process.version，对应 package.json 的 engines.node: ">=22"）
function checkNode(results) {
  const major = Number(process.versions.node.split(".")[0]);
  const ok = major >= 22;
  results.push({
    name: "Node.js 版本 ≥ 22",
    ok,
    lines: [ok ? `当前 ${process.version}，满足要求` : `当前 ${process.version}，低于要求的 22`],
    hints: ok
      ? []
      : [
          "到 https://nodejs.org/ 安装 Node.js 22 LTS（或用 nvm-windows / fnm 安装 22.x），",
          "装完后重开终端窗口，再重新运行本脚本。",
        ],
  });
}

// 2) pnpm 可用（子进程跑 pnpm -v）
function checkPnpm(results) {
  const r = runCommand("pnpm", ["-v"]);
  const ok = r.ok && /^\d/.test(r.output);
  results.push({
    name: "pnpm 可用",
    ok,
    lines: [ok ? `版本 ${r.output}` : "命令 pnpm -v 执行失败：未安装，或不在 PATH 中"],
    hints: ok
      ? []
      : [
          "执行 npm install -g pnpm 安装（Node 22 自带 corepack，也可 corepack enable 后重开终端）。",
          "装完后重开终端窗口，确认 pnpm -v 能打印版本号，再重跑本脚本。",
        ],
  });
}

// 3) Docker 可用（子进程跑 docker info；静默失败即 ✗）
function checkDocker(results) {
  const r = runCommand("docker", ["info"], 30_000);
  const ok = r.ok;
  results.push({
    name: "Docker 可用",
    ok,
    lines: [ok ? "docker info 正常，Docker 守护进程已在运行" : "docker info 执行失败：Docker 未安装，或守护进程未运行"],
    hints: ok
      ? []
      : [
          "启动 Docker Desktop，等系统托盘的鲸鱼图标就绪（不再转圈）后，重新运行本脚本。",
          "若尚未安装：https://www.docker.com/products/docker-desktop/ 下载安装后启动一次。",
        ],
  });
  return ok; // 后面的镜像检查依赖 Docker 可用
}

// 4) 端口 8081 / 8787 / 8790 是否空闲
async function checkPorts(results) {
  const lines = [];
  const hints = [];
  let allFree = true;
  for (const port of REQUIRED_PORTS) {
    const { free, code } = await probePort(port);
    allFree = allFree && free;
    lines.push(free ? `端口 ${port}：空闲` : `端口 ${port}：被占用${code && code !== "EADDRINUSE" ? `（错误码 ${code}）` : ""}`);
    if (!free) {
      hints.push(
        `端口 ${port} 被占用时的排查三步：` +
          `① netstat -ano | findstr :${port} 找到占用行（最后一列是 PID）；` +
          `② tasklist /fi "PID eq <PID>" 看是哪个程序；` +
          `③ 确认无用后 taskkill /PID <PID> /F 结束它。`,
      );
    }
  }
  if (!allFree) {
    hints.push(
      "常见原因是上一次 OpenMuse 没退干净：关闭旧的 OpenMuse 窗口/托盘进程后重跑。" +
        "PowerShell 也可一条命令定位占用进程：Get-Process -Id (Get-NetTCPConnection -LocalPort <端口>).OwningProcess",
    );
  }
  results.push({
    name: `端口 ${REQUIRED_PORTS.join(" / ")} 是否空闲`,
    ok: allFree,
    lines,
    hints,
  });
}

// 5) 仓库根 .env 是否存在；存在则只核对键名（绝不读取或打印任何值）
function checkEnvFile(results) {
  if (!fs.existsSync(envPath)) {
    results.push({
      name: "仓库根 .env 配置文件",
      ok: false,
      lines: [`没有找到 ${envPath}`],
      hints: [
        "在仓库根目录执行：copy .env.example .env",
        "然后用记事本/编辑器打开 .env，填入下列 4 个键的值：" + REQUIRED_ENV_KEYS.join("、"),
        "（.env 含密钥，不要截图外发、不要提交进 git）",
      ],
    });
    return;
  }

  // 读入文件后立刻只保留键名集合，值一律丢弃、不打印
  let keys;
  try {
    keys = parseEnvKeys(fs.readFileSync(envPath, "utf8"));
  } catch (err) {
    results.push({
      name: "仓库根 .env 配置文件",
      ok: false,
      lines: [`.env 存在，但读取失败（${err.code ?? err.message}）`],
      hints: ["确认文件未被其他程序独占锁定，且当前用户有读取权限，然后重跑本脚本。"],
    });
    return;
  }

  const present = [];
  const missing = [];
  for (const key of REQUIRED_ENV_KEYS) {
    if (keys.has(key)) present.push(key);
    else missing.push(key);
  }
  const ok = missing.length === 0;
  const lines = [`.env 存在（${envPath}）`];
  if (ok) {
    lines.push(`· 必需键全部出现（共 ${present.length} 个，只核对键名，未读取任何值）`);
  } else {
    lines.push(`· 已出现：${present.join("、") || "（无）"}`);
    lines.push(`· 缺少：${missing.join("、")}`);
  }
  results.push({
    name: "仓库根 .env 配置文件",
    ok,
    lines,
    hints: ok
      ? []
      : [
          "用编辑器打开仓库根的 .env，补上缺少的键（只加键名和值即可，不要动其他行）。",
          "对应密钥的获取方式见 README「快速开始 / 模型接入预设」一节。",
        ],
  });
}

// 6) docker 镜像 openmuse-desktop:local 与 openmuse-computer:local 是否存在
function checkDockerImages(results, dockerOk) {
  if (!dockerOk) {
    // Docker 不可用时无法查询镜像，按未通过处理并指回上一项
    results.push({
      name: "Docker 镜像 openmuse-desktop:local / openmuse-computer:local",
      ok: false,
      lines: ["跳过：Docker 不可用，无法查询本地镜像列表"],
      hints: ["先完成上面「Docker 可用」一项（启动 Docker Desktop），再重新运行本脚本。"],
    });
    return;
  }

  const r = runCommand("docker", ["images", "--format", "{{.Repository}}:{{.Tag}}"], 30_000);
  if (!r.ok) {
    results.push({
      name: "Docker 镜像 openmuse-desktop:local / openmuse-computer:local",
      ok: false,
      lines: ["docker images 查询失败"],
      hints: ["重跑一次本脚本；若仍失败，重启 Docker Desktop 后再试。"],
    });
    return;
  }

  const existing = new Set(r.output.split(/\r?\n/).map((s) => s.trim()).filter(Boolean));
  const missing = REQUIRED_IMAGES.filter((it) => !existing.has(it.image));
  const ok = missing.length === 0;
  const lines = [ok ? "本地镜像齐全" : `缺少 ${missing.length}/${REQUIRED_IMAGES.length} 个本地镜像`];
  for (const it of REQUIRED_IMAGES) {
    lines.push(`· ${it.image}：${existing.has(it.image) ? "存在" : "缺失"}`);
  }
  results.push({
    name: "Docker 镜像 openmuse-desktop:local / openmuse-computer:local",
    ok,
    lines,
    hints: ok
      ? []
      : missing.map((it) => `在仓库根目录执行：${it.build}`),
  });
}

// ── 汇总输出 ──

function printCheck(index, total, item) {
  console.log(`检查 ${index}/${total}：${item.name}`);
  const lines = Array.isArray(item.lines) ? item.lines : [item.lines];
  lines.forEach((line, i) => {
    const mark = i === 0 ? (item.ok ? "✓" : "✗") : " ";
    console.log(`  ${mark} ${line}`);
  });
  for (const hint of item.ok ? [] : item.hints) {
    console.log(`  对策：${hint}`);
  }
  console.log("");
}

async function main() {
  const results = [];
  checkNode(results); // 1
  checkPnpm(results); // 2
  const dockerOk = checkDocker(results); // 3
  await checkPorts(results); // 4
  checkEnvFile(results); // 5
  checkDockerImages(results, dockerOk); // 6

  const total = results.length;
  const failed = results.filter((r) => !r.ok);
  console.log("==============================================");
  console.log(" OpenMuse 新用户环境自检");
  console.log("==============================================");
  console.log("");
  results.forEach((item, i) => printCheck(i + 1, total, item));

  console.log("----------------------------------------------");
  console.log(`自检完成：共 ${total} 项，通过 ${total - failed.length} 项，未通过 ${failed.length} 项。`);
  if (failed.length === 0) {
    console.log("✓ 全部通过！可以按 README 继续：pnpm install --frozen-lockfile，然后双击 StartOpenMuse.cmd");
    process.exitCode = 0;
  } else {
    console.log(`✗ 有 ${failed.length} 项未通过：请按上面各项的「对策」处理后，重新运行本脚本。`);
    process.exitCode = 1;
  }
}

// 兜底：脚本自身异常也按失败退出，并给出中文提示（不输出任何环境变量值）
main().catch((err) => {
  console.error(`✗ 自检脚本自身运行出错：${err?.message ?? err}`);
  process.exitCode = 1;
});
