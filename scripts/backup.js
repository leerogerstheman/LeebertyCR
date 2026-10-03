'use strict';

/**
 * scripts/backup.js - 备份 data 目录到 data-backups/<时间戳>。
 *
 *   node scripts/backup.js
 */

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const DATA = path.join(ROOT, 'data');
const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
const DEST = path.join(ROOT, 'data-backups', stamp);

if (!fs.existsSync(DATA)) {
  console.log('data 目录不存在，无需备份。');
  process.exit(0);
}

fs.mkdirSync(DEST, { recursive: true });
for (const f of fs.readdirSync(DATA)) {
  const src = path.join(DATA, f);
  if (fs.statSync(src).isFile()) {
    fs.copyFileSync(src, path.join(DEST, f));
  }
}
const files = fs.readdirSync(DEST);
console.log('备份完成: ' + DEST + ' (' + files.length + ' 个文件)');
console.log('恢复方式：把备份里的文件复制回 data 目录。');