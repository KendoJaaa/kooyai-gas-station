; Retain compatibility with the previously shipped cross-built installers.
CRCCheck off

; Use electron-builder's normal process checks and upgrade flow. In particular,
; do not delete an installation or its registry entries before uninstallOldVersion
; has copied and run its uninstaller. App identity stays stable across releases.
