@echo off
rem OpenMuse 国产版 一键启动：桌面窗口 + 后台全部服务
rem 前置：仓库已 pnpm install；已构建 pnpm build:server 与 pnpm build:web；
rem       Docker Desktop 运行中（桌面/终端功能需要）。
cd /d "%~dp0apps\desktop-app"
start "OpenMuse" "node_modules\electron\dist\electron.exe" .
