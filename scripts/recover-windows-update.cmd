@echo off
setlocal
title Pum - recover a stuck update
echo Restart Windows before running this file. Do not open Pum yet.
echo This moves only the downloaded update cache. Saved station records stay in place.
echo.

tasklist /FI "IMAGENAME eq banthukpum.exe" /NH 2>nul | find /I "banthukpum.exe" >nul
if not errorlevel 1 (
  echo Pum still has a running process. Restart Windows, then run this file first.
  pause
  exit /b 1
)

set "PENDING_DIR=%APPDATA%\kooyai-update"
set "BACKUP_DIR=%APPDATA%\kooyai-update-backup-%RANDOM%-%RANDOM%"
if not exist "%PENDING_DIR%" (
  echo There is no pending update cache. You can try opening Pum.
  pause
  exit /b 0
)
if exist "%BACKUP_DIR%" (
  echo Backup folder already exists. Run this file again.
  pause
  exit /b 1
)
move "%PENDING_DIR%" "%BACKUP_DIR%" >nul
if errorlevel 1 (
  echo Could not move the update cache. Restart Windows and try again.
  pause
  exit /b 1
)
echo The pending update was backed up to:
echo "%BACKUP_DIR%"
echo.
echo Open Pum now. Wait for the repaired release before clicking Update again.
pause
