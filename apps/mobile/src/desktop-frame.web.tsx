import { useEffect, useRef } from "react";
import { View } from "react-native";

// Web embeds noVNC directly: it speaks WebSocket to the desktop and renders the
// live graphical session inside the app.
//
// The server reports the noVNC URL on the API host's loopback. When the app is
// opened from another device on the LAN, that loopback host would point at the
// visitor's own machine — rewrite it to the host the app itself was loaded from.
// reconnect=true 让瞬断的 WebSocket 自愈；真正的重启由 startedAt key 重挂载处理。
//
// 分辨率自适应：视口尺寸变化（防抖 600ms）后，把目标分辨率上报给主进程，
// 由其调整容器内 Xvfb 的实际分辨率——文字保持 1:1 锐利而非缩放模糊。
export function DesktopFrame({ url }: { url: string }) {
  const frameBox = useRef<View>(null);
  useEffect(() => {
    const el = frameBox.current as unknown as HTMLDivElement | null;
    if (!el || typeof ResizeObserver === "undefined") return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const ro = new ResizeObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const dpr = window.devicePixelRatio || 1;
        const width = Math.round((el.clientWidth * dpr) / 2) * 2;
        const height = Math.round((el.clientHeight * dpr) / 2) * 2;
        if (width >= 640 && height >= 480 && width <= 3840 && height <= 2160) {
          window.zmuseWindow?.resizeDesktop(width, height);
        }
      }, 600);
    });
    ro.observe(el);
    return () => {
      ro.disconnect();
      clearTimeout(timer);
    };
  }, []);

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
    <View
      ref={frameBox as never}
      style={{ borderRadius: 14, overflow: "hidden", backgroundColor: "#0E1620" }}
    >
      <iframe
        src={src}
        title="图形化桌面"
        style={{ display: "block", width: "100%", aspectRatio: "16 / 10", border: "none" }}
        allow="clipboard-read; clipboard-write; fullscreen"
      />
    </View>
  );
}
