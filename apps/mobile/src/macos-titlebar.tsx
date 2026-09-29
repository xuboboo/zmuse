import { type ReactNode, useEffect, useState } from "react";
import { Image, Pressable, Text, View } from "react-native";

const isElectron = () => typeof navigator !== "undefined" && /Electron/i.test(navigator.userAgent);

interface WindowControls {
  minimize: () => void;
  toggleMaximize: () => void;
  hideToTray: () => void;
}
function controls(): WindowControls | undefined {
  return (window as { zmuseWindow?: WindowControls }).zmuseWindow;
}

// 拖拽层通过 ref 注入 -webkit-app-region（react-native-web 不认识该样式键）。
function applyAppRegion(el: Element | null, region: "drag" | "no-drag") {
  el?.setAttribute("style", `${el.getAttribute("style") ?? ""};-webkit-app-region:${region}`);
}

function Light({ color, onPress, label }: { color: string; onPress: () => void; label: string }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      ref={(el) => applyAppRegion(el as unknown as Element, "no-drag")}
      style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: color }}
    >
      <View />
    </Pressable>
  );
}

/**
 * 顶部一体化工具栏（mac 风格）：
 * [红绿灯(桌面端)] [左侧内容(菜单)] —— 居中 Logo+标题 —— [右侧内容(状态徽章/通知)]
 * 整条可拖拽；交互元素单独覆盖在拖拽层之上。
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
    setElectron(isElectron());
  }, []);
  return (
    <View style={{ height: 54, justifyContent: "center", backgroundColor: "transparent" }}>
      {/* 拖拽层：铺满整条，位于交互元素之下 */}
      <View
        ref={(el) => applyAppRegion(el as unknown as Element, "drag")}
        style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0 }}
      />
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: electron ? 14 : 18,
          gap: 10,
        }}
      >
        {electron && (
          <View style={{ flexDirection: "row", gap: 8, marginRight: 2 }}>
            <Light
              color="#FF5F57"
              label="关闭窗口（缩到托盘）"
              onPress={() => controls()?.hideToTray()}
            />
            <Light color="#FEBC2E" label="最小化" onPress={() => controls()?.minimize()} />
            <Light
              color="#28C840"
              label="最大化或还原"
              onPress={() => controls()?.toggleMaximize()}
            />
          </View>
        )}
        {left}
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            left: 0,
            right: 0,
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
    </View>
  );
}
