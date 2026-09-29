// ZMuse 云桌面桥（Electron 主进程侧）：
// 1. 分辨率自适应：渲染端上报视口尺寸 → 容器内 xrandr 实际调整 Xvfb 分辨率
// 2. 剪贴板双向桥：宿主剪贴板 ⇄ 桌面 X 剪贴板（xclip），带防回环追踪
// 容器发现：按 DesktopService 写入的 dev.openmuse.managed=desktop-v1 标签查找。
// 所有调用均为 spawn("docker", [字面量, ..., 已校验变量]) 形式，无 shell、无拼接。
const { spawn } = require("node:child_process");

const deps = {
  log: () => {},
  readHostClipboard: () => "",
  writeHostClipboard: () => {},
};
let containerName = null;
let lastPushed = null; // 宿主 → 桌面：最近一次推送的内容（防回环）
let lastPulled = null; // 桌面 → 宿主：最近一次拉取的内容（防回环）
let pollTimer = null;

// 白名单校验：容器名只允许 Docker 名称字符且不以 - 开头（杜绝选项注入）。
function safeContainerName(name) {
  return typeof name === "string" && /^[A-Za-z0-9][A-Za-z0-9_.-]{0,120}$/.test(name) ? name : null;
}

// 白名单校验：分辨率只能是「数字 x 数字」形态（640x480 ~ 3840x2160）。
function safeMode(width, height) {
  return Number.isSafeInteger(width) &&
    Number.isSafeInteger(height) &&
    width >= 640 &&
    width <= 3840 &&
    height >= 480 &&
    height <= 2160
    ? `${width}x${height}`
    : null;
}

function init(d) {
  deps.log = d.log ?? deps.log;
  deps.readHostClipboard = d.readHostClipboard ?? deps.readHostClipboard;
  deps.writeHostClipboard = d.writeHostClipboard ?? deps.writeHostClipboard;
  if (d.intervalMs > 0 && !pollTimer) {
    pollTimer = setInterval(() => tick().catch(() => {}), d.intervalMs);
    pollTimer.unref?.();
  }
}

function stop() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
}

function runDocker(args, timeoutMs, input) {
  return new Promise((resolve) => {
    const child = spawn("docker", args, {
      windowsHide: true,
      input: input !== undefined ? input : undefined,
    });
    let out = "";
    let err = "";
    const timer = setTimeout(() => {
      child.kill();
      resolve({ code: -1, out, err: "timeout" });
    }, timeoutMs);
    child.stdout.on("data", (c) => (out += c));
    child.stderr.on("data", (c) => (err += c));
    child.on("error", () => {
      clearTimeout(timer);
      resolve({ code: -1, out, err: "spawn failed" });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? -1, out, err });
    });
  });
}

async function findContainer() {
  const r = await runDocker(
    ["ps", "--filter", "label=dev.openmuse.managed=desktop-v1", "--format", "{{.Names}}"],
    8000,
  );
  if (r.code !== 0) return null;
  containerName = safeContainerName(
    r.out
      .split("\n")
      .map((s) => s.trim())
      .filter((n) => n.endsWith("-desktop"))[0],
  );
  return containerName;
}

async function desktopRunning() {
  if (!containerName) await findContainer();
  if (!containerName) return false;
  const r = await runDocker(["inspect", "-f", "{{.State.Running}}", containerName], 8000);
  return r.code === 0 && r.out.trim() === "true";
}

// 分辨率自适应：把容器内桌面调整为给定像素。
async function resizeDesktop(payload) {
  const width = Math.round(Number(payload?.width));
  const height = Math.round(Number(payload?.height));
  const mode = safeMode(width, height);
  if (mode === null) return { ok: false };
  if (!(await desktopRunning())) return { ok: false, note: "desktop not running" };
  const r = await runDocker(["exec", containerName, "xrandr", "-s", mode], 8000);
  const ok = r.code === 0;
  if (!ok) deps.log(`xrandr resize failed: ${r.err.slice(0, 120)}`);
  return { ok };
}

async function tick() {
  if (!(await desktopRunning())) return;

  // 桌面 → 宿主：X 剪贴板有新内容时写入宿主剪贴板
  const out = await runDocker(
    ["exec", containerName, "xclip", "-selection", "clipboard", "-o"],
    4000,
  );
  if (out.code === 0 && out.out && out.out !== lastPulled && out.out !== lastPushed) {
    lastPulled = out.out;
    deps.writeHostClipboard(out.out);
    deps.log(`clipboard desktop→host (${out.out.length} chars)`);
  }

  // 宿主 → 桌面：宿主剪贴板变化时推送到 X 剪贴板
  const hostText = deps.readHostClipboard();
  if (hostText && hostText !== lastPushed && hostText !== lastPulled) {
    lastPushed = hostText;
    await runDocker(["exec", containerName, "xclip", "-selection", "clipboard"], 4000, hostText);
    deps.log(`clipboard host→desktop (${hostText.length} chars)`);
  }
}

module.exports = { init, stop, resizeDesktop, tick };
