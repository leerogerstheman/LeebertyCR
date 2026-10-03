'use strict';

/**
 * scripts/package.js - 生成便携版发布包（零第三方依赖）。
 *
 *   node scripts/package.js
 *
 * 产物：dist/LeebertyCR-Portable-<版本>.zip
 *   包含：LeebertyCR.exe（原生窗口）、src/、seed/、web/、scripts/、desktop/、
 *         start.bat、stop.bat、安装快捷方式.bat、docs/、README.md
 *   排除：data/（运行数据）、logs/、dist/、test/、node_modules/
 *
 * 说明：只依赖 Node 自带的 fs/zlib/child_process（压缩交给系统 tar 或 PowerShell）。
 */

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const STAGE = path.join(DIST, 'LeebertyCR-Portable');

const INCLUDE = [
  'LeebertyCR.exe',
  'start.bat',
  'stop.bat',
  '安装快捷方式.bat',
  'README.md',
  'package.json',
  'src',
  'seed',
  'web',
  'scripts',
  'desktop',
  'docs',
  'Dockerfile',
  'docker-compose.yml',
  '.dockerignore',
];

const EXCLUDE_DIRS = new Set(['data', 'logs', 'dist', 'test', 'node_modules', '.git']);

function copyRecursive(src, dest) {
  const st = fs.statSync(src);
  if (st.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const name of fs.readdirSync(src)) {
      if (EXCLUDE_DIRS.has(name)) continue;
      copyRecursive(path.join(src, name), path.join(dest, name));
    }
  } else {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  }
}

function main() {
  const version = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version || '0.0.0';
  fs.mkdirSync(DIST, { recursive: true });
  fs.rmSync(STAGE, { recursive: true, force: true });
  fs.mkdirSync(STAGE, { recursive: true });

  let copied = 0;
  for (const item of INCLUDE) {
    const src = path.join(ROOT, item);
    if (!fs.existsSync(src)) {
      console.log('  skip（不存在）: ' + item);
      continue;
    }
    copyRecursive(src, path.join(STAGE, item));
    copied++;
  }
  // 便携包内附带一份空白 data 目录（首次运行自动初始化）
  fs.mkdirSync(path.join(STAGE, 'data'), { recursive: true });
  fs.writeFileSync(path.join(STAGE, 'data', '.keep'), '', 'utf8');

  const zipName = 'LeebertyCR-Portable-' + version + '.zip';
  const zipPath = path.join(DIST, zipName);
  fs.rmSync(zipPath, { force: true });

  // 优先用系统 tar（Windows 10+ 自带），失败退回 PowerShell Compress-Archive
  let ok = false;
  const tar = spawnSync('tar', ['-a', '-c', '-f', zipPath, '-C', DIST, 'LeebertyCR-Portable'], { stdio: 'inherit' });
  if (tar.status === 0 && fs.existsSync(zipPath)) ok = true;
  if (!ok) {
    const ps = spawnSync('powershell', ['-NoProfile', '-Command',
      `Compress-Archive -Path '${STAGE}' -DestinationPath '${zipPath}' -Force`], { stdio: 'inherit' });
    ok = ps.status === 0 && fs.existsSync(zipPath);
  }

  console.log('');
  console.log('  LeebertyCR 便携版打包');
  console.log('  ' + '='.repeat(58));
  console.log('  版本      ' + version);
  console.log('  条目      ' + copied + ' 项（已排除 data/ logs/ dist/ test/）');
  console.log('  暂存目录  ' + STAGE);
  if (ok) {
    const size = fs.statSync(zipPath).size;
    console.log('  压缩包    ' + zipPath + '（' + Math.round(size / 1024) + ' KB）');
    console.log('');
    console.log('  PACKAGE OK - 解压后双击 LeebertyCR.exe 即可运行（需本机有 Node.js 18+）');
  } else {
    console.log('  压缩包    生成失败：请手动压缩 ' + STAGE);
    console.log('');
    process.exit(1);
  }
  console.log('');
}

main();