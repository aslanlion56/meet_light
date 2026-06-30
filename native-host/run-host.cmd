@echo off
setlocal
set "SCRIPT_DIR=%~dp0"
set "NODE_PATH_FILE=%SCRIPT_DIR%.node-path"

if exist "%NODE_PATH_FILE%" (
  set /p NODE_BIN=<"%NODE_PATH_FILE%"
  if exist "%NODE_BIN%" (
    "%NODE_BIN%" "%SCRIPT_DIR%host.js"
    exit /b %ERRORLEVEL%
  )
)

if exist "C:\Program Files\nodejs\node.exe" (
  "C:\Program Files\nodejs\node.exe" "%SCRIPT_DIR%host.js"
  exit /b %ERRORLEVEL%
)

where node >nul 2>&1
if %ERRORLEVEL%==0 (
  node "%SCRIPT_DIR%host.js"
  exit /b %ERRORLEVEL%
)

echo Node.js no encontrado. Ejecuta scripts/install-native-host-windows.ps1 >&2
exit /b 1
