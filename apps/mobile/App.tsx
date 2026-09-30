import { CopilotKitProvider } from "@copilotkit/react-native/headless";
import { StatusBar } from "expo-status-bar";
import { Bell, Check, X } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  Pressable,
  ScrollView,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import type { Section, Workspace } from "../../packages/domain/src";
import {
  AgentActivityScreen,
  AgentStatus,
  AppsScreen,
  GoalsScreen,
  IdeasScreen,
} from "./src/agent-ui";
import { AgentWorkspaceProvider, useAgentWorkspace } from "./src/agent-workspace";
import { API_URL, createSession, MuseApi } from "./src/api";
import { ChatScreen, WorkspaceTools } from "./src/chat";
import { ComputerEntry } from "./src/computer";
import { ComputerDraftProvider } from "./src/computer-drafts";
import { Details } from "./src/details";
import { AppToolbar } from "./src/macos-titlebar";
import { BrowserScreen, CalendarScreen, FilesScreen, MailScreen } from "./src/screens";
import { ZSidebar } from "./src/sidebar";
import { ThreadsProvider, ThreadsSheet, useMuseThread } from "./src/threads";
import { Button, Card, colors, ErrorNotice, Field, IconButton, Mascot, s } from "./src/ui";
import { type Detail, useWorkspace, WorkspaceContext } from "./src/workspace";

const titles: Partial<Record<Section, { title: string; subtitle: string }>> = {
  activity: { title: "动态", subtitle: "计划、进度、决定与结果。" },
  ideas: { title: "想法", subtitle: "基于你的世界，给出有用的下一步。" },
  goals: {
    title: "目标",
    subtitle: "长期目标，以及值得持续关注的事。",
  },
  apps: {
    title: "应用",
    subtitle: "连接、能力，以及智能体记住的事。",
  },
  connections: { title: "应用", subtitle: "连接与能力。" },
  mail: { title: "邮件", subtitle: "工作背后的往来对话。" },
  calendar: { title: "日历", subtitle: "把时间留给重要的事。" },
  browser: { title: "浏览器", subtitle: "你连接过的浏览会话。" },
  files: { title: "文件", subtitle: "文档、表单与填写好的副本。" },
};
export default function App() {
  const [token, setToken] = useState("");
  const [accessKey, setAccessKey] = useState("");
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const connect = useCallback(async (key?: string) => {
    setBusy(true);
    setError("");
    try {
      const session = await createSession(key);
      setToken(session.token);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, []);
  useEffect(() => {
    void connect();
  }, [connect]);
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      {token ? (
        <CopilotKitProvider
          runtimeUrl={`${API_URL}/api/copilotkit`}
          headers={{ Authorization: `Bearer ${token}` }}
        >
          <WorkspaceApp token={token} />
        </CopilotKitProvider>
      ) : (
        <SafeAreaView
          style={{
            flex: 1,
            backgroundColor: colors.canvas,
            justifyContent: "center",
            alignItems: "center",
            padding: 24,
          }}
        >
          <View style={{ width: "100%", maxWidth: 420, gap: 22, alignItems: "center" }}>
            <Mascot size={72} />
            <Text
              style={{ fontSize: 32, color: colors.text, letterSpacing: -1, fontWeight: "500" }}
            >
              Welcome to ZMuse.
            </Text>
            <Text style={[s.muted, { textAlign: "center" }]}>A little room for your day.</Text>
            {busy ? (
              <ActivityIndicator color={colors.blueDark} />
            ) : (
              <Card style={{ width: "100%" }}>
                <ErrorNotice error={error} />
                <Field
                  label="工作区访问口令"
                  value={accessKey}
                  onChangeText={setAccessKey}
                  secureTextEntry
                  placeholder="正式工作区必填"
                />
                <Button primary onPress={() => void connect(accessKey || undefined)}>
                  Open workspace
                </Button>
                <Text style={[s.small, { marginTop: 15 }]}>
                  Local workspaces open without a key. Make sure your ZMuse server is running at{" "}
                  {API_URL}.
                </Text>
              </Card>
            )}
          </View>
        </SafeAreaView>
      )}
    </SafeAreaProvider>
  );
}
function WorkspaceApp({ token }: { token: string }) {
  const api = useMemo(() => new MuseApi(token), [token]);
  const [workspace, setWorkspace] = useState<Workspace>();
  const [section, setSection] = useState<Section>("chat");
  const [detail, setDetail] = useState<Detail>();
  const [toast, setToast] = useState("");
  const [error, setError] = useState("");
  const [prompt, setPrompt] = useState<{ id: number; text: string }>();
  const refresh = useCallback(async () => {
    const snapshot = await api.request<Workspace>("/api/workspace");
    setWorkspace(snapshot);
    setError("");
  }, [api]);
  useEffect(() => {
    void refresh().catch((e) => setError(String(e)));
  }, [refresh]);
  useEffect(() => {
    const listener = AppState.addEventListener("change", (state) => {
      if (state === "active") void refresh().catch((e) => setError(String(e)));
    });
    return () => listener.remove();
  }, [refresh]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 5500);
    return () => clearTimeout(timer);
  }, [toast]);
  const navigate = useCallback(
    (next: Section) =>
      setSection(next === "today" ? "chat" : next === "connections" ? "apps" : next),
    [],
  );
  const open = useCallback((next: Detail) => setDetail(next), []);
  const close = useCallback(() => setDetail(undefined), []);
  const ask = useCallback((text: string) => {
    setPrompt({ id: Date.now(), text });
    setSection("chat");
  }, []);
  if (!workspace)
    return (
      <SafeAreaView
        style={{
          flex: 1,
          backgroundColor: colors.canvas,
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
          gap: 18,
        }}
      >
        <Mascot size={56} />
        {error ? (
          <>
            <ErrorNotice error={error} />
            <Button onPress={() => void refresh().catch((e) => setError(String(e)))}>
              Try again
            </Button>
          </>
        ) : (
          <>
            <ActivityIndicator color={colors.blueDark} />
            <Text style={s.muted}>Opening your workspace…</Text>
          </>
        )}
      </SafeAreaView>
    );
  return (
    <WorkspaceContext.Provider
      value={{ workspace, api, section, navigate, refresh, open, close, notify: setToast, ask }}
    >
      <AgentWorkspaceProvider>
        <ComputerDraftProvider key={token}>
          <ThreadsProvider>
            <WorkspaceShell
              detail={detail}
              toast={toast}
              clearToast={() => setToast("")}
              error={error}
              prompt={prompt}
            />
          </ThreadsProvider>
        </ComputerDraftProvider>
      </AgentWorkspaceProvider>
    </WorkspaceContext.Provider>
  );
}
function WorkspaceShell({
  detail,
  toast,
  clearToast,
  error,
  prompt,
}: {
  detail?: Detail;
  toast: string;
  clearToast: () => void;
  error: string;
  prompt?: { id: number; text: string };
}) {
  const { workspace, section, navigate, open } = useWorkspace();
  const { data } = useAgentWorkspace();
  const {
    selection,
    visited,
    mainId,
    start: startThread,
    loading: threadsLoading,
    error: threadsError,
    retry: retryThreads,
    enabled: richThreads,
  } = useMuseThread();
  const [threadsOpen, setThreadsOpen] = useState(false);
  const { width } = useWindowDimensions();
  const desktop = width >= 900;
  const pending =
    (data?.notifications.filter((n) => !n.read).length || 0) +
    workspace.actions.filter((a) => a.status === "awaiting_review").length;
  const title = titles[section] || titles.apps;
  const Screen =
    section === "mail"
      ? MailScreen
      : section === "calendar"
        ? CalendarScreen
        : section === "browser"
          ? BrowserScreen
          : section === "files"
            ? FilesScreen
            : section === "activity"
              ? AgentActivityScreen
              : section === "ideas"
                ? IdeasScreen
                : section === "goals"
                  ? GoalsScreen
                  : AppsScreen;
  const utility = ["mail", "calendar", "browser", "files"].includes(section);
  return (
    <>
      <WorkspaceTools />
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }} edges={["top", "bottom"]}>
        <AppToolbar
          title={
            section === "chat"
              ? selection.id === mainId
                ? "主对话"
                : selection.existing
                  ? "侧聊"
                  : "新对话"
              : (title?.title ?? "ZMuse")
          }
        />
        <View style={{ flex: 1, flexDirection: "row" }}>
          <ZSidebar
            section={section}
            navigate={(s) => navigate(s as Section)}
            pending={pending}
            computer={section === "chat" ? <ComputerEntry /> : null}
            manageThreads={() => setThreadsOpen(true)}
            newChat={() => {
              startThread();
              navigate("chat");
            }}
          />
          <View style={{ flex: 1, minWidth: 0 }}>
            <View
              style={{
                height: 46,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "flex-end",
                paddingRight: 16,
              }}
            >
              <View>
                <IconButton
                  icon={Bell}
                  label={`通知，${pending} 条未读或待处理`}
                  onPress={() => open({ type: "notifications" })}
                />
                {pending > 0 && (
                  <View
                    pointerEvents="none"
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: 4,
                      position: "absolute",
                      top: 7,
                      right: 9,
                      backgroundColor: colors.blueDark,
                    }}
                  />
                )}
              </View>
            </View>
            <View style={{ flex: 1, minHeight: 0 }}>
              {section !== "chat" && (
                <ScrollView
                  key={section}
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={{
                    paddingHorizontal: desktop ? 42 : 22,
                    paddingBottom: 28,
                    maxWidth: 900,
                    width: "100%",
                    alignSelf: "center",
                  }}
                  keyboardShouldPersistTaps="handled"
                >
                  {utility && (
                    <Button
                      small
                      style={{ alignSelf: "flex-start", marginBottom: 18 }}
                      onPress={() => navigate("apps")}
                    >
                      返回应用
                    </Button>
                  )}
                  <Text style={[s.title, { fontSize: 25, marginBottom: 22 }]}>{title?.title}</Text>
                  <ErrorNotice error={error} />
                  <Screen />
                </ScrollView>
              )}
              <View
                style={{
                  display: section === "chat" ? "flex" : "none",
                  flex: 1,
                  paddingHorizontal: desktop ? 42 : 17,
                  width: "100%",
                  maxWidth: 900,
                  alignSelf: "center",
                }}
              >
                <AgentStatus />
                {richThreads ? (
                  <>
                    <ErrorNotice error={threadsError} />
                    {threadsError ? (
                      <Button onPress={retryThreads}>Retry main chat</Button>
                    ) : threadsLoading ? (
                      <ActivityIndicator color={colors.blueDark} />
                    ) : null}
                    {visited.map((thread) => (
                      <View
                        key={thread.id}
                        style={{ display: selection.id === thread.id ? "flex" : "none", flex: 1 }}
                      >
                        <ChatScreen
                          thread={thread}
                          active={section === "chat" && selection.id === thread.id}
                          prompt={selection.id === thread.id ? prompt : undefined}
                        />
                      </View>
                    ))}
                  </>
                ) : (
                  <ChatScreen prompt={prompt} active={section === "chat"} />
                )}
              </View>
            </View>
          </View>
        </View>
        {!!toast && (
          <View
            pointerEvents="box-none"
            style={{ position: "absolute", bottom: 94, left: 20, right: 20, alignItems: "center" }}
          >
            <View
              style={[
                s.row,
                {
                  gap: 10,
                  padding: 14,
                  backgroundColor: colors.text,
                  borderRadius: 20,
                  maxWidth: 560,
                },
              ]}
            >
              <Check size={16} color={colors.blue} />
              <Text style={{ color: "#FFF", fontSize: 13, flexShrink: 1 }}>{toast}</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="关闭通知"
                onPress={clearToast}
              >
                <X size={16} color="#FFF" />
              </Pressable>
            </View>
          </View>
        )}
        {threadsOpen && <ThreadsSheet onClose={() => setThreadsOpen(false)} />}
        {detail && (
          <Details
            key={
              detail.type === "task"
                ? detail.taskId
                : detail.type === "file"
                  ? detail.file.id
                  : detail.type === "browser"
                    ? detail.browser.id
                    : detail.type === "mail"
                      ? detail.mail.id
                      : detail.type === "review"
                        ? detail.action.id
                        : detail.type === "email"
                          ? JSON.stringify(detail.draft)
                          : detail.type === "event"
                            ? detail.event?.id || "event-new"
                            : detail.type
            }
            detail={detail}
          />
        )}
      </SafeAreaView>
    </>
  );
}
