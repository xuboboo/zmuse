import { Mail, Search } from "lucide-react-native";
import { useContext } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { z } from "zod";
import { BrowserRunContext } from "./browser-tool-card";
import { Button, Card, colors, ErrorNotice, s } from "./ui";
import { useWorkspace } from "./workspace";

const messageSchema = z.object({
  id: z.string(),
  threadId: z.string(),
  sender: z.string(),
  from: z.string(),
  to: z.array(z.string()),
  subject: z.string(),
  body: z.string(),
  date: z.string(),
  unread: z.boolean(),
  label: z.string(),
  attachments: z.array(z.string()),
});

export function MailToolCard({
  result,
  loading,
  search = false,
}: {
  result: unknown;
  loading: boolean;
  search?: boolean;
}) {
  const { open } = useWorkspace();
  const { active } = useContext(BrowserRunContext);
  let value = result;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      value = undefined;
    }
  }
  const error = z.object({ error: z.string() }).safeParse(value);
  if (error.success) return <ErrorNotice error={error.data.error} />;
  if (loading)
    return (
      <View style={[s.row, { gap: 10, padding: 14 }]}>
        {active ? (
          <ActivityIndicator size="small" color={colors.blueDark} />
        ) : (
          <Mail size={16} color={colors.muted} />
        )}
        <Text style={s.muted}>
          {!active ? "邮件读取已暂停" : search ? "正在检查收件箱…" : "正在读取邮件…"}
        </Text>
      </View>
    );
  if (search) {
    const parsed = z
      .object({ matches: z.array(z.object({ id: z.string() })), truncated: z.boolean() })
      .safeParse(value);
    if (!parsed.success) return <ErrorNotice error="邮箱没有返回可读结果。" />;
    const count = parsed.data.matches.length;
    return (
      <View style={[s.row, { gap: 9, padding: 12 }]}>
        <Search size={16} color={colors.muted} />
        <Text style={s.muted}>
          {count ? `找到${parsed.data.truncated ? "至少 " : ""}${count} 封邮件` : "没有匹配的邮件"}
        </Text>
      </View>
    );
  }
  const parsed = z
    .object({ messages: z.array(messageSchema), truncated: z.boolean() })
    .safeParse(value);
  if (!parsed.success) return <ErrorNotice error="无法显示这封邮件。" />;
  const message = parsed.data.messages.at(-1);
  if (!message) return <Text style={s.muted}>该会话中没有邮件。</Text>;
  return (
    <Card
      style={{ padding: 18, gap: 14, backgroundColor: "#F0EFF2", maxWidth: 440, width: "100%" }}
    >
      <View style={[s.row, { gap: 10 }]}>
        <View style={[s.iconBox, { backgroundColor: "#E9F5FC" }]}>
          <Mail size={20} color={colors.blueDark} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[s.text, { fontWeight: "600" }]}>{message.sender}</Text>
          <Text style={s.small}>邮件 · {parsed.data.messages.length} 封</Text>
        </View>
      </View>
      <Text style={s.heading}>{message.subject}</Text>
      <Text style={s.muted} numberOfLines={3}>
        {message.body}
      </Text>
      {parsed.data.truncated && <Text style={s.small}>仅显示该会话的摘要。</Text>}
      <Button small icon={Mail} onPress={() => open({ type: "mail", mail: message })}>
        打开邮件
      </Button>
    </Card>
  );
}
