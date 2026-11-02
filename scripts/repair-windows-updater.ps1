# Windows PowerShell 2.0 compatible. Repair helpers only; never write station data.
param(
    [string]$AppExe,
    [switch]$NoLaunch,
    [switch]$Quiet,
    [string]$AppDataPath,
    [string]$ResultRoot,
    [switch]$ElevatedWorker
)
$ErrorActionPreference = 'Stop'
$automated = $env:GITHUB_ACTIONS -eq 'true' -and $env:KOOYAI_REPAIR_AUTOMATED -eq '1'
if (!$AppDataPath) { $AppDataPath = [Environment]::GetFolderPath('ApplicationData') }
if (!$ResultRoot) { $ResultRoot = [IO.Path]::Combine([Environment]::GetFolderPath('LocalApplicationData'), 'Pum-Repair') }
[IO.Directory]::CreateDirectory($ResultRoot) > $null
$resultFile = [IO.Path]::Combine($ResultRoot, 'last-result.txt')
$session = [DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss') + '-' + [Guid]::NewGuid().ToString('N')
$logFile = [IO.Path]::Combine($ResultRoot, $session + '.log')
$source = Split-Path -Parent $MyInvocation.MyCommand.Path
$form = $null
$label = $null
$stage = $null
$changed = @()
$originals = @{}
$openedPid = 0
$code = 'R01'
$mutex = $null
$ownsMutex = $false

function Log($text) {
    try { [IO.File]::AppendAllText($logFile, [DateTime]::UtcNow.ToString('o') + ' ' + $text + [Environment]::NewLine, [Text.Encoding]::UTF8) } catch {}
}
function Result($status, $detail) {
    $lines = @("status=$status", "code=$detail", "app=$AppExe", "pid=$openedPid", "log=$logFile")
    try { [IO.File]::WriteAllText($resultFile, [string]::Join([Environment]::NewLine, $lines), [Text.Encoding]::UTF8) } catch { Log $_.Exception.Message }
}
function Phase($text) {
    Log $text
    if ($label) { $label.Text = $text; [Windows.Forms.Application]::DoEvents() }
}
function FileHash($path) {
    $stream = [IO.File]::OpenRead($path)
    $sha = [Security.Cryptography.SHA256]::Create()
    try { return [BitConverter]::ToString($sha.ComputeHash($stream)) }
    finally { $stream.Dispose(); $sha.Dispose() }
}
function RunningApp($path) {
    foreach ($process in @(Get-Process -Name banthukpum -ErrorAction SilentlyContinue)) {
        try { $executable = $process.MainModule.FileName }
        catch { throw 'Cannot inspect a running Pum process. Restart Windows before repairing.' }
        if ($executable -ieq $path) { return $true }
    }
    return $false
}
function SwapFile($from, $to) {
    if ([IO.File]::Exists($to)) { [IO.File]::Replace($from, $to, $null) }
    else { [IO.File]::Move($from, $to) }
}
function IsAdmin {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($identity)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

try {
    if (!$ElevatedWorker) {
        $mutex = New-Object System.Threading.Mutex($false, 'Local\Pum-Updater-Repair')
        try { $ownsMutex = $mutex.WaitOne(0, $false) }
        catch [System.Threading.AbandonedMutexException] { $ownsMutex = $true }
        if (!$ownsMutex) { $code = 'R00'; throw 'Another repair is already running.' }
    }
    Result 'running' 'START'
    if (!$Quiet) {
        Add-Type -AssemblyName System.Windows.Forms
        $form = New-Object System.Windows.Forms.Form
        $form.Text = 'ซ่อมโปรแกรมบันทึกปั้ม'
        $form.Size = New-Object System.Drawing.Size(460, 150)
        $form.StartPosition = 'CenterScreen'
        $form.FormBorderStyle = 'FixedDialog'
        $form.ControlBox = $false
        $form.TopMost = $true
        $label = New-Object System.Windows.Forms.Label
        $label.Dock = 'Fill'
        $label.TextAlign = 'MiddleCenter'
        $form.Controls.Add($label)
        $form.Show()
    }
    Phase 'กำลังตรวจสอบโปรแกรม กรุณารอสักครู่'

    # Validate every companion before touching the installation or update cache.
    foreach ($name in @('apply-update.ps1', 'apply-update.cmd')) {
        if (![IO.File]::Exists([IO.Path]::Combine($source, $name))) { throw 'The repair package is incomplete.' }
    }
    $code = 'R02'
    if (!$AppExe) {
        $candidates = @()
        foreach ($hive in @('HKCU:', 'HKLM:')) {
            $entry = Get-ItemProperty -LiteralPath ($hive + '\Software\3761aeb8-f483-5a64-a1f9-f9ce5194a967') -ErrorAction SilentlyContinue
            if ($entry -and $entry.InstallLocation) { $candidates += [IO.Path]::Combine($entry.InstallLocation, 'banthukpum.exe') }
        }
        $shell = New-Object -ComObject WScript.Shell
        foreach ($folder in @([Environment]::GetFolderPath('Desktop'), [Environment]::GetFolderPath('CommonDesktopDirectory'), [Environment]::GetFolderPath('StartMenu'))) {
            if (!$folder) { continue }
            foreach ($link in @(Get-ChildItem -LiteralPath $folder -Filter '*.lnk' -Recurse -ErrorAction SilentlyContinue)) {
                $path = $shell.CreateShortcut($link.FullName).TargetPath
                if ([IO.Path]::GetFileName($path) -ieq 'banthukpum.exe') { $candidates += $path }
            }
        }
        $candidates = @($candidates | Where-Object {
            [IO.File]::Exists($_) -and [IO.File]::Exists([IO.Path]::Combine([IO.Path]::GetDirectoryName($_), 'resources\app.asar'))
        } | Select-Object -Unique)
        if ($candidates.Count -ne 1) { throw 'Cannot identify one unambiguous Pum installation.' }
        $AppExe = $candidates[0]
    }
    $AppExe = [IO.Path]::GetFullPath($AppExe)
    if ([IO.Path]::GetFileName($AppExe) -ine 'banthukpum.exe') { throw 'Unexpected executable name.' }
    $resources = [IO.Path]::Combine([IO.Path]::GetDirectoryName($AppExe), 'resources')
    if (![IO.File]::Exists($AppExe) -or ![IO.File]::Exists([IO.Path]::Combine($resources, 'app.asar'))) { throw 'Pum installation is incomplete.' }
    $code = 'R03'
    if (RunningApp $AppExe) { throw 'Pum is still running. Close it or restart Windows before repairing.' }
    # Old helpers can run after the app has exited. Never overwrite a live updater.
    foreach ($process in @(Get-WmiObject Win32_Process -Filter "Name='cmd.exe' OR Name='powershell.exe'" -ErrorAction Stop)) {
        if ($process.ProcessId -eq $PID) { continue }
        if ($process.CommandLine -and $process.CommandLine -match 'apply-update\.(cmd|ps1)' -and $process.CommandLine.IndexOf($AppExe, [StringComparison]::OrdinalIgnoreCase) -ge 0) {
            throw 'An old updater is still running. Restart Windows before repairing.'
        }
    }

    $code = 'R04'
    Phase 'กำลังเตรียมซ่อม ระบบจะเก็บข้อมูลเดิมไว้'
    try {
        $stage = [IO.Path]::Combine($resources, '.pum-repair-' + $session)
        [IO.Directory]::CreateDirectory($stage) > $null
    } catch [UnauthorizedAccessException] {
        if ($ElevatedWorker -or (IsAdmin) -or $Quiet) { throw }
        Phase 'Windows ต้องการอนุญาตให้ซ่อมโปรแกรม กรุณากด Yes'
        # The original unelevated process keeps the caller's data path and launches
        # Pum afterwards. An administrator account must not open a different profile.
        $arguments = '-NoProfile -STA -NonInteractive -ExecutionPolicy Bypass -File "' + $MyInvocation.MyCommand.Path + '" -AppExe "' + $AppExe + '" -AppDataPath "' + $AppDataPath + '" -ResultRoot "' + $ResultRoot + '" -NoLaunch -Quiet -ElevatedWorker'
        $admin = Start-Process -FilePath ([IO.Path]::Combine($PSHOME, 'powershell.exe')) -ArgumentList $arguments -Verb RunAs -WindowStyle Hidden -PassThru
        $admin.WaitForExit()
        if ($admin.ExitCode -ne 0 -or ![IO.File]::ReadAllText($resultFile).Contains('status=repaired')) { throw 'Administrator repair was cancelled or failed.' }
        $stage = $null
    }
    if ($stage) {
        # Stage and hash-check both new helpers and snapshot both originals first.
        foreach ($name in @('apply-update.ps1', 'apply-update.cmd')) {
            $target = [IO.Path]::Combine($resources, $name)
            if ([IO.File]::Exists($target)) {
                if (([IO.File]::GetAttributes($target) -band [IO.FileAttributes]::ReadOnly) -ne 0) { throw 'An updater file is read-only.' }
                $old = [IO.Path]::Combine($stage, $name + '.old')
                [IO.File]::Copy($target, $old)
                $originals[$name] = $old
            } else { $originals[$name] = $null }
            $incoming = [IO.Path]::Combine($source, $name)
            $prepared = [IO.Path]::Combine($stage, $name + '.new')
            [IO.File]::Copy($incoming, $prepared)
            if ((FileHash $incoming) -ne (FileHash $prepared)) { throw 'A staged helper failed verification.' }
        }
        $code = 'R05'
        $pending = [IO.Path]::Combine($AppDataPath, 'kooyai-update')
        if ([IO.Directory]::Exists($pending)) {
            $quarantine = $pending + '-before-repair-' + $session
            [IO.Directory]::Move($pending, $quarantine)
            Log ('Stalled update preserved at ' + $quarantine)
        }
        # Keep copies for support before committing either replacement.
        $backup = [IO.Path]::Combine($ResultRoot, 'original-helpers-' + $session)
        [IO.Directory]::CreateDirectory($backup) > $null
        foreach ($name in @('apply-update.ps1', 'apply-update.cmd')) {
            if ($originals[$name]) { [IO.File]::Copy($originals[$name], [IO.Path]::Combine($backup, $name)) }
        }
        $code = 'R06'
        foreach ($name in @('apply-update.ps1', 'apply-update.cmd')) {
            if (RunningApp $AppExe) { throw 'Pum was opened during repair.' }
            SwapFile ([IO.Path]::Combine($stage, $name + '.new')) ([IO.Path]::Combine($resources, $name))
            $changed += $name
        }
        foreach ($name in @('apply-update.ps1', 'apply-update.cmd')) {
            if ((FileHash ([IO.Path]::Combine($source, $name))) -ne (FileHash ([IO.Path]::Combine($resources, $name)))) { throw 'Installed helper verification failed.' }
        }
    }
    Result 'repaired' 'OK'
    if (!$NoLaunch) {
        $code = 'R07'
        Phase 'ซ่อมเสร็จแล้ว กำลังเปิดโปรแกรมบันทึกปั้ม'
        $app = Start-Process -FilePath $AppExe -PassThru
        $openedPid = $app.Id
        $opened = $false
        $deadline = [DateTime]::UtcNow.AddSeconds(60)
        while ([DateTime]::UtcNow -lt $deadline) {
            $app.Refresh()
            if ($app.HasExited) { break }
            if ($app.MainWindowHandle -ne [IntPtr]::Zero) { $opened = $true; break }
            if ($form) { [Windows.Forms.Application]::DoEvents() }
            Start-Sleep -Milliseconds 200
        }
        if (!$opened) { throw 'The repair finished but Pum did not open a window.' }
        Result 'success' 'OK'
    }
    Log 'Repair completed.'
    if (!$Quiet -and !$NoLaunch -and !$automated) {
        [Windows.Forms.MessageBox]::Show($form, 'ซ่อมเสร็จแล้ว โปรแกรมบันทึกปั้มเปิดให้แล้ว', 'ซ่อมโปรแกรมบันทึกปั้ม', 'OK', 'Information') > $null
    }
} catch {
    Log ($_.Exception.ToString())
    # Restore every changed helper on a failed commit. Keep the stalled download
    # quarantined: restoring that marker would bring back the startup loop.
    if ($code -eq 'R06') {
        foreach ($name in $changed) {
            try {
                $target = [IO.Path]::Combine($resources, $name)
                if ($originals[$name]) { SwapFile $originals[$name] $target }
                elseif ([IO.File]::Exists($target)) { [IO.File]::Delete($target) }
            } catch { Log ('ROLLBACK FAILED: ' + $_.Exception.ToString()); $code = 'R08' }
        }
    }
    if ($code -ne 'R00') { Result 'failed' $code }
    if (!$Quiet -and !$automated) {
        $message = 'ซ่อมยังไม่สำเร็จ ข้อมูลของคุณยังอยู่ กรุณาส่งภาพข้อความนี้ให้ผู้ดูแล' + [Environment]::NewLine + 'รหัส: ' + $code
        if ($code -eq 'R00') { $message = 'กำลังซ่อมอยู่แล้ว กรุณารอหน้าต่างซ่อมเดิมให้เสร็จ' }
        if ($code -eq 'R03') { $message = 'กรุณารีสตาร์ต Windows แล้วเปิดไฟล์ซ่อมอีกครั้ง ก่อนเปิดโปรแกรมบันทึกปั้ม' + [Environment]::NewLine + 'รหัส: ' + $code }
        if ($code -eq 'R02') { $message = 'หาโปรแกรมบันทึกปั้มที่ต้องซ่อมไม่พบ กรุณาติดต่อผู้ดูแล ไม่ต้องเลือกไฟล์เอง' + [Environment]::NewLine + 'รหัส: ' + $code }
        if ($code -eq 'R07') { $message = 'ซ่อมตัวอัปเดตแล้ว แต่โปรแกรมยังเปิดไม่สำเร็จ กรุณาติดต่อผู้ดูแล' + [Environment]::NewLine + 'รหัส: ' + $code }
        if (!$form) { Add-Type -AssemblyName System.Windows.Forms }
        [Windows.Forms.MessageBox]::Show($message, 'ซ่อมโปรแกรมบันทึกปั้ม', 'OK', 'Warning') > $null
    }
    exit 1
} finally {
    if ($form) { $form.Close(); $form.Dispose() }
    if ($stage -and $code -ne 'R08' -and [IO.Directory]::Exists($stage)) {
        try { [IO.Directory]::Delete($stage, $true) } catch { Log ('Stage cleanup: ' + $_.Exception.Message) }
    }
    if ($ownsMutex) { $mutex.ReleaseMutex() }
    if ($mutex) { $mutex.Dispose() }
}
exit 0
