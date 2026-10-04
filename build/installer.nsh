; Mac-built NSIS uninstallers fail Windows' own file check. Turn that check off
; so Uninstall works on the PC that installs this build.
CRCCheck off

; Windows identifies a program by its id, not the shortcut name.
; Delete the two earlier ids before their broken uninstallers can start.
!macro customCheckAppRunning
  nsExec::Exec `"$SYSDIR\taskkill.exe" /F /T /IM "kooyai-gas-station.exe"`
  Pop $R0
  nsExec::Exec `"$SYSDIR\taskkill.exe" /F /T /IM "kooyai.exe"`
  Pop $R0

  ; com.kooyai.gasstation
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\e60d62e0-2a1f-5b13-aa65-aa5c6098ac21"
  DeleteRegKey HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\e60d62e0-2a1f-5b13-aa65-aa5c6098ac21"
  ; com.kooyai.station
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\2e7fc0f7-1cd7-54e3-bbd8-1ab497c5e119"
  DeleteRegKey HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\2e7fc0f7-1cd7-54e3-bbd8-1ab497c5e119"

  DeleteRegKey HKCU "Software\kooyai-gas-station"
  DeleteRegKey HKLM "Software\kooyai-gas-station"
  DeleteRegKey HKCU "Software\Kooyai"
  DeleteRegKey HKLM "Software\Kooyai"

  RMDir /r "$LOCALAPPDATA\Programs\kooyai-gas-station"
  RMDir /r "$LOCALAPPDATA\Programs\kooyai"
  RMDir /r "$PROGRAMFILES\kooyai-gas-station"
  RMDir /r "$PROGRAMFILES\kooyai"
  RMDir /r "$PROGRAMFILES64\kooyai-gas-station"
  RMDir /r "$PROGRAMFILES64\kooyai"

  SetShellVarContext current
  Delete "$DESKTOP\แบบบันทึกสถานีน้ำมัน.lnk"
  Delete "$SMPROGRAMS\แบบบันทึกสถานีน้ำมัน.lnk"
  Delete "$DESKTOP\Kooyai.lnk"
  Delete "$SMPROGRAMS\Kooyai.lnk"
  SetShellVarContext all
  Delete "$DESKTOP\แบบบันทึกสถานีน้ำมัน.lnk"
  Delete "$SMPROGRAMS\แบบบันทึกสถานีน้ำมัน.lnk"
  Delete "$DESKTOP\Kooyai.lnk"
  Delete "$SMPROGRAMS\Kooyai.lnk"
  SetShellVarContext current
!macroend
