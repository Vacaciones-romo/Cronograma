@echo off
title Sistema de Cronogramas - Portable
color 0A

echo ========================================
echo    SISTEMA DE CRONOGRAMAS v1.0
echo ========================================
echo.

set "BASE_DIR=%~dp0"
cd /d "%BASE_DIR%"

echo Verificando Node.js...
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo ERROR: Node.js no esta instalado.
    echo Descargar desde: https://nodejs.org/
    pause
    exit /b 1
)

echo Node.js encontrado
node --version
echo.

echo Verificando dependencias...
if not exist "node_modules\" (
    echo Instalando dependencias...
    call npm install express body-parser sqlite3 sqlite bcryptjs
    if %errorlevel% neq 0 (
        echo Error instalando dependencias
        pause
        exit /b 1
    )
    echo Dependencias instaladas
) else (
    echo Dependencias OK
)
echo.

if not exist "data\" mkdir data
echo Carpetas listas
echo.

echo ========================================
echo INICIANDO SERVIDOR...
echo ========================================
echo.
echo Puerto: 3000
echo Abrir: http://localhost:3000
echo Usuario: admin
echo Contraseña: 1234
echo.

start http://localhost:3000
node server.js

echo.
echo El servidor se ha detenido
pause