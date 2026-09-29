// ZMuse 桌面容器操作助手（由 desktop-bridge.js 以固定字面量 argv 调用）。
// 动态数据一律走 stdin / 环境变量，绝不进入 argv——杜绝选项注入。
// 用法：node desktop-exec.cjs <discover|running|resize|get-clipboard|set-clipboard> [arg]
const { spawnSync } = require("node:child_process");

function fail(message) {
  process.stdout.write(JSON.stringify({ code: -1, out: "", err: message }));
  process.exit(0);
}

const container = process.argv[2] ?? "";
const sub = process.argv[3] ?? "";
if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,120}$/.test(container)) fail("bad container name");

function docker(args, timeoutMs, input) {
  const r = spawnSync(
    "docker",
    ["exec", ...(input !== undefined ? ["-i"] : []), container, ...args],
    {
      timeout: timeoutMs,
      input: input !== undefined ? input : undefined,
      encoding: "utf8",
      windowsHide: true,
    },
  );
  return { code: r.status ?? -1, out: r.stdout ?? "", err: r.stderr ?? "" };
}

switch (sub) {
  case "discover": {
    const r = docker(
      ["ps", "--filter", "label=dev.openmuse.managed=desktop-v1", "--format", "{{.Names}}"],
      8000,
    );
    process.stdout.write(
      JSON.stringify({
        code: r.code,
        out:
          r.out
            .split("\n")
            .map((s) => s.trim())
            .filter((n) => n.endsWith("-desktop"))[0] ?? "",
        err: r.err,
      }),
    );
    break;
  }
  case "running": {
    const r = docker(["inspect", "-f", "{{.State.Running}}", container], 8000);
    process.stdout.write(JSON.stringify({ code: r.code, out: r.out.trim(), err: r.err }));
    break;
  }
  case "resize": {
    const mode = process.argv[4] ?? "";
    if (!/^[0-9]+x[0-9]+$/.test(mode) || mode.length > 9) fail("bad mode");
    const r = docker(["xrandr", "-s", mode], 8000);
    process.stdout.write(JSON.stringify({ code: r.code, out: r.out, err: r.err }));
    break;
  }
  case "get-clipboard": {
    const r = docker(["xclip", "-selection", "clipboard", "-o"], 4000);
    process.stdout.write(JSON.stringify({ code: r.code, out: r.out, err: r.err }));
    break;
  }
  case "set-clipboard": {
    const text = process.env.ZMUSE_CLIP ?? "";
    if (text.length > 1024 * 1024) fail("clipboard too large");
    const r = docker(["xclip", "-selection", "clipboard"], 4000, text);
    process.stdout.write(JSON.stringify({ code: r.code, out: r.out, err: r.err }));
    break;
  }
  default:
    fail("unknown subcommand");
}
