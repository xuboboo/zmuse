@echo off
rem ============================================================
rem  OpenMuse new-user environment preflight (double-click shim)
rem  Keep this file PURE ASCII on purpose: some Windows codepages
rem  cannot render non-ASCII batch files. The Chinese output is
rem  produced by preflight.mjs; "chcp 65001" below switches this
rem  console to UTF-8 so that output renders correctly.
rem ============================================================
title OpenMuse Preflight
chcp 65001 >nul

where node >nul 2>nul
if errorlevel 1 (
    echo [ERROR] "node" was not found in PATH.
    echo Install Node.js 22 LTS from https://nodejs.org/ , open a NEW terminal, then run this file again.
    pause
    exit /b 1
)

rem Run the real check next to this .cmd file (%~dp0 ends with a backslash).
node "%~dp0preflight.mjs"
set PREFLIGHT_EXIT=%errorlevel%
echo.
pause
exit /b %PREFLIGHT_EXIT%
