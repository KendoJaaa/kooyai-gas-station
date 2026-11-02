# Keep this compatible with Windows PowerShell 2.0 (Windows 7).
param(
    [string]$PendingPath,
    [string]$TargetPath,
    [string]$MarkerPath,
    [string]$Relaunch,
    [string]$AppExe
)
$ErrorActionPreference = 'Stop'
$pending = $env:KOOYAI_UPDATE_PENDING
$target = $env:KOOYAI_UPDATE_TARGET
$marker = $env:KOOYAI_UPDATE_MARKER
$failure = $env:KOOYAI_UPDATE_FAILURE
$expectedHash = $env:KOOYAI_UPDATE_SHA256
if ($PendingPath) {
    # Compatibility with already-installed apps that call the five-argument CMD
    # helper. This lets a repair fix the old updater without running an installer.
    $pending = $PendingPath
    $target = $TargetPath
    $marker = $MarkerPath
    $failure = [System.IO.Path]::Combine([System.IO.Path]::GetDirectoryName($marker), 'failed.txt')
    $env:KOOYAI_UPDATE_RELAUNCH = $Relaunch
    $env:KOOYAI_UPDATE_EXE = $AppExe
}
$staged = $target + '.new'
$backup = $target + '.previous'
$installed = $false

function FileHash($path) {
    $stream = [System.IO.File]::OpenRead($path)
    $hash = [System.Security.Cryptography.SHA256]::Create()
    try {
        return [System.BitConverter]::ToString($hash.ComputeHash($stream)).Replace('-', '').ToLowerInvariant()
    } finally {
        $stream.Dispose()
        $hash.Dispose()
    }
}

try {
    if ($PendingPath) {
        $match = [System.Text.RegularExpressions.Regex]::Match(
            [System.IO.File]::ReadAllText($marker), '"sha256"\s*:\s*"([a-fA-F0-9]{64})"'
        )
        if (!$match.Success) { throw 'The pending update has no valid checksum. Download it again.' }
        $expectedHash = $match.Groups[1].Value.ToLowerInvariant()
    }
    # Wait for the app that requested this update, not every process with its name.
    $parentProcess = $null
    if (!$PendingPath -and $env:KOOYAI_UPDATE_PID) {
        $parentProcess = Get-Process -Id ([int]$env:KOOYAI_UPDATE_PID) -ErrorAction SilentlyContinue
    }
    if ($parentProcess -and !$parentProcess.WaitForExit(30000)) {
        throw 'The app did not close within 30 seconds. Close it before retrying the update.'
    }

    [System.IO.File]::Copy($pending, $staged, $true)
    if ((FileHash $staged) -ne $expectedHash) {
        throw 'The downloaded update failed its SHA-256 check. Download it again.'
    }

    # A crash reporter or antivirus may briefly hold the archive open after exit.
    # Retry the actual replacement with a deadline, and keep the old archive intact.
    for ($attempt = 0; $attempt -lt 30; $attempt++) {
        try {
            [System.IO.File]::Replace($staged, $target, $backup)
            $installed = $true
            break
        } catch {
            if ($attempt -eq 29) { throw }
            Start-Sleep -Milliseconds 1000
        }
    }
} catch {
    [System.IO.File]::WriteAllText($failure, $expectedHash + "`n" + $_.Exception.Message)
    # Older app versions do not understand failed.txt. Move their marker aside
    # as well, so they cannot retry a failed update at every launch.
    if ([System.IO.File]::Exists($marker)) {
        Move-Item -LiteralPath $marker -Destination ($marker + '.failed') -Force -ErrorAction SilentlyContinue
    }
} finally {
    if ([System.IO.File]::Exists($staged)) {
        Remove-Item -LiteralPath $staged -Force -ErrorAction SilentlyContinue
    }
}

if ($installed) {
    # Delete the marker first: a cleanup error must not trigger another install.
    Remove-Item -LiteralPath $marker -Force -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $pending -Force -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $failure -Force -ErrorAction SilentlyContinue
}

# On failure the unchanged app can open: the failure file stops automatic retries.
if ($env:KOOYAI_UPDATE_RELAUNCH -eq '1') {
    Start-Process -FilePath $env:KOOYAI_UPDATE_EXE
}
