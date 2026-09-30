import {
  computerIdentity,
  type DockerResult,
  type DockerRunner,
} from "../../apps/server/src/computer.ts";
import type { Config } from "../../apps/server/src/config.ts";
export const config: Config = {
  mode: "sample",
  port: 8787,
  host: "127.0.0.1",
  publicUrl: "http://localhost:8787",
  // 相对路径：ubuntu runner 的 "/" 只读，createAuth 会 mkdir dataDir
  dataDir: "unused",
  agentBackend: "sample",
  intelligenceApiKey: "test-project-key-never-sent",
  googleRedirectUri: "http://localhost/callback",
  allowedOrigins: [],
  computerEnabled: true,
};
export const ok = (stdout = ""): DockerResult => ({
  stdout,
  stderr: "",
  exitCode: 0,
  timedOut: false,
  interrupted: false,
  truncated: false,
});
export function sandbox(running = true, owner = "owner") {
  const identity = computerIdentity(config, owner);
  return {
    Id: "container-id",
    Name: `/${identity.container}`,
    Config: {
      Image: "openmuse-computer:local",
      User: "1000:1000",
      Labels: identity.labels,
      Env: ["PATH=/usr/local/bin:/usr/bin:/bin", "HOME=/workspace", "LANG=C.UTF-8"],
      Entrypoint: ["/usr/bin/sleep"],
      Cmd: ["infinity"],
      WorkingDir: "/workspace",
    },
    HostConfig: {
      ReadonlyRootfs: true,
      Privileged: false,
      CapDrop: ["ALL"],
      CapAdd: null,
      SecurityOpt: ["no-new-privileges"],
      NetworkMode: "none",
      Memory: 536870912,
      MemorySwap: 536870912,
      PidsLimit: 128,
      NanoCpus: 1000000000,
      Binds: null,
      Devices: [],
      DeviceRequests: null,
      PortBindings: {},
      PidMode: "",
      IpcMode: "private",
      Tmpfs: { "/tmp": "rw,nosuid,nodev,noexec,size=67108864,mode=1777" },
      RestartPolicy: { Name: "no" },
    },
    Mounts: [{ Type: "volume", Name: identity.volume, Destination: "/workspace", RW: true }],
    NetworkSettings: { Networks: { none: {} } },
    State: { Running: running },
  };
}
export function fixture(
  options: {
    command?: () => Promise<DockerResult>;
    inspect?: ReturnType<typeof sandbox>;
    missing?: boolean;
    owner?: string;
  } = {},
) {
  const identity = computerIdentity(config, options.owner ?? "owner");
  const calls: { args: string[]; timeoutMs: number; input?: string }[] = [];
  const runner: DockerRunner = async (args, opts) => {
    calls.push({ args, timeoutMs: opts.timeoutMs, input: opts.input });
    if (args[0] === "container" && args[1] === "ls")
      return ok(options.missing ? "" : "container-id\n");
    if (args[0] === "container" && args[1] === "inspect")
      return ok(JSON.stringify([options.inspect ?? sandbox(true, options.owner)]));
    if (args[0] === "volume" && args[1] === "ls") return ok(identity.volume);
    if (args[0] === "volume" && args[1] === "inspect")
      return ok(
        JSON.stringify([
          {
            Name: identity.volume,
            Labels: identity.labels,
            Driver: "local",
            Options: null,
            Scope: "local",
          },
        ]),
      );
    if (args[0] === "exec") return options.command ? options.command() : ok("hello\n");
    return ok();
  };
  return { runner, calls };
}
