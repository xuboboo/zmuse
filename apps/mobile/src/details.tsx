import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import {
  CalendarDays,
  Check,
  Clock3,
  Download,
  Edit3,
  ExternalLink,
  FileText,
  Globe2,
  Mail as MailIcon,
  Reply,
  RotateCw,
  Save,
  Send,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react-native";
import { useEffect, useState } from "react";
import { ActivityIndicator, Image, Linking, Platform, Text, View } from "react-native";
import {
  type ActionProposal,
  type Artifact,
  type BrowserSession,
  type CalendarEvent,
  type EmailDraft,
  type EventDraft,
  emailDraftSchema,
  eventDraftSchema,
  type Mail,
  type ProposalInput,
} from "../../../packages/domain/src";
import { DelegateSheet, NotificationsSheet, TaskDetail } from "./agent-ui";
import BrowserConsole from "./BrowserConsole";
import { browserAddress, browserSite } from "./browser-address";
import { ComputerSheet } from "./computer";
import DateTimeEditor from "./DateTimeEditor";
import { localDateTime, zonedInstant } from "./date-time";
import PdfReader from "./PdfReader";
import {
  actionStatusLabel,
  Button,
  browserStatusLabel,
  Card,
  CheckRow,
  Chip,
  colors,
  dateLabel,
  Empty,
  ErrorNotice,
  Field,
  LinkRow,
  resultSummary,
  SectionHeading,
  Sheet,
  s,
  timeLabel,
} from "./ui";
import { type Detail, useWorkspace } from "./workspace";
export function Details({ detail }: { detail: Detail }) {
  const { close, navigate } = useWorkspace();
  if (detail.type === "computer") return <ComputerSheet />;
  if (detail.type === "task") return <TaskDetail taskId={detail.taskId} />;
  if (detail.type === "delegate") return <DelegateSheet />;
  if (detail.type === "notifications") return <NotificationsSheet />;
  if (detail.type === "mail") return <MailDetail mail={detail.mail} />;
  if (detail.type === "email") return <EmailEditor draft={detail.draft} />;
  if (detail.type === "event")
    return <EventEditor event={detail.event} draft={detail.draft} neighbors={detail.neighbors} />;
  if (detail.type === "file") return <FileDetail file={detail.file} />;
  if (detail.type === "review") return <ReviewDetail initial={detail.action} />;
  if (detail.type === "browser") return <BrowserDetail initial={detail.browser} />;
  return (
    <Sheet title="你的工作区" subtitle="一切，从容安放。" onClose={close}>
      {[
        { section: "mail" as const, title: "邮件", icon: MailIcon },
        { section: "calendar" as const, title: "日历", icon: CalendarDays },
        { section: "browser" as const, title: "浏览器", icon: Globe2 },
        { section: "files" as const, title: "文件", icon: FileText },
        { section: "activity" as const, title: "动态", icon: Clock3 },
        { section: "connections" as const, title: "连接", icon: ShieldCheck },
      ].map((item) => (
        <LinkRow
          key={item.section}
          title={item.title}
          icon={item.icon}
          onPress={() => {
            navigate(item.section);
            close();
          }}
        />
      ))}
    </Sheet>
  );
}
function MailDetail({ mail: m }: { mail: Mail }) {
  const { workspace: w, api, refresh, open, close } = useWorkspace();
  const [error, setError] = useState("");
  const [importing, setImporting] = useState("");
  async function importAttachment(reference: string) {
    setError("");
    setImporting(reference);
    try {
      const file = await api.request<Artifact>("/api/mail/import-attachment", { reference });
      await refresh();
      open({ type: "file", file });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setImporting("");
    }
  }
  const [thread, setThread] = useState<Mail[]>([m]);
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    void api
      .request<Mail[]>(`/api/mail/threads/${encodeURIComponent(m.threadId)}`)
      .then((items) => {
        if (active) setThread(items.sort((a, b) => a.date.localeCompare(b.date)));
      })
      .catch((e) => {
        if (active) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [api, m.threadId, retry]);
  return (
    <Sheet title={m.subject} subtitle={`${thread.length} 封邮件`} onClose={close}>
      {loading && (
        <View style={[s.row, { gap: 10, paddingBottom: 20 }]}>
          <ActivityIndicator color={colors.blueDark} />
          <Text style={s.muted}>正在加载会话…</Text>
        </View>
      )}
      {thread.map((message) => (
        <Card key={message.id} style={{ marginBottom: 16 }}>
          <View style={s.between}>
            <View style={{ gap: 4, flex: 1 }}>
              <Text style={s.heading}>{message.sender}</Text>
              <Text style={s.small}>{message.from}</Text>
              <Text style={s.small}>收件人：{message.to.join("、")}</Text>
            </View>
            <Text style={s.small}>
              {dateLabel(message.date)} · {timeLabel(message.date)}
            </Text>
          </View>
          <View style={s.divider} />
          <Text selectable style={[s.text, { lineHeight: 25 }]}>
            {message.body}
          </Text>
          {message.attachments.map((id) => {
            const file = w.files.find((f) => f.id === id);
            return file ? (
              <LinkRow
                key={id}
                title={file.name}
                detail={`${file.pageCount} 页 · PDF 附件`}
                icon={FileText}
                onPress={() => open({ type: "file", file })}
              />
            ) : (
              <Button
                key={id}
                busy={importing === id}
                icon={FileText}
                onPress={() => void importAttachment(id)}
              >
                {decodeURIComponent(id.split(":").slice(2).join(":")) || "打开附件"}
              </Button>
            );
          })}
        </Card>
      ))}
      <ErrorNotice error={error} />
      {!!error && <Button onPress={() => setRetry(retry + 1)}>重新加载会话</Button>}
      <Button
        primary
        icon={Reply}
        style={{ alignSelf: "flex-start" }}
        onPress={() =>
          open({
            type: "email",
            draft: {
              to: [m.from],
              subject: /^re:/i.test(m.subject) ? m.subject : `Re: ${m.subject}`,
              body: "",
              cc: [],
              bcc: [],
              attachmentIds: [],
              threadId: m.threadId,
              replyToMessageId: m.id,
            },
          })
        }
      >
        写回复
      </Button>
    </Sheet>
  );
}
function EmailEditor({ draft }: { draft?: Partial<EmailDraft> & { id?: string } }) {
  const { workspace: w, api, refresh, open, close, notify } = useWorkspace();
  const [to, setTo] = useState(draft?.to?.join(", ") || "");
  const [cc, setCc] = useState(draft?.cc?.join(", ") || "");
  const [bcc, setBcc] = useState(draft?.bcc?.join(", ") || "");
  const [subject, setSubject] = useState(draft?.subject || "");
  const [body, setBody] = useState(draft?.body || "");
  const [attachments, setAttachments] = useState(draft?.attachmentIds || []);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  function emails(value: string) {
    return value
      .split(/[,;\n]/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  async function save(review: boolean) {
    setBusy(review ? "review" : "draft");
    setError("");
    try {
      const parsed = emailDraftSchema.safeParse({
        to: emails(to),
        cc: emails(cc),
        bcc: emails(bcc),
        subject,
        body,
        attachmentIds: attachments,
        threadId: draft?.threadId,
        replyToMessageId: draft?.replyToMessageId,
      });
      if (!parsed.success)
        throw new Error(
          parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("\n"),
        );
      if (review) {
        const action = await api.request<ActionProposal>("/api/actions", {
          kind: "email.send",
          data: parsed.data,
        });
        await refresh();
        open({ type: "review", action });
      } else {
        await api.request("/api/drafts", {
          ...parsed.data,
          ...(draft?.id ? { id: draft.id } : {}),
        });
        await refresh();
        notify("草稿已保存在 ZMuse。");
        close();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy("");
    }
  }
  return (
    <Sheet
      title={draft?.threadId ? "写回复" : "新邮件"}
      subtitle={`来自 ${w.profile.email} · 私密保存在 ZMuse`}
      onClose={close}
    >
      <Field
        label="收件人"
        value={to}
        onChangeText={setTo}
        placeholder="person@example.com"
        autoCapitalize="none"
        keyboardType="email-address"
      />
      <View style={{ flexDirection: "row", gap: 16 }}>
        <View style={{ flex: 1 }}>
          <Field
            label="抄送"
            value={cc}
            onChangeText={setCc}
            placeholder="可选"
            autoCapitalize="none"
          />
        </View>
        <View style={{ flex: 1 }}>
          <Field
            label="密送"
            value={bcc}
            onChangeText={setBcc}
            placeholder="可选"
            autoCapitalize="none"
          />
        </View>
      </View>
      <Field label="主题" value={subject} onChangeText={setSubject} placeholder="想写点什么？" />
      <Field
        label="正文"
        value={body}
        onChangeText={setBody}
        multiline
        placeholder="开始输入内容…"
        style={{ minHeight: 210 }}
      />
      {w.files.length > 0 && (
        <Card style={{ padding: 16, marginBottom: 18 }}>
          <Text style={[s.heading, { fontSize: 13, marginBottom: 5 }]}>附件</Text>
          {w.files.map((f) => (
            <CheckRow
              key={f.id}
              checked={attachments.includes(f.id)}
              label={`${f.name} · ${Math.max(1, Math.round(f.size / 1024))} KB`}
              onPress={() =>
                setAttachments(
                  attachments.includes(f.id)
                    ? attachments.filter((id) => id !== f.id)
                    : [...attachments, f.id],
                )
              }
            />
          ))}
        </Card>
      )}
      <ErrorNotice error={error} />
      <View style={[s.row, { gap: 10, flexWrap: "wrap" }]}>
        <Button
          primary
          icon={ShieldCheck}
          busy={busy === "review"}
          disabled={!!busy}
          onPress={() => void save(true)}
        >
          审阅邮件
        </Button>
        <Button
          icon={Save}
          busy={busy === "draft"}
          disabled={!!busy}
          onPress={() => void save(false)}
        >
          保存草稿
        </Button>
      </View>
      <Text style={[s.small, { marginTop: 13 }]}>发送前，你可以核对收件人、正文与附件。</Text>
    </Sheet>
  );
}
function EventEditor({
  event: e,
  draft,
  neighbors,
}: {
  event?: CalendarEvent;
  draft?: EventDraft;
  neighbors?: CalendarEvent[];
}) {
  const seed = e || draft;
  const { workspace: w, api, open, close, refresh } = useWorkspace();
  const initialStart = new Date();
  initialStart.setMinutes(0, 0, 0);
  initialStart.setHours(initialStart.getHours() + 1);
  const [title, setTitle] = useState(seed?.title || "");
  const [start, setStart] = useState(seed?.start || initialStart.toISOString());
  const [end, setEnd] = useState(
    seed?.end || new Date(initialStart.getTime() + 3600000).toISOString(),
  );
  const [allDay, setAllDay] = useState(seed?.allDay || false);
  const [zone, setZone] = useState(
    seed?.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone,
  );
  const [location, setLocation] = useState(seed?.location || "");
  const [description, setDescription] = useState(seed?.description || "");
  const [attendees, setAttendees] = useState(seed?.attendees.join(", ") || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const conflicts = (neighbors || w.events).filter(
    (item) =>
      item.id !== e?.id &&
      Date.parse(start) < Date.parse(item.end) &&
      Date.parse(end) > Date.parse(item.start),
  );
  async function propose(remove = false) {
    setBusy(true);
    setError("");
    try {
      let data: ProposalInput;
      if (remove && e) {
        data = {
          kind: "calendar.delete",
          data: { eventId: e.id, calendarId: e.calendarId, title: e.title },
        };
      } else {
        const parsed = eventDraftSchema.safeParse({
          calendarId: e?.calendarId || draft?.calendarId || "primary",
          title,
          start,
          end,
          allDay,
          timeZone: zone,
          location,
          description,
          attendees: attendees
            .split(/[,;\n]/)
            .map((a) => a.trim())
            .filter(Boolean),
        });
        if (!parsed.success)
          throw new Error(
            parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("\n"),
          );
        data = e
          ? { kind: "calendar.update", data: { ...parsed.data, eventId: e.id } }
          : { kind: "calendar.create", data: parsed.data };
      }
      const action = await api.request<ActionProposal>("/api/actions", data);
      await refresh();
      open({ type: "review", action });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Sheet
      title={e ? "留一点时间" : "值得期待的事"}
      subtitle={e ? "编辑该事件，然后确认修改。" : "在你的日历中创建事件。"}
      onClose={close}
    >
      <Field
        label="事件标题"
        value={title}
        onChangeText={setTitle}
        placeholder="为什么事情腾时间？"
      />
      <CheckRow
        label="全天事件"
        checked={allDay}
        onPress={() => {
          try {
            if (!allDay) {
              const local = localDateTime(start, zone);
              const endDay = new Date(`${local.date}T12:00:00Z`);
              endDay.setUTCDate(endDay.getUTCDate() + 1);
              setStart(local.date);
              setEnd(endDay.toISOString().slice(0, 10));
            } else {
              setStart(zonedInstant(start, "09:00", zone));
              setEnd(zonedInstant(start, "10:00", zone));
            }
            setAllDay(!allDay);
            setError("");
          } catch (cause) {
            setError(cause instanceof Error ? cause.message : String(cause));
          }
        }}
      />
      <DateTimeEditor
        label="开始时间"
        value={start}
        onChange={setStart}
        timeZone={zone}
        allDay={allDay}
      />
      <DateTimeEditor
        label="结束时间"
        value={end}
        onChange={setEnd}
        timeZone={zone}
        allDay={allDay}
      />
      {allDay && (
        <Text style={[s.small, { marginBottom: 15 }]}>结束日期是事件最后一天的次日。</Text>
      )}
      <Field label="时区" value={zone} onChangeText={setZone} placeholder="America/Los_Angeles" />
      <Field
        label="地点或会议链接"
        value={location}
        onChangeText={setLocation}
        placeholder="可选"
      />
      <Field
        label="参与者"
        value={attendees}
        onChangeText={setAttendees}
        placeholder="邮箱地址，用逗号分隔"
      />
      <Field
        label="备注"
        value={description}
        onChangeText={setDescription}
        multiline
        placeholder="还有什么要留意的？"
      />
      {!!conflicts.length && (
        <Card style={{ backgroundColor: colors.orange, padding: 16, marginBottom: 16 }}>
          <Text style={s.heading}>时间有冲突</Text>
          {conflicts.map((c) => (
            <Text key={c.id} style={s.muted}>
              {c.title} · {timeLabel(c.start, c.timeZone)}–{timeLabel(c.end, c.timeZone)}
            </Text>
          ))}
        </Card>
      )}
      <ErrorNotice error={error} />
      <View style={[s.row, { gap: 10, flexWrap: "wrap" }]}>
        <Button primary icon={ShieldCheck} busy={busy} onPress={() => void propose()}>
          {e ? "审阅修改" : "审阅事件"}
        </Button>
        {e && (
          <Button icon={Trash2} disabled={busy} danger onPress={() => void propose(true)}>
            审阅删除
          </Button>
        )}
      </View>
    </Sheet>
  );
}
function ReviewDetail({ initial }: { initial: ActionProposal }) {
  const { workspace: w, api, refresh, close, open } = useWorkspace();
  const [local, setLocal] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const action =
    local.status !== initial.status ? local : w.actions.find((a) => a.id === initial.id) || local;
  const d = action.data;
  const pending = action.status === "awaiting_review";
  async function decide(decision: "approve" | "deny") {
    setBusy(true);
    setError("");
    try {
      const result = await api.request<ActionProposal>(`/api/actions/${action.id}/decide`, {
        decision,
        hash: action.hash,
      });
      setLocal(result);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  async function edit() {
    setBusy(true);
    setError("");
    try {
      let next: Detail;
      if (action.kind === "email.send")
        next = { type: "email", draft: emailDraftSchema.parse(action.data) };
      else {
        const draft = eventDraftSchema.parse(action.data);
        if (action.kind === "calendar.update") {
          const eventId = action.data.eventId;
          if (typeof eventId !== "string" || !eventId)
            throw new Error("缺少事件引用，请在日历中重新打开该事件。");
          next = { type: "event", event: { ...draft, id: eventId } };
        } else next = { type: "event", draft };
      }
      await api.request(`/api/actions/${action.id}/decide`, {
        decision: "deny",
        hash: action.hash,
      });
      await refresh();
      open(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  const email = action.kind === "email.send";
  return (
    <Sheet
      title={pending ? "最后确认" : action.title}
      subtitle={
        w.mode === "sample" ? "此操作仅保存在本地工作区。" : "在更改已连接账户前，请核对这一操作。"
      }
      onClose={close}
    >
      <View style={[s.row, { gap: 13, marginBottom: 21 }]}>
        <View style={[s.iconBox, { backgroundColor: colors.lavender }]}>
          <ShieldCheck size={22} color={colors.text} />
        </View>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={s.heading}>{action.title}</Text>
          <Text style={s.small}>{action.kind.replace(".", " · ")}</Text>
        </View>
        <Chip tint={pending ? colors.lavender : colors.green}>
          {actionStatusLabel(action.status)}
        </Chip>
      </View>
      <Card style={{ gap: 13 }}>
        <ReviewLine label="账户" value={action.account || w.profile.email} />
        {email ? (
          <>
            <ReviewLine label="收件人" value={arrayText(d.to)} />
            <ReviewLine label="抄送" value={arrayText(d.cc) || "无"} />
            <ReviewLine label="密送" value={arrayText(d.bcc) || "无"} />
            <ReviewLine label="主题" value={String(d.subject || "")} />
            <View style={s.divider} />
            <Text selectable style={[s.text, { lineHeight: 25 }]}>
              {String(d.body || "")}
            </Text>
            <View style={s.divider} />
            <Text style={s.label}>附件</Text>
            {Array.isArray(d.attachmentIds) && d.attachmentIds.length ? (
              d.attachmentIds.map((id) => {
                const file = w.files.find((f) => f.id === id);
                return (
                  <Text key={String(id)} style={s.text}>
                    {file?.name || String(id)} · 版本 {String(id).slice(-8)}
                  </Text>
                );
              })
            ) : (
              <Text style={s.muted}>无附件</Text>
            )}
          </>
        ) : (
          <>
            <ReviewLine label="事件" value={String(d.title || "")} />
            {action.kind !== "calendar.delete" && (
              <>
                <ReviewLine
                  label="开始时间"
                  value={
                    d.allDay
                      ? String(d.start || "")
                      : `${dateLabel(String(d.start || ""), { year: "numeric", month: "short", day: "numeric", timeZone: String(d.timeZone || "UTC") })} · ${timeLabel(String(d.start || ""), String(d.timeZone || "UTC"))}`
                  }
                />
                <ReviewLine
                  label="结束时间"
                  value={
                    d.allDay
                      ? `${String(d.end || "")}（不含当天）`
                      : `${dateLabel(String(d.end || ""), { year: "numeric", month: "short", day: "numeric", timeZone: String(d.timeZone || "UTC") })} · ${timeLabel(String(d.end || ""), String(d.timeZone || "UTC"))}`
                  }
                />
                <ReviewLine label="时区" value={String(d.timeZone || "")} />
                <ReviewLine label="全天" value={d.allDay ? "是" : "否"} />
                <ReviewLine label="地点" value={String(d.location || "无")} />
                <ReviewLine label="参与者" value={arrayText(d.attendees) || "只有你"} />
                <ReviewLine label="备注" value={String(d.description || "无")} />
              </>
            )}
            <ReviewLine label="日历" value={String(d.calendarId || "primary")} />
            <Text style={s.small}>
              {action.kind === "calendar.delete"
                ? "将删除该事件，并可能通知参与者。"
                : "参与者可能会收到你日历发出的邀请或更新。"}
            </Text>
          </>
        )}
      </Card>
      <ErrorNotice error={error || action.error} />
      {!!action.result && (
        <Card style={{ marginTop: 16, backgroundColor: colors.green, padding: 18 }}>
          <Text selectable style={s.text}>
            {resultSummary(action.result)}
          </Text>
        </Card>
      )}
      {pending ? (
        <>
          <Text style={[s.small, { marginVertical: 17 }]}>
            审阅将于{" "}
            {new Date(action.expiresAt).toLocaleString(undefined, {
              year: "numeric",
              month: "short",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
              timeZoneName: "short",
            })}{" "}
            过期。批准仅适用于上面显示的内容。
          </Text>
          <View style={[s.row, { gap: 10, flexWrap: "wrap" }]}>
            <Button primary icon={Check} busy={busy} onPress={() => void decide("approve")}>
              {w.mode === "sample" ? "本地批准" : email ? "批准并发送" : "批准修改"}
            </Button>
            {action.kind !== "calendar.delete" && (
              <Button icon={Edit3} disabled={busy} onPress={() => void edit()}>
                编辑内容
              </Button>
            )}
            <Button icon={X} disabled={busy} onPress={() => void decide("deny")}>
              暂不执行
            </Button>
          </View>
        </>
      ) : (
        <Button style={{ alignSelf: "flex-start", marginTop: 19 }} onPress={close}>
          完成
        </Button>
      )}
    </Sheet>
  );
}
function arrayText(value: unknown) {
  return Array.isArray(value) ? value.map(String).join(", ") : "";
}
function ReviewLine({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ gap: 4 }}>
      <Text style={s.label}>{label}</Text>
      <Text selectable style={s.text}>
        {value}
      </Text>
    </View>
  );
}
function FileDetail({ file: f }: { file: Artifact }) {
  const { api, refresh, open, close } = useWorkspace();
  const [values, setValues] = useState<Record<string, string | boolean>>(() =>
    Object.fromEntries(
      (f.fields || [])
        .filter((field) => field.type !== "unsupported")
        .map((field) => [
          field.name,
          field.type === "checkbox" ? field.value === "true" || field.value === "Yes" : field.value,
        ]),
    ),
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const url = api.url(f.url || `/api/files/${f.id}/content`);
  async function fill() {
    setBusy(true);
    setError("");
    try {
      const file = await api.request<Artifact>(`/api/files/${f.id}/fill`, { fields: values });
      await refresh();
      open({ type: "file", file });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  async function share() {
    setError("");
    try {
      if (Platform.OS === "web") {
        await Linking.openURL(url);
        return;
      }
      const target = `${FileSystem.cacheDirectory}${f.id}.pdf`;
      await FileSystem.downloadAsync(url, target, {
        headers: { Authorization: `Bearer ${api.token}` },
      });
      if (await Sharing.isAvailableAsync())
        await Sharing.shareAsync(target, { mimeType: "application/pdf", UTI: "com.adobe.pdf" });
      else throw new Error("此设备不支持分享。");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }
  return (
    <Sheet
      title={f.name}
      subtitle={`${f.pageCount} 页 · ${Math.max(1, Math.round(f.size / 1024))} KB · ${f.source}`}
      onClose={close}
      wide
    >
      <PdfReader url={url} token={api.token} pageCount={f.pageCount} />
      <View style={[s.row, { gap: 10, marginVertical: 18, flexWrap: "wrap" }]}>
        <Button icon={Download} onPress={() => void share()}>
          {Platform.OS === "web" ? "打开 / 下载" : "保存或分享"}
        </Button>
        <Button
          icon={Send}
          onPress={() => open({ type: "email", draft: { attachmentIds: [f.id] } })}
        >
          作为邮件附件
        </Button>
      </View>
      {f.fields && f.fields.length > 0 && (
        <Card>
          <SectionHeading title="填写此表单" />
          <Text style={[s.muted, { marginBottom: 18 }]}>
            在下方填写内容。保存会生成新副本，原文件保持不变。
          </Text>
          {f.fields.map((field) =>
            field.type === "unsupported" ? (
              <Text key={field.name} style={s.muted}>
                {field.name} · 暂不支持该字段类型
              </Text>
            ) : field.type === "checkbox" ? (
              <CheckRow
                key={field.name}
                checked={!!values[field.name]}
                label={field.name.replace(/_/g, " ").replace(/^./, (s) => s.toUpperCase())}
                onPress={() => setValues({ ...values, [field.name]: !values[field.name] })}
              />
            ) : (
              <Field
                key={field.name}
                label={field.name.replace(/_/g, " ").replace(/^./, (s) => s.toUpperCase())}
                value={String(values[field.name] || "")}
                onChangeText={(value) => setValues({ ...values, [field.name]: value })}
              />
            ),
          )}
          <Button primary icon={Save} busy={busy} onPress={() => void fill()}>
            保存填写后的副本
          </Button>
        </Card>
      )}
      <ErrorNotice error={error} />
      <Text style={[s.small, { marginTop: 15 }]}>
        添加于 {dateLabel(f.createdAt)}
        {f.parentId ? " · 填写后的副本" : ""}
      </Text>
    </Sheet>
  );
}
function BrowserDetail({ initial }: { initial: BrowserSession }) {
  const { workspace: w, api, refresh, close, notify } = useWorkspace();
  const [local, setLocal] = useState(initial);
  const [url, setUrl] = useState(initial.url);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  const latest = w.browsers.find((b) => b.id === initial.id);
  const browser = {
    ...(latest && latest.updatedAt > local.updatedAt ? latest : local),
    consoleUrl: local.consoleUrl,
    previewUrl: local.previewUrl,
  };
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    void api
      .request<BrowserSession>(`/api/browsers/${initial.id}`)
      .then((session) => {
        if (active) {
          setLocal(session);
          setLoading(false);
        }
      })
      .catch((e) => {
        if (active) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      active = false;
    };
  }, [api, initial.id, retry]);
  async function importDownloads() {
    setBusy(true);
    setError("");
    try {
      const result = await api.request<{
        files: Artifact[];
        failures: { name: string; message: string }[];
      }>(`/api/browsers/${browser.id}/import-downloads`, {});
      await refresh();
      if (result.failures.length)
        setError(
          result.failures.map((failure) => `${failure.name}: ${failure.message}`).join("\n"),
        );
      const files = result.files;
      notify(
        files.length
          ? `已将 ${files.length} 个 PDF 下载添加到文件。`
          : "本次会话没有新的 PDF 下载。",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  async function mutate(end = false) {
    if (busy || loading) return;
    setBusy(true);
    setError("");
    try {
      const result = await api.request<BrowserSession>(
        `/api/browsers/${browser.id}/${end ? "close" : browser.status === "closed" ? "reopen" : "navigate"}`,
        end ? {} : { url: browserAddress(url) },
      );
      setLocal(result);
      setUrl(result.url);
      await refresh();
      if (end) close();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Sheet
      title={browserSite(browser.url)}
      subtitle={`${browserStatusLabel(browser.status)} · 更新于 ${timeLabel(browser.updatedAt)}`}
      onClose={close}
      wide
    >
      <View style={[s.row, { gap: 10, marginBottom: 16 }]}>
        <View style={{ flex: 1 }}>
          <Field
            label="网址"
            value={url}
            onChangeText={setUrl}
            autoCapitalize="none"
            keyboardType="url"
            onSubmitEditing={() => void mutate()}
          />
        </View>
        <Button primary busy={busy} disabled={loading || !url.trim()} onPress={() => void mutate()}>
          {browser.status === "closed"
            ? "重新打开"
            : browser.status === "error"
              ? "重新连接"
              : "前往"}
        </Button>
      </View>
      <ErrorNotice error={error} />
      {loading ? (
        <View style={[s.row, { gap: 10, paddingVertical: 24 }]}>
          {error ? (
            <Button onPress={() => setRetry(retry + 1)}>重试连接</Button>
          ) : (
            <>
              <ActivityIndicator color={colors.blueDark} />
              <Text style={s.muted}>正在连接浏览器…</Text>
            </>
          )}
        </View>
      ) : browser.status === "active" && browser.consoleUrl ? (
        <BrowserConsole url={api.url(browser.consoleUrl)} />
      ) : browser.status === "active" && browser.previewUrl ? (
        <Image
          source={{ uri: api.url(browser.previewUrl) }}
          style={{ width: "100%", height: 450, backgroundColor: colors.canvas }}
          resizeMode="contain"
        />
      ) : (
        <Empty
          icon={Globe2}
          title={browser.status === "closed" ? "会话已关闭" : "预览不可用"}
          detail={
            browser.status === "closed"
              ? "配置与下载已保存。重新打开即可从上次继续。"
              : "重新连接以继续使用保存的浏览器配置。"
          }
        />
      )}
      <View style={[s.row, { gap: 10, marginTop: 18, flexWrap: "wrap" }]}>
        {!loading && browser.status === "active" && browser.consoleUrl && (
          <Button
            icon={ExternalLink}
            onPress={() => void Linking.openURL(api.url(browser.consoleUrl || ""))}
          >
            在窗口中打开浏览器
          </Button>
        )}
        {!loading && (
          <Button icon={RotateCw} disabled={busy} onPress={() => setRetry(retry + 1)}>
            刷新连接
          </Button>
        )}
        {!loading && browser.status !== "closed" && (
          <Button icon={Download} busy={busy} onPress={() => void importDownloads()}>
            导入 PDF 下载
          </Button>
        )}
        {!loading && browser.status !== "closed" && (
          <Button icon={X} danger busy={busy} onPress={() => void mutate(true)}>
            关闭会话
          </Button>
        )}
      </View>
    </Sheet>
  );
}
