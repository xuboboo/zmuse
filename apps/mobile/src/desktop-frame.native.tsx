import { ExternalLink } from "lucide-react-native";
import { useState } from "react";
import { Linking, Pressable, Text, View } from "react-native";
import { colors, s } from "./ui";

// Native builds have no bundled WebView dependency; the noVNC page works in the
// system browser with the same autoconnect URL.
export function DesktopFrame({ url }: { url: string }) {
  const [failed, setFailed] = useState(false);
  return (
    <View style={{ gap: 10 }}>
      <View
        style={{
          aspectRatio: 1.6,
          borderRadius: 14,
          backgroundColor: "#0E1620",
          alignItems: "center",
          justifyContent: "center",
          gap: 10,
          padding: 20,
        }}
      >
        <Text style={{ color: "#E8EEF3", textAlign: "center", fontSize: 14, lineHeight: 21 }}>
          在应用内直接查看桌面画面需要开发构建（Expo dev build）。
        </Text>
        <Text style={{ color: "#9FB3C4", textAlign: "center", fontSize: 12, lineHeight: 18 }}>
          Web 版已内嵌实时画面；此处可在外部浏览器打开同一桌面。
        </Text>
      </View>
      {failed ? <Text style={s.muted}>打开失败，请确认桌面正在运行后重试。</Text> : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="在外部浏览器打开桌面"
        onPress={() => {
          Linking.openURL(url).catch(() => setFailed(true));
        }}
        style={[
          s.row,
          {
            gap: 8,
            justifyContent: "center",
            padding: 13,
            borderRadius: 14,
            backgroundColor: colors.blue,
          },
        ]}
      >
        <ExternalLink size={16} color={colors.blueDark} />
        <Text style={{ color: colors.blueDark, fontWeight: "600" }}>在外部浏览器打开桌面</Text>
      </Pressable>
    </View>
  );
}
