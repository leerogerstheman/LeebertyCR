@echo off
REM start-silent.bat - start LeebertyCR server in the background with logs
setlocal EnableExtensions
cd /d "%~dp0"
set "CRA_PORT=8816"
if not "%~1"=="" set "CRA_PORT=%~1"
if not exist "logs" mkdir "logs" >nul 2>&1
if not exist "data" mkdir "data" >nul 2>&1
set "CRA_OPEN_BROWSER=0"
start "LeebertyCR server" /min node src\server.js >> logs\server.log 2>&1
echo Started in background on port %CRA_PORT%. Log: logs\server.log
endlocal