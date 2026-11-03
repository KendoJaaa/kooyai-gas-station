@echo off
setlocal
"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File "%~dp0apply-update.ps1" -PendingPath "%~1" -TargetPath "%~2" -MarkerPath "%~3" -Relaunch "%~4" -AppExe "%~5"
exit /b %errorlevel%
