@echo off
REM ============================================================================
REM INSTALADOR DE TAREA PROGRAMADA WINDOWS (100% GRATUITO)
REM Ejecuta el monitor cada 4 horas de manera automatizada
REM ============================================================================
set TASK_NAME=MonitorPlantasAirtek
set PYTHON_PATH=python.exe
set SCRIPT_DIR=%~dp0
set SCRIPT_PATH=%SCRIPT_DIR%ejecutar_en_segundo_plano.vbs

echo Registrando tarea programada: %TASK_NAME%...
echo Cada 4 horas ejecutara: %SCRIPT_PATH%

schtasks /create /tn "%TASK_NAME%" /tr "wscript.exe \"%SCRIPT_PATH%\"" /sc HOURLY /mo 4 /f

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ============================================================================
    echo [EXITO] Tarea programada '%TASK_NAME%' instalada con exito.
    echo Se ejecutara cada 4 horas en segundo plano sin ventanas molestas.
    echo ============================================================================
) else (
    echo.
    echo [AVISO] Se requieren permisos de Administrador para instalar la tarea programada.
    echo Haga clic derecho sobre este archivo .bat y seleccione 'Ejecutar como administrador'.
)
pause
