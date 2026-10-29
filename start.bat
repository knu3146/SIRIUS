@echo off
chcp 65001 >nul
cd /d "%~dp0"
set NODECMD=node
if exist "%~dp0.runtime\node\node.exe" (
  set NODECMD="%~dp0.runtime\node\node.exe"
) else (
  where node >nul 2>nul
  if errorlevel 1 (
  echo Node.js가 설치되어 있지 않습니다. https://nodejs.org 에서 LTS 버전을 설치한 뒤 다시 실행하세요.
  pause
  exit /b 1
  )
)
%NODECMD% server.js
pause
