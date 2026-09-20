# ==============================================================================
# AYURCASE Windows Client Turnkey PowerShell Build Script
# Compiles the native Windows desktop client (.exe / .msi / NSIS setup)
# ==============================================================================

[CmdletBinding()]
param (
    [switch]$SkipNpmBuild
)

$ErrorActionPreference = "Stop"

Write-Host "==============================================================================" -ForegroundColor Cyan
Write-Host "                     AYURCASE WINDOWS CLIENT BUILDER                          " -ForegroundColor Cyan
Write-Host "==============================================================================" -ForegroundColor Cyan
Write-Host ""

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ClientDir = Join-Path $ScriptDir "client"
$InstallerDir = Join-Path $ScriptDir "installer"

# 1. Check Node.js
$NodeCmd = Get-Command node -ErrorAction SilentlyContinue
if ($NodeCmd) {
    $NodeVer = & node --version
    Write-Host "[OK] Node.js detected: $NodeVer" -ForegroundColor Green
} else {
    Write-Host "[WARNING] Node.js not found in PATH. Will use pre-bundled frontend assets in client/dist." -ForegroundColor Yellow
    $SkipNpmBuild = $true
}

# 2. Check Cargo / Rust
$CargoCmd = Get-Command cargo -ErrorAction SilentlyContinue
if ($CargoCmd) {
    $CargoVer = & cargo --version
    Write-Host "[OK] Cargo detected: $CargoVer" -ForegroundColor Green
} else {
    Write-Host "[ERROR] Rust / Cargo is NOT installed or not in PATH." -ForegroundColor Red
    Write-Host "Please install Rust from https://rustup.rs/ with Desktop development with C++." -ForegroundColor Red
    exit 1
}

# 3. Check Tauri CLI or npx
Push-Location $ClientDir
try {
    # Build Frontend if requested
    if (-not $SkipNpmBuild) {
        Write-Host ""
        Write-Host "[INFO] Building frontend bundle..." -ForegroundColor Cyan
        if (-not (Test-Path "node_modules")) {
            npm install
        }
        npm run build
        Write-Host "[OK] Frontend build complete." -ForegroundColor Green
    } else {
        Write-Host "[INFO] Using pre-bundled frontend in client/dist/" -ForegroundColor Cyan
    }

    # Build Tauri
    Write-Host ""
    Write-Host "[INFO] Building AYURCASE native Windows executable & installer..." -ForegroundColor Cyan
    $TauriCmd = Get-Command tauri -ErrorAction SilentlyContinue
    if ($TauriCmd) {
        cargo tauri build
    } else {
        npx -y @tauri-apps/cli build
    }

    Write-Host "[OK] Tauri compilation finished successfully!" -ForegroundColor Green

    # Copy output to installer folder
    if (-not (Test-Path $InstallerDir)) {
        New-Item -ItemType Directory -Path $InstallerDir -Force | Out-Null
    }

    $NsisPath = Join-Path $ClientDir "src-tauri\target\release\bundle\nsis"
    $MsiPath  = Join-Path $ClientDir "src-tauri\target\release\bundle\msi"
    $ExePath  = Join-Path $ClientDir "src-tauri\target\release\ayurcase.exe"

    if (Test-Path $NsisPath) {
        Copy-Item (Join-Path $NsisPath "*.exe") -Destination $InstallerDir -Force -ErrorAction SilentlyContinue
    }
    if (Test-Path $MsiPath) {
        Copy-Item (Join-Path $MsiPath "*.msi") -Destination $InstallerDir -Force -ErrorAction SilentlyContinue
    }
    if (Test-Path $ExePath) {
        Copy-Item $ExePath -Destination $InstallerDir -Force -ErrorAction SilentlyContinue
    }

    Write-Host ""
    Write-Host "==============================================================================" -ForegroundColor Green
    Write-Host "[SUCCESS] AYURCASE Windows Client Built Successfully!" -ForegroundColor Green
    Write-Host "Installer and binaries available at: $InstallerDir" -ForegroundColor Green
    Write-Host "==============================================================================" -ForegroundColor Green
}
finally {
    Pop-Location
}
