@echo off
rem 安装快捷方式.bat - 在桌面创建 LeebertyCR 快捷方式（无需管理员权限）
setlocal
set "TARGET=%~dp0LeebertyCR.exe"
if not exist "%TARGET%" (
  echo [错误] 未找到 LeebertyCR.exe，请先运行 scripts\build-exe.js 生成。
  pause
  exit /b 1
)
powershell -NoProfile -Command ^
  "$s=(New-Object -ComObject WScript.Shell).CreateShortcut([Environment]::GetFolderPath('Desktop')+'\LeebertyCR.lnk');" ^
  "$s.TargetPath='%TARGET%'; $s.WorkingDirectory='%~dp0'; $s.Description='LeebertyCR - CRA/CRC 临床试验工作台'; $s.Save()"
if errorlevel 1 (
  echo [错误] 创建快捷方式失败。
  pause
  exit /b 1
)
echo 已在桌面创建快捷方式：LeebertyCR.lnk
echo 目标：%TARGET%
pause
