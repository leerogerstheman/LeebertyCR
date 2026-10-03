'use strict';

/**
 * subjects.js - 受试者登记册（伪匿名）+ 访视计划 + 简易 eCRF 数据与逻辑核查。
 *
 * 设计取舍（本机教学工具，非生产 CDMS）：
 *  - 受试者只用「中心编号 + 受试者编号」标识，不采集姓名/身份证等直接标识符（伪匿名）。
 *  - 访视（visit）挂在受试者下，可携带 eCRF 表单数据（formId 指向 seed/forms.json）。
 *  - 逻辑核查：必填、数值范围、枚举、跨字段规则；违规在写入前拦截（400 + violations）。
 *  - 入组漏斗与按月的入组统计用于教学演示真实中心的招募节奏。
 *
 * 法规/理念锚点（教学中会解释）：
 *  - ICH E6(R2) 4.9 记录与报告：源数据可溯源、可归因
 *  - 21 CFR Part 11.10(a) 系统验证/准确性检查（范围与逻辑核查）
 *  - GDPR/《个人信息保护法》最小化原则：能不用直接标识符就不用
 */

const fs = require('node:fs');
const path = require('node:path');

const store = require('./store');
const auth = require('./auth');

const SUBJECTS_FILE = () => path.join(store.DATA_DIR, 'subjects.json');

const STATUSES = ['screened', 'enrolled', 'ongoing', 'completed', 'withdrawn', 'screen_failed'];
const VISIT_STATUSES = ['planned', 'done', 'missed', 'cancelled'];

function nowIso() { return new Date().toISOString(); }
function today() { return new Date().toISOString().slice(0, 10); }

function httpError(status, errCode, message) {
  const err = new Error(message || errCode);
  err.status = status;
  err.errCode = errCode;
  return err;
}

const EMPTY = () => ({ version: 1, counters: { subject: 0, visit: 0 }, subjects: [] });

function load() {
  store.ensureDataDir();
  const file = SUBJECTS_FILE();
  if (!fs.existsSync(file)) {
    const seeded = EMPTY();
    seeded.subjects = seedDemoSubjects(seeded);
    save(seeded);
    return seeded;
  }
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    return {
      ...EMPTY(),
      ...raw,
      counters: { ...EMPTY().counters, ...(raw.counters || {}) },
      subjects: Array.isArray(raw.subjects) ? raw.subjects : [],
    };
  } catch (err) {
    return { ...EMPTY(), error: String(err.message) };
  }
}

function save(data) {
  store.ensureDataDir();
  const file = SUBJECTS_FILE();
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, file);
}

/* ------------------------------------------------------------------ 表单定义与逻辑核查 */

function loadForms() {
  const file = path.join(store.SEED_DIR, 'forms.json');
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return { forms: [] };
  }
}

function getForm(formId) {
  return (loadForms().forms || []).find((f) => f.id === formId) || null;
}

/** 逻辑核查：返回违规数组（空数组=通过）。 */
function checkForm(form, data) {
  const violations = [];
  const vals = data || {};
  const fields = form.fields || [];
  for (const f of fields) {
    const raw = vals[f.key];
    const empty = raw === undefined || raw === null || String(raw).trim() === '';
    if (f.required && empty) {
      violations.push({ key: f.key, label: f.label, rule: 'required', message: f.label + '为必填项' });
      continue;
    }
    if (empty) continue;
    if (f.type === 'number') {
      const n = Number(raw);
      if (Number.isNaN(n)) {
        violations.push({ key: f.key, label: f.label, rule: 'number', message: f.label + '必须是数值' });
        continue;
      }
      if (f.min !== undefined && n < f.min) {
        violations.push({ key: f.key, label: f.label, rule: 'range', message: `${f.label} ${n} 低于允许下限 ${f.min}` });
      }
      if (f.max !== undefined && n > f.max) {
        violations.push({ key: f.key, label: f.label, rule: 'range', message: `${f.label} ${n} 高于允许上限 ${f.max}` });
      }
    }
    if (f.type === 'select' && f.options && !f.options.includes(String(raw))) {
      violations.push({ key: f.key, label: f.label, rule: 'enum', message: f.label + '取值不在允许范围内' });
    }
    if (f.type === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(String(raw))) {
      violations.push({ key: f.key, label: f.label, rule: 'date', message: f.label + '日期格式应为 YYYY-MM-DD' });
    }
  }
  // 跨字段规则（例如：收缩压 ≤ 舒张压 属逻辑矛盾）
  for (const rule of form.rules || []) {
    const a = Number(vals[rule.left]);
    const b = Number(vals[rule.right]);
    if (Number.isNaN(a) || Number.isNaN(b)) continue;
    if (rule.op === '<=' && !(a <= b)) {
      violations.push({ key: rule.right, label: rule.message, rule: 'cross_field', message: rule.message });
    }
    if (rule.op === '>=' && !(a >= b)) {
      violations.push({ key: rule.right, label: rule.message, rule: 'cross_field', message: rule.message });
    }
    if (rule.op === '!=' && a === b) {
      violations.push({ key: rule.right, label: rule.message, rule: 'cross_field', message: rule.message });
    }
  }
  return violations;
}

/* ------------------------------------------------------------------ 受试者读写 */

function actorIs(user, ...roles) { return user && roles.includes(user.role); }

const EDIT_ROLES = ['crc', 'cra', 'pi'];

function viewSubject(s) {
  return {
    id: s.id,
    subjectNo: s.subjectNo,
    site: s.site,
    status: s.status,
    initials: s.initials || null,
    screenDate: s.screenDate || null,
    consentDate: s.consentDate || null,
    enrolledDate: s.enrolledDate || null,
    completedDate: s.completedDate || null,
    withdrawalReason: s.withdrawalReason || null,
    protocolCode: s.protocolCode || null,
    cohort: s.cohort || null,
    note: s.note || null,
    visitCount: (s.visits || []).length,
    visitsDone: (s.visits || []).filter((v) => v.status === 'done').length,
    nextVisit: (s.visits || []).filter((v) => v.status === 'planned').sort((a, b) => String(a.plannedDate).localeCompare(String(b.plannedDate)))[0] || null,
    createdBy: s.createdBy || null,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
    demo: Boolean(s.demo),
  };
}

function listSubjects(filter) {
  const data = load();
  const f = filter || {};
  let list = data.subjects.slice();
  if (f.status) list = list.filter((s) => s.status === f.status);
  if (f.site) list = list.filter((s) => s.site === f.site);
  if (f.search) {
    const q = String(f.search).toLowerCase();
    list = list.filter((s) => String(s.subjectNo).toLowerCase().includes(q) || String(s.site || '').toLowerCase().includes(q));
  }
  const sites = Array.from(new Set(data.subjects.map((s) => s.site).filter(Boolean)));
  return {
    subjects: list.map(viewSubject).sort((a, b) => String(a.subjectNo).localeCompare(String(b.subjectNo))),
    sites,
    stats: stats(data),
  };
}

function stats(data) {
  const subs = data.subjects || [];
  const byStatus = {};
  for (const st of STATUSES) byStatus[st] = subs.filter((s) => s.status === st).length;
  const byMonth = {};
  for (const s of subs) {
    const d = s.enrolledDate || s.screenDate;
    if (!d) continue;
    const key = String(d).slice(0, 7);
    byMonth[key] = (byMonth[key] || 0) + 1;
  }
  const months = Object.keys(byMonth).sort().map((m) => ({ month: m, count: byMonth[m] }));
  const screened = subs.length;
  const enrolled = subs.filter((s) => ['enrolled', 'ongoing', 'completed'].includes(s.status)).length;
  const ongoing = subs.filter((s) => ['enrolled', 'ongoing'].includes(s.status)).length;
  const completed = byStatus.completed;
  const withdrawn = byStatus.withdrawn;
  const screenFailed = byStatus.screen_failed;
  return {
    total: screened,
    screened,
    enrolled,
    ongoing,
    completed,
    withdrawn,
    screenFailed,
    screenFailureRate: screened ? Math.round(((screenFailed + withdrawn) / screened) * 1000) / 10 : 0,
    consentRate: screened ? Math.round(((screened - screenFailed) / screened) * 1000) / 10 : 0,
    byStatus,
    byMonth: months,
    funnel: [
      { stage: '筛选', count: screened },
      { stage: '签署知情同意', count: subs.filter((s) => s.consentDate).length },
      { stage: '入组', count: enrolled },
      { stage: '随访中', count: ongoing },
      { stage: '完成', count: completed },
    ],
  };
}

function getSubject(id) {
  const data = load();
  const s = data.subjects.find((x) => x.id === id || x.subjectNo === id);
  if (!s) throw httpError(404, 'SUBJECT_NOT_FOUND', '未找到受试者 ' + id);
  const out = viewSubject(s);
  out.visits = (s.visits || []).slice().sort((a, b) => String(a.plannedDate).localeCompare(String(b.plannedDate)))
    .map((v) => viewVisit(v));
  out.forms = (loadForms().forms || []).map((f) => ({ id: f.id, title: f.title, visitType: f.visitType || null }));
  return out;
}

function viewVisit(v) {
  return {
    id: v.id,
    name: v.name,
    visitType: v.visitType || null,
    plannedDate: v.plannedDate,
    actualDate: v.actualDate || null,
    window: v.window || null,
    status: v.status,
    formId: v.formId || null,
    data: v.data || {},
    violations: v.violations || [],
    by: v.by || null,
    updatedAt: v.updatedAt || null,
  };
}

function createSubject(input, user) {
  if (!user) throw httpError(401, 'AUTH_REQUIRED', '请先登录');
  if (!actorIs(user, ...EDIT_ROLES, 'admin')) {
    throw httpError(403, 'ROLE_NOT_PERMITTED', '只有 CRC / CRA / 研究者（或管理员代录）可以登记受试者');
  }
  const data = load();
  const subjectNo = String((input && input.subjectNo) || '').trim();
  if (!/^\d{3,6}$/.test(subjectNo)) {
    throw httpError(400, 'SUBJECT_NO_INVALID', '受试者编号应为 3–6 位数字（如 1001）。不要使用姓名或身份证号——伪匿名是第一原则');
  }
  if (data.subjects.some((s) => s.subjectNo === subjectNo)) {
    throw httpError(409, 'SUBJECT_EXISTS', '受试者编号 ' + subjectNo + ' 已存在');
  }
  const at = nowIso();
  data.counters.subject += 1;
  const s = {
    id: 'S' + String(data.counters.subject).padStart(4, '0'),
    subjectNo,
    site: String((input.site || '本中心')).trim(),
    protocolCode: String((input.protocolCode || '')).trim() || null,
    status: (input.status && STATUSES.includes(input.status)) ? input.status : 'screened',
    initials: String((input.initials || '')).trim() || null,
    cohort: String((input.cohort || '')).trim() || null,
    screenDate: input.screenDate || today(),
    consentDate: input.consentDate || null,
    enrolledDate: input.enrolledDate || null,
    completedDate: null,
    withdrawalReason: null,
    note: String((input.note || '')).trim() || null,
    visits: [],
    createdBy: user.username,
    createdAt: at,
    updatedAt: at,
    demo: false,
  };
  data.subjects.push(s);
  save(data);
  auth.logEvent('subject_created', { username: user.username, subjectNo: s.subjectNo, site: s.site });
  return viewSubject(s);
}

function updateSubject(id, input, user) {
  if (!user) throw httpError(401, 'AUTH_REQUIRED', '请先登录');
  if (!actorIs(user, ...EDIT_ROLES, 'admin')) {
    throw httpError(403, 'ROLE_NOT_PERMITTED', '只有 CRC / CRA / 研究者可以修改受试者记录');
  }
  const data = load();
  const s = data.subjects.find((x) => x.id === id || x.subjectNo === id);
  if (!s) throw httpError(404, 'SUBJECT_NOT_FOUND', '未找到受试者 ' + id);
  const before = { status: s.status, note: s.note };
  const body = input || {};
  if (body.status !== undefined) {
    if (!STATUSES.includes(body.status)) throw httpError(400, 'SUBJECT_STATUS_INVALID', '状态非法：' + body.status);
    s.status = body.status;
    if (body.status === 'enrolled' && !s.enrolledDate) s.enrolledDate = today();
    if (body.status === 'completed') s.completedDate = s.completedDate || today();
  }
  if (body.consentDate !== undefined) s.consentDate = body.consentDate || null;
  if (body.enrolledDate !== undefined) s.enrolledDate = body.enrolledDate || null;
  if (body.withdrawalReason !== undefined) s.withdrawalReason = String(body.withdrawalReason || '').trim() || null;
  if (body.note !== undefined) s.note = String(body.note || '').trim() || null;
  if (body.cohort !== undefined) s.cohort = String(body.cohort || '').trim() || null;
  s.updatedAt = nowIso();
  save(data);
  if (before.status !== s.status) {
    auth.logEvent('subject_status_changed', { username: user.username, subjectNo: s.subjectNo, from: before.status, to: s.status });
  } else {
    auth.logEvent('subject_updated', { username: user.username, subjectNo: s.subjectNo });
  }
  return viewSubject(s);
}

function deleteSubject(id, user) {
  if (!user || user.role !== 'admin') {
    throw httpError(403, 'PERMISSION_DENIED', '仅系统管理员可以删除受试者记录（用于清理训练数据）');
  }
  const data = load();
  const idx = data.subjects.findIndex((x) => x.id === id || x.subjectNo === id);
  if (idx < 0) throw httpError(404, 'SUBJECT_NOT_FOUND', '未找到受试者 ' + id);
  const s = data.subjects[idx];
  data.subjects.splice(idx, 1);
  save(data);
  auth.logEvent('subject_deleted', { username: user.username, subjectNo: s.subjectNo });
  return { ok: true, message: '受试者记录已删除（管理员清理）' };
}

/* ------------------------------------------------------------------ 访视与 eCRF 数据 */

function addVisit(subjectId, input, user) {
  if (!user) throw httpError(401, 'AUTH_REQUIRED', '请先登录');
  if (!actorIs(user, ...EDIT_ROLES, 'admin')) {
    throw httpError(403, 'ROLE_NOT_PERMITTED', '只有 CRC / CRA / 研究者可以登记访视');
  }
  const data = load();
  const s = data.subjects.find((x) => x.id === subjectId || x.subjectNo === subjectId);
  if (!s) throw httpError(404, 'SUBJECT_NOT_FOUND', '未找到受试者 ' + subjectId);
  const name = String((input && input.name) || '').trim();
  if (!name) throw httpError(400, 'VISIT_NAME_REQUIRED', '访视名称必填（如 V2 第 2 次访视）');
  const plannedDate = String((input && input.plannedDate) || today());
  if (!/^\d{4}-\d{2}-\d{2}$/.test(plannedDate)) throw httpError(400, 'VISIT_DATE_INVALID', '计划日期格式应为 YYYY-MM-DD');
  const at = nowIso();
  data.counters.visit += 1;
  const v = {
    id: 'V' + String(data.counters.visit).padStart(4, '0'),
    name,
    visitType: String((input.visitType || '')).trim() || null,
    plannedDate,
    actualDate: null,
    window: String((input.window || '')).trim() || null,
    status: 'planned',
    formId: String((input.formId || '')).trim() || null,
    data: {},
    violations: [],
    by: user.username,
    updatedAt: at,
  };
  s.visits = s.visits || [];
  s.visits.push(v);
  s.updatedAt = at;
  save(data);
  auth.logEvent('visit_created', { username: user.username, subjectNo: s.subjectNo, visit: v.name, plannedDate });
  return viewVisit(v);
}

function updateVisit(subjectId, visitId, input, user) {
  if (!user) throw httpError(401, 'AUTH_REQUIRED', '请先登录');
  if (!actorIs(user, ...EDIT_ROLES, 'admin')) {
    throw httpError(403, 'ROLE_NOT_PERMITTED', '只有 CRC / CRA / 研究者可以修改访视');
  }
  const data = load();
  const s = data.subjects.find((x) => x.id === subjectId || x.subjectNo === subjectId);
  if (!s) throw httpError(404, 'SUBJECT_NOT_FOUND', '未找到受试者 ' + subjectId);
  const v = (s.visits || []).find((x) => x.id === visitId);
  if (!v) throw httpError(404, 'VISIT_NOT_FOUND', '未找到访视 ' + visitId);
  const body = input || {};

  let violations = [];
  if (body.data !== undefined) {
    const form = v.formId ? getForm(v.formId) : null;
    if (!form) throw httpError(400, 'FORM_NOT_FOUND', '该访视未绑定表单，无法录入数据');
    violations = checkForm(form, body.data);
    if (violations.length) {
      // 逻辑核查失败：拒绝写入（教学重点：脏数据不许进库）
      const err = httpError(400, 'EDIT_CHECK_FAILED', '逻辑核查未通过：' + violations.map((x) => x.message).join('；'));
      err.violations = violations;
      throw err;
    }
    v.data = body.data;
    v.violations = [];
  }
  if (body.status !== undefined) {
    if (!VISIT_STATUSES.includes(body.status)) throw httpError(400, 'VISIT_STATUS_INVALID', '访视状态非法：' + body.status);
    v.status = body.status;
    if (body.status === 'done' && !v.actualDate) v.actualDate = body.actualDate || today();
  }
  if (body.actualDate !== undefined) v.actualDate = body.actualDate || null;
  if (body.plannedDate !== undefined) v.plannedDate = body.plannedDate;
  if (body.formId !== undefined) v.formId = body.formId || null;
  v.by = user.username;
  v.updatedAt = nowIso();
  s.updatedAt = v.updatedAt;
  save(data);
  auth.logEvent('visit_updated', { username: user.username, subjectNo: s.subjectNo, visit: v.name, status: v.status, violations: violations.length });
  return viewVisit(v);
}

function deleteVisit(subjectId, visitId, user) {
  if (!user || !actorIs(user, 'admin', 'crc')) {
    throw httpError(403, 'PERMISSION_DENIED', '仅 CRC 或管理员可以删除访视（其他角色请改状态为取消）');
  }
  const data = load();
  const s = data.subjects.find((x) => x.id === subjectId || x.subjectNo === subjectId);
  if (!s) throw httpError(404, 'SUBJECT_NOT_FOUND', '未找到受试者 ' + subjectId);
  const idx = (s.visits || []).findIndex((x) => x.id === visitId);
  if (idx < 0) throw httpError(404, 'VISIT_NOT_FOUND', '未找到访视 ' + visitId);
  const [removed] = s.visits.splice(idx, 1);
  save(data);
  auth.logEvent('visit_deleted', { username: user.username, subjectNo: s.subjectNo, visit: removed.name });
  return { ok: true, message: '访视已删除' };
}

/* ------------------------------------------------------------------ 日历与导出 */

/** 未来/临期访视（默认 30 天内），用于日历与提醒。 */
function upcoming(days) {
  const data = load();
  const span = Number(days) || 30;
  const now = new Date();
  const limit = new Date(now.getTime() + span * 86400000);
  const out = [];
  for (const s of data.subjects) {
    for (const v of s.visits || []) {
      if (v.status !== 'planned') continue;
      const d = new Date(v.plannedDate + 'T00:00:00');
      if (d > limit) continue;
      const overdue = d < new Date(now.toISOString().slice(0, 10) + 'T00:00:00');
      out.push({
        subjectNo: s.subjectNo, subjectId: s.id, site: s.site,
        visit: v.name, visitType: v.visitType, visitId: v.id, plannedDate: v.plannedDate,
        days: Math.ceil((d - new Date(now.toISOString().slice(0, 10) + 'T00:00:00')) / 86400000),
        overdue,
      });
    }
  }
  return out.sort((a, b) => String(a.plannedDate).localeCompare(String(b.plannedDate)));
}

/** iCal 导出（RFC 5545 最小可用子集），可导入 Outlook / Google 日历。 */
function toIcal(visits) {
  const pad = (n) => String(n).padStart(2, '0');
  const stamp = () => {
    const d = new Date();
    return d.getUTCFullYear() + pad(d.getUTCMonth() + 1) + pad(d.getUTCDate()) + 'T' + pad(d.getUTCHours()) + pad(d.getUTCMinutes()) + pad(d.getUTCSeconds()) + 'Z';
  };
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//LeebertyCR//Clinical Trial Visit Calendar//CN',
    'CALSCALE:GREGORIAN',
  ];
  for (const v of visits) {
    const d = v.plannedDate.replace(/-/g, '');
    lines.push('BEGIN:VEVENT');
    lines.push('UID:' + v.subjectNo + '-' + v.visitId + '@leebertycr');
    lines.push('DTSTAMP:' + stamp());
    lines.push('DTSTART;VALUE=DATE:' + d);
    lines.push('SUMMARY:' + v.subjectNo + ' ' + v.visit + (v.visitType ? '（' + v.visitType + '）' : ''));
    lines.push('DESCRIPTION:中心 ' + (v.site || '') + (v.overdue ? ' · 已逾期' : ' · 还有 ' + v.days + ' 天'));
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n') + '\r\n';
}

/* ------------------------------------------------------------------ 演示数据 */

function seedDemoSubjects(initial) {
  const now = new Date();
  const dateOnly = (d) => d.toISOString().slice(0, 10);
  const days = (n) => { const d = new Date(now); d.setDate(d.getDate() + n); return dateOnly(d); };

  const mk = (subjectNo, site, status, extra) => {
    initial.counters.subject += 1;
    const at = new Date(now).toISOString();
    return {
      id: 'S' + String(initial.counters.subject).padStart(4, '0'),
      subjectNo, site, status,
      protocolCode: 'DEMO-2026-001 v1.0',
      screenDate: days(extra.screenOffset === undefined ? -40 : extra.screenOffset),
      consentDate: extra.consentOffset === undefined ? null : days(extra.consentOffset),
      enrolledDate: extra.enrollOffset === undefined ? null : days(extra.enrollOffset),
      completedDate: null,
      withdrawalReason: extra.withdrawalReason || null,
      cohort: extra.cohort || null,
      note: extra.note || null,
      visits: extra.visits || [],
      createdBy: 'demo_crc',
      createdAt: at, updatedAt: at,
      demo: true,
    };
  };

  const visit = (initial, name, offset, status, formId, data) => {
    initial.counters.visit += 1;
    return {
      id: 'V' + String(initial.counters.visit).padStart(4, '0'),
      name, visitType: name.split(' ')[0], plannedDate: days(offset), actualDate: status === 'done' ? days(offset) : null,
      window: '±3 天', status, formId: formId || null, data: data || {}, violations: [],
      by: 'demo_crc', updatedAt: new Date(now).toISOString(),
    };
  };

  const s1 = mk('1001', '演示中心 A', 'ongoing', {
    screenOffset: -60, consentOffset: -59, enrollOffset: -55, cohort: '队列 1',
    note: '教学演示：进度正常的受试者',
    visits: [
      visit(initial, 'V1 筛选/基线', -58, 'done', 'visit_vitals', { visitDate: days(-58), sbp: 122, dbp: 78, pulse: 72, temp: 36.6, doseTaken: 'yes', doseAmount: 50, aeOccurred: 'no' }),
      visit(initial, 'V2 第 2 次访视', -28, 'done', 'visit_vitals', { visitDate: days(-28), sbp: 126, dbp: 80, pulse: 74, temp: 36.5, doseTaken: 'yes', doseAmount: 50, aeOccurred: 'no' }),
      visit(initial, 'V3 第 3 次访视', 2, 'planned', 'visit_vitals', {}),
    ],
  });

  const s2 = mk('1002', '演示中心 A', 'enrolled', {
    screenOffset: -20, consentOffset: -19, enrollOffset: -14, cohort: '队列 1',
    note: '教学演示：刚入组、首次给药后需关注',
    visits: [
      visit(initial, 'V1 筛选/基线', -18, 'done', 'visit_vitals', { visitDate: days(-18), sbp: 134, dbp: 86, pulse: 88, temp: 36.8, doseTaken: 'yes', doseAmount: 50, aeOccurred: 'no' }),
      visit(initial, 'V2 第 2 次访视', 5, 'planned', 'visit_vitals', {}),
    ],
  });

  const s3 = mk('1003', '演示中心 B', 'screen_failed', {
    screenOffset: -15, withdrawalReason: '筛选期肝功超出方案允许范围',
    note: '教学演示：筛选失败——注意筛选失败率对招募的影响',
    visits: [visit(initial, 'V1 筛选/基线', -14, 'done', 'visit_vitals', { visitDate: days(-14), sbp: 128, dbp: 82, pulse: 70, temp: 36.7, doseTaken: 'no', aeOccurred: 'no' })],
  });

  const s4 = mk('1004', '演示中心 B', 'withdrawn', {
    screenOffset: -50, consentOffset: -49, enrollOffset: -45, withdrawalReason: '受试者因个人原因撤回知情同意',
    note: '教学演示：撤回同意——数据留存与后续处理规则',
    visits: [
      visit(initial, 'V1 筛选/基线', -44, 'done', 'visit_vitals', { visitDate: days(-44), sbp: 118, dbp: 76, pulse: 68, temp: 36.4, doseTaken: 'yes', doseAmount: 50, aeOccurred: 'no' }),
      visit(initial, 'V2 第 2 次访视', -14, 'missed', 'visit_vitals', {}),
    ],
  });

  return [s1, s2, s3, s4];
}

function reseedDemoSubjects(user) {
  if (!user || user.role !== 'admin') throw httpError(403, 'PERMISSION_DENIED', '仅系统管理员可重新生成演示受试者');
  const data = load();
  const existing = new Set(data.subjects.map((s) => s.subjectNo));
  const added = seedDemoSubjects(data).filter((s) => !existing.has(s.subjectNo));
  if (!added.length) return { ok: true, added: 0, total: data.subjects.length };
  for (const s of added) data.subjects.push(s);
  save(data);
  auth.logEvent('subjects_reseeded', { username: user.username, added: added.length });
  return { ok: true, added: added.length, total: data.subjects.length };
}

module.exports = {
  STATUSES, VISIT_STATUSES,
  load, save,
  listSubjects, getSubject, createSubject, updateSubject, deleteSubject, reseedDemoSubjects,
  addVisit, updateVisit, deleteVisit,
  upcoming, toIcal,
  loadForms, getForm, checkForm, stats,
};