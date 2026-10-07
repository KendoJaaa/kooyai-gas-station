# บันทึกปั้ม

Thai-only Electron app for one gas station. Saves on the PC, syncs through MongoDB Atlas, and updates itself from Atlas.

## Releasing a new version

Run one command from the repo root. It takes no arguments:

```bash
node scripts/release.mjs
```

It does all of this, in order:

1. Picks the version. If the cloud already has the `package.json` version, it bumps the patch number.
2. Builds normal Windows (x64) and Mac on the current Electron.
3. Builds Windows 7 (32-bit and 64-bit) on Electron 22.
4. Checks that each `app.asar` reports the new version.
5. Publishes the three update slots in Atlas (`win`, `win7`, `mac`), each from its own build, and deletes old update files.
6. Copies `Pum.exe`, `Pum-Windows7-32bit.exe`, and `Pum-Mac.dmg` to the Desktop.

Then commit and push `package.json` with the new version.

Do not publish one `app.asar` to every slot. Windows 7 runs Electron 22 (Chrome 108, Node 16), so its slot must come from the Windows 7 build. To replace a single slot, use `node scripts/publish-update.mjs <win|win7|mac> <app.asar>`.

## Things that break easily

- The folder name contains `:`, which breaks `node_modules/.bin` lookup. Run tools by path, for example `node node_modules/electron-builder/cli.js`.
- `resources/company-db.json` holds the Atlas connection string. It is gitignored but must exist. Installers and publishing both read it.
- Open MongoDB only through `withDatabase` in `src/main/mongo.ts`. Never call `new MongoClient` anywhere else, and never connect with a `mongodb+srv://` address. Some station PCs refuse the SRV DNS lookup (`querySrv ECONNREFUSED`). `src/main/atlas.json` lists the Cluster0 hosts used instead.
- A station only sees a new update after its app reaches Atlas. If a PC cannot connect, send it an installer from the Desktop.
- Station PCs include 32-bit Windows 7. `Pum.exe` will not install there.
