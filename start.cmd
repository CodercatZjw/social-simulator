@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Please install Node.js 24 or newer from https://nodejs.org/en/download
  echo Then double-click start.cmd again.
  pause
  exit /b 1
)
node scripts\launch.mjs %*
if errorlevel 1 pause
