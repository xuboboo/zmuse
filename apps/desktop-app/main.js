// OpenMuse Windows 桌面壳：
// 1. 启动并守护 API(8787) 与浏览器 worker(8790) 子进程
// 2. 本地静态服务中文 Web 界面(8081)，与 API 的 CORS 白名单一致
// 3. 健康检查通过后开窗；窗口关闭缩到托盘（后台任务继续），托盘退出才真正停止
const { app, BrowserWindow, Tray, Menu, nativeImage } = require("electron");
const { spawn } = require("node:child_process");
const { createServer } = require("node:http");
const { appendFile, mkdir } = require("node:fs/promises");
const { createReadStream, existsSync, readdirSync } = require("node:fs");
const http = require("node:http");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..", "..");
const WEB_DIR = path.resolve(__dirname, "..", "mobile", "dist", "web");
const LOG_DIR = path.join(__dirname, "logs");
const WEB_PORT = 8081;
const API = "http://127.0.0.1:8787";
const WORKER = "http://127.0.0.1:8790";

if (!existsSync(path.join(WEB_DIR, "index.html"))) {
  fail(`缺少 Web 产物：${WEB_DIR}\n先在仓库根目录运行 pnpm build:web`);
}
if (!existsSync(path.join(ROOT, "dist", "apps", "server", "src", "index.js"))) {
  fail(`缺少 API 产物：dist/apps/server/src/index.js\n先在仓库根目录运行 pnpm build:server`);
}
function fail(message) {
  // Electron 未就绪前只能走对话框与退出码。
  app.whenReady().then(() => {
    const win = new BrowserWindow({ show: false });
    const { dialog } = require("electron");
    dialog.showErrorBox("OpenMuse 桌面版启动失败", message);
    win.destroy();
    app.exit(1);
  });
}

const children = [];
let tray = null;
let mainWindow = null;
let quitting = false;

async function log(line) {
  try {
    await mkdir(LOG_DIR, { recursive: true });
    await appendFile(path.join(LOG_DIR, "app.log"), `${new Date().toISOString()} ${line}\n`);
  } catch {
    /* 日志失败不影响运行 */
  }
}

// 后端启动参数是固定常量；每个分支内联完整 argv 并以 -- 结束选项。
const spawnOpts = {
  cwd: ROOT,
  env: process.env,
  windowsHide: true,
  stdio: ["ignore", "pipe", "pipe"],
};
const respawnTimes = { api: [], worker: [] };

// 自愈守护：非退出期的子进程消失（崩溃/被误杀）时自动拉起；
// 60 秒内超过 3 次则放弃并记录，避免崩溃循环刷屏。
function launchBackend(name) {
  let child;
  if (name === "worker") {
    child = spawn(
      "node",
      ["--env-file=.env", "--import", "tsx", "--", "apps/worker/src/index.ts"],
      spawnOpts,
    );
  } else {
    child = spawn("node", ["--env-file=.env", "--", "dist/apps/server/src/index.js"], spawnOpts);
  }
  children.push(child);
  child.stdout.on("data", (c) => appendFile(path.join(LOG_DIR, name), c).catch(() => {}));
  child.stderr.on("data", (c) => appendFile(path.join(LOG_DIR, name), c).catch(() => {}));
  log(`${name} started pid=${child.pid}`);
  child.on("exit", (code) => {
    log(`${name} process exited code=${code}`);
    if (quitting) return;
    const now = Date.now();
    respawnTimes[name] = respawnTimes[name].filter((t) => now - t < 60000);
    if (respawnTimes[name].length >= 3) {
      log(`${name} keeps exiting; stop respawning until next app start`);
      return;
    }
    respawnTimes[name].push(now);
    log(`${name} respawning in 3s`);
    setTimeout(() => {
      if (!quitting) launchBackend(name);
    }, 3000);
  });
}

// 读取 .env 中本机部署的口令（仅驻内存，不落日志）。
function readEnvValue(key) {
  try {
    const env = require("node:fs").readFileSync(path.join(ROOT, ".env"), "utf8");
    const prefix = `${key}=`;
    for (const line of env.split(/\r?\n/)) {
      if (!line.startsWith(prefix)) continue;
      const value = line.slice(prefix.length).trim();
      if (value) return value;
    }
  } catch {
    /* 没有 .env 或没有该键 */
  }
  return undefined;
}

// 退出链全部走优雅关停：API 与 worker 各自收到 HTTP 关停指令后
// 自行停止任务、关闭浏览器会话与数据库；child.kill() 只作兜底。
async function quitGracefully() {
  quitting = true;
  const accessKey = readEnvValue("OPENMUSE_ACCESS_KEY");
  try {
    const session = await fetch(`${API}/api/session`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(accessKey ? { accessKey } : {}),
      signal: AbortSignal.timeout(8000),
    }).then((r) => r.json());
    if (session?.token) {
      await fetch(`${API}/api/shutdown`, {
        method: "POST",
        headers: { authorization: `Bearer ${session.token}` },
        signal: AbortSignal.timeout(8000),
      });
    }
  } catch {
    /* API 不在时自然无需关停 */
  }
  const workerToken = readEnvValue("WORKER_TOKEN");
  const workerPort = Number(readEnvValue("WORKER_SHUTDOWN_PORT")) || 8791;
  try {
    await fetch(`http://127.0.0.1:${workerPort}/shutdown`, {
      method: "POST",
      headers: { authorization: `Bearer ${workerToken}` },
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    /* worker 不在时同理 */
  }
  await new Promise((r) => setTimeout(r, 4000));
  for (const child of children) {
    if (child.exitCode === null) child.kill();
  }
  app.quit();
}

function get(url, timeoutMs = 2500) {
  return new Promise((resolve) => {
    const req = http.get(url, { timeout: timeoutMs }, (res) => {
      res.resume();
      resolve(res.statusCode === 200);
    });
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
    req.on("error", () => resolve(false));
  });
}

async function waitHealthy(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await get(url)) return true;
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".map": "application/json",
};

const webRoot = WEB_DIR + path.sep;
function safeWebFile(urlPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch {
    return null;
  }
  if (decoded.includes("\0")) return null;
  const target = path.resolve(WEB_DIR, `.${path.posix.normalize(`/${decoded}`)}`);
  if (target !== WEB_DIR && !target.startsWith(webRoot)) return null;
  return target;
}

function serveWeb() {
  const server = createServer((req, res) => {
    const urlPath = new URL(req.url, "http://x").pathname;
    let file = safeWebFile(urlPath);
    if (!file) {
      res.writeHead(403);
      return res.end();
    }
    if (!existsSync(file) || file === WEB_DIR) file = path.join(WEB_DIR, "index.html");
    const type = MIME[path.extname(file).toLowerCase()] ?? "application/octet-stream";
    res.writeHead(200, { "content-type": type, "cache-control": "no-cache" });
    createReadStream(file).pipe(res);
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(WEB_PORT, "127.0.0.1", () => resolve(server));
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    backgroundColor: "#F6F7F9",
    title: "OpenMuse",
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  mainWindow.loadURL(`http://127.0.0.1:${WEB_PORT}`);
  mainWindow.on("close", (event) => {
    if (!quitting) {
      // 缩到托盘：委托任务与监控继续在后台运行。
      event.preventDefault();
      mainWindow.hide();
    }
  });
}

function createTray() {
  try {
    const assetsDir = path.join(WEB_DIR, "assets");
    const png = existsSync(assetsDir)
      ? readdirSync(assetsDir).find((f) => f.startsWith("capybara") && f.endsWith(".png"))
      : undefined;
    const icon = png
      ? nativeImage.createFromPath(path.join(assetsDir, png)).resize({ width: 16, height: 16 })
      : nativeImage.createEmpty();
    tray = new Tray(icon);
    tray.setToolTip("OpenMuse — 后台任务运行中");
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: "打开 OpenMuse", click: () => mainWindow?.show() },
        { type: "separator" },
        {
          label: "退出（停止后台任务）",
          click: () => {
            void quitGracefully();
          },
        },
      ]),
    );
    tray.on("click", () => mainWindow?.show());
  } catch (error) {
    log(`tray init failed: ${error}`);
  }
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => mainWindow?.show());
  app.whenReady().then(async () => {
    try {
      await log("=== OpenMuse desktop starting ===");
      try {
        await serveWeb();
      } catch {
        return fail(
          `端口 ${WEB_PORT} 已被占用（可能是开发用的 Metro 还在运行）。\n关闭它之后重新启动 OpenMuse。`,
        );
      }
      log("web server ready on 8081");
      launchBackend("api");
      launchBackend("worker");
      const apiOk = await waitHealthy(`${API}/api/health`, 90000);
      const workerOk = await waitHealthy(`${WORKER}/health`, 60000);
      log(`health api=${apiOk} worker=${workerOk}`);
      if (!apiOk) {
        return fail(
          "API 在 90 秒内未就绪。查看 apps/desktop-app/logs/api.log。\n常见原因：.env 缺少 CPK_INTELLIGENCE_API_KEY，或 Docker 未启动。",
        );
      }
      if (!workerOk) log("worker 未就绪（浏览器功能暂不可用），界面仍会打开");
      createWindow();
      createTray();
    } catch (error) {
      fail(`启动异常：${error?.stack ?? error}`);
    }
  });
  app.on("window-all-closed", () => {
    /* 托盘常驻：由托盘菜单决定退出 */
  });
  app.on("before-quit", (event) => {
    // 关窗/系统退出同样走优雅链；quitGracefully 末尾会再次 app.quit()。
    if (!quitting) {
      event.preventDefault();
      void quitGracefully();
    }
  });
}
