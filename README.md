# แบบบันทึกสถานีน้ำมัน

Offline Windows desktop app: Thai-only form, save on this PC, export PDF. No internet, no cloud, no Node server in the shipped `.exe`.

Public GitHub repo — [KendoJaaa/kooyai-gas-station](https://github.com/KendoJaaa/kooyai-gas-station).

## What v1 does

- Dummy Thai gas-station record (name, dates, fuel type, liters, notes)
- Validates with Zod
- Writes JSON under Electron `app.getPath('userData')`
- Reloads that file on next launch
- Builds a PDF with Chromium `printToPDF` from a print view

## Stack

Electron + electron-vite + React + TypeScript + Mantine (Thai locale) + Zod. Bun for install and scripts. Windows installer via electron-builder (NSIS).

Dev uses Vite’s local server for hot reload. Production is just the `.exe`.

## Develop (macOS / Windows)

```bash
bun install
bun run dev
```

## Windows installer

On a machine that can run electron-builder for Windows:

```bash
bun run build:win
```

The NSIS setup appears under `dist/`. Install on the uncle’s PC. After that it runs offline.

## Data location

The form is a JSON file in the OS user-data folder (not in the install directory), for example:

`%APPDATA%\แบบบันทึกสถานีน้ำมัน\record.json`
