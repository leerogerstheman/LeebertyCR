@echo off
REM ===========================================================================
REM  LeebertyCR - native desktop client launcher (PURE ASCII)
REM
REM  Launches the native WinForms application window. The window manages its
REM  own local service (hidden node process) and shows everything in its own
REM  frame - no browser, no Edge, no tabs.
REM
REM  Stop the app from the tray menu ("Stop and exit") or run stop.bat.
REM ===========================================================================
start "" "%~dp0LeebertyCR.exe"