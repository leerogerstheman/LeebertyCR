'use strict';

/**
 * scripts/verify-audit.js - 审计哈希链完整性校验（命令行）。
 *
 *   node scripts/verify-audit.js
 *
 * 退出码：0 = 链完整；1 = 链被破坏（会给出断点 seq 与原因）。
 */

const path = require('node:path');
const store = require(path.join(__dirname, '..', 'src', 'store.js'));
const audit = require(path.join(__dirname, '..', 'src', 'core', 'audit.js'));

const result = audit.verify();
console.log('');
console.log('  LeebertyCR - audit chain verification');
console.log('  ' + '='.repeat(60));
console.log('');
console.log('  file        ' + path.join(store.DATA_DIR, 'audit-chain.jsonl'));
console.log('  entries     ' + result.count);
console.log('  integrity   ' + (result.ok ? 'OK - chain is complete' : 'BROKEN - ' + result.error));
console.log('');
if (!result.ok) {
  console.log('  action: preserve the data directory; do NOT keep appending to a broken chain.');
  console.log('  the audit key lives outside the chain file (data/audit-chain.key).');
  console.log('');
  process.exit(1);
}
console.log('  VERIFY PASSED');
console.log('');
process.exit(0);