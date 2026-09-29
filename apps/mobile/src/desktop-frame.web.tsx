import { View } from "react-native";

// Web embeds noVNC directly: it speaks WebSocket to the desktop and renders the
// live graphical session inside the app.
//
// The server reports the noVNC URL on the API host's loopback. When the app is
// opened from another device on the LAN, that loopback host would point at the
// visitor's own machine — rewrite it to the host the app itself was loaded from.
// reconnect=true 让瞬断的 WebSocket 自愈；真正的重启由 startedAt key 重挂载处理。
export function DesktopFrame({ url }: { url: string }) {
  let src = url;
  try {
    const parsed = new URL(url);
    const here = window.location.hostname;
    if (here && parsed.hostname !== here && ["127.0.0.1", "localhost"].includes(parsed.hostname)) {
      parsed.hostname = here;
    }
    parsed.searchParams.set("reconnect", "true");
    parsed.searchParams.set("reconnect_delay", "2000");
    src = parsed.toString();
  } catch {
    /* keep the server-provided URL */
  }
  return (
    <View style={{ borderRadius: 14, overflow: "hidden", backgroundColor: "#0E1620" }}>
      <iframe
        src={src}
        title="图形化桌面"
        style={{ display: "block", width: "100%", aspectRatio: "16 / 10", border: "none" }}
        allow="clipboard-read; clipboard-write; fullscreen"
      />
    </View>
  );
}
