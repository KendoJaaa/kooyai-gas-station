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

## Windows 7

Current `build:win` is Electron 39 and does not start on Windows 7. Windows 7 SP1, Windows 8, and Windows 8.1 use a separate installer pinned to Electron 22.3.27 (Chromium 108):

```bash
bun run build:win7
```

That writes NSIS setups under `dist/`:

- `kooyai-gas-station-<version>-win7-setup.exe` — 32-bit and 64-bit in one installer
- `kooyai-gas-station-<version>-win7-x64-setup.exe`
- `kooyai-gas-station-<version>-win7-ia32-setup.exe`

The PC needs Windows 7 SP1. Atlas sync from that build runs on Electron’s Node 16.17.1; the MongoDB driver asks for Node 16.20.1 or newer, so confirm sync once on the actual machine. A wrong system clock makes the Atlas connection fail.

## Data location

The form is cached as JSON in the OS user-data folder (not in the install directory), for example:

`%APPDATA%\แบบบันทึกสถานีน้ำมัน\station.json`

Every install shares one company database. The connection is `resources/company-db.json`, which is not committed:

```json
{ "mongodbUri": "mongodb+srv://USER:PASSWORD@cluster.mongodb.net/" }
```

Rebuild the installer after adding that file. Machines do not enter their own address.
