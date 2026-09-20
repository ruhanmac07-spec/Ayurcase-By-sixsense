@echo off
REM ==============================================================================
REM AYURCASE Windows Client Turnkey Build Script
REM Compiles the native Windows desktop client (.exe / .msi / NSIS setup)
REM ==============================================================================

setlocal enabledelayedexpansion
title AYURCASE Windows Client Builder

echo ==============================================================================
echo                      AYURCASE WINDOWS CLIENT BUILDER                          
echo ==============================================================================
echo.

REM 1. Verify Node.js
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [WARNING] Node.js not detected in PATH.
    echo If building from source, please install Node.js 18+ from https://nodejs.org/
    echo Proceeding with pre-bundled frontend assets in client/dist...
    set USE_PREBUNDLED=1
) else (
    echo [OK] Node.js detected:
    node --version
    set USE_PREBUNDLED=0
)

REM 2. Verify Rust and Cargo
where cargo >nul 2>nul
if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Rust / Cargo is NOT installed or not in PATH.
    echo To compile the native Windows desktop app, install Rust from:
    echo   https://rustup.rs/
    echo Make sure to install the "Desktop development with C++" workload from Visual Studio Build Tools.
    echo.
    pause
    exit /b 1
)

echo [OK] Cargo detected:
cargo --version

REM 3. Navigate to client directory
cd /d "%~dp0client"
if not exist "src-tauri" (
    echo [ERROR] Could not find src-tauri directory in %cd%
    pause
    exit /b 1
)

REM 4. Build Frontend (if Node.js is present and requested)
if "%USE_PREBUNDLED%"=="0" (
    echo.
    echo [INFO] Installing frontend dependencies and building production bundle...
    if not exist "node_modules" (
        call npm install
    )
    call npm run build
    if %errorlevel% neq 0 (
        echo [WARNING] npm run build encountered an issue. Falling back to pre-bundled assets in dist/
    ) else (
        echo [OK] Frontend bundle built successfully in dist/
    )
) else (
    echo [INFO] Using pre-bundled frontend assets in client/dist/
)

REM 5. Build Tauri Windows Application Bundle
echo.
echo [INFO] Compiling AYURCASE Tauri Windows Executable and NSIS Installer...
echo This may take a few minutes on the first build...
echo.

where tauri >nul 2>nul
if %errorlevel% equ 0 (
    call cargo tauri build
) else (
    call npx -y @tauri-apps/cli build
)

if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Tauri build failed.
    echo Please check the error messages above.
    echo Ensure Microsoft Visual Studio C++ Build Tools and WebView2 are installed.
    pause
    exit /b 1
)

REM 6. Locate and copy installer
set OUT_DIR=%~dp0installer
if not exist "%OUT_DIR%" mkdir "%OUT_DIR%"

if exist "src-tauri\target\release\bundle\nsis\*.exe" (
    copy "src-tauri\target\release\bundle\nsis\*.exe" "%OUT_DIR%\" >nul
)
if exist "src-tauri\target\release\bundle\msi\*.msi" (
    copy "src-tauri\target\release\bundle\msi\*.msi" "%OUT_DIR%\" >nul
)
if exist "src-tauri\target\release\ayurcase.exe" (
    copy "src-tauri\target\release\ayurcase.exe" "%OUT_DIR%\" >nul
)

echo.
echo ==============================================================================
echo [SUCCESS] AYURCASE Windows Client Built Successfully!
echo Output installers are located in:
echo   %OUT_DIR%
echo ==============================================================================
echo.
pause
