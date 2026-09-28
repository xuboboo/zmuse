import { useCallback, useEffect, useState } from "react";
import { Text, View } from "react-native";
import type { MuseApi } from "./api";
import { DesktopFrame } from "./desktop-frame";
import { Button, colors, ErrorNotice, s } from "./ui";

export interface DesktopSnapshot {
  enabled: boolean;
  status: "running" | "stopped" | "error" | "unconfigured";
  url?: string;
  container: string;
  startedAt?: string;
  message?: string;
}

const statusLabel: Record<DesktopSnapshot["status"], string> = {
  running: "运行中",
  stopped: "已停止",
  error: "需要处理",
  unconfigured: "未启用",
};

export function DesktopPanel({ api }: { api: MuseApi }) {
  const [snapshot, setSnapshot] = useState<DesktopSnapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    try {
      setSnapshot(await api.request<DesktopSnapshot>("/api/desktop"));
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [api]);
  useEffect(() => {
    void load();
  }, [load]);
  async function control(action: "start" | "stop") {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      // Restart must be a real stop followed by a fresh start: a wedged
      // container would make a no-op "重启" misleading.
      if (action === "start" && snapshot?.status === "running") {
        await api.request("/api/desktop/stop", {});
      }
      setSnapshot(await api.request<DesktopSnapshot>(`/api/desktop/${action}`, {}));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      void load();
    } finally {
      setBusy(false);
    }
  }
  const running = snapshot?.status === "running";
  return (
    <View style={{ gap: 12 }}>
      <View style={{ gap: 12, padding: 18, borderRadius: 20, backgroundColor: colors.lavender }}>
        <Text style={s.heading}>
          图形化桌面{snapshot ? ` · ${statusLabel[snapshot.status]}` : ""}
        </Text>
        <Text style={s.muted}>
          完整的 Linux 桌面环境：内置 Firefox
          浏览器（可上网）、中文界面与常用工具，画面实时呈现在下方，可直接操作。
        </Text>
      </View>
      <View style={[s.row, { gap: 8 }]}>
        <Button primary busy={busy} disabled={busy} onPress={() => void control("start")}>
          {running ? "重启桌面" : "启动桌面"}
        </Button>
        <Button busy={busy} disabled={!running || busy} onPress={() => void control("stop")}>
          停止桌面
        </Button>
        <Button small disabled={busy} onPress={() => void load()}>
          刷新
        </Button>
      </View>
      <ErrorNotice error={error} />
      {snapshot?.message ? <Text style={s.muted}>{snapshot.message}</Text> : null}
      {running && snapshot?.url ? (
        // startedAt changes on every boot: the key remounts the frame so noVNC
        // reconnects instead of keeping a dead socket after a restart.
        <DesktopFrame key={snapshot.startedAt ?? "boot"} url={snapshot.url} />
      ) : (
        <Text style={s.muted}>
          点击“启动桌面”，首次启动约需 20 秒，之后桌面画面会出现在这里，可直接用鼠标键盘操作。
        </Text>
      )}
    </View>
  );
}
