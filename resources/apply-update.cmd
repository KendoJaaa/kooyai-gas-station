@echo off
set "PENDING=%~1"
set "TARGET=%~2"
set "MARKER=%~3"
set "RELAUNCH=%~4"
set "EXE=%~5"
for %%I in ("%EXE%") do set "EXENAME=%%~nxI"
ping 127.0.0.1 -n 3 >nul
:wait
tasklist /FI "IMAGENAME eq %EXENAME%" | find /I "%EXENAME%" >nul
if not errorlevel 1 (
  ping 127.0.0.1 -n 2 >nul
  goto wait
)
copy /Y "%PENDING%" "%TARGET%"
if errorlevel 1 goto finish
del /F /Q "%PENDING%"
del /F /Q "%MARKER%"
:finish
if /I "%RELAUNCH%"=="1" start "" "%EXE%"
