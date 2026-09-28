import {
  AppWindow,
  FileText,
  FolderOpen,
  Globe2,
  Monitor,
  Plus,
  RefreshCw,
  Terminal,
} from "lucide-react-native";
import { useEffect, useState } from "react";
import { AppState, Image, Pressable, Text, View } from "react-native";
import type { BrowserSession } from "../../../packages/domain/src";
import { browserAddress } from "./browser-address";
import { useComputerDraft } from "./computer-drafts";
import { LinuxWorkspace } from "./computer-workspace";
import { DesktopPanel } from "./desktop";
import { Button, Card, colors, ErrorNotice, Field, LinkRow, Sheet, s } from "./ui";
import { useWorkspace } from "./workspace";

export function ComputerEntry() {
  const { workspace, open } = useWorkspace();
  const available = workspace.connections.some(
    (c) => c.id === "browser" && c.status === "connected",
  );
  const active = workspace.browsers.filter((b) => b.status === "active").length;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="智能电脑 — 打开控制台"
      onPress={() => open({ type: "computer" })}
      style={[
        s.row,
        {
          alignSelf: "center",
          gap: 6,
          paddingHorizontal: 12,
          paddingVertical: 7,
          borderRadius: 20,
          backgroundColor: "#F1F3F4",
          pointerEvents: "auto",
        },
      ]}
    >
      <Monitor size={13} color={colors.muted} />
      <Text style={{ fontSize: 12, color: colors.muted }}>
        电脑
        {!available ? " · 离线" : active ? " · 接管中" : " · 就绪"}
      </Text>
      <View
        style={{
          width: 5,
          height: 5,
          borderRadius: 3,
          backgroundColor: available ? "#57AD85" : "#ACB0B5",
        }}
      />
    </Pressable>
  );
}
export function BrowserThreadCard({ browser }: { browser: BrowserSession }) {
  const { open } = useWorkspace();
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setFailed(false);
  }, [browser.previewUrl, browser.updatedAt]);
  return (
    <Card
      style={{ padding: 13, backgroundColor: "#EEEEF0", gap: 12, maxWidth: 440, width: "100%" }}
    >
      <View style={[s.row, { gap: 10 }]}>
        <View style={[s.iconBox, { width: 36, height: 36, borderRadius: 9 }]}>
          <Globe2 size={21} color={colors.blueDark} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[s.text, { fontWeight: "600" }]}>浏览器</Text>
          <Text numberOfLines={1} style={s.small}>
            {browser.status === "closed"
              ? "会话已保存"
              : browser.status === "error"
                ? "需要处理"
                : browser.title}
          </Text>
        </View>
      </View>
      {browser.previewUrl && browser.status === "active" && !failed ? (
        <Image
          accessibilityLabel={`浏览器画面：${browser.title}`}
          source={{ uri: browser.previewUrl }}
          style={{ width: "100%", aspectRatio: 1.6, borderRadius: 11, backgroundColor: "#FFF" }}
          resizeMode="contain"
          onError={() => setFailed(true)}
        />
      ) : (
        <View
          style={{
            padding: 24,
            borderRadius: 12,
            backgroundColor: "#FFF",
            alignItems: "center",
            gap: 10,
          }}
        >
          <Globe2 size={30} color={colors.muted} />
          <Text numberOfLines={2} style={[s.muted, { textAlign: "center" }]}>
            {failed ? "画面暂不可用，重新打开浏览器即可恢复。" : browser.url}
          </Text>
        </View>
      )}
      <Button onPress={() => open({ type: "browser", browser })}>
        {browser.status === "closed"
          ? "重新打开"
          : browser.status === "error"
            ? "重新连接"
            : "接管控制"}
      </Button>
    </Card>
  );
}
export function ComputerSheet() {
  const { workspace, api, refresh, close, open, navigate } = useWorkspace();
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [tab, setTab] = useComputerDraft("tab");
  const available = workspace.connections.some(
    (c) => c.id === "browser" && c.status === "connected",
  );
  useEffect(() => {
    let active = true;
    const timer = setInterval(() => {
      if (AppState.currentState !== "active") return;
      void refresh().catch((e) => {
        if (active) setError(e instanceof Error ? e.message : String(e));
      });
    }, 10000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [refresh]);
  async function create() {
    if (busy || !url.trim()) return;
    setBusy(true);
    setError("");
    try {
      const browser = await api.request<BrowserSession>("/api/browsers", {
        url: browserAddress(url),
      });
      await refresh();
      open({ type: "browser", browser });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  const tabs = [
    { key: "Browser", label: "浏览器", icon: Globe2 },
    { key: "Desktop", label: "桌面", icon: AppWindow },
    { key: "Terminal", label: "终端", icon: Terminal },
    { key: "Files", label: "文件", icon: FolderOpen },
  ] as const;
  return (
    <Sheet title="智能电脑" subtitle="你的智能体在这里工作，随时可以亲自上手。" onClose={close}>
      <View style={{ gap: 20 }}>
        {tab === "Browser" && (
          <View
            style={[s.row, { gap: 12, padding: 18, borderRadius: 20, backgroundColor: colors.sky }]}
          >
            <Monitor size={28} color={colors.blueDark} />
            <View style={{ flex: 1 }}>
              <Text style={s.heading}>{available ? "浏览器已连接" : "浏览器离线"}</Text>
              <Text style={s.muted}>
                {available
                  ? "智能体的浏览器和文档都在这里，随时接管。"
                  : "先启动浏览器 worker（pnpm dev:browser）即可连接。"}
              </Text>
            </View>
          </View>
        )}
        <View style={[s.row, { gap: 8 }]}>
          {tabs.map(({ key, label, icon }) => (
            <Button key={key} primary={tab === key} icon={icon} onPress={() => setTab(key)}>
              {label}
            </Button>
          ))}
        </View>
        {tab === "Desktop" ? (
          <DesktopPanel api={api} />
        ) : (
          <View style={{ display: tab === "Browser" ? "none" : "flex" }}>
            <LinuxWorkspace tab={tab === "Files" ? "Files" : "Terminal"} />
          </View>
        )}
        <ErrorNotice error={error} />
        {tab === "Browser" ? (
          <>
            <View>
              <Field
                label="网址"
                value={url}
                onChangeText={setUrl}
                placeholder="https://example.com"
                autoCapitalize="none"
                keyboardType="url"
                onSubmitEditing={() => void create()}
              />
              <Button
                primary
                icon={Plus}
                busy={busy}
                disabled={!available || !url.trim()}
                onPress={() => void create()}
              >
                打开浏览会话
              </Button>
            </View>
            {[...workspace.browsers]
              .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
              .map((browser) => (
                <BrowserThreadCard key={browser.id} browser={browser} />
              ))}
            {!workspace.browsers.length && (
              <Text style={s.muted}>
                在这里打开网页，或让智能体帮你调研——它的浏览会话会出现在这里。
              </Text>
            )}
            <Text style={s.small}>
              每个浏览会话保留独立的登录态和下载记录；打开即可接管，回到对话不留痕迹。
            </Text>
          </>
        ) : tab === "Files" ? (
          <>
            <Text style={s.heading}>文档</Text>
            <Text style={s.small}>来自邮件、浏览器下载和你上传的 PDF。</Text>
            {workspace.files.map((file) => (
              <LinkRow
                key={file.id}
                icon={FileText}
                title={file.name}
                detail={`${file.pageCount} 页 · PDF`}
                onPress={() => open({ type: "file", file })}
              />
            ))}
            <Button
              icon={Plus}
              onPress={() => {
                close();
                navigate("files");
              }}
            >
              导入文档
            </Button>
          </>
        ) : null}
        <Button
          small
          icon={RefreshCw}
          onPress={() =>
            void refresh()
              .then(() => setError(""))
              .catch((e) => setError(String(e)))
          }
        >
          刷新电脑状态
        </Button>
      </View>
    </Sheet>
  );
}
