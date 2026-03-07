@echo off
REM Navigate to the agent directory
cd /d "%~dp0\..\agent" || exit /b 0

where uv >nul 2>nul
if %ERRORLEVEL% neq 0 (
  echo uv not found — skipping Python agent setup
  exit /b 0
)

uv sync