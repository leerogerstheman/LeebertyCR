'use strict';

/**
 * workflow.js - 配置驱动的工作流执行引擎（参考 GxP-Workbench src/domain/workflow.js）。
 *
 * 本模块是全系统唯一的状态机：流程定义是数据（seed/workflows.json），
 * 记录 = 一条受控记录 + 一串有角色门槛、部分需要电子签名的步骤。
 *
 * 推进步骤时按顺序执行五道门（与 GxP 的 completeStep 同构）：
 *   1. 终态检查            —— 已关闭/已取消的记录不可再改         409 RECORD_TERMINAL
 *   2. 步骤存在与顺序       —— 只能执行当前步骤                    404/409 STEP_*
 *   3. 角色门              —— 当前账号的角色必须在该步骤允许内     403 ROLE_NOT_PERMITTED
 *   4. 独立复核门          —— 记录提出人不得执行独立复核步骤       403 INDEPENDENCE_VIOLATION
 *   5. 签名门 + 必填字段门  —— 签名步骤必须通过双要素签名
 *      （21 CFR 11.200(a)(1)(i)：标识码+口令 + 一次性挑战码）      428/403 SIGNATURE_*
 *                                                           400 STEP_FIELDS_MISSING
 * 角色来自登录账号（auth.js），不来自请求参数 —— 服务端强制。
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const store = require('./store');
const auth = require('./auth');

function nowIso() { return new Date().toISOString(); }
function daysFromNow(n) { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); }

/* ------------------------------------------------ 记录版本快照（P0：可重建） */

function recordHistoryFile() {
  return path.join(store.DATA_DIR, 'record-history.jsonl');
}

/**
 * 每次记录变更（创建/推进/取消）追加一个完整快照行。
 * snapshot 为最小化视图（不含 history 全文，防文件膨胀）；hash 固定该版本内容。
 */
function snapshotRecord(record, action, by) {
  const snap = {
    recordKey: record.recordKey,
    processCode: record.processCode,
    title: record.title,
    status: record.status,
    stepIndex: record.stepIndex,
    steps: (record.steps || []).map((s) => ({
      code: s.code, status: s.status,
      completedByRole: s.completedByRole || null,
      signedBy: s.signedBy || null,
    })),
    persisted: (record.data && record.data.persisted) || {},
    historyCount: (record.history || []).length,
    updatedAt: record.updatedAt,
  };
  const hash = crypto.createHash('sha256').update(JSON.stringify(snap)).digest('hex');
  const line = {
    key: record.recordKey,
    version: record.recordVersion,
    at: nowIso(),
    by: by || null,
    action,
    status: record.status,
    hash,
    snapshot: snap,
  };
  try {
    store.ensureDataDir();
    fs.appendFileSync(recordHistoryFile(), JSON.stringify(line) + '\n', 'utf8');
  } catch { /* 快照失败不阻断主流程（审计链已接管） */ }
}

function readRecordHistory(recordKey) {
  const file = recordHistoryFile();
  if (!fs.existsSync(file)) return [];
  const out = [];
  for (const l of fs.readFileSync(file, 'utf8').split('\n').filter(Boolean)) {
    try {
      const e = JSON.parse(l);
      if (e.key === recordKey) out.push(e);
    } catch { /* 跳过坏行 */ }
  }
  return out;
}

function listVersions(recordKey) {
  return readRecordHistory(recordKey).map((e) => ({
    version: e.version, at: e.at, by: e.by, action: e.action, status: e.status, hash: e.hash,
  }));
}

function getVersion(recordKey, version) {
  const v = readRecordHistory(recordKey).find((e) => e.version === Number(version));
  if (!v) throw httpError(404, 'VERSION_NOT_FOUND', '未找到版本 ' + version);
  return { key: v.key, version: v.version, at: v.at, by: v.by, action: v.action, status: v.status, hash: v.hash, snapshot: v.snapshot };
}

function httpError(status, errCode, message) {
  const err = new Error(message || errCode);
  err.status = status;
  err.errCode = errCode;
  return err;
}

function getDefs() {
  return store.loadContent().workflows.workflows || [];
}

function getDef(processCode) {
  return getDefs().find((w) => w.code === processCode) || null;
}

const WORKFLOW_ROLES = ['cra', 'crc', 'pi', 'qa'];

function actorIs(user, ...roles) {
  return user && roles.includes(user.role);
}

/* ------------------------------------------------------------------ 通用 */

function viewRecord(r) {
  const def = getDef(r.processCode);
  const now = Date.now();
  return {
    id: r.id,
    recordKey: r.recordKey,
    processCode: r.processCode,
    processName: def ? def.name : r.processCode,
    title: r.title,
    summary: r.summary,
    status: r.status,
    stepIndex: r.stepIndex,
    steps: r.steps,
    stepCount: def ? def.steps.length : 0,
    currentStepCode: def && r.stepIndex < def.steps.length ? def.steps[r.stepIndex].code : null,
    data: r.data || {},
    criticality: r.criticality || (def && def.criticalityLevels ? def.criticalityLevels[0] : null),
    author: r.author || {},
    dueDate: r.dueDate,
    overdue: !r.closedAt && r.dueDate ? Date.parse(r.dueDate + 'T23:59:59') < now : false,
    daysToDue: r.dueDate && !r.closedAt ? Math.ceil((Date.parse(r.dueDate + 'T00:00:00') - now) / 86400000) : null,
    closedAt: r.closedAt || null,
    recordVersion: r.recordVersion || 1,
    demo: Boolean(r.demo),
    history: (r.history || []).map((h) => ({ ...h })),
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    definition: def ? {
      states: def.states,
      initialState: def.initialState,
      terminalStates: def.terminalStates || [],
      regulationRefs: def.regulationRefs || [],
      slaDays: def.slaDays || null,
    } : null,
  };
}

function typeSummary() {
  let data = null;
  try { data = store.loadRecords(); } catch (e) { data = { records: [] }; }
  const counts = {};
  for (const r of data.records) counts[r.processCode] = (counts[r.processCode] || 0) + 1;
  return getDefs().map((def) => ({
    code: def.code,
    recordPrefix: def.recordPrefix,
    name: def.name,
    nameEn: def.nameEn || null,
    category: def.category || null,
    description: def.description || null,
    states: def.states,
    initialState: def.initialState,
    terminalStates: def.terminalStates || [],
    criticalityLevels: def.criticalityLevels || [],
    slaDays: def.slaDays || null,
    stepCount: def.steps.length,
    steps: def.steps.map((s) => ({
      code: s.code, name: s.name, nameEn: s.nameEn || null,
      role: s.role || [], type: s.type || 'task',
      signatureMeaning: s.signatureMeaning || null,
      independentOfAuthor: Boolean(s.independentOfAuthor),
      onComplete: s.onComplete || null,
      guidance: s.guidance || null,
      form: s.form || [],
    })),
    fields: def.fields || [],
    recordCount: counts[def.code] || 0,
  }));
}

/* ------------------------------------------------------------------ 创建 */

function createRecord(input, user) {
  if (!actorIs(user, ...WORKFLOW_ROLES)) {
    throw httpError(403, 'ROLE_NOT_PERMITTED', '只有 CRA / CRC / 研究者 / QA 身份可以新建记录。当前账号角色：' + (user ? user.role : '匿名'));
  }
  const def = getDef(input.type);
  if (!def) throw httpError(400, 'UNKNOWN_PROCESS_TYPE', '未知的流程类型: ' + input.type);

  const values = { ...(input.values || {}) };
  const title = String(values.title || '').trim();
  if (title.length < 3) throw httpError(400, 'TITLE_REQUIRED', '标题至少 3 个字');
  values.title = title;

  const missing = (def.fields || []).filter((f) => f.required && (values[f.key] === undefined || values[f.key] === null || values[f.key] === ''));
  if (missing.length) {
    throw httpError(400, 'REQUIRED_FIELDS_MISSING', '缺少必填字段: ' + missing.map((f) => f.label).join('、'));
  }
  if (def.fields && def.fields.some((f) => f.key === 'criticality') && !values.criticality) {
    values.criticality = (def.criticalityLevels || ['major']).includes('major') ? 'major' : (def.criticalityLevels || [])[0];
  }

  const data = store.loadRecords();
  const prefix = def.recordPrefix || def.code.slice(0, 2).toUpperCase();
  const year = new Date().getFullYear();
  const next = (data.counters[prefix] || 0) + 1;
  data.counters[prefix] = next;
  const recordKey = `${prefix}-${year}-${String(next).padStart(4, '0')}`;

  const at = nowIso();
  const record = {
    id: recordKey,
    recordKey,
    processCode: def.code,
    title,
    summary: values.summary || null,
    status: def.initialState || 'draft',
    stepIndex: 0,
    steps: def.steps.map((s, i) => ({
      code: s.code,
      status: i === 0 ? 'current' : 'pending',
      completedAt: null,
      completedBy: null,        // userId
      completedByRole: null,
      signedBy: null,           // 打印姓名
      signature: null,          // {username, printedName, meaning, reason, method, at}
      formData: {},
    })),
    data: { record: values, persisted: {}, steps: {} },
    criticality: values.criticality || null,
    author: { userId: user.username, name: user.fullName || user.username, role: user.role, at },
    dueDate: daysFromNow(def.slaDays || 30),
    closedAt: null,
    demo: false,
    history: [{ at, userId: user.username, role: user.role, actor: user.fullName || user.username, action: 'created', stepCode: null, from: null, to: def.initialState || 'draft', comment: '记录创建' }],
    createdAt: at,
    updatedAt: at,
    recordVersion: 1,
  };
  data.records.push(record);
  snapshotRecord(record, 'created', user.username);
  store.saveRecords(data);
  auth.logEvent('record_created', { username: user.username, recordKey, processCode: def.code, title });
  return viewRecord(record);
}

/* ------------------------------------------------------------------ 列表 */

function listRecords(filters) {
  const data = store.loadRecords();
  let records = data.records.slice();
  if (filters.type) records = records.filter((r) => r.processCode === filters.type);
  if (filters.status) records = records.filter((r) => r.status === filters.status);
  if (filters.open === '1') {
    const defs = getDefs();
    records = records.filter((r) => {
      const def = defs.find((d) => d.code === r.processCode);
      return !(def && def.terminalStates.includes(r.status));
    });
  }
  if (filters.demo === '1') records = records.filter((r) => r.demo);
  records.sort((a, b) => String(a.recordKey).localeCompare(String(b.recordKey)) * -1);
  return records.map(viewRecord);
}

function getRecord(recordKey) {
  const data = store.loadRecords();
  const r = data.records.find((x) => x.recordKey === recordKey) || data.records.find((x) => x.id === recordKey);
  if (!r) throw httpError(404, 'RECORD_NOT_FOUND', '未找到记录 ' + recordKey);
  return viewRecord(r);
}

/* ------------------------------------------------------------------ 推进 */

/**
 * 完成当前步骤。身份来自登录账号（user = auth 解析出的用户），
 * 角色门、独立复核门、双要素签名全部服务端强制。
 */
function completeStep(recordKey, input, user) {
  if (!user) throw httpError(401, 'AUTH_REQUIRED', '请先登录');
  if (!actorIs(user, ...WORKFLOW_ROLES)) {
    throw httpError(403, 'ROLE_NOT_PERMITTED', '只有 CRA / CRC / 研究者 / QA 身份可以执行步骤。当前账号角色：' + user.role);
  }
  const data = store.loadRecords();
  const record = data.records.find((x) => x.recordKey === recordKey);
  if (!record) throw httpError(404, 'RECORD_NOT_FOUND', '未找到记录 ' + recordKey);
  const def = getDef(record.processCode);
  if (!def) throw httpError(400, 'PROCESS_TYPE_MISSING', '流程定义缺失: ' + record.processCode);

  // 门 1：终态
  if ((def.terminalStates || []).includes(record.status)) {
    throw httpError(409, 'RECORD_TERMINAL', `记录 ${record.recordKey} 已处于终态 ${record.status}，不能再修改`);
  }

  // 门 2：步骤存在且为当前步骤
  const stepDef = def.steps.find((s) => s.code === input.code);
  if (!stepDef) throw httpError(404, 'STEP_NOT_FOUND', '流程中不存在步骤 ' + input.code);
  if (record.stepIndex >= def.steps.length) throw httpError(409, 'ALL_STEPS_DONE', '全部步骤已完成');
  if (def.steps[record.stepIndex].code !== input.code) {
    throw httpError(409, 'STEP_OUT_OF_ORDER', `当前应执行步骤「${def.steps[record.stepIndex].name}」，而非「${stepDef.name}」`);
  }

  // 门 3：角色门（基于登录账号的角色）
  const allowed = stepDef.role || [];
  if (!allowed.includes(user.role)) {
    throw httpError(403, 'ROLE_NOT_PERMITTED',
      `步骤「${stepDef.name}」要求由以下角色执行：${allowed.map((r) => auth.ROLES[r] ? auth.ROLES[r].labelZh : r).join('、')}。` +
      `当前账号「${user.fullName}」的角色是 ${auth.ROLES[user.role] ? auth.ROLES[user.role].labelZh : user.role}。` +
      '请退出后使用对应角色的账号登录执行（角色由账号决定，不能临时切换）。');
  }

  // 门 4：独立复核门（提出人=记录创建账号，不得执行独立复核步骤）
  if (stepDef.independentOfAuthor && record.author.userId === user.username) {
    throw httpError(403, 'INDEPENDENCE_VIOLATION',
      '本步骤要求独立复核（Annex 11 §12.1 / ICH Q10 §3.2）：记录「' + record.recordKey + '」由 ' +
      `「${record.author.name}（${record.author.role}）」提出，提出人不能自己关闭/放行。` +
      `请退出后使用 ${allowed.filter((r) => r !== record.author.role).map((r) => auth.ROLES[r].labelZh).join(' 或 ')} 角色的账号执行。`);
  }

  const formData = { ...(input.values || {}) };

  // 门 5a：双要素电子签名（21 CFR Part 11.200(a)(1)(i)）
  let signature = null;
  if (stepDef.type === 'signature') {
    const sigResult = auth.verifySignature(user, input.sign);
    if (!sigResult.ok) {
      const status = sigResult.code === 'SECOND_FACTOR_REQUIRED' ? 428
        : sigResult.code === 'REASON_REQUIRED' ? 428
        : sigResult.code === 'SIGNATURE_IDENTITY_MISMATCH' || sigResult.code === 'SIGNATURE_AUTH_FAILED' ? 403 : 409;
      throw httpError(status, sigResult.code, sigResult.message);
    }
    signature = {
      username: user.username,
      printedName: user.fullName || user.username,
      meaning: stepDef.signatureMeaning || 'signed',
      reason: sigResult.reason,
      method: sigResult.method,
      at: nowIso(),
    };
    auth.logEvent('signature_applied', { username: user.username, recordKey, stepCode: stepDef.code, meaning: signature.meaning });
  }

  // 门 5b：必填字段
  const missing = (stepDef.requiresFields || []).filter((f) => {
    const v = formData[f];
    return v === undefined || v === null || v === '';
  });
  if (missing.length) {
    throw httpError(400, 'STEP_FIELDS_MISSING', '本步骤缺少必填内容: ' + missing.join('、'));
  }

  // 通过：落库
  const at = nowIso();
  const fromStatus = record.status;
  const toStatus = stepDef.onComplete || fromStatus;

  const step = record.steps[record.stepIndex];
  step.status = 'completed';
  step.completedAt = at;
  step.completedBy = user.username;
  step.completedByRole = user.role;
  step.signedBy = signature ? signature.printedName : null;
  step.signature = signature;
  step.formData = formData;
  if (stepDef.persistFields) {
    for (const [key, field] of Object.entries(stepDef.persistFields)) {
      if (formData[field] !== undefined) record.data.persisted[key] = formData[field];
    }
  }
  record.data.steps[stepDef.code] = formData;

  const nextIndex = record.stepIndex + 1;
  record.stepIndex = nextIndex;
  if (nextIndex < def.steps.length) record.steps[nextIndex].status = 'current';
  record.status = toStatus;
  if ((def.terminalStates || []).includes(toStatus)) record.closedAt = at;
  record.updatedAt = at;
  record.history.push({
    at, userId: user.username, role: user.role, actor: user.fullName || user.username,
    action: 'step_completed', stepCode: stepDef.code,
    from: fromStatus, to: toStatus,
    comment: signature
      ? `电子签名（含义：${signature.meaning}；要素：${signature.method}）`
      : `完成步骤「${stepDef.name}」`,
  });
  record.recordVersion = (record.recordVersion || 1) + 1;
  snapshotRecord(record, 'step:' + stepDef.code, user.username);

  store.saveRecords(data);
  return viewRecord(record);
}

/* ------------------------------------------------------------------ 取消/删除 */

function cancelRecord(recordKey, input, user) {
  if (!user) throw httpError(401, 'AUTH_REQUIRED', '请先登录');
  if (!actorIs(user, ...WORKFLOW_ROLES)) {
    throw httpError(403, 'ROLE_NOT_PERMITTED', '只有 CRA / CRC / 研究者 / QA 身份可以取消记录');
  }
  const data = store.loadRecords();
  const record = data.records.find((x) => x.recordKey === recordKey);
  if (!record) throw httpError(404, 'RECORD_NOT_FOUND');
  const def = getDef(record.processCode);
  const reason = String((input && input.reason) || '').trim();
  if (reason.length < 5) throw httpError(400, 'CANCEL_REASON_REQUIRED', '取消必须说明理由（至少 5 个字）');
  if ((def.terminalStates || []).includes(record.status)) {
    throw httpError(409, 'RECORD_TERMINAL', '记录已处于终态，不能取消');
  }
  const at = nowIso();
  const fromStatus = record.status;
  record.status = 'cancelled';
  record.closedAt = at;
  record.updatedAt = at;
  record.history.push({
    at, userId: user.username, role: user.role, actor: user.fullName || user.username,
    action: 'cancelled', stepCode: null, from: fromStatus, to: 'cancelled', comment: reason,
  });
  record.recordVersion = (record.recordVersion || 1) + 1;
  snapshotRecord(record, 'cancelled', user.username);
  store.saveRecords(data);
  auth.logEvent('record_cancelled', { username: user.username, recordKey, reason });
  return viewRecord(record);
}

/**
 * 删除记录：GxP 理念是记录不可删除（审计可辩护性）。
 * 本工作台作为本机教学工具：仅系统管理员可删（用于清理训练数据）；真实部署建议关闭该能力。
 */
function deleteRecord(recordKey, user) {
  if (!user) throw httpError(401, 'AUTH_REQUIRED', '请先登录');
  if (user.role !== 'admin') {
    throw httpError(403, 'RECORD_DELETE_NOT_ALLOWED', '只有系统管理员可以删除记录。记录不可删除——记录是审计证据（GxP）');
  }
  const data = store.loadRecords();
  const idx = data.records.findIndex((x) => x.recordKey === recordKey || x.id === recordKey);
  if (idx < 0) throw httpError(404, 'RECORD_NOT_FOUND');
  data.records.splice(idx, 1);
  store.saveRecords(data);
  auth.logEvent('record_deleted', { username: user.username, recordKey });
  return { ok: true, message: '记录已删除（管理员清理）' };
}

/** 重新生成演示记录（管理员）：补充缺失的 2 条教学演示数据 */
function reseedDemoRecords(user) {
  if (!user || user.role !== 'admin') {
    throw httpError(403, 'PERMISSION_DENIED', '仅系统管理员可重新生成演示记录');
  }
  const data = store.loadRecords();
  const added = store.seedDemoRecords(data);
  if (!added || !added.length) {
    return { ok: true, added: 0, total: data.records.length };
  }
  for (const r of added) data.records.push(r);
  store.saveRecords(data);
  auth.logEvent('demo_reseeded', { username: user.username, added: added.length });
  return { ok: true, added: added.length, total: data.records.length };
}

module.exports = { createRecord, listRecords, getRecord, completeStep, cancelRecord, deleteRecord, typeSummary, listVersions, getVersion, reseedDemoRecords };