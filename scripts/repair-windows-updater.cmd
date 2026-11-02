@echo off
setlocal
title Pum - repair installed updater
"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "%~dp0repair-windows-updater.ps1"
if errorlevel 1 (
  echo.
  echo Repair did not finish. Keep the error message above for support.
  pause
  exit /b 1
)
echo The repair is complete. Your existing Pum application is opening.
pause
