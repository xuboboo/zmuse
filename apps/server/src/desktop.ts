import { createHash } from "node:crypto";
import { z } from "zod";
import { type DockerRunner, runDocker } from "./computer.ts";
import type { Config } from "./config.ts";
import { AppError } from "./errors.ts";

const controlTimeout = 10000;
const readyTimeoutMs = 90000;

const hash = (value: string) => createHash("sha256").update(value).digest("hex");

/** Signals the desktop is genuinely usable: its VNC agent runs inside the container. */
export type DesktopReadyProbe = (
  docker: DockerRunner,
  port: number,
  container: string,
) => Promise<void>;

export const defaultDesktopReady: DesktopReadyProbe = async (docker, port, container) => {
  const page = `http://127.0.0.1:${port}/vnc.html`;
  const deadline = Date.now() + readyTimeoutMs;
  let pageOk = false;
  while (Date.now() < deadline) {
    try {
      pageOk ||= (await fetch(page, { signal: AbortSignal.timeout(3000) })).ok;
    } catch {
      /* not ready yet */
    }
    if (pageOk) {
      // The web page is static and serves before Xfce boots; only a live VNC
      // agent inside the container proves the graphical session is usable.
      const agent = await docker(["exec", container, "pgrep", "-x", "x11vnc"], {
        timeoutMs: controlTimeout,
      });
      if (!agent.timedOut && agent.exitCode === 0) return;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new AppError(
    "Desktop did not become reachable in time. Check its container logs and try again.",
    503,
  );
};

export function desktopIdentity(config: Config, owner: string) {
  const deployment = hash(config.desktopDeploymentId ?? config.publicUrl).slice(0, 16);
  const ownerHash = hash(owner).slice(0, 24);
  return {
    container: `openmuse-${deployment}-${ownerHash}-desktop`,
    labels: {
      "dev.openmuse.managed": "desktop-v1",
      "dev.openmuse.deployment": deployment,
      "dev.openmuse.owner": ownerHash,
    } as Record<string, string>,
  };
}

const inspectionSchema = z.object({
  Name: z.string(),
  State: z.object({ Running: z.boolean(), StartedAt: z.string() }),
  Config: z.object({
    Image: z.string(),
    Labels: z.record(z.string(), z.string()).nullable().optional(),
  }),
  HostConfig: z.object({ PortBindings: z.record(z.string(), z.unknown()).nullable().optional() }),
});
type Inspection = z.infer<typeof inspectionSchema>;

export interface DesktopSnapshot {
  enabled: boolean;
  provider: "docker";
  status: "running" | "stopped" | "error" | "unconfigured";
  url?: string;
  container: string;
  /** Container start time; changes on every boot so the UI can remount its frame. */
  startedAt?: string;
  message?: string;
}

export class DesktopService {
  constructor(
    readonly config: Config,
    private readonly docker: DockerRunner = runDocker,
    private readonly ready: DesktopReadyProbe = defaultDesktopReady,
  ) {}

  private enabled() {
    if (!this.config.desktopEnabled)
      throw new AppError(
        "Desktop is not configured. Enable DESKTOP_ENABLED and build the local desktop image.",
        503,
      );
  }
  private image() {
    const image = this.config.desktopImage ?? "openmuse-desktop:local";
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._/:@-]{0,250}$/.test(image))
      throw new AppError("DESKTOP_IMAGE is invalid", 503);
    return image;
  }
  private port() {
    const port = this.config.desktopPort ?? 6080;
    if (!Number.isInteger(port) || port < 1024 || port > 65535)
      throw new AppError("DESKTOP_PORT must be an integer between 1024 and 65535", 503);
    return port;
  }
  url() {
    return `http://127.0.0.1:${this.port()}/vnc.html?autoconnect=1&resize=scale`;
  }
  private async checked(args: string[]) {
    const result = await this.docker(args, { timeoutMs: controlTimeout });
    if (result.timedOut)
      throw new AppError("Docker did not respond within 10 seconds. Check the Docker engine.", 503);
    if (result.interrupted || result.exitCode !== 0 || result.truncated) {
      const hint = result.stderr.trim().slice(-140);
      throw new AppError(
        "Docker operation failed. Check the engine and that the desktop image is built locally." +
          (hint ? ` Last error: ${hint}` : ""),
        503,
      );
    }
    return result.stdout;
  }
  private async inspect(owner: string): Promise<Inspection | undefined> {
    const identity = desktopIdentity(this.config, owner);
    const found = (
      await this.checked([
        "container",
        "ls",
        "--all",
        "--filter",
        `name=^/${identity.container}$`,
        "--format",
        "{{.ID}}",
      ])
    ).trim();
    if (!found) return undefined;
    const raw = JSON.parse(await this.checked(["container", "inspect", identity.container]));
    const parsed = z.array(inspectionSchema).length(1).safeParse(raw);
    if (!parsed.success)
      throw new AppError("Desktop container inspection failed; refusing to attach", 409);
    return parsed.data[0];
  }
  private running(inspection: Inspection | undefined) {
    return inspection?.State.Running ? "running" : ("stopped" as const);
  }
  private starting = new Set<string>();
  async start(owner: string) {
    this.enabled();
    const identity = desktopIdentity(this.config, owner);
    if (this.starting.has(owner))
      throw new AppError("Desktop is already starting. Try again in a few seconds.", 409);
    this.starting.add(owner);
    try {
      const port = this.port();
      const existing = await this.inspect(owner);
      const portMatches = (() => {
        const bindings = existing?.HostConfig.PortBindings?.["6080/tcp"];
        if (!Array.isArray(bindings) || bindings.length === 0) return false;
        const first = bindings[0] as { HostPort?: string } | null;
        return first?.HostPort === String(port);
      })();
      const labelsMatch =
        !!existing &&
        Object.entries(identity.labels).every(
          ([key, value]) => existing.Config.Labels?.[key] === value,
        );
      // Stale containers (image rebuilt, port changed, foreign labels) are recreated.
      if (existing && (!portMatches || !labelsMatch || existing.Config.Image !== this.image())) {
        await this.checked(["container", "rm", "-f", identity.container]);
      } else if (existing) {
        if (!existing.State.Running) await this.checked(["container", "start", identity.container]);
        await this.ready(this.docker, port, identity.container);
        return this.snapshot(owner);
      }
      const labels = Object.entries(identity.labels).flatMap(([key, value]) => [
        "--label",
        `${key}=${value}`,
      ]);
      await this.checked([
        "container",
        "create",
        "--pull",
        "never",
        "--name",
        identity.container,
        ...labels,
        "--user",
        "1000:1000",
        "--cap-drop",
        "ALL",
        "--security-opt",
        "no-new-privileges",
        "--ipc",
        "private",
        "--shm-size",
        "512m",
        "--memory",
        "2g",
        "--cpus",
        "2",
        "--pids-limit",
        "512",
        "--restart",
        "no",
        "--publish",
        `127.0.0.1:${port}:6080`,
        "--env",
        `SCREEN_SIZE=${this.config.desktopScreen ?? "1600x900x24"}`,
        this.image(),
      ]);
      await this.checked(["container", "start", identity.container]);
      await this.ready(this.docker, port, identity.container);
    } finally {
      this.starting.delete(owner);
    }
    return this.snapshot(owner);
  }
  async stop(owner: string) {
    this.enabled();
    const identity = desktopIdentity(this.config, owner);
    const existing = await this.inspect(owner);
    if (existing?.State.Running) await this.checked(["container", "stop", identity.container]);
    return this.snapshot(owner);
  }
  async snapshot(owner: string): Promise<DesktopSnapshot> {
    const identity = desktopIdentity(this.config, owner);
    const base = {
      enabled: Boolean(this.config.desktopEnabled),
      provider: "docker" as const,
      container: identity.container,
    };
    if (!base.enabled)
      return {
        ...base,
        status: "unconfigured",
        message: "Enable the graphical desktop on the server to use it here.",
      };
    try {
      const inspection = await this.inspect(owner);
      const status = this.running(inspection);
      return {
        ...base,
        status,
        url: status === "running" ? this.url() : undefined,
        startedAt: inspection?.State.StartedAt,
      };
    } catch (error) {
      return {
        ...base,
        status: "error",
        message:
          error instanceof AppError ? error.message : "Desktop inspection failed. Check Docker.",
      };
    }
  }
}
