'use strict';

/**
 * test/unit/audit.test.js - 审计哈希链单元测试（node:test，Node 18+ 自带）。
 *   node --test test/unit
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// 用独立临时数据目录隔离（必须在 require store 之前设置）
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cra-audit-'));
process.env.CRA_DATA_DIR = tmp;

const audit = require('../../src/core/audit.js');

test('append 构建连续链且校验通过', () => {
  for (let i = 0; i < 5; i++) {
    audit.append({ event: 'unit', n: i, payload: { a: 1, b: [1, 2] } });
  }
  const v = audit.verify();
  assert.equal(v.ok, true, JSON.stringify(v));
  assert.equal(v.count, 5);
});

test('篡改最后一条会被检出并定位', () => {
  const file = path.join(tmp, 'audit-chain.jsonl');
  const lines = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean);
  const last = JSON.parse(lines[lines.length - 1]);
  last.event = 'tampered-by-attacker';
  lines[lines.length - 1] = JSON.stringify(last);
  fs.writeFileSync(file, lines.join('\n') + '\n');
  const v = audit.verify();
  assert.equal(v.ok, false);
  assert.equal(v.brokenAt, 5);
});

test('删除中间一条导致链断裂', () => {
  const file = path.join(tmp, 'audit-chain.jsonl');
  const lines = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean);
  const cut = lines.filter((_, i) => i !== 2); // 删掉第三条
  fs.writeFileSync(file, cut.join('\n') + '\n');
  const v = audit.verify();
  assert.equal(v.ok, false);
  assert.ok(v.brokenAt !== null);
});

test('合法前缀校验通过（截断到前 2 条）', () => {
  const file = path.join(tmp, 'audit-chain.jsonl');
  const lines = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean);
  fs.writeFileSync(file, lines.slice(0, 2).join('\n') + '\n');
  const v = audit.verify();
  assert.equal(v.ok, true);
  assert.equal(v.count, 2);
});