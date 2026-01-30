@echo off
:: ============================================================================
:: ClawdBot Lite - One-Click Installer
:: The cheapest way to run your own AI assistant
:: ============================================================================

title ClawdBot Lite Installer
color 0A

echo.
echo  ============================================================================
echo  ^|                                                                          ^|
echo  ^|              CLAWDBOT LITE - ONE-CLICK INSTALLER                         ^|
echo  ^|                                                                          ^|
echo  ^|   Powered by DeepSeek AI - 100x cheaper than GPT-4!                      ^|
echo  ^|   Cost: ~$0.14/million tokens                                            ^|
echo  ^|                                                                          ^|
echo  ============================================================================
echo.
echo  This installer will:
echo    1. Check/install Node.js
echo    2. Install dependencies
echo    3. Build the project
echo    4. Run setup wizard (asks for API keys)
echo.
echo  Press any key to start...
pause >nul

:: Check for Node.js
where node >nul 2>&1
if %errorLevel% neq 0 (
    echo.
    echo [!] Node.js not found. Installing...
    winget install OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
    if %errorLevel% neq 0 (
        echo [ERROR] Failed to install Node.js.
        echo         Please install manually from https://nodejs.org
        pause
        exit /b 1
    )
    echo [OK] Node.js installed! Please restart this installer.
    pause
    exit /b 0
)

echo.
echo [OK] Node.js found

:: Install dependencies
echo.
echo [STEP 1/3] Installing dependencies...
cd /d "%~dp0"
call npm install
if %errorLevel% neq 0 (
    echo [ERROR] Failed to install dependencies.
    pause
    exit /b 1
)
echo [OK] Dependencies installed!

:: Build
echo.
echo [STEP 2/3] Building...
call npm run build
if %errorLevel% neq 0 (
    echo [ERROR] Build failed.
    pause
    exit /b 1
)
echo [OK] Build complete!

:: Run setup
echo.
echo [STEP 3/3] Running setup wizard...
call npm run setup

pause
