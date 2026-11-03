# แบบบันทึกสถานีน้ำมัน

Thai gas-station records, local offline saves, PDF reports, and company sync through MongoDB Atlas. Existing users receive app updates from the Atlas `app_releases` channels and `app_updates` GridFS bucket.

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

That builds the separate **32-bit (`ia32`)** installer `dist/ปั้ม-Windows7-ia32.exe` using Electron 22.3.27. The supported release targets are current Windows x64, Windows 7 ia32, and macOS.

The PC needs Windows 7 SP1. Atlas sync from that build runs on Electron’s Node 16.17.1; the MongoDB driver asks for Node 16.20.1 or newer, so confirm sync once on the actual machine. A wrong system clock makes the Atlas connection fail.

## Data location

The form is cached as JSON in the OS user-data folder (not in the install directory), for example:

`%APPDATA%\แบบบันทึกสถานีน้ำมัน\station.json`

Every install shares one company database. The connection is `resources/company-db.json`, which is not committed:

```json
{ "mongodbUri": "mongodb+srv://USER:PASSWORD@cluster.mongodb.net/" }
```

Rebuild the installer after adding that file. Machines do not enter their own address.

## Windows update validation

`.github/workflows/windows-upgrade.yml` builds and tests on disposable Windows Server 2022 VMs. Each run exercises both current Electron x64 and Electron 22 ia32:

- Build real NSIS installers and launch the packaged app.
- Repair the installed helper without uninstalling or changing the app identity.
- Open with a corrupted pending update and confirm the installed program is intact.
- Apply a valid Atlas-format staged archive on close and reopen the new version.
- Upgrade/reinstall twice with the same executable name, app ID, and installer GUID.
- Check that saved records and the installed company configuration survive.
- Save screenshots as workflow artifacts.

Electron 22 on Server 2022 does **not** establish native Windows 7 compatibility. Keep a Windows 7 SP1 ia32 acceptance check for that target. The automated test script refuses to run outside a disposable GitHub Actions Windows VM, because it installs into a real Windows profile and writes synthetic station data there.

Do not change `appId`, `executableName`, the NSIS GUID, or the user-data path to work around installer failures. Do not delete an installation before NSIS can run its existing uninstaller.

## Release

1. Commit and push source changes. Wait for both Windows integration jobs to pass for that exact commit.
2. Keep the existing production `resources/company-db.json` available locally and gitignored.
3. Run `node scripts/release.mjs` from a clean checkout.

Use `node scripts/release.mjs --windows-only` when only the current Windows and Windows 7 ia32 installers are requested.

The release command verifies the Windows results before bumping the version and building all three targets. It checks Atlas free-tier capacity before uploading, verifies upload hashes, and switches the `win` and `win7` channels together. Mac archives are not stored in MongoDB; Mac installers are distributed manually. It retains previous Windows GridFS files and copies `Pum.exe`, `Pum-Windows7-32bit.exe`, and `Pum-Mac.dmg` to the Desktop. Commit the resulting version bump after release. It does not publish station updates through GitHub Releases.

Windows updates are attempted on close, never before opening the app. The updater verifies raw archive bytes using Electron's `original-fs`, uses bounded waits and replacement retries, preserves `app.asar.previous`, and prevents failed downloads from repeatedly hijacking startup. This does not provide automatic rollback for arbitrary errors inside a newly installed application; retain the previous archive and keep the Windows acceptance checks mandatory.

## Repair an existing Windows updater without reinstalling

Run `node scripts/package-updater-repair.mjs`. It creates `dist/Pum-Updater-Repair.zip` and copies it to the Desktop. The ZIP contains only helper scripts and instructions; it contains no database credentials or replacement app binary.

On the affected Windows PC, restart Windows, extract the entire ZIP, and run `Repair-Pum.cmd` before opening Pum. The tool locates the existing installation through its registration or shortcuts, backs up the old helper scripts and stalled update cache, replaces the helpers, and opens the existing app. It preserves the app name, station records, and company database configuration. An installation under Program Files may require running the repair with administrator permissions.
