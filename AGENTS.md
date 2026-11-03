# Build targets

This project has three supported release targets:

- Windows (current version).
- Windows 7, **32-bit (`ia32`)**, using the Windows 7 build configuration.
- macOS.

When asked to build for "all three platforms", use these targets. Do not include Linux or Windows 7 64-bit unless explicitly requested.

## Releases and cloud updates

- Existing users receive app updates from MongoDB Atlas, not Cloudflare or GitHub Releases.
- The Atlas project is **Kooyai Gas Station**, Cluster0, database **kooyai**. Update channels are only the `win` and `win7` documents in `app_releases`. Their `fileId` values point to the `app_updates` GridFS bucket. Do not upload Mac archives or recreate the `mac` channel; Mac installers are distributed manually to conserve the free tier.
- Run `node scripts/release.mjs` to build all three targets, bump above the highest published version, verify the archives, and publish the two Windows update channels. Keep the Mac installer locally.
- When only the two Windows versions are requested, use `node scripts/release.mjs --windows-only`.
- Windows 7 must get a separate archive built for Electron 22 / Chromium 108 / Node 16, and its installer must be 32-bit (`ia32`).
- `resources/company-db.json` contains the existing production connection string and stays gitignored. Do not print credentials or upload them to public hosting.
- Verify uploaded file hashes and update both Windows channel records together. Retain previous Windows files for rollback. Publication must pass the free-tier storage check before uploading; leave room for station records.
- Preserve the updater, direct Atlas connection fallback, and complete company database history when integrating changes. The release implementation was on `origin/cursor/keep-company-database-history`; `main` was older than the installed 1.1.10 release.
- Release installers are copied to the Desktop as `Pum.exe`, `Pum-Windows7-32bit.exe`, and `Pum-Mac.dmg`.
