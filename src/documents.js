'use strict';

/**
 * documents.js - eTMF / ISF 文档生命周期与缺口扫描（P2）。
 *
 * 设计取舍（本机教学工具）：
 *  - 文档元数据 + 版本链（每次修订追加一条版本记录，含谁、何时、为什么改）。
 *  - 生命周期：draft（草稿）→ review（待审）→ approved（已批准）→ superseded（已被替代）→ archived（已归档）。
 *  - 缺口扫描：按「必需文件清单」比对现存类别，列出缺失项与缺失的已批准版本。
 *
 * 法规/理念锚点：
 *  - ICH E6(R2) 8.1 必需文件（Essential Documents）：试验前/中/后三阶段各有哪些文件
 *  - ICH E6(R2) 4.9 / 5.5：文件可归因、可溯源、及时归档
 *  - ALCOA+ 的 Enduring（耐久）与 Available（可取）：归档不是终点，能被调阅才算数
 */

const fs = require('node:fs');
const path = require('node:path');

const store = require('./store');
const auth = require('./auth');

const DOC_FILE = () => path.join(store.DATA_DIR, 'documents.json');

function nowIso() { return new Date().toISOString(); }
function today() { return new Date().toISOString().slice(0, 10); }

function httpError(status, errCode, message) {
  const err = new Error(message || errCode);
  err.status = status;
  err.errCode = errCode;
  return err;
}

/** 生命周期状态机：非法流转直接拒绝（与工作流引擎同一套「门」的思想）。 */
const STATES = ['draft', 'review', 'approved', 'superseded', 'archived'];
const TRANSITIONS = {
  draft: ['review', 'archived'],
  review: ['approved', 'draft'],
  approved: ['superseded', 'archived'],
  superseded: ['archived'],
  archived: [],
};

const STATE_CN = {
  draft: '草稿', review: '待审', approved: '已批准', superseded: '已被替代', archived: '已归档',
};

/** 必需文件清单（ICH E6(R2) 8 节的精简版，按阶段分组）。 */
const ESSENTIAL = [
  { phase: 'before', category: 'protocol', name: '临床试验方案（含修订版）' },
  { phase: 'before', category: 'protocol', name: '方案签名页（研究者与申办方）' },
  { phase: 'before', category: 'ib', name: '研究者手册（IB）或产品说明书' },
  { phase: 'before', category: 'icf', name: '知情同意书（ICF）模板与各版本' },
  { phase: 'before', category: 'irb', name: '伦理委员会批件与成员表' },
  { phase: 'before', category: 'regulatory', name: '监管机构批准/备案文件' },
  { phase: 'before', category: 'contract', name: '临床试验协议 / 合同' },
  { phase: 'before', category: 'cv', name: '研究者与团队简历（CV，两年内签名）' },
  { phase: 'before', category: 'delegation', name: '授权分工表（含签字样张）' },
  { phase: 'before', category: 'lab', name: '实验室资质与正常值范围' },
  { phase: 'during', category: 'monitoring', name: '监查报告与随访信' },
  { phase: 'during', category: 'crf', name: 'CRF / eCRF 与数据澄清（Query）记录' },
  { phase: 'during', category: 'sae', name: 'SAE 报告与递交记录' },
  { phase: 'during', category: 'ip', name: '试验用药品记录（接收/发放/回收/销毁）' },
  { phase: 'during', category: 'training', name: '培训记录（方案培训、系统培训）' },
  { phase: 'during', category: 'communication', name: '与伦理/监管/申办方的往来沟通记录' },
  { phase: 'after', category: 'completion', name: '试验总结报告 / 分中心小结' },
  { phase: 'after', category: 'archive', name: '归档清单与存档确认（含保存期限）' },
];

function load() {
  store.ensureDataDir();
  const file = DOC_FILE();
  if (!fs.existsSync(file)) {
    const seeded = { version: 1, counters: { doc: 0, version: 0 }, documents: [] };
    seeded.documents = seedDemoDocuments(seeded);
    save(seeded);
    return seeded;
  }
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    return {
      version: 1,
      counters: { doc: 0, version: 0, ...(raw.counters || {}) },
      documents: Array.isArray(raw.documents) ? raw.documents : [],
    };
  } catch (err) {
    return { version: 1, counters: { doc: 0, version: 0 }, documents: [], error: String(err.message) };
  }
}

function save(data) {
  store.ensureDataDir();
  const file = DOC_FILE();
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, file);
}

function viewDoc(d) {
  return {
    id: d.id,
    title: d.title,
    category: d.category,
    phase: d.phase,
    status: d.status,
    version: d.version,
    owner: d.owner,
    reviewer: d.reviewer || null,
    effectiveDate: d.effectiveDate || null,
    reviewDueDate: d.reviewDueDate || null,
    overdue: d.reviewDueDate && d.status !== 'archived' ? d.reviewDueDate < today() : false,
    location: d.location || null,
    note: d.note || null,
    versionCount: (d.versions || []).length,
    createdBy: d.createdBy,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
    demo: Boolean(d.demo),
  };
}

function list(filter) {
  const data = load();
  const f = filter || {};
  let list = data.documents.slice();
  if (f.status) list = list.filter((d) => d.status === f.status);
  if (f.phase) list = list.filter((d) => d.phase === f.phase);
  if (f.category) list = list.filter((d) => d.category === f.category);
  if (f.search) {
    const q = String(f.search).toLowerCase();
    list = list.filter((d) => String(d.title).toLowerCase().includes(q));
  }
  return {
    documents: list.map(viewDoc).sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt))),
    essential: ESSENTIAL,
    byStatus: STATES.reduce((acc, s) => { acc[s] = data.documents.filter((d) => d.status === s).length; return acc; }, {}),
  };
}

/** 缺口扫描：缺哪些必需文件的类别，或类别有文件但没有「已批准」版本。 */
function gaps() {
  const data = load();
  const rows = [];
  for (const e of ESSENTIAL) {
    const matches = data.documents.filter((d) => d.category === e.category);
    const approved = matches.filter((d) => d.status === 'approved' || d.status === 'superseded');
    rows.push({
      phase: e.phase,
      category: e.category,
      name: e.name,
      present: matches.length,
      approved: approved.length,
      status: matches.length === 0 ? 'missing' : (approved.length === 0 ? 'unapproved' : 'ok'),
    });
  }
  const missing = rows.filter((r) => r.status === 'missing');
  const unapproved = rows.filter((r) => r.status === 'unapproved');
  return {
    rows,
    missing: missing.length,
    unapproved: unapproved.length,
    ok: rows.length - missing.length - unapproved.length,
    total: rows.length,
    readiness: Math.round(((rows.length - missing.length) / rows.length) * 1000) / 10,
  };
}

function getDoc(id) {
  const data = load();
  const d = data.documents.find((x) => x.id === id);
  if (!d) throw httpError(404, 'DOC_NOT_FOUND', '未找到文档 ' + id);
  const out = viewDoc(d);
  out.versions = (d.versions || []).slice().reverse();
  out.allowedNext = TRANSITIONS[d.status] || [];
  return out;
}

function actorCanEdit(user) {
  return user && ['crc', 'cra', 'pi', 'qa', 'admin'].includes(user.role);
}

function createDoc(input, user) {
  if (!user) throw httpError(401, 'AUTH_REQUIRED', '请先登录');
  if (!actorCanEdit(user)) throw httpError(403, 'ROLE_NOT_PERMITTED', '当前角色不能维护文档');
  const title = String((input && input.title) || '').trim();
  if (title.length < 3) throw httpError(400, 'DOC_TITLE_REQUIRED', '文档名称至少 3 个字');
  const category = String((input && input.category) || '').trim();
  if (!ESSENTIAL.some((e) => e.category === category)) {
    throw httpError(400, 'DOC_CATEGORY_INVALID', '文件类别必须在必需文件清单内：' + Array.from(new Set(ESSENTIAL.map((e) => e.category))).join(', '));
  }
  const data = load();
  const at = nowIso();
  data.counters.doc += 1;
  data.counters.version += 1;
  const doc = {
    id: 'DOC' + String(data.counters.doc).padStart(4, '0'),
    title,
    category,
    phase: (input.phase && ['before', 'during', 'after'].includes(input.phase)) ? input.phase
      : (ESSENTIAL.find((e) => e.category === category) || {}).phase || 'before',
    status: 'draft',
    version: 1,
    owner: String(input.owner || user.fullName || user.username),
    reviewer: input.reviewer ? String(input.reviewer) : null,
    effectiveDate: null,
    reviewDueDate: input.reviewDueDate || null,
    location: String(input.location || '').trim() || null,
    note: String(input.note || '').trim() || null,
    versions: [{
      version: 1,
      at,
      by: user.username,
      action: 'created',
      from: null,
      to: 'draft',
      comment: '文档建档',
    }],
    createdBy: user.username,
    createdAt: at,
    updatedAt: at,
    demo: false,
  };
  data.documents.push(doc);
  save(data);
  auth.logEvent('doc_created', { username: user.username, docId: doc.id, title: doc.title, category: doc.category });
  return viewDoc(doc);
}

function transitionDoc(id, input, user) {
  if (!user) throw httpError(401, 'AUTH_REQUIRED', '请先登录');
  if (!actorCanEdit(user)) throw httpError(403, 'ROLE_NOT_PERMITTED', '当前角色不能流转文档状态');
  const data = load();
  const d = data.documents.find((x) => x.id === id);
  if (!d) throw httpError(404, 'DOC_NOT_FOUND', '未找到文档 ' + id);
  const to = String((input && input.to) || '').trim();
  if (!STATES.includes(to)) throw httpError(400, 'DOC_STATE_INVALID', '状态非法：' + to);
  const allowed = TRANSITIONS[d.status] || [];
  if (!allowed.includes(to)) {
    throw httpError(409, 'DOC_TRANSITION_NOT_ALLOWED',
      '不允许从「' + STATE_CN[d.status] + '」直接到「' + STATE_CN[to] + '」；允许的下一步：' + (allowed.map((s) => STATE_CN[s]).join(' / ') || '无（终态）'));
  }
  // 独立性：批准人不能是建档人（与工作流引擎的独立复核同源，管理员亦无豁免）
  if (to === 'approved' && d.createdBy === user.username) {
    throw httpError(403, 'INDEPENDENCE_VIOLATION', '批准人不能是文档建档人（职责分离）：请换一个账号批准');
  }
  const comment = String((input && input.comment) || '').trim();
  if ((to === 'superseded' || to === 'draft') && comment.length < 3) {
    throw httpError(400, 'DOC_REASON_REQUIRED', '退回或替代必须写明理由（至少 3 个字）');
  }
  const at = nowIso();
  const from = d.status;
  d.status = to;
  if (to === 'approved') d.effectiveDate = d.effectiveDate || today();
  d.updatedAt = at;
  data.counters.version += 1;
  d.versions.push({
    version: ++d.version,
    at,
    by: user.username,
    action: 'transition:' + to,
    from,
    to,
    comment: comment || ('状态流转 ' + STATE_CN[from] + ' → ' + STATE_CN[to]),
  });
  save(data);
  auth.logEvent('doc_transition', { username: user.username, docId: d.id, from, to });
  return viewDoc(d);
}

function deleteDoc(id, user) {
  if (!user || user.role !== 'admin') throw httpError(403, 'PERMISSION_DENIED', '仅系统管理员可删除文档记录（用于清理训练数据）');
  const data = load();
  const idx = data.documents.findIndex((x) => x.id === id);
  if (idx < 0) throw httpError(404, 'DOC_NOT_FOUND', '未找到文档 ' + id);
  const [removed] = data.documents.splice(idx, 1);
  save(data);
  auth.logEvent('doc_deleted', { username: user.username, docId: removed.id, title: removed.title });
  return { ok: true, message: '文档记录已删除（管理员清理）' };
}

function reseedDemoDocs(user) {
  if (!user || user.role !== 'admin') throw httpError(403, 'PERMISSION_DENIED', '仅系统管理员可重新生成演示文档');
  const data = load();
  const existing = new Set(data.documents.map((d) => d.title));
  const added = seedDemoDocuments(data).filter((d) => !existing.has(d.title));
  if (!added.length) return { ok: true, added: 0, total: data.documents.length };
  for (const d of added) data.documents.push(d);
  save(data);
  auth.logEvent('docs_reseeded', { username: user.username, added: added.length });
  return { ok: true, added: added.length, total: data.documents.length };
}

/* ------------------------------------------------------------------ 演示数据 */

function seedDemoDocuments(initial) {
  const iso = nowIso();
  const mk = (title, category, status, opts) => {
    const o = opts || {};
    initial.counters.doc += 1;
    initial.counters.version += 1;
    const phase = (ESSENTIAL.find((e) => e.category === category) || {}).phase || 'before';
    return {
      id: 'DOC' + String(initial.counters.doc).padStart(4, '0'),
      title, category, phase, status,
      version: o.version || 1,
      owner: o.owner || '陈语（CRC）',
      reviewer: o.reviewer || null,
      effectiveDate: o.effectiveDate || null,
      reviewDueDate: o.reviewDueDate || null,
      location: o.location || 'ISF 第 ' + (initial.counters.doc) + ' 册',
      note: o.note || null,
      versions: [{
        version: o.version || 1, at: iso, by: 'demo_crc', action: o.version > 1 ? 'revised' : 'created',
        from: null, to: status, comment: o.comment || '演示数据：建档',
      }],
      createdBy: 'demo_crc',
      createdAt: iso,
      updatedAt: iso,
      demo: true,
    };
  };

  return [
    mk('临床试验方案（DEMO-2026-001 v1.0）', 'protocol', 'approved', { effectiveDate: '2026-01-10', comment: '申办方与研究者签署版' }),
    mk('知情同意书模板 v2.1（含修订说明）', 'icf', 'approved', { version: 2, effectiveDate: '2026-02-01', comment: '依据伦理意见补充风险段落' }),
    mk('伦理委员会批件（2026-03 年度续审）', 'irb', 'approved', { effectiveDate: '2026-03-15', reviewDueDate: '2027-03-14' }),
    mk('研究者简历 CV（王建军，2026-01 签名）', 'cv', 'approved', { effectiveDate: '2026-01-05', reviewDueDate: '2028-01-04' }),
    mk('授权分工表（含签字样张）', 'delegation', 'approved', { effectiveDate: '2026-01-12', reviewDueDate: '2026-12-31' }),
    mk('研究团队方案培训记录（2026-01）', 'training', 'approved', { effectiveDate: '2026-01-14' }),
    mk('试验用药品接收与发放记录（4 月）', 'ip', 'draft', { note: '待 CRC 补录 4 月 18 日发放' }),
    mk('监查报告（第 2 次监查 · 2026-05）', 'monitoring', 'review', { comment: '待 QA 复核' }),
    mk('SAE 报告 S-2026-004 与伦理递交回执', 'sae', 'approved', { effectiveDate: '2026-05-20', note: '首次报告 24 小时内递交' }),
    mk('试验协议 / 合同（含预算附件）', 'contract', 'approved', { effectiveDate: '2026-01-08', reviewDueDate: '2027-01-07' }),
  ];
}

module.exports = {
  STATES, STATE_CN, TRANSITIONS, ESSENTIAL,
  load, save, list, gaps, getDoc, createDoc, transitionDoc, deleteDoc, reseedDemoDocs,
};