import { Minus, Square, X } from "lucide-react-native";
import { type ReactNode, useEffect, useState } from "react";
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

// 拖拽/禁拖拽通过 ref 注入 -webkit-app-region（react-native-web 不认识该样式键）。
function applyAppRegion(el: Element | null, region: "drag" | "no-drag") {
  el?.setAttribute("style", `${el.getAttribute("style") ?? ""};-webkit-app-region:${region}`);
}

// Windows 用户习惯：控制组在右上角，顺序为 最小化 / 最大化 / 关闭；
// 关闭键悬停变系统红（#E81123）。整条标题栏可拖拽，按钮自身禁拖拽。
export function WindowTitlebar({ title }: { title: string }) {
  const [electron, setElectron] = useState(false);
  useEffect(() => {
    setElectron(isElectron());
  }, []);
  if (!electron) return null;
  return (
    <View
      ref={(el) => applyAppRegion(el as unknown as Element, "drag")}
      style={{ height: 40, flexDirection: "row", alignItems: "center" }}
    >
      <View
        pointerEvents="none"
        style={{ position: "absolute", left: 0, right: 0, alignItems: "center" }}
      >
        <Text style={{ fontSize: 13, fontWeight: "600", color: "#6E6E73" }}>{title}</Text>
      </View>
      <View style={{ flex: 1 }} />
      <View style={{ flexDirection: "row", alignSelf: "stretch" }}>
        <CaptionButton
          label="最小化"
          hoverBackground="rgba(0,0,0,0.06)"
          onPress={() => controls()?.minimize()}
          icon={(color) => <Minus size={16} color={color} strokeWidth={1.8} />}
        />
        <CaptionButton
          label="最大化或还原"
          hoverBackground="rgba(0,0,0,0.06)"
          onPress={() => controls()?.toggleMaximize()}
          icon={(color) => <Square size={13} color={color} strokeWidth={1.8} />}
        />
        <CaptionButton
          label="关闭窗口（缩到托盘）"
          hoverBackground="#E81123"
          iconColor="#1D1D1F"
          hoverIconColor="#FFFFFF"
          onPress={() => controls()?.hideToTray()}
          icon={(color) => <X size={16} color={color} strokeWidth={1.8} />}
        />
      </View>
    </View>
  );
}

function CaptionButton({
  label,
  hoverBackground,
  iconColor = "#1D1D1F",
  hoverIconColor,
  onPress,
  icon,
}: {
  label: string;
  hoverBackground: string;
  iconColor?: string;
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
        height: 40,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: hovered ? hoverBackground : "transparent",
      }}
    >
      {icon(hovered ? (hoverIconColor ?? iconColor) : iconColor)}
    </Pressable>
  );
}
