@echo off
rem OpenMuse one-click launcher: desktop window + all backend services.
rem Prerequisites: repo dependencies installed; pnpm build:server and pnpm build:web
rem already run; Docker Desktop running (needed by the desktop/terminal features).
cd /d "%~dp0apps\desktop-app"
start "OpenMuse" "node_modules\electron\dist\electron.exe" .
