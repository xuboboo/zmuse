import { Minus, Square, X } from "lucide-react-native";
import { type ReactNode, useEffect, useState } from "react";
import { Image, Pressable, Text, View } from "react-native";

interface WindowControls {
  minimize: () => void;
  toggleMaximize: () => void;
  hideToTray: () => void;
}
declare global {
  interface Window {
    zmuseWindow?: WindowControls;
  }
}
function controls(): WindowControls | undefined {
  return window.zmuseWindow;
}

// 桌面程序判定：preload 注入的窗口控制桥存在即为桌面端
// （Electron 44 的 UA 已不含 Electron 标识，UA 检测不可靠）。
function hasWindowControls(): boolean {
  return typeof window !== "undefined" && !!window.zmuseWindow;
}

// 拖拽层通过 ref 注入 -webkit-app-region（react-native-web 不认识该样式键）。
function applyAppRegion(el: Element | null, region: "drag" | "no-drag") {
  el?.setAttribute("style", `${el.getAttribute("style") ?? ""};-webkit-app-region:${region}`);
}

// Windows 窗口控制按钮：46px 宽全高命中区；关闭键悬停系统红 #E81123 + 白叉。
function CaptionButton({
  label,
  hoverBackground,
  hoverIconColor,
  onPress,
  icon,
}: {
  label: string;
  hoverBackground: string;
  hoverIconColor?: string;
  onPress: () => void;
  icon: (color: string) => ReactNode;
}) {
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
        width: 46,
        height: "100%",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: hovered ? hoverBackground : "transparent",
      }}
    >
      {icon(hovered ? (hoverIconColor ?? "#1D1D1F") : "#1D1D1F")}
    </Pressable>
  );
}

/**
 * 顶部一体化工具栏（Windows 布局 + 精致质感）。
 * 层级：拖拽层(absolute 铺满) 在底，内容层(relative zIndex 10) 在上可点。
 * [☰菜单] —— 居中 Logo+ZMuse —— [电脑状态徽章] [🔔] || [− □ ✕ 右上角贴边]
 */
export function AppToolbar({
  title = "ZMuse",
  left,
  right,
}: {
  title?: string;
  left?: ReactNode;
  right?: ReactNode;
}) {
  const [electron, setElectron] = useState(false);
  useEffect(() => {
    setElectron(hasWindowControls());
  }, []);
  return (
    <View style={{ height: 54, justifyContent: "center" }}>
      {/* 拖拽层：铺满整条；内容层 relative+zIndex 压在其上，按钮可点 */}
      <View
        ref={(el) => applyAppRegion(el as unknown as Element, "drag")}
        style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0 }}
      />
      <View
        style={{
          position: "relative",
          zIndex: 10,
          flexDirection: "row",
          alignItems: "center",
          height: 54,
          paddingLeft: electron ? 14 : 18,
          paddingRight: electron ? 10 : 18,
        }}
      >
        {left}
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            left: 0,
            right: 150,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 7,
          }}
        >
          <Image
            source={require("../assets/zmuse-icon.png")}
            style={{ width: 22, height: 22, borderRadius: 6 }}
            accessible={false}
          />
          <Text style={{ fontSize: 15, fontWeight: "700", color: "#1D1D1F" }}>{title}</Text>
        </View>
        <View style={{ flex: 1 }} />
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>{right}</View>
      </View>
      {/* Windows 控制组：绝对定位右上角贴边（在拖拽层之上，no-drag 可点） */}
      {electron && (
        <View
          style={{
            position: "absolute",
            right: 0,
            top: 0,
            bottom: 0,
            flexDirection: "row",
            zIndex: 20,
          }}
        >
          <CaptionButton
            label="最小化"
            hoverBackground="rgba(0,0,0,0.06)"
            onPress={() => controls()?.minimize()}
            icon={(color) => <Minus size={15} color={color} strokeWidth={1.8} />}
          />
          <CaptionButton
            label="最大化或还原"
            hoverBackground="rgba(0,0,0,0.06)"
            onPress={() => controls()?.toggleMaximize()}
            icon={(color) => <Square size={12} color={color} strokeWidth={1.8} />}
          />
          <CaptionButton
            label="关闭窗口（缩到托盘）"
            hoverBackground="#E81123"
            hoverIconColor="#FFFFFF"
            onPress={() => controls()?.hideToTray()}
            icon={(color) => <X size={16} color={color} strokeWidth={1.8} />}
          />
        </View>
      )}
    </View>
  );
}
