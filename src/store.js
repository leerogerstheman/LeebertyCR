'use strict';

/**
 * store.js - 内容库加载与运行状态持久化（零依赖，JSON 文件存储）。
 *
 * 内容库（seed/*.json）是只读的知识资产：理念、流程、清单、模板、法规、练习。
 * 运行状态（data/state.json）是用户工作痕迹：当前身份、任务台、清单进度、练习成绩。
 * 状态写入采用「临时文件 + 原子改名」策略，避免写一半损坏。
 */

const fs = require('node:fs');
const path = require('node:path');

const config = require('./config');
const ROOT = path.resolve(__dirname, '..');
const SEED_DIR = path.join(ROOT, 'seed');
const DATA_DIR = config.dataDir;
const STATE_FILE = path.join(DATA_DIR, 'state.json'); // 旧版单用户状态（迁移用）
const USERS_FILE = path.join(DATA_DIR, 'accounts.json');
const USERS_DIR = path.join(DATA_DIR, 'users');

/* ------------------------------------------------------------------ 内容库 */

const CONTENT_FILES = [
  'concepts.json',      // 理念课堂（角色定义、原则、ALCOA+、受试者权益）
  'lifecycle.json',     // 试验全生命周期阶段
  'cra-tasks.json',     // CRA 工作手册任务卡
  'crc-tasks.json',     // CRC 工作手册任务卡
  'checklists.json',    // 核查清单库
  'templates.json',     // 文件模板库
  'regulations.json',   // 法规速查与时限速查
  'quiz.json',          // 场景练习题库
  'cases.json',         // 案例学习
  'glossary.json',      // 术语表
  'workflows.json',     // 可执行工作流定义（GxP-Workbench 引擎同构）
  'forms.json',         // 简易 eCRF 表单定义（P1：访视数据录入 + 逻辑核查）
];

function readJson(file) {
  const full = path.join(SEED_DIR, file);
  const raw = fs.readFileSync(full, 'utf8');
  return JSON.parse(raw);
}

let contentCache = null;

/** 加载并轻度校验内容库；任何文件损坏都会抛出明确错误（宁可启动失败，不可静默缺内容）。 */
function loadContent() {
  if (contentCache) return contentCache;
  const content = {};
  for (const file of CONTENT_FILES) {
    const key = file.replace(/\.json$/, '');
    try {
      content[key] = readJson(file);
    } catch (err) {
      throw new Error(`seed/${file} 加载失败: ${err.message}`);
    }
  }
  validateContent(content);
  contentCache = content;
  return content;
}

function validateContent(c) {
  const assert = (cond, msg) => {
    if (!cond) throw new Error('内容库校验失败: ' + msg);
  };
  assert(Array.isArray(c.concepts.roleCards) && c.concepts.roleCards.length >= 2, 'concepts.roleCards');
  assert(Array.isArray(c.lifecycle.phases) && c.lifecycle.phases.length >= 6, 'lifecycle.phases');
  assert(Array.isArray(c['cra-tasks'].tasks) && c['cra-tasks'].tasks.length >= 8, 'cra-tasks');
  assert(Array.isArray(c['crc-tasks'].tasks) && c['crc-tasks'].tasks.length >= 8, 'crc-tasks');
  assert(Array.isArray(c.checklists.checklists) && c.checklists.checklists.length >= 6, 'checklists');
  assert(Array.isArray(c.templates.templates) && c.templates.templates.length >= 4, 'templates');
  assert(Array.isArray(c.regulations.cards) && c.regulations.cards.length >= 4, 'regulations');
  assert(Array.isArray(c.regulations.deadlines.rows) && c.regulations.deadlines.rows.length >= 8, 'deadlines');
  assert(Array.isArray(c.quiz.questions) && c.quiz.questions.length >= 10, 'quiz');
  assert(Array.isArray(c.cases.cases) && c.cases.cases.length >= 3, 'cases');
  assert(Array.isArray(c.glossary.terms) && c.glossary.terms.length >= 30, 'glossary');
  assert(Array.isArray(c.forms.forms) && c.forms.forms.length >= 1, 'forms');
  for (const f of c.forms.forms) {
    assert(Array.isArray(f.fields) && f.fields.length >= 3, '表单 ' + f.id + ' 字段不足');
    const keys = new Set();
    for (const fl of f.fields) {
      assert(fl.key && fl.label && fl.type, '表单 ' + f.id + ' 字段缺少 key/label/type');
      assert(!keys.has(fl.key), '表单 ' + f.id + ' 存在重复字段 key: ' + fl.key);
      keys.add(fl.key);
    }
    for (const r of f.rules || []) {
      assert(keys.has(r.left) && keys.has(r.right), '表单 ' + f.id + ' 的规则引用了不存在的字段');
    }
  }
  // 每张清单的条目 id 必须唯一（前端用它记录勾选状态）
  for (const cl of c.checklists.checklists) {
    const ids = new Set();
    for (const it of cl.items) {
      if (ids.has(it.id)) throw new Error(`清单 ${cl.id} 存在重复条目 id: ${it.id}`);
      ids.add(it.id);
    }
  }
  validateWorkflows(c.workflows && c.workflows.workflows ? c.workflows.workflows : []);
}

const APP_ROLES = ['cra', 'crc', 'pi', 'qa'];

/**
 * 工作流定义校验（与 GxP-Workbench src/domain/workflow.js 的 register() 同构）：
 * 必填字段、步骤码唯一、onComplete 落在 states、initialState 合法、
 * 角色在应用角色集内、requiresFields/persistFields 引用步骤表单存在的字段。
 */
function validateWorkflows(list) {
  if (!Array.isArray(list)) throw new Error('内容库校验失败: workflows 必须为数组');
  for (const def of list) {
    const label = def.code || '(unnamed)';
    for (const key of ['code', 'recordPrefix', 'name', 'states', 'steps']) {
      if (!def[key]) throw new Error(`工作流 ${label} 缺少 "${key}"`);
    }
    const codes = new Set(def.steps.map((s) => s.code));
    if (!Array.isArray(def.steps) || def.steps.length < 1) {
      throw new Error(`工作流 ${label} 至少需要 1 个步骤`);
    }
    if (def.steps.some((s) => !s.code)) {
      throw new Error(`工作流 ${label} 存在缺少 code 的步骤`);
    }
    if (codes.size !== def.steps.length) throw new Error(`工作流 ${label} 存在重复步骤码`);
    for (const step of def.steps) {
      if (!step.name) throw new Error(`${label}: 步骤 ${step.code} 缺少 name`);
      if (!Array.isArray(step.role) || step.role.length === 0) {
        throw new Error(`${label}: 步骤 ${step.code} 未指定可执行角色`);
      }
      if (step.onComplete && !def.states.includes(step.onComplete)) {
        throw new Error(`${label}: 步骤 ${step.code} 的目标状态 "${step.onComplete}" 不在 states 中`);
      }
      for (const r of step.role || []) {
        if (!APP_ROLES.includes(r)) throw new Error(`${label}: 步骤 ${step.code} 使用了未知角色 "${r}"`);
      }
      const formKeys = new Set((step.form || []).map((f) => f.key));
      for (const fk of step.requiresFields || []) {
        if (!formKeys.has(fk)) throw new Error(`${label}: 步骤 ${step.code} 的 requiresFields "${fk}" 不在表单中`);
      }
      for (const fk of Object.values(step.persistFields || {})) {
        if (!formKeys.has(fk)) throw new Error(`${label}: 步骤 ${step.code} 的 persistFields 引用了表单外字段 "${fk}"`);
      }
      const dup = new Set();
      for (const f of step.form || []) {
        if (dup.has(f.key)) throw new Error(`${label}: 步骤 ${step.code} 表单字段重复 "${f.key}"`);
        dup.add(f.key);
      }
    }
    if (!def.states.includes(def.initialState)) {
      throw new Error(`${label}: initialState "${def.initialState}" 不在 states 中`);
    }
  }
}

/* ------------------------------------------------------------------ 运行状态 */

const DEFAULT_STATE = () => ({
  version: 1,
  role: 'cra',                        // 当前身份视角：cra | crc | pi | viewer
  learnerName: '',
  checklists: {},                     // { [checklistId]: { checked: string[], note: string } }
  tasks: [],                          // 个人任务台
  quiz: { best: { cra: 0, crc: 0, all: 0 }, attempts: 0 },
  read: {},                           // 已读学习页打卡 { [pageKey]: true }
});

function ensureDataDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function loadState() {
  ensureDataDir();
  if (!fs.existsSync(STATE_FILE)) return DEFAULT_STATE();
  try {
    const raw = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    const base = DEFAULT_STATE();
    return {
      ...base,
      ...raw,
      checklists: { ...(raw.checklists || {}) },
      tasks: Array.isArray(raw.tasks) ? raw.tasks : [],
      quiz: { ...base.quiz, ...(raw.quiz || {}) },
      read: { ...(raw.read || {}) },
    };
  } catch (err) {
    // 状态文件损坏不阻塞使用：保留现场，提示用户手动处理
    return { ...DEFAULT_STATE(), stateError: String(err.message) };
  }
}

/** 原子写入：先写临时文件，再 rename 覆盖。 */
function saveState(state) {
  ensureDataDir();
  const tmp = STATE_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2), 'utf8');
  fs.renameSync(tmp, STATE_FILE);
}

/** 深拷贝（避免调用方直接改动内部对象）。 */
function cloneState(state) {
  return JSON.parse(JSON.stringify(state));
}

/* ------------------------------------------------------------------ 工作流记录 */

const RECORDS_FILE = path.join(DATA_DIR, 'records.json');

const EMPTY_RECORDS = () => ({ version: 1, counters: {}, records: [] });

function loadRecords() {
  ensureDataDir();
  if (!fs.existsSync(RECORDS_FILE)) {
    const seeded = EMPTY_RECORDS();
    seeded.records = seedDemoRecords(seeded);
    saveRecords(seeded);
    return seeded;
  }
  try {
    const raw = JSON.parse(fs.readFileSync(RECORDS_FILE, 'utf8'));
    return {
      ...EMPTY_RECORDS(),
      ...raw,
      counters: { ...(raw.counters || {}) },
      records: Array.isArray(raw.records) ? raw.records : [],
    };
  } catch (err) {
    return { ...EMPTY_RECORDS(), error: String(err.message) };
  }
}

function saveRecords(data) {
  ensureDataDir();
  const tmp = RECORDS_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, RECORDS_FILE);
}

/**
 * 首次运行（records.json 不存在）时生成 2 条演示记录，让用户立刻看到
 * 工作流运行器的样子（与 GxP-Workbench 首启自动生成演示数据同理）。
 * 演示记录标记 demo: true，提出人为内置演示账号 demo_cra（仅管理员可删除）。
 */
function seedDemoRecords(initial) {
  const content = loadContent();
  const now = new Date();
  const iso = now.toISOString();
  const dateOnly = (d) => d.toISOString().slice(0, 10);
  const days = (n) => { const d = new Date(now); d.setDate(d.getDate() + n); return dateOnly(d); };

  const mk = (def, title, summary, values, authorRole, stepsDone, extra) => {
    const prefix = def.recordPrefix;
    const next = (initial.counters[prefix] || 0) + 1;
    initial.counters[prefix] = next;
    const recordKey = `${prefix}-${now.getFullYear()}-${String(next).padStart(4, '0')}`;
    const stepInstances = def.steps.map((s, i) => ({
      code: s.code,
      status: i < stepsDone ? 'completed' : i === stepsDone ? 'current' : 'pending',
    }));
    const history = [
      { at: iso, userId: 'demo_cra', role: authorRole, actor: '林晓（CRA）', action: 'created', stepCode: null, from: null, to: def.initialState, comment: '记录创建（演示）' },
    ];
    for (let i = 0; i < stepsDone; i++) {
      const s = def.steps[i];
      history.push({
        at: iso, userId: 'demo_' + stepRoleOf(s), role: stepRoleOf(s), actor: '演示用户',
        action: 'step_completed', stepCode: s.code, from: i === 0 ? def.initialState : def.steps[i - 1].onComplete,
        to: s.onComplete, comment: '演示：步骤「' + s.name + '」已完成（教学数据）',
      });
    }
    const status = stepsDone > 0 ? def.steps[stepsDone - 1].onComplete : def.initialState;
    return {
      id: recordKey, recordKey, processCode: def.code, demo: true, title, summary,
      status, stepIndex: stepsDone, steps: stepInstances,
      data: { record: values, steps: {}, persisted: {} },
      dueDate: days(def.slaDays || 30), criticality: values.criticality || 'major',
      author: { userId: 'demo_cra', name: '林晓（CRA）', role: authorRole, at: iso },
      history, createdAt: iso, updatedAt: iso,
      ...extra,
    };
  };

  return [
    mk(findDef(content, 'GCP-IC'),
      '演示：受试者筛选检查先于知情同意签署',
      '监查发现 1 例受试者（编号 1006）的筛选检查（抽血、心电图）早于 ICF 签署日期 1 天。',
      { title: '演示：受试者筛选检查先于知情同意签署', summary: '监查发现 1 例受试者筛选检查早于 ICF 签署 1 天', protocolNumber: 'DEMO-2026-001 v1.0', subjectId: '1006', site: '演示中心', occurredAt: dateOnly(now), criticality: 'critical' },
      'cra', 1),
    mk(findDef(content, 'MON-CYCLE'),
      '演示：某中心 5 月常规监查闭环',
      '常规监查发现：3 条遗留问题（ISF 缺口 1、SAE 报告超时 1、eCRF 录入延迟）待随访信发出。',
      { title: '演示：某中心 5 月常规监查闭环', summary: '常规监查遗留问题待随访信发出', protocolNumber: 'DEMO-2026-001 v1.0', site: '演示中心', visitDate: dateOnly(now), criticality: 'major' },
      'cra', 2),
  ];

  function stepRoleOf(s) {
    return (s.role && s.role[0]) || 'cra';
  }
  function findDef(content, code) {
    return (content.workflows.workflows || []).find((w) => w.code === code) || null;
  }
}

/* ------------------------------------------------------------------ 用户与个人状态 */

function userStateFile(username) {
  const safe = String(username || 'guest').replace(/[^A-Za-z0-9_.-]/g, '_');
  return path.join(USERS_DIR, safe, 'state.json');
}

function loadUserState(username) {
  const file = userStateFile(username);
  if (!fs.existsSync(file)) return DEFAULT_STATE();
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    const base = DEFAULT_STATE();
    return {
      ...base,
      ...raw,
      checklists: { ...(raw.checklists || {}) },
      tasks: Array.isArray(raw.tasks) ? raw.tasks : [],
      quiz: { ...base.quiz, ...(raw.quiz || {}) },
      read: { ...(raw.read || {}) },
    };
  } catch (err) {
    return { ...DEFAULT_STATE(), stateError: String(err.message) };
  }
}

function saveUserState(username, state) {
  const file = userStateFile(username);
  const dir = path.dirname(file);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2), 'utf8');
  fs.renameSync(tmp, file);
}

module.exports = {
  ROOT,
  SEED_DIR,
  DATA_DIR,
  STATE_FILE,
  RECORDS_FILE,
  USERS_FILE,
  USERS_DIR,
  ensureDataDir,
  loadContent,
  validateWorkflows,
  loadState,
  saveState,
  cloneState,
  loadRecords,
  saveRecords,
  seedDemoRecords,
  userStateFile,
  loadUserState,
  saveUserState,
};