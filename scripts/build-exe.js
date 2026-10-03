'use strict';

/**
 * scripts/build-exe.js - 用系统自带的 C# 编译器把 desktop/Launcher.cs 编译为
 * 单文件 exe（无第三方组件），并运行启动器自检（--selftest）验证可用。
 *
 *   node scripts/build-exe.js
 */

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'dist', 'desktop');
const OUT_EXE = path.join(OUT_DIR, 'LeebertyCR.exe');
const SRC = path.join(ROOT, 'desktop', 'Launcher.cs');
const CLIENT_FILES = [
  'NativeClient.cs',
  'MainWin.cs',
  'ApiClient.cs',
  'Views.cs',
  'Views2.cs',
  'Subjects.cs',
  'Documents.cs',
].map((f) => path.join(ROOT, 'desktop', f));

const CSC_CANDIDATES = [
  path.join(process.env.windir || 'C:\\Windows', 'Microsoft.NET', 'Framework64', 'v4.0.30319', 'csc.exe'),
  path.join(process.env.windir || 'C:\\Windows', 'Microsoft.NET', 'Framework', 'v4.0.30319', 'csc.exe'),
];

const csc = CSC_CANDIDATES.find((c) => fs.existsSync(c));
if (!csc) {
  console.error('未找到 C# 编译器（csc.exe）。\n本机可直接使用 start.bat / start-silent.bat 启动，无需 exe。');
  process.exit(1);
}

fs.mkdirSync(OUT_DIR, { recursive: true });

console.log('编译原生桌面客户端（WinForms，零浏览器依赖）...');
const r = spawnSync(csc, [
  '/nologo',
  '/target:winexe',
  '/optimize+',
  '/codepage:65001',
  '/out:' + OUT_EXE,
  '/reference:System.Windows.Forms.dll',
  '/reference:System.Drawing.dll',
  '/reference:System.Web.Extensions.dll',
  ...CLIENT_FILES,
], { encoding: 'utf8' });

if (r.status !== 0) {
  console.error('编译失败:\n' + (r.stdout || '') + (r.stderr || ''));
  process.exit(1);
}
console.log('编译成功: ' + OUT_EXE + ' (' + fs.statSync(OUT_EXE).size + ' bytes)');

console.log('\n运行原生客户端自检（--selftest）...\n');
const t = spawnSync(OUT_EXE, ['--root', ROOT, '--selftest'], { encoding: 'utf8', timeout: 60000 });
process.stdout.write(t.stdout || '');
process.stderr.write(t.stderr || '');
if (t.status !== 0) {
  console.error('\n自检失败。');
  process.exit(1);
}
console.log('\n原生客户端构建并验证通过。');
console.log('可直接双击 ' + OUT_EXE + '（或复制到项目根目录双击）。');