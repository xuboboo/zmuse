import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { CopilotKitIntelligence } from "@copilotkit/runtime/v2";
import { createApp } from "../apps/server/src/app.ts";
import type { Config } from "../apps/server/src/config.ts";
import { createStore, type Store } from "../apps/server/src/db.ts";
import type {
  AgentMemory,
  AgentNotification,
  AgentTask,
  AgentWorkspace,
  Goal,
  Idea,
  Monitor,
  RunEvent,
} from "../packages/domain/src/agent.ts";

let db: Store, server: Awaited<ReturnType<typeof createApp>>, directory: string, token: string;
let config: Config;
const headers = () => ({ Authorization: `Bearer ${token}`, "Content-Type": "application/json" });
const request = (path: string, body?: unknown) =>
  server.app.request(`/api/agent${path}`, {
    headers: headers(),
    ...(body === undefined ? {} : { method: "POST", body: JSON.stringify(body) }),
  });
async function read<T>(path: string, body?: unknown, status = 200): Promise<T> {
  const response = await request(path, body);
  assert.equal(response.status, status, await response.clone().text());
  return response.json();
}

before(async () => {
  directory = await mkdtemp(join(tmpdir(), "openmuse-agent-api-"));
  db = await createStore({ dataDir: join(directory, "db") });
  config = {
    mode: "sample",
    port: 8787,
    host: "127.0.0.1",
    publicUrl: "http://localhost:8787",
    dataDir: directory,
    agentBackend: "model",
    intelligenceApiKey: "test-project-key-never-sent",
    googleRedirectUri: "http://localhost:8787/api/google/callback",
    allowedOrigins: ["http://localhost:8081"],
  };
  server = await createApp(db, config);
  const session = await server.app.request("/api/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  assert.equal(session.status, 200);
  token = (await session.json()).token;
});
after(async () => {
  await server?.agent?.stop();
  await db?.close();
  if (directory) await rm(directory, { recursive: true, force: true });
});

test("agent API requires a session and reports the actual worker state", async () => {
  assert.equal((await server.app.request("/api/agent")).status, 401);
  assert.equal(
    (
      await server.app.request("/api/agent/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: "Plan the week" }),
      })
    ).status,
    401,
  );
  const workspace = await read<AgentWorkspace>("");
  assert.equal(workspace.worker.running, false);
  assert.equal(workspace.identity.name, "ZMuse");
  assert.equal(workspace.identity.tone, "warm");
});

test("the main Rich Thread survives reopening and concurrent initialization", async (t) => {
  t.mock.method(
    CopilotKitIntelligence.prototype,
    "getOrCreateThread",
    async (input: Parameters<CopilotKitIntelligence["getOrCreateThread"]>[0]) => ({
      id: input.threadId,
    }),
  );
  assert.equal((await server.app.request("/api/main-thread")).status, 401);
  const responses = await Promise.all(
    Array.from({ length: 3 }, () => server.app.request("/api/main-thread", { headers: headers() })),
  );
  const threads = await Promise.all(responses.map((response) => response.json()));
  assert.ok(threads.every((thread) => thread.threadId === threads[0].threadId));
  assert.equal(threads[0].existing, true);
  const reopened = await (
    await server.app.request("/api/main-thread", { headers: headers() })
  ).json();
  assert.equal(reopened.threadId, threads[0].threadId);
  assert.equal(reopened.existing, true);
  assert.equal(await db.get("other-user", "conversation-settings", "main"), null);
});

test("task detail and controls stay scoped to the authenticated owner", async () => {
  const task = await read<AgentTask>(
    "/tasks",
    { prompt: "Plan the week", owner: "other-user" },
    201,
  );
  assert.equal(task.status, "queued");
  assert.ok(task.plan.length > 0);
  const hidden = await server.agent.createTask("other-user", { prompt: "Private task" });
  assert.equal((await request(`/tasks/${hidden.id}`)).status, 404);
  assert.equal((await request(`/tasks/${hidden.id}/control`, { action: "cancel" })).status, 404);
  assert.equal((await request(`/tasks/${hidden.id}/input`, { answer: "Private" })).status, 404);
  const snapshot = await read<AgentWorkspace>("");
  assert.ok(snapshot.tasks.some((item) => item.id === task.id));
  assert.ok(!snapshot.tasks.some((item) => item.id === hidden.id));
  assert.equal((await server.agent.getTask("other-user", hidden.id)).status, "queued");
  await server.agent.control("other-user", hidden.id, "cancel");
  assert.equal(
    (await read<AgentTask>(`/tasks/${task.id}/control`, { action: "pause" })).status,
    "paused",
  );
  assert.equal(
    (await read<AgentTask>(`/tasks/${task.id}/control`, { action: "resume" })).status,
    "queued",
  );
  assert.equal(
    (await read<AgentTask>(`/tasks/${task.id}/control`, { action: "cancel" })).status,
    "cancelled",
  );
  const detail = await read<{ task: AgentTask; events: RunEvent[]; artifacts: unknown[] }>(
    `/tasks/${task.id}`,
  );
  assert.equal(detail.task.status, "cancelled");
  assert.equal(detail.events.length, 3);
  assert.deepEqual(detail.artifacts, []);
});

test("agent request validation rejects malformed input with useful JSON errors", async () => {
  for (const [path, body] of [
    ["/tasks", { prompt: " " }],
    ["/tasks", { prompt: "Plan", kind: "unknown" }],
    ["/tasks/missing/control", { action: "delete" }],
    ["/tasks/missing/input", { answer: " " }],
    ["/goals", { title: " " }],
    ["/goals/missing", { status: "unknown" }],
    ["/goals/missing", { milestones: [{ id: "one", title: "Step", done: "yes" }] }],
    [
      "/monitors",
      { title: "Price", url: "https://example.com", condition: "price_below", value: "bad" },
    ],
    ["/monitors/missing/control", { action: "delete" }],
    ["/ideas/missing", { action: "accept", prompt: " " }],
    ["/memories", { text: " " }],
    ["/identity", { name: "ZMuse", tone: "angry" }],
    ["/sample-page", { text: "a".repeat(100001) }],
  ] satisfies [string, unknown][]) {
    const response = await request(path, body);
    assert.equal(response.status, 422, path);
    assert.equal(typeof (await response.json()).error, "string", path);
  }
  const malformed = await server.app.request("/api/agent/tasks", {
    method: "POST",
    headers: headers(),
    body: "{",
  });
  assert.equal(malformed.status, 400);
});

test("goal updates validate milestones and pausing a goal pauses its task", async () => {
  const goal = await read<Goal>("/goals", { title: "Travel", milestones: ["Choose dates"] }, 201);
  const task = await read<AgentTask>("/tasks", { prompt: "Find dates", goalId: goal.id }, 201);
  const saved = await read<Goal>(`/goals/${goal.id}`, {
    status: "paused",
    milestones: goal.milestones.map((milestone) => ({ ...milestone, done: true })),
  });
  assert.equal(saved.status, "paused");
  assert.equal(saved.milestones[0].done, true);
  assert.equal((await read<{ task: AgentTask }>(`/tasks/${task.id}`)).task.status, "paused");
  const hidden = await server.agent.createGoal("other-user", { title: "Private goal" });
  assert.equal((await request(`/goals/${hidden.id}`, { status: "completed" })).status, 404);
  assert.equal(
    (await request("/tasks", { prompt: "Link private goal", goalId: hidden.id })).status,
    404,
  );
});

test("memories can be edited and forgotten while identity changes persist", async () => {
  const memory = await read<AgentMemory>(
    "/memories",
    { text: "I prefer morning meetings", source: "You" },
    201,
  );
  const updated = await read<AgentMemory>(`/memories/${memory.id}`, {
    text: "I prefer afternoon meetings",
  });
  assert.equal(updated.id, memory.id);
  assert.equal(updated.createdAt, memory.createdAt);
  assert.equal(updated.source, "You");
  await db.put("other-user", "memories", { ...memory, id: "private-memory" });
  const privateIdentity = await db.get("other-user", "agent-settings", "identity");
  assert.equal((await request("/memories/private-memory", { text: "Overwrite" })).status, 404);
  assert.equal((await request("/memories/private-memory/forget", {})).status, 404);
  await read("/identity", {
    name: "Nova",
    tone: "concise",
    avatar: "lilac",
    showChatUpdates: false,
  });
  const snapshot = await read<AgentWorkspace>("");
  assert.equal(snapshot.identity.name, "Nova");
  assert.equal(snapshot.identity.tone, "concise");
  assert.equal(snapshot.identity.avatar, "lilac");
  assert.equal(snapshot.identity.showChatUpdates, false);
  assert.equal(
    (await request("/identity", { name: "Nova", tone: "warm", avatar: "invalid" })).status,
    422,
  );
  assert.equal(snapshot.memories.find((item) => item.id === memory.id)?.text, updated.text);
  assert.deepEqual(await db.get("other-user", "agent-settings", "identity"), privateIdentity);
  assert.deepEqual(await read(`/memories/${memory.id}/forget`, {}), { ok: true });
  assert.ok(!(await read<AgentWorkspace>("")).memories.some((item) => item.id === memory.id));
  assert.ok(await db.get("other-user", "memories", "private-memory"));
});

test("idea dismissal survives refresh and concurrent acceptance creates one goal and task", async () => {
  const ideas = await read<Idea[]>("/ideas/refresh", {});
  assert.ok(ideas.length >= 2);
  assert.ok(ideas.every((idea) => idea.evidence.length > 0));
  const dismissed = ideas[0],
    accepted = ideas[1];
  assert.equal(
    (await read<Idea>(`/ideas/${dismissed.id}`, { action: "dismiss" })).status,
    "dismissed",
  );
  assert.equal(
    (await read<Idea[]>("/ideas/refresh", {})).find((idea) => idea.id === dismissed.id)?.status,
    "dismissed",
  );
  const before = await read<AgentWorkspace>("");
  const results = await Promise.all([
    read<Idea>(`/ideas/${accepted.id}`, { action: "accept" }),
    read<Idea>(`/ideas/${accepted.id}`, { action: "accept" }),
  ]);
  assert.equal(results[0].status, "accepted");
  assert.equal(results[0].taskId, results[1].taskId);
  const after = await read<AgentWorkspace>("");
  assert.equal(after.goals.length, before.goals.length + 1);
  assert.equal(after.tasks.length, before.tasks.length + 1);
  assert.ok(results[0].taskId);
  await read(`/tasks/${results[0].taskId}/control`, { action: "cancel" });
});

test("sample monitor saves its baseline and deduplicates notifications for repeated changes", async () => {
  await read("/sample-page", { text: "No tables available" });
  const monitor = await read<Monitor>(
    "/monitors",
    {
      title: "Dinner availability",
      url: "sample://availability",
      condition: "change",
      intervalMinutes: 1,
    },
    201,
  );
  const notifications = async () =>
    (await read<AgentNotification[]>("/notifications")).filter(
      (item) => item.taskId === monitor.taskId,
    );
  await server.agent.worker.tick();
  assert.equal(
    (await read<{ task: AgentTask }>(`/tasks/${monitor.taskId}`)).task.status,
    "scheduled",
  );
  assert.equal((await notifications()).length, 0);
  for (const text of [
    "One table at 7 pm",
    "One table at 7 pm",
    "Two tables at 7 pm",
    "One table at 7 pm",
  ]) {
    await read("/sample-page", { text });
    await read(`/monitors/${monitor.id}/control`, { action: "check" });
    await server.agent.worker.tick();
  }
  const found = await notifications();
  assert.equal(found.length, 2);
  assert.ok(found.every((item) => !item.read));
  const readNotification = await read<AgentNotification>(`/notifications/${found[0].id}/read`, {});
  assert.equal(readNotification.read, true);
  assert.equal((await notifications()).find((item) => item.id === found[0].id)?.read, true);
  const snapshot = await read<AgentWorkspace>("");
  assert.equal(snapshot.monitors.find((item) => item.id === monitor.id)?.checks, 5);
  assert.equal(
    (await read<Monitor>(`/monitors/${monitor.id}/control`, { action: "pause" })).status,
    "paused",
  );
  assert.equal(
    (await read<Monitor>(`/monitors/${monitor.id}/control`, { action: "stop" })).status,
    "stopped",
  );
  await server.agent.notify(
    "other-user",
    "Private",
    "Private details",
    undefined,
    "private-notice",
  );
  const privateNotification = (await db.list<AgentNotification>("other-user", "notifications"))[0];
  assert.equal((await request(`/notifications/${privateNotification.id}/read`, {})).status, 404);
  assert.equal(
    (await db.get<AgentNotification>("other-user", "notifications", privateNotification.id))?.read,
    false,
  );
});

test("live mode rejects sample sources and hides the fixture mutation endpoint", async () => {
  const live = await createApp(db, {
    ...config,
    mode: "live",
    accessKey: "a-private-test-key-with-enough-characters",
  });
  try {
    const response = await live.app.request("/api/agent/sample-page", {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ text: "Changed" }),
    });
    assert.equal(response.status, 404);
    const monitor = await live.app.request("/api/agent/monitors", {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ title: "Forbidden fixture", url: "sample://availability" }),
    });
    assert.equal(monitor.status, 422);
    assert.deepEqual(await db.get("local-user", "sample-pages", "availability"), {
      id: "availability",
      text: "One table at 7 pm",
    });
  } finally {
    await live.agent.stop();
  }
});
