@echo off
REM Foodie Finder - Android Build Script (Windows)
REM Automates building APK/AAB with EAS Build

echo ╔══════════════════════════════════════════╗
echo ║  🍔 Foodie Finder - Android Build       ║
echo ║  v1.0.0                                  ║
echo ╚══════════════════════════════════════════╝
echo.

REM Check if EAS CLI is installed
where eas >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo ❌ EAS CLI not found
    echo Install with: npm install -g eas-cli
    exit /b 1
)

REM Check if logged in
eas whoami >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo ❌ Not logged in to Expo
    echo Login with: eas login
    exit /b 1
)

REM Build type
set BUILD_TYPE=%1
if "%BUILD_TYPE%"=="" set BUILD_TYPE=preview

echo Build Type: %BUILD_TYPE%
echo.

if "%BUILD_TYPE%"=="dev" goto DEV
if "%BUILD_TYPE%"=="development" goto DEV
if "%BUILD_TYPE%"=="preview" goto PREVIEW
if "%BUILD_TYPE%"=="test" goto PREVIEW
if "%BUILD_TYPE%"=="prod" goto PROD
if "%BUILD_TYPE%"=="production" goto PROD
goto INVALID

:DEV
echo → Building DEVELOPMENT APK...
echo   - Development client
echo   - Internal distribution
echo   - Debug features enabled
echo.
eas build --platform android --profile development
goto END

:PREVIEW
echo → Building PREVIEW APK (recommended for testing)...
echo   - Release build
echo   - APK format (installable)
echo   - Internal distribution
echo   - File size: ~50 MB
echo.
eas build --platform android --profile preview
goto END

:PROD
echo → Building PRODUCTION AAB (for Google Play)...
echo   - Release build
echo   - AAB format (optimized)
echo   - Google Play Store
echo   - File size: ~30 MB
echo.
eas build --platform android --profile production
goto END

:INVALID
echo ❌ Invalid build type: %BUILD_TYPE%
echo.
echo Usage: build-android.bat [dev^|preview^|prod]
echo.
echo Options:
echo   dev, development  - Development APK with dev features
echo   preview, test     - Preview APK for testing (recommended)
echo   prod, production  - Production AAB for Play Store
echo.
exit /b 1

:END
echo.
echo ╔══════════════════════════════════════════╗
echo ║  Build Started!                          ║
echo ╚══════════════════════════════════════════╝
echo.
echo Monitor progress at:
echo https://expo.dev/accounts/[your-account]/projects/foodie-finder/builds
echo.
echo Build typically takes 10-20 minutes.
echo You'll receive an email when it's complete.
