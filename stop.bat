@echo off
REM stop.bat - stop the background LeebertyCR instance on the default / given port
setlocal EnableExtensions
set "CRA_PORT=8816"
if not "%~1"=="" set "CRA_PORT=%~1"
echo Stopping LeebertyCR on port %CRA_PORT% ...
for /f "tokens=5" %%P in ('netstat -ano -p TCP ^| findstr LISTENING ^| findstr ":%CRA_PORT% "') do (
  taskkill /F /PID %%P >nul 2>&1
)
echo Done.
endlocal