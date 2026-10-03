'use strict';

/**
 * audit.js - 只追加的哈希链审计追踪（参考 GxP-Workbench src/core/audit.js）。
 *
 * 每条审计记录：{ seq, ts, ...业务字段, prev, hash }
 *   prev = 上一条记录的 hash（首条为常量 GENESIS）
 *   hash = HMAC-SHA256(chainKey, prev + '|' + 规范化payload)
 *
 * 三层防护：
 *   1. 直接改行内容    -> 重算校验时 hash 不匹配，定位到具体 seq
 *   2. 删除/插入行     -> prev 链断裂，定位到断点
 *   3. 把文件拷走重算  -> HMAC 密钥在库外（data/audit-chain.key），无法伪造
 */

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const store = require('../store');

const GENESIS = 'GENESIS';

function auditFile() { return path.join(store.DATA_DIR, 'audit-chain.jsonl'); }
function keyFile() { return path.join(store.DATA_DIR, 'audit-chain.key'); }

function loadKey() {
  store.ensureDataDir();
  try {
    if (fs.existsSync(keyFile())) {
      const k = fs.readFileSync(keyFile(), 'utf8').trim();
      if (k.length >= 64) return k;
    }
  } catch { /* regenerate below */ }
  const k = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(keyFile(), k, 'utf8');
  return k;
}

/** 规范化 JSON：键排序、无多余空白（哈希与字段顺序无关） */
function canonical(obj) {
  return stableStringify(obj);
}

function stableStringify(v) {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'string') return JSON.stringify(v);
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (Array.isArray(v)) return '[' + v.map(stableStringify).join(',') + ']';
  if (typeof v === 'object') {
    const keys = Object.keys(v).sort();
    return '{' + keys.map((k) => JSON.stringify(k) + ':' + stableStringify(v[k])).join(',') + '}';
  }
  return JSON.stringify(String(v));
}

let keyCache = null;
function chainKey() {
  if (!keyCache) keyCache = loadKey();
  return keyCache;
}

function chainHash(prev, payload) {
  return crypto.createHmac('sha256', chainKey())
    .update(String(prev) + '|' + canonical(payload))
    .digest('hex');
}

function readLines() {
  const file = auditFile();
  if (!fs.existsSync(file)) return [];
  try {
    return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean);
  } catch {
    return [];
  }
}

function lastEntry() {
  const lines = readLines();
  if (!lines.length) return { seq: 0, hash: GENESIS };
  const last = JSON.parse(lines[lines.length - 1]);
  return { seq: last.seq, hash: last.hash };
}

/** 追加一条审计记录（幂等业务方调用；本函数只负责链式落盘） */
function append(fields) {
  const prev = lastEntry();
  const payload = { ...fields };
  const entry = {
    seq: prev.seq + 1,
    ts: new Date().toISOString(),
    ...payload,
    prev: prev.hash,
  };
  entry.hash = chainHash(entry.prev, { ts: entry.ts, ...payload });
  try {
    store.ensureDataDir();
    fs.appendFileSync(auditFile(), JSON.stringify(entry) + '\n', 'utf8');
  } catch { /* 审计失败不阻断业务，但会在控制台暴露 */ }
  return entry;
}

/** 全链校验：返回 { ok, count, brokenAt, error } */
function verify() {
  const lines = readLines();
  let prevHash = GENESIS;
  let prevSeq = 0;
  for (let i = 0; i < lines.length; i++) {
    let entry;
    try {
      entry = JSON.parse(lines[i]);
    } catch (e) {
      return { ok: false, count: i, brokenAt: null, error: '第 ' + (i + 1) + ' 行无法解析: ' + e.message };
    }
    if (entry.seq !== prevSeq + 1) {
      return { ok: false, count: i, brokenAt: entry.seq, error: '序号断层：期望 ' + (prevSeq + 1) + '，实际 ' + entry.seq };
    }
    if (entry.prev !== prevHash) {
      return { ok: false, count: i, brokenAt: entry.seq, error: '第 ' + entry.seq + ' 条的 prev 与上一条 hash 不匹配（链断裂）' };
    }
    const payload = { ...entry };
    delete payload.seq;
    delete payload.prev;
    delete payload.hash;
    const expect = chainHash(entry.prev, payload);
    if (expect !== entry.hash) {
      return { ok: false, count: i, brokenAt: entry.seq, error: '第 ' + entry.seq + ' 条内容被篡改（hash 不匹配）' };
    }
    prevHash = entry.hash;
    prevSeq = entry.seq;
  }
  return { ok: true, count: lines.length, brokenAt: null, error: null };
}

/** 最近 n 条（用于界面展示） */
function tail(n) {
  const lines = readLines();
  const slice = lines.slice(-Math.max(1, Number(n) || 100));
  return slice.map((l) => {
    try { return JSON.parse(l); } catch { return { seq: 0, ts: '', event: 'unparsable' }; }
  });
}

module.exports = { append, verify, tail, GENESIS };