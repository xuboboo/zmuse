// 只暴露三个窗口控制动作；渲染进程拿不到任何 Node 能力。
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("zmuseWindow", {
  minimize: () => ipcRenderer.send("win:minimize"),
  toggleMaximize: () => ipcRenderer.send("win:toggle-maximize"),
  hideToTray: () => ipcRenderer.send("win:hide"),
  resizeDesktop: (width, height) => ipcRenderer.invoke("desktop:resize", { width, height }),
});
