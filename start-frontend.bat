@echo off
echo ========================================
echo   WhatsApp Bot - Frontend
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
    echo [INFO] Instalando dependencias...
    call npm install
    if %ERRORLEVEL% NEQ 0 (
        echo [ERROR] Fallo la instalacion de dependencias
        pause
        exit /b 1
    )
)

echo.
echo ========================================
echo   Iniciando servidor de desarrollo...
echo ========================================
echo.
echo El navegador se abrira automaticamente en:
echo http://localhost:5173
echo.
echo Presiona Ctrl+C para detener el servidor
echo.

npm run dev
