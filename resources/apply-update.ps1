# Keep this compatible with Windows PowerShell 2.0 (Windows 7).
$ErrorActionPreference = 'Stop'
$pending = $env:KOOYAI_UPDATE_PENDING
$target = $env:KOOYAI_UPDATE_TARGET
$marker = $env:KOOYAI_UPDATE_MARKER
$failure = $env:KOOYAI_UPDATE_FAILURE
$expectedHash = $env:KOOYAI_UPDATE_SHA256
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
    # Wait for the app that requested this update, not every process with its name.
    $parentProcess = Get-Process -Id ([int]$env:KOOYAI_UPDATE_PID) -ErrorAction SilentlyContinue
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
