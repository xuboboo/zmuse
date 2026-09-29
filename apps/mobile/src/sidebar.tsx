import {
  CalendarDays,
  FileText,
  Lightbulb,
  type LucideIcon,
  MessageCircle,
  PanelsTopLeft,
  Plus,
  Shapes,
  SquareCheck,
} from "lucide-react-native";
import type { ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import { colors } from "./ui";

const I = ({ C, color }: { C: LucideIcon; color: string }) => <C size={18} color={color} />;

interface Item {
  key: string;
  label: string;
  C: LucideIcon;
  active?: boolean;
  badge?: number;
  onPress: () => void;
}

function Row({ item }: { item: Item }) {
  const c = item.active ? colors.blueDark : colors.muted;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={item.label}
      onPress={item.onPress}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        paddingHorizontal: 12,
        paddingVertical: 9,
        borderRadius: 10,
        backgroundColor: item.active
          ? "rgba(0,113,227,0.10)"
          : pressed
            ? "rgba(0,0,0,0.04)"
            : "transparent",
      })}
    >
      <I C={item.C} color={c} />
      <Text
        style={{
          fontSize: 14,
          fontWeight: item.active ? "600" : "500",
          color: item.active ? colors.blueDark : colors.text,
        }}
      >
        {item.label}
      </Text>
      {!!item.badge && item.badge > 0 && (
        <View
          style={{
            marginLeft: "auto",
            minWidth: 18,
            paddingHorizontal: 5,
            paddingVertical: 1,
            borderRadius: 9,
            backgroundColor: colors.blueDark,
            alignItems: "center",
          }}
        >
          <Text style={{ fontSize: 10, fontWeight: "700", color: "#FFFFFF" }}>{item.badge}</Text>
        </View>
      )}
    </Pressable>
  );
}

function GroupLabel({ text }: { text: string }) {
  return (
    <Text
      style={{
        fontSize: 11,
        fontWeight: "700",
        color: colors.muted,
        letterSpacing: 0.5,
        paddingHorizontal: 12,
        marginTop: 14,
        marginBottom: 4,
      }}
    >
      {text}
    </Text>
  );
}

export function ZSidebar({
  section,
  navigate,
  pending,
  computer,
  manageThreads,
}: {
  section: string;
  navigate: (s: string) => void;
  pending: number;
  computer: ReactNode;
  manageThreads: () => void;
}) {
  const nav: Item[] = [
    {
      key: "chat",
      label: "对话",
      C: MessageCircle,
      active: section === "chat",
      onPress: () => navigate("chat"),
    },
    {
      key: "activity",
      label: "动态",
      C: PanelsTopLeft,
      active: section === "activity",
      badge: pending,
      onPress: () => navigate("activity"),
    },
    {
      key: "ideas",
      label: "想法",
      C: Lightbulb,
      active: section === "ideas",
      onPress: () => navigate("ideas"),
    },
    {
      key: "goals",
      label: "目标",
      C: SquareCheck,
      active: section === "goals",
      onPress: () => navigate("goals"),
    },
    {
      key: "apps",
      label: "应用",
      C: Shapes,
      active: section === "apps",
      onPress: () => navigate("apps"),
    },
  ];
  const tools: Item[] = [
    {
      key: "mail",
      label: "邮件",
      C: MessageCircle,
      active: section === "mail",
      onPress: () => navigate("mail"),
    },
    {
      key: "calendar",
      label: "日历",
      C: CalendarDays,
      active: section === "calendar",
      onPress: () => navigate("calendar"),
    },
    {
      key: "browser",
      label: "浏览器",
      C: PanelsTopLeft,
      active: section === "browser",
      onPress: () => navigate("browser"),
    },
    {
      key: "files",
      label: "文件",
      C: FileText,
      active: section === "files",
      onPress: () => navigate("files"),
    },
  ];
  return (
    <View
      style={{
        width: 232,
        backgroundColor: "#EBEBEE",
        borderRightWidth: 1,
        borderRightColor: "rgba(0,0,0,0.06)",
        paddingHorizontal: 10,
        paddingTop: 6,
        paddingBottom: 12,
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="新建对话"
        onPress={() => navigate("chat")}
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          paddingVertical: 10,
          borderRadius: 12,
          backgroundColor: colors.blueDark,
          marginBottom: 8,
        }}
      >
        <Plus size={17} color="#FFFFFF" strokeWidth={2.2} />
        <Text style={{ fontSize: 14, fontWeight: "700", color: "#FFFFFF" }}>新建对话</Text>
      </Pressable>
      {nav.map((item) => (
        <Row key={item.key} item={item} />
      ))}
      <GroupLabel text="工具" />
      {tools.map((item) => (
        <Row key={item.key} item={item} />
      ))}
      <View style={{ flex: 1 }} />
      <GroupLabel text="设备" />
      {computer}
      <Row
        item={{
          key: "threads",
          label: "会话管理",
          C: MessageCircle,
          onPress: manageThreads,
        }}
      />
    </View>
  );
}
