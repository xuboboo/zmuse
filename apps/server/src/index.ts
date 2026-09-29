import { serve } from "@hono/node-server";
import { createApp } from "./app.ts";
import { readConfig } from "./config.ts";
import { createStore } from "./db.ts";

const config = readConfig();
const db = await createStore({
  dataDir: `${config.dataDir}/postgres`,
  databaseUrl: config.databaseUrl,
});
await db.recoverInterruptedActions();
const { app, agent, auth } = await createApp(db, config);
if (config.taskWorkerEnabled) agent.start();
const server = serve({ fetch: app.fetch, port: config.port, hostname: config.host }, () =>
  console.log(`ZMuse ${config.mode} API ready at ${config.publicUrl}`),
);
const shutdown = () => {
  server.close(() => {
    void agent
      .stop()
      .then(() => db.close())
      .then(() => process.exit(0));
  });
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
// Windows 桌面壳的退出路径：taskkill 发不出信号，这里提供与会话绑定的
// 优雅关停入口（同样的 shutdown 流程：停 worker → 关库 → 退出）。
app.post("/api/shutdown", async (c) => {
  await auth.owner(c.req.header("authorization"));
  c.header("content-type", "application/json");
  setTimeout(shutdown, 50);
  return c.json({ ok: true });
});
