; Skip the default Retry/Cancel loop. Force-close leftover processes so
; install can continue after a reboot that reopened the app.
!macro customCheckAppRunning
  nsExec::Exec 'taskkill /F /IM "kooyai-gas-station.exe"'
  Pop $0
  nsExec::Exec 'taskkill /F /IM "Electron.exe"'
  Pop $0
  Sleep 2000
!macroend
