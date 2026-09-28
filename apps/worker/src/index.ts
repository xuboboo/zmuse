import { createHash, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import { createWorkerServer } from "./server.ts";

const token = process.env.WORKER_TOKEN ?? "";
const worker = await createWorkerServer({
  token,
  dataDir: process.env.WORKER_DATA_DIR ?? ".openmuse/browser-profiles",
  maxSessions: 3,
  idleTimeoutMs: 30 * 60_000,
});
worker.server.listen(8790, process.env.WORKER_HOST ?? "127.0.0.1", () => {
  console.log("OpenMuse browser worker listening on port 8790");
});
let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  const deadline = setTimeout(() => process.exit(1), 30_000);
  deadline.unref();
  await worker.close();
  process.exit(0);
}
process.on("SIGTERM", () => {
  void stop();
});
process.on("SIGINT", () => {
  void stop();
});
// 桌面壳的退出路径：Windows taskkill 发不出信号，这里提供与 worker token 绑定的
// 优雅关停入口（仅监听本机回环），复用与 SIGTERM 相同的 stop() 流程。
const shutdownPort = Number(process.env.WORKER_SHUTDOWN_PORT ?? "8791");
if (Number.isInteger(shutdownPort) && shutdownPort >= 1024 && shutdownPort <= 65535 && token) {
  const expect = createHash("sha256").update(`Bearer ${token}`).digest();
  createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://x");
    const given = createHash("sha256")
      .update(req.headers.authorization ?? "")
      .digest();
    const authorized =
      req.method === "POST" &&
      url.pathname === "/shutdown" &&
      given.length === expect.length &&
      timingSafeEqual(given, expect);
    if (!authorized) {
      res.writeHead(401, { "content-type": "application/json" });
      return res.end(JSON.stringify({ error: "Unauthorized" }));
    }
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
    void stop();
  }).listen(shutdownPort, "127.0.0.1", () => {
    console.log(`OpenMuse worker shutdown listener on port ${shutdownPort}`);
  });
}
