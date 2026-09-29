import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";

const isElectron = () => typeof navigator !== "undefined" && /Electron/i.test(navigator.userAgent);

interface WindowControls {
  minimize: () => void;
  toggleMaximize: () => void;
  hideToTray: () => void;
}
function controls(): WindowControls | undefined {
  return (window as { zmuseWindow?: WindowControls }).zmuseWindow;
}

// macOS 风格窗口标题栏：红绿灯控制点 + 整条可拖拽。
// 仅在 Electron（桌面程序）里渲染；普通浏览器里返回 null。
// 拖拽/禁拖拽通过 ref 注入 -webkit-app-region（react-native-web 不认识该样式键）。
function applyAppRegion(el: Element | null, region: "drag" | "no-drag") {
  el?.setAttribute("style", `${el.getAttribute("style") ?? ""};-webkit-app-region:${region}`);
}

export function MacTitlebar({ title }: { title: string }) {
  const [electron, setElectron] = useState(false);
  useEffect(() => {
    setElectron(isElectron());
  }, []);
  if (!electron) return null;
  return (
    <View
      ref={(el) => applyAppRegion(el as unknown as Element, "drag")}
      style={{
        height: 40,
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: "transparent",
      }}
    >
      <View style={{ flexDirection: "row", gap: 8, paddingLeft: 18 }}>
        <Light
          color="#FF5F57"
          label="关闭窗口（缩到托盘）"
          onPress={() => controls()?.hideToTray()}
        />
        <Light color="#FEBC2E" label="最小化" onPress={() => controls()?.minimize()} />
        <Light color="#28C840" label="最大化或还原" onPress={() => controls()?.toggleMaximize()} />
      </View>
      <View
        pointerEvents="none"
        style={{ position: "absolute", left: 0, right: 0, alignItems: "center" }}
      >
        <Text style={{ fontSize: 13, fontWeight: "600", color: "#6E6E73" }}>{title}</Text>
      </View>
    </View>
  );
}

function Light({ color, onPress, label }: { color: string; onPress: () => void; label: string }) {
  const [hovered, setHovered] = useState(false);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      ref={(el) => applyAppRegion(el as unknown as Element, "no-drag")}
      style={{
        width: 12,
        height: 12,
        borderRadius: 6,
        backgroundColor: color,
        opacity: hovered ? 1 : 0.92,
        transform: [{ scale: hovered ? 1.12 : 1 }],
      }}
    >
      <View />
    </Pressable>
  );
}
