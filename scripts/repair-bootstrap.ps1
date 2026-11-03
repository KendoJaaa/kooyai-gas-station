# Embedded as UTF-16 EncodedCommand in the single-file CMD repair.
$ErrorActionPreference = 'Stop'
$quiet = $env:GITHUB_ACTIONS -eq 'true' -and $env:KOOYAI_REPAIR_AUTOMATED -eq '1'
try {
    try {
        Add-Type 'using System; using System.Runtime.InteropServices; public static class PumConsole { [DllImport("kernel32.dll")] public static extern IntPtr GetConsoleWindow(); [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int n); }'
        [PumConsole]::ShowWindow([PumConsole]::GetConsoleWindow(), 0) > $null
    } catch {}
    $lines = [IO.File]::ReadAllLines($env:PUM_REPAIR_SELF)
    $at = [Array]::IndexOf($lines, ':__PUM_REPAIR_FILES__')
    if ($at -lt 0 -or $lines.Length -ne $at + 4) { throw 'Incomplete repair file.' }
    $payload = [string]::Join([string][char]10, [string[]]$lines[($at + 1)..($lines.Length - 1)])
    $sha = [Security.Cryptography.SHA256]::Create()
    try { $digest = [BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($payload))).Replace('-', '').ToLowerInvariant() }
    finally { $sha.Dispose() }
    if ($digest -ne '__PUM_PAYLOAD_HASH__') { throw 'The repair file is damaged.' }
    $folder = [IO.Path]::Combine([IO.Path]::GetTempPath(), 'Pum-Repair-' + [Guid]::NewGuid().ToString('N'))
    [IO.Directory]::CreateDirectory($folder) > $null
    foreach ($line in $lines[($at + 1)..($lines.Length - 1)]) {
        $pair = $line.Split([char[]]'|', 2)
        if ($pair.Length -ne 2 -or @('apply-update.cmd', 'apply-update.ps1', 'repair-windows-updater.ps1') -notcontains $pair[0]) { throw 'Invalid repair contents.' }
        [IO.File]::WriteAllBytes([IO.Path]::Combine($folder, $pair[0]), [Convert]::FromBase64String($pair[1]))
    }
    & ([IO.Path]::Combine($folder, 'repair-windows-updater.ps1'))
    exit $LASTEXITCODE
} catch {
    try {
        $support = [IO.Path]::Combine([Environment]::GetFolderPath('LocalApplicationData'), 'Pum-Repair')
        [IO.Directory]::CreateDirectory($support) > $null
        [IO.File]::WriteAllText([IO.Path]::Combine($support, 'bootstrap-error.txt'), $_.Exception.ToString(), [Text.Encoding]::UTF8)
    } catch {}
    if (!$quiet) {
        Add-Type -AssemblyName System.Windows.Forms
        [Windows.Forms.MessageBox]::Show('เปิดไฟล์ซ่อมไม่สำเร็จ กรุณาส่งภาพข้อความนี้ให้ผู้ดูแล รหัส B01', 'ซ่อมโปรแกรมบันทึกปั้ม', 'OK', 'Warning') > $null
    }
    [Console]::Error.WriteLine('Repair bootstrap failed: ' + $_.Exception.Message)
    exit 1
} finally {
    if ($folder -and [IO.Directory]::Exists($folder)) {
        try { [IO.Directory]::Delete($folder, $true) } catch {}
    }
}
