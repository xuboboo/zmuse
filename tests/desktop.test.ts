import assert from "node:assert/strict";
import { test } from "node:test";
import type { DockerResult, DockerRunner } from "../apps/server/src/computer.ts";
import {
  type DesktopReadyProbe,
  DesktopService,
  desktopIdentity,
} from "../apps/server/src/desktop.ts";
import { config as base, ok } from "./helpers/computer.ts";

const config = {
  ...base,
  desktopEnabled: true,
  desktopImage: "openmuse-desktop:local",
  desktopPort: 6080,
};

interface Call {
  args: string[];
}
interface FakeState {
  exists: boolean;
  running: boolean;
  image: string;
  labels: Record<string, string>;
  hostPort: string;
}

const managedLabels: Record<string, string> = {
  ...desktopIdentity(config, "owner").labels,
};

const probeCalls: { port: number; container: string }[] = [];
const instantProbe: DesktopReadyProbe = async (docker, port, container) => {
  probeCalls.push({ port, container });
  await docker(["exec", container, "pgrep", "-x", "x11vnc"], { timeoutMs: 1000 });
};

function harness(
  state: FakeState,
  overrides: Record<string, DockerResult> = {},
): {
  runner: DockerRunner;
  calls: Call[];
  state: FakeState;
} {
  const calls: Call[] = [];
  const respond = (args: string[]): DockerResult => {
    if (overrides[args.join(" ")]) return overrides[args.join(" ")];
    if (args[0] === "container" && args[1] === "ls") return ok(state.exists ? "abc123" : "");
    if (args[0] === "container" && args[1] === "inspect") {
      return ok(
        JSON.stringify([
          {
            Name: `/${args[2]}`,
            State: { Running: state.running, StartedAt: "2026-09-29T00:00:00.000Z" },
            Config: { Image: state.image, Labels: state.labels },
            HostConfig: { PortBindings: { "6080/tcp": [{ HostPort: state.hostPort }] } },
          },
        ]),
      );
    }
    if (args[0] === "container" && args[1] === "rm") state.exists = false;
    if (args[0] === "container" && args[1] === "create") {
      state.exists = true;
      state.running = false;
      const image = args.at(-1);
      if (image) state.image = image;
      const publish = args.indexOf("--publish");
      state.hostPort = args[publish + 1]?.split(":")[1] ?? state.hostPort;
      const labels: Record<string, string> = {};
      for (let i = 0; i < args.length; i++) {
        if (args[i] === "--label") {
          const [k, v] = args[i + 1]?.split("=") ?? [];
          if (k && v !== undefined) labels[k] = v;
        }
      }
      state.labels = labels;
    }
    if (args[0] === "container" && args[1] === "start") {
      state.exists = true;
      state.running = true;
    }
    if (args[0] === "container" && args[1] === "stop") state.running = false;
    return ok();
  };
  const runner: DockerRunner = (args, options) => {
    calls.push({ args });
    void options;
    return Promise.resolve(respond(args));
  };
  return { runner, calls, state };
}

const fresh = (): FakeState => ({
  exists: false,
  running: false,
  image: "openmuse-desktop:local",
  labels: {},
  hostPort: "6080",
});
const managed = (): FakeState => ({
  exists: true,
  running: true,
  image: "openmuse-desktop:local",
  labels: { ...managedLabels },
  hostPort: "6080",
});

test("disabled desktop reports setup without invoking Docker", async () => {
  const h = harness(fresh());
  const service = new DesktopService({ ...config, desktopEnabled: false }, h.runner, instantProbe);
  assert.equal((await service.snapshot("owner")).status, "unconfigured");
  await assert.rejects(service.start("owner"), /not configured/);
  assert.equal(h.calls.length, 0);
});

test("fresh start creates the container with isolation flags and probes readiness", async () => {
  const h = harness(fresh());
  const service = new DesktopService(config, h.runner, instantProbe);
  const snapshot = await service.start("owner");
  assert.equal(snapshot.status, "running");
  assert.equal(snapshot.url?.startsWith("http://127.0.0.1:6080/vnc.html"), true);
  const create = h.calls.find((c) => c.args[1] === "create");
  assert.ok(create);
  assert.equal(create.args[create.args.indexOf("--publish") + 1], "127.0.0.1:6080:6080");
  assert.equal(create.args[create.args.indexOf("--shm-size") + 1], "512m");
  assert.equal(create.args[create.args.indexOf("--cap-drop") + 1], "ALL");
  assert.equal(create.args.filter((a) => a === "--label").length, 3);
  assert.equal(probeCalls.at(-1)?.port, 6080);
});

test("starting a running desktop is idempotent and never recreates it", async () => {
  const h = harness(managed());
  const service = new DesktopService(config, h.runner, instantProbe);
  const snapshot = await service.start("owner");
  assert.equal(snapshot.status, "running");
  assert.equal(
    h.calls.some((c) => c.args[1] === "create"),
    false,
  );
  assert.equal(
    h.calls.some((c) => c.args[1] === "rm"),
    false,
  );
});

test("stale image, foreign labels or a moved port each trigger recreation", async () => {
  const stale = managed();
  stale.image = "openmuse-desktop:stale";
  const foreign = managed();
  foreign.labels = { "dev.openmuse.managed": "desktop-v1" };
  const moved = managed();
  moved.hostPort = "9999";
  for (const state of [stale, foreign, moved]) {
    const h = harness(state);
    const snapshot = await new DesktopService(config, h.runner, instantProbe).start("owner");
    assert.equal(snapshot.status, "running");
    assert.ok(h.calls.some((c) => c.args[1] === "rm" && c.args[2] === "-f"));
    assert.ok(h.calls.some((c) => c.args[1] === "create"));
  }
});

test("stop halts a running container and leaves a stopped one untouched", async () => {
  const running = harness(managed());
  await new DesktopService(config, running.runner, instantProbe).stop("owner");
  assert.ok(running.calls.some((c) => c.args[1] === "stop"));

  const stopped = harness({ ...managed(), running: false });
  await new DesktopService(config, stopped.runner, instantProbe).stop("owner");
  assert.equal(
    stopped.calls.some((c) => c.args[1] === "stop"),
    false,
  );
});

test("docker failures surface their stderr hint through snapshot errors", async () => {
  const h = harness(managed());
  const failing: DockerRunner = (args, options) => {
    if (args[1] === "inspect")
      return Promise.resolve({
        ...ok(""),
        stderr: "boom",
        exitCode: 1,
      });
    void options;
    return h.runner(args, options);
  };
  const service = new DesktopService(config, failing, instantProbe);
  const snapshot = await service.snapshot("owner");
  assert.equal(snapshot.status, "error");
  assert.match(snapshot.message ?? "", /Last error: boom/);
});
