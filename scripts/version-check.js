'use strict';

/**
 * scripts/version-check.js - 版本与环境自检。
 *
 *   node scripts/version-check.js
 *
 * 检查：应用版本一致性（package.json / config / 内容库）、Node 版本要求、
 *       数据目录状态、Docker 配置存在性、原生客户端是否已构建。
 */

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const ok = [];
const warn = [];
const bad = [];

function readJson(p) { return JSON.parse(fs.readFileSync(p, 'utf8')); }

const pkg = readJson(path.join(ROOT, 'package.json'));
const config = require(path.join(ROOT, 'src', 'config.js'));

// 1. 版本一致性
if (pkg.version === config.app.version) ok.push('版本一致：' + pkg.version);
else bad.push('版本不一致：package.json=' + pkg.version + ' config=' + config.app.version);

if (pkg.name && config.app.name === 'LeebertyCR') ok.push('应用名：' + config.app.name);
else warn.push('应用名与预期不符：' + config.app.name);

// 2. Node 版本
const major = Number(process.versions.node.split('.')[0]);
if (major >= 18) ok.push('Node.js ' + process.versions.node + ' 满足要求（>=18）');
else bad.push('Node.js ' + process.versions.node + ' 过低，需要 >=18');

// 3. 原生客户端
const exe = path.join(ROOT, 'LeebertyCR.exe');
if (fs.existsSync(exe)) ok.push('原生客户端已构建：' + Math.round(fs.statSync(exe).size / 1024) + ' KB');
else warn.push('原生客户端未构建（运行 node scripts/build-exe.js）');

// 4. 内容库
try {
  const store = require(path.join(ROOT, 'src', 'store.js'));
  const content = store.loadContent();
  const n = Object.keys(content).length;
  ok.push('内容库 ' + n + ' 个文件加载正常（流程 ' + content.workflows.workflows.length +
    ' 条 / 清单 ' + content.checklists.checklists.length + ' 张 / 表单 ' + content.forms.forms.length + ' 个）');
} catch (e) {
  bad.push('内容库加载失败：' + e.message);
}

// 5. 数据目录
const dataDir = config.dataDir;
if (fs.existsSync(dataDir)) {
  const files = fs.readdirSync(dataDir);
  ok.push('数据目录存在：' + dataDir + '（' + files.length + ' 个条目）');
} else {
  warn.push('数据目录尚未创建（首次运行会自动初始化）：' + dataDir);
}

// 6. 部署产物
for (const f of ['Dockerfile', 'docker-compose.yml', '安装快捷方式.bat']) {
  if (fs.existsSync(path.join(ROOT, f))) ok.push('部署产物：' + f);
  else warn.push('缺少部署产物：' + f);
}

// 7. Docker 语法静态检查（本机未装 Docker 也能发现明显笔误）
const df = path.join(ROOT, 'Dockerfile');
if (fs.existsSync(df)) {
  const lines = fs.readFileSync(df, 'utf8').split('\n');
  const froms = lines.filter((l) => /^FROM\s+/i.test(l));
  const cmds = lines.filter((l) => /^CMD\s+/i.test(l));
  if (froms.length === 1 && cmds.length === 1) ok.push('Dockerfile 基本结构正确（1 FROM / 1 CMD）');
  else warn.push('Dockerfile 结构可疑（FROM=' + froms.length + ', CMD=' + cmds.length + '）');
}

console.log('');
console.log('  LeebertyCR 版本与环境自检');
console.log('  ' + '='.repeat(62));
console.log('');
for (const l of ok) console.log('  OK    ' + l);
for (const l of warn) console.log('  WARN  ' + l);
for (const l of bad) console.log('  FAIL  ' + l);
console.log('');
if (bad.length) {
  console.log('  VERSION CHECK FAILED - ' + bad.length + ' 项需要处理');
  console.log('');
  process.exit(1);
}
console.log('  VERSION CHECK PASSED' + (warn.length ? '（' + warn.length + ' 项提示）' : ''));
console.log('');
process.exit(0);