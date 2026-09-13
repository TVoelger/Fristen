@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Bitte zuerst Node.js 24 oder neuer von https://nodejs.org/en/download installieren.
  pause
  exit /b 1
)
node -e "if(!(Number(process.versions.node.split('.')[0])>=24))process.exit(1)"
if errorlevel 1 (
  echo Fuer Fristen wird Node.js 24 oder neuer benoetigt.
  pause
  exit /b 1
)
if not exist "node_modules\vite\package.json" (
  call npm ci
  if errorlevel 1 (
    pause
    exit /b 1
  )
)
call npm run dev -- --open
if errorlevel 1 pause
endlocal
