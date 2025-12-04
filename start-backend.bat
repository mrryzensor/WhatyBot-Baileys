@echo off
echo ========================================
echo   WhatsApp Bot - Inicio Rapido
echo ========================================
echo.

REM Verificar si Node.js esta instalado
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Node.js no esta instalado
    echo Por favor instala Node.js desde https://nodejs.org/
    pause
    exit /b 1
)

echo [OK] Node.js detectado: 
node --version
echo.

REM Verificar si las dependencias estan instaladas
if not exist "node_modules\" (
    echo [INFO] Instalando dependencias del frontend...
    call npm install
    if %ERRORLEVEL% NEQ 0 (
        echo [ERROR] Fallo la instalacion de dependencias del frontend
        pause
        exit /b 1
    )
)

if not exist "server\node_modules\" (
    echo [INFO] Instalando dependencias del backend...
    cd server
    call npm install
    if %ERRORLEVEL% NEQ 0 (
        echo [ERROR] Fallo la instalacion de dependencias del backend
        pause
        exit /b 1
    )
    cd ..
)

echo.
echo ========================================
echo   Iniciando servidor backend...
echo ========================================
echo.
echo Presiona Ctrl+C para detener el servidor
echo.

cd server
npm run dev
