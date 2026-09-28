import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { createApp } from "../apps/server/src/app.ts";
import type { DockerRunner } from "../apps/server/src/computer.ts";
import type { Config } from "../apps/server/src/config.ts";
import { createStore, type Store } from "../apps/server/src/db.ts";
import { config as base, ok } from "./helpers/computer.ts";

let db: Store, app: Awaited<ReturnType<typeof createApp>>["app"], token: string, directory: string;
const headers = () => ({ Authorization: `Bearer ${token}`, "Content-Type": "application/json" });

// 故障注入的假 Docker：inspect 直接失败，用于验证错误路径不触达真实引擎。
const brokenDocker: DockerRunner = (args, options) => {
  void args;
  void options;
  return Promise.resolve({
    stdout: "",
    stderr: "injected failure",
    exitCode: 1,
    timedOut: false,
    interrupted: false,
    truncated: false,
  });
};
const okDocker: DockerRunner = (args, options) => {
  void args;
  void options;
  return Promise.resolve(ok());
};

before(async () => {
  directory = await mkdtemp(join(tmpdir(), "openmuse-desktop-routes-"));
  db = await createStore();
  const config: Config = {
    ...base,
    desktopEnabled: true,
    desktopImage: "openmuse-desktop:local",
    desktopPort: 6080,
  };
  ({ app } = await createApp(db, config, { docker: brokenDocker }));
  const response = await app.request("/api/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  assert.equal(response.status, 200);
  token = (await response.json()).token;
});
after(async () => {
  await db.close();
  await rm(directory, { recursive: true, force: true });
});

test("desktop routes require a session", async () => {
  assert.equal((await app.request("/api/desktop")).status, 401);
  assert.equal((await app.request("/api/desktop/start", { method: "POST" })).status, 401);
  assert.equal((await app.request("/api/desktop/stop", { method: "POST" })).status, 401);
});

test("desktop snapshot reports the configured deployment", async () => {
  const response = await app.request("/api/desktop", { headers: headers() });
  assert.equal(response.status, 200);
  const body = (await response.json()) as {
    enabled: boolean;
    provider: string;
    status: string;
    container: string;
  };
  assert.equal(body.enabled, true);
  assert.equal(body.provider, "docker");
  assert.equal(body.container.includes("-desktop"), true);
});

test("docker failures surface as error snapshot and 503 on start", async () => {
  const response = await app.request("/api/desktop", { headers: headers() });
  assert.equal(response.status, 200);
  const body = (await response.json()) as { status: string; message?: string };
  assert.equal(body.status, "error");
  assert.match(body.message ?? "", /injected failure/);
  const start = await app.request("/api/desktop/start", {
    method: "POST",
    headers: headers(),
  });
  assert.equal(start.status, 503);
});

test("shutdown route requires a session", async () => {
  // 只验证鉴权边界；已鉴权的调用会触发真实退出，不在套件内执行。
  const response = await app.request("/api/shutdown", { method: "POST" });
  assert.equal(response.status, 401);
  void okDocker;
});
