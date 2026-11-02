# Repairs existing installations in place. No uninstall, registry edits, or app rename.
# Compatible with Windows PowerShell 2.0.
param([string]$AppExe, [switch]$NoLaunch)
$ErrorActionPreference = 'Stop'

if (!$AppExe) {
    $candidates = @()
    $key = 'Software\Microsoft\Windows\CurrentVersion\Uninstall\3761aeb8-f483-5a64-a1f9-f9ce5194a967'
    foreach ($hive in @('HKCU:', 'HKLM:')) {
        $entry = Get-ItemProperty -LiteralPath ($hive + '\' + $key) -ErrorAction SilentlyContinue
        if ($entry -and $entry.InstallLocation) {
            $candidates += [System.IO.Path]::Combine($entry.InstallLocation, 'banthukpum.exe')
        }
    }
    # Shortcuts also cover installations whose old registry entries were damaged.
    $shell = New-Object -ComObject WScript.Shell
    foreach ($folder in @([Environment]::GetFolderPath('Desktop'), [Environment]::GetFolderPath('CommonDesktopDirectory'))) {
        foreach ($link in @(Get-ChildItem -LiteralPath $folder -Filter '*.lnk' -ErrorAction SilentlyContinue)) {
            $path = $shell.CreateShortcut($link.FullName).TargetPath
            if ([System.IO.Path]::GetFileName($path) -ieq 'banthukpum.exe') { $candidates += $path }
        }
    }
    $candidates = @($candidates | Where-Object {
        [System.IO.File]::Exists($_) -and
        [System.IO.File]::Exists([System.IO.Path]::Combine([System.IO.Path]::GetDirectoryName($_), 'resources\app.asar'))
    } | Select-Object -Unique)
    if ($candidates.Count -eq 1) {
        $AppExe = $candidates[0]
    } else {
        Add-Type -AssemblyName System.Windows.Forms
        $picker = New-Object System.Windows.Forms.OpenFileDialog
        $picker.Title = 'Select the installed Pum application (banthukpum.exe)'
        $picker.Filter = 'Pum application (banthukpum.exe)|banthukpum.exe'
        if ($picker.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK) { exit 1 }
        $AppExe = $picker.FileName
    }
}

$AppExe = [System.IO.Path]::GetFullPath($AppExe)
$resources = [System.IO.Path]::Combine([System.IO.Path]::GetDirectoryName($AppExe), 'resources')
if (![System.IO.File]::Exists($AppExe) -or ![System.IO.File]::Exists([System.IO.Path]::Combine($resources, 'app.asar'))) {
    throw 'This is not an installed Pum application.'
}
$running = @(Get-Process -Name banthukpum -ErrorAction SilentlyContinue | Where-Object { $_.Path -ieq $AppExe })
if ($running.Count -gt 0) { throw 'Restart Windows, then run this repair before opening Pum.' }

$source = Split-Path -Parent $MyInvocation.MyCommand.Path
foreach ($name in @('apply-update.cmd', 'apply-update.ps1')) {
    $target = [System.IO.Path]::Combine($resources, $name)
    if ([System.IO.File]::Exists($target) -and ![System.IO.File]::Exists($target + '.before-repair')) {
        [System.IO.File]::Copy($target, $target + '.before-repair')
    }
    [System.IO.File]::Copy([System.IO.Path]::Combine($source, $name), $target, $true)
}

# Preserve the stalled download for diagnosis; never touch station.json or the DB.
$pending = [System.IO.Path]::Combine([Environment]::GetFolderPath('ApplicationData'), 'kooyai-update')
if ([System.IO.Directory]::Exists($pending)) {
    [System.IO.Directory]::Move($pending, $pending + '-before-repair-' + [Guid]::NewGuid().ToString('N'))
}
Write-Host 'Updater repaired. The application name, installation, and station records were preserved.'
if (!$NoLaunch) { Start-Process -FilePath $AppExe }
