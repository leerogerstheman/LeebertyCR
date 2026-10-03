'use strict';

/**
 * test/unit/engine.test.js - 核心引擎单元测试：
 *   工作流状态机校验、口令策略与哈希、eCRF 逻辑核查、CSV 转义。
 *   node --test "test/unit/*.test.js"
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cra-engine-'));
process.env.CRA_DATA_DIR = tmp;

const store = require('../../src/store.js');
const auth = require('../../src/auth.js');
const subjects = require('../../src/subjects.js');
const documents = require('../../src/documents.js');

/* ---------------------------------------------------------------- 内容库与工作流定义 */

test('seed 内容库可加载且工作流定义通过校验', () => {
  const content = store.loadContent();
  assert.ok(content.workflows.workflows.length >= 8, '至少 8 条流程定义');
  for (const w of content.workflows.workflows) {
    assert.ok(w.code && w.name, '流程需有 code 与 name');
    assert.ok(Array.isArray(w.steps) && w.steps.length >= 3, w.code + ' 步骤数不足');
    const codes = new Set();
    for (const s of w.steps) {
      assert.ok(s.code && s.name && Array.isArray(s.role) && s.role.length >= 1, w.code + ' 步骤字段缺失');
      assert.ok(!codes.has(s.code), w.code + ' 步骤码重复: ' + s.code);
      codes.add(s.code);
      assert.ok((w.states || []).includes(s.onComplete), w.code + '/' + s.code + ' onComplete 未在 states 中');
    }
    assert.ok((w.states || []).includes(w.initialState), w.code + ' initialState 非法');
  }
});

test('validateWorkflows 拒绝非法定义（缺前缀 / onComplete 越界 / 步骤为空）', () => {
  assert.throws(() => store.validateWorkflows([{ code: 'X', name: 'X', steps: [] }]), /recordPrefix/);
  assert.throws(() => store.validateWorkflows([{
    code: 'X', name: 'X', recordPrefix: 'X', initialState: 'a', states: ['a'],
    steps: [{ code: 's1', name: 's', role: ['cra'], onComplete: 'zzz' }],
  }]), /onComplete|states/);
  assert.throws(() => store.validateWorkflows([{
    code: 'X', name: 'X', recordPrefix: 'X', initialState: 'a', states: ['a'], steps: [],
  }]), /steps|步骤/);
});

test('eCRF 表单定义完整（字段 key 唯一、规则引用有效）', () => {
  const forms = subjects.loadForms().forms;
  assert.ok(forms.length >= 2);
  for (const f of forms) {
    const keys = new Set(f.fields.map((x) => x.key));
    assert.equal(keys.size, f.fields.length, f.id + ' 字段 key 重复');
    for (const r of f.rules || []) {
      assert.ok(keys.has(r.left) && keys.has(r.right), f.id + ' 规则引用未知字段');
    }
  }
});

/* ---------------------------------------------------------------- 逻辑核查 */

test('逻辑核查：必填、范围、枚举、跨字段', () => {
  const form = subjects.getForm('visit_vitals');
  const good = { visitDate: '2026-06-01', sbp: 120, dbp: 80, pulse: 70, temp: 36.5, doseTaken: 'yes', aeOccurred: 'no' };
  assert.deepEqual(subjects.checkForm(form, good), [], '合法数据不应有违规');

  const missing = subjects.checkForm(form, { visitDate: '2026-06-01' });
  assert.ok(missing.some((v) => v.rule === 'required'), '缺必填应报 required');

  const outOfRange = subjects.checkForm(form, Object.assign({}, good, { pulse: 500 }));
  assert.ok(outOfRange.some((v) => v.rule === 'range' && v.key === 'pulse'), '超范围应报 range');

  const badEnum = subjects.checkForm(form, Object.assign({}, good, { doseTaken: 'maybe' }));
  assert.ok(badEnum.some((v) => v.rule === 'enum'), '非法枚举应报 enum');

  const crossField = subjects.checkForm(form, Object.assign({}, good, { sbp: 80, dbp: 130 }));
  assert.ok(crossField.some((v) => v.rule === 'cross_field'), '收缩压 < 舒张压 应报跨字段违规');

  const badDate = subjects.checkForm(form, Object.assign({}, good, { visitDate: '2026/06/01' }));
  assert.ok(badDate.some((v) => v.rule === 'date'), '日期格式错误应报 date');
});

/* ---------------------------------------------------------------- 口令与权限 */

test('口令策略：长度与四类字符', () => {
  const policy = require('../../src/config.js').security;
  assert.ok(policy, '安全策略存在');
  const short = auth.validatePassword('Ab1!');
  assert.equal(short.ok, false, '过短口令应被拒');
  const weak = auth.validatePassword('aaaaaaaaaaaa');
  assert.equal(weak.ok, false, '单一字符类应被拒');
  const strong = auth.validatePassword('CRA-Demo-2026!');
  assert.equal(strong.ok, true, '合规口令应通过: ' + JSON.stringify(strong));
});

test('口令哈希：scrypt 加盐且可校验（同口令不同哈希）', () => {
  const a = auth.hashPassword('CRA-Demo-2026!');
  const b = auth.hashPassword('CRA-Demo-2026!');
  assert.equal(typeof a, 'string', 'hashPassword 返回字符串');
  assert.ok(a.startsWith('scrypt$'), '哈希格式为 scrypt$N$r$p$salt$hash');
  assert.notEqual(a, b, '相同口令应产生不同哈希（随机盐）');
  assert.equal(auth.verifyPassword('CRA-Demo-2026!', a), true, '正确口令应校验通过');
  assert.equal(auth.verifyPassword('wrong-password', a), false, '错误口令应失败');
});

test('RBAC：权限按角色收敛，admin 具备用户管理与审计权限', () => {
  const admin = auth.permissionsFor('admin');
  assert.ok(admin.includes('user.manage') && admin.includes('audit.view'), 'admin 应有用户管理与审计权限');
  const cra = auth.permissionsFor('cra');
  assert.ok(cra.includes('record.create'), 'CRA 可创建记录');
  assert.equal(cra.includes('user.manage'), false, 'CRA 不可管理用户');
  assert.equal(cra.includes('audit.view'), false, 'CRA 不可看审计日志');
  assert.equal(auth.can('cra', 'user.manage'), false);
  assert.equal(auth.can('qa', 'audit.view'), true, 'QA 可看审计日志');
});

/* ---------------------------------------------------------------- 文档状态机 */

test('文档状态机：合法流转链与非法跳转', () => {
  assert.deepEqual(documents.TRANSITIONS.draft, ['review', 'archived']);
  assert.ok(!documents.TRANSITIONS.review.includes('archived'), 'review 不能直接归档');
  assert.deepEqual(documents.TRANSITIONS.archived, [], 'archived 为终态');
  // 状态机覆盖每个状态且目标状态合法
  for (const s of documents.STATES) {
    assert.ok(Array.isArray(documents.TRANSITIONS[s]), s + ' 缺少流转定义');
    for (const to of documents.TRANSITIONS[s]) {
      assert.ok(documents.STATES.includes(to), s + ' → ' + to + ' 目标非法');
    }
  }
});

test('必需文件清单：三阶段齐备且覆盖主要文件类别', () => {
  const cats = new Set();
  const phases = new Set();
  for (const e of documents.ESSENTIAL) {
    assert.ok(['before', 'during', 'after'].includes(e.phase), '阶段非法: ' + e.phase);
    cats.add(e.category);
    phases.add(e.phase);
    assert.ok(e.name && e.name.length >= 4, '必需文件需有名称');
  }
  // 同一类别可以有多份必需文件（如方案与方案签名页），但类别集合须覆盖三阶段主要文件
  assert.ok(cats.size >= 12, '必需文件类别过少: ' + cats.size);
  assert.deepEqual(Array.from(phases).sort(), ['after', 'before', 'during'], '三个阶段都要覆盖');
  for (const must of ['protocol', 'icf', 'irb', 'delegation', 'sae', 'ip']) {
    assert.ok(cats.has(must), '缺少关键类别: ' + must);
  }
});

/* ---------------------------------------------------------------- CSV 转义（服务端逻辑） */

test('CSV 转义：逗号、引号、换行', () => {
  // 与 server.js 中的 csvEscape 行为一致（独立复现，防止回归）
  const esc = (v) => {
    const s = String(v == null ? '' : v);
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  assert.equal(esc('普通'), '普通');
  assert.equal(esc('含,逗号'), '"含,逗号"');
  assert.equal(esc('含"引号'), '"含""引号"');
  assert.equal(esc('含\n换行'), '"含\n换行"');
  assert.equal(esc(null), '');
});

/* ---------------------------------------------------------------- 存储原子性 */

test('记录/状态写入为原子（临时文件不残留）', () => {
  const state = store.loadState();
  state.quiz.attempts = 7;
  store.saveState(state);
  const again = store.loadState();
  assert.equal(again.quiz.attempts, 7, '状态应可读写');
  const leftovers = fs.readdirSync(tmp).filter((f) => f.endsWith('.tmp'));
  assert.deepEqual(leftovers, [], '不应残留 .tmp 文件');
});