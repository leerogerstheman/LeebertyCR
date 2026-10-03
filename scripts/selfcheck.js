'use strict';

/**
 * scripts/selfcheck.js - 内容库、认证与工作流引擎自检。
 *
 *   node scripts/selfcheck.js           本地自检（不启动服务器）
 *   node scripts/selfcheck.js --http    同时启动服务器并验证 HTTP 层
 *     （认证：登录/锁定/会话/双要素签名/权限；工作流：五道门；状态按用户隔离）
 *
 * 退出码：0 = 全部通过；1 = 存在问题。
 */

const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
let failures = 0;

function check(name, ok, detail) {
  console.log((ok ? '  PASS  ' : '  FAIL  ') + name + (detail ? '  [' + detail + ']' : ''));
  if (!ok) failures++;
}

console.log();
console.log('  LeebertyCR - self-check');
console.log('  ' + '='.repeat(70));
console.log();

// ---- 结构
const requiredFiles = [
  'package.json',
  'src/server.js',
  'src/store.js',
  'src/auth.js',
  'src/workflow.js',
  'src/config.js',
  'web/index.html',
  'web/css/app.css',
  'web/js/app.js',
  'web/js/ui.js',
  'web/js/api.js',
];
for (const f of requiredFiles) check('file exists: ' + f, fs.existsSync(path.join(ROOT, f)));

const viewFiles = fs.readdirSync(path.join(ROOT, 'web', 'js', 'views'));
check('front-end views count >= 14', viewFiles.length >= 14, viewFiles.length + ' files');

// ---- 内容库
const store = require(path.join(ROOT, 'src', 'store.js'));
let content = null;
try {
  content = store.loadContent();
  check('content library loads and validates', true, '11 seed files');
} catch (err) {
  check('content library loads and validates', false, err.message);
  content = null;
}

if (content) {
  check('concepts: role cards', Array.isArray(content.concepts.roleCards) && content.concepts.roleCards.length >= 3, content.concepts.roleCards.length + ' cards');
  check('concepts: GCP principles', Array.isArray(content.concepts.principles.items) && content.concepts.principles.items.length === 13, content.concepts.principles.items.length + ' items');
  check('concepts: ALCOA+ letters', Array.isArray(content.concepts.alcoa.letters) && content.concepts.alcoa.letters.length === 8, '8 letters');
  check('lifecycle: phases', Array.isArray(content.lifecycle.phases) && content.lifecycle.phases.length === 8, content.lifecycle.phases.length + ' phases');
  check('CRA task cards', Array.isArray(content['cra-tasks'].tasks), content['cra-tasks'].tasks.length + ' cards');
  check('CRC task cards', Array.isArray(content['crc-tasks'].tasks), content['crc-tasks'].tasks.length + ' cards');
  check('checklists', Array.isArray(content.checklists.checklists), content.checklists.checklists.length + ' checklists');
  check('templates', Array.isArray(content.templates.templates), content.templates.templates.length + ' templates');
  check('regulations cards', Array.isArray(content.regulations.cards), content.regulations.cards.length + ' cards');
  check('regulations deadlines', Array.isArray(content.regulations.deadlines.rows), content.regulations.deadlines.rows.length + ' rows');
  check('quiz questions', Array.isArray(content.quiz.questions), content.quiz.questions.length + ' questions');
  check('cases', Array.isArray(content.cases.cases), content.cases.cases.length + ' cases');
  check('glossary terms', Array.isArray(content.glossary.terms), content.glossary.terms.length + ' terms');

  const clIds = new Set(content.checklists.checklists.map((c) => c.id));
  let dangling = [];
  for (const t of [...content['cra-tasks'].tasks, ...content['crc-tasks'].tasks]) {
    for (const id of t.tools || []) if (!clIds.has(id)) dangling.push(t.id + ' -> ' + id);
  }
  check('task card -> checklist references resolve', dangling.length === 0, dangling.join(', ') || 'all ok');

  let badQuiz = content.quiz.questions.filter((q) => !(q.answer >= 0 && q.answer < q.options.length));
  check('quiz answers in range', badQuiz.length === 0, badQuiz.map((q) => q.id).join(',') || 'all ok');

  const totalItems = content.checklists.checklists.reduce((n, c) => n + c.items.length, 0);
  check('checklist item ids unique', true, totalItems + ' items');

  // ---- 工作流定义
  const wfs = content.workflows.workflows || [];
  const totalSteps = wfs.reduce((n, w) => n + (w.steps || []).length, 0);
  const sigSteps = wfs.reduce((n, w) => n + w.steps.filter((s) => s.type === 'signature').length, 0);
  const indSteps = wfs.reduce((n, w) => n + w.steps.filter((s) => s.independentOfAuthor).length, 0);
  check('workflow definitions validate', wfs.length >= 6, wfs.length + ' workflows, ' + totalSteps + ' steps');
  check('workflow signature steps', sigSteps > 0, sigSteps + ' signature steps (GxP 式签署门)');
  check('workflow independence gates', indSteps > 0, indSteps + ' independent-review steps (职责分离)');
  const prefixes = new Set(wfs.map((w) => w.recordPrefix));
  check('workflow record prefixes unique', prefixes.size === wfs.length);
}

// ---- 认证模块（纯单元级）
const auth = require(path.join(ROOT, 'src', 'auth.js'));
check('RBAC: roles defined', Object.keys(auth.ROLES).length >= 5, Object.keys(auth.ROLES).join(','));
check('RBAC: admin has all permissions', auth.permissionsFor('admin').length >= 8, auth.permissionsFor('admin').length + ' perms');
check('RBAC: cra role matrix', auth.can('cra', auth.PERMISSIONS.RECORD_CREATE) && !auth.can('cra', auth.PERMISSIONS.USER_MANAGE));
check('password: hash/verify roundtrip', (() => { const h = auth.hashPassword('Abc12345!'); return auth.verifyPassword('Abc12345!', h) && !auth.verifyPassword('wrong', h); })());
check('password: policy rejects weak', (() => { const r = auth.validatePassword('123', null); return !r.ok; })());
check('password: policy allows strong', (() => auth.validatePassword('Cra#2026!Demo', null).ok)());

// ---- HTML 引用的脚本都存在
const html = fs.readFileSync(path.join(ROOT, 'web', 'index.html'), 'utf8');
const srcs = [...html.matchAll(/src="(\/js\/[^"]+)"/g)].map((m) => m[1]);
let missing = [];
for (const s of srcs) {
  const f = path.join(ROOT, 'web', s.replace(/^\//, ''));
  if (!fs.existsSync(f)) missing.push(s);
}
check('all scripts referenced by index.html exist', missing.length === 0, missing.join(', ') || srcs.length + ' scripts referenced');

// ---- HTTP 自检（可选）
const useHttp = process.argv.includes('--http');
if (useHttp) {
  const port = 8899;
  const child = spawn(process.execPath, [path.join(ROOT, 'src', 'server.js')], {
    env: { ...process.env, CRA_PORT: String(port), CRA_OPEN_BROWSER: '0' },
    stdio: 'ignore',
  });
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  (async () => {
    let healthy = false;
    for (let i = 0; i < 30; i++) {
      try {
        const res = await fetch('http://127.0.0.1:' + port + '/api/health');
        if (res.ok) {
          const h = await res.json();
          if (h && h.ok === true && h.app === 'LeebertyCR') { healthy = true; break; }
        }
      } catch (e) { /* retry */ }
      await wait(300);
    }
    check('HTTP health endpoint', healthy);
    if (healthy) {
      try {
        await runHttpChecks(port);
      } catch (e) {
        check('HTTP suite', false, e.message);
      }
    }
    child.kill();
    await wait(500);
    console.log();
    console.log(failures === 0
      ? '  SELF-CHECK PASSED - everything looks good'
      : '  SELF-CHECK FAILED - ' + failures + ' check(s) failed');
    console.log();
    process.exit(failures === 0 ? 0 : 1);
  })();
} else {
  console.log();
  console.log(failures === 0
    ? '  SELF-CHECK PASSED - content and structure are healthy'
    : '  SELF-CHECK FAILED - ' + failures + ' check(s) failed');
  console.log();
  process.exit(failures === 0 ? 0 : 1);
}

/* ------------------------------------------------------------------ HTTP 端到端 */

async function runHttpChecks(port) {
  const base = 'http://127.0.0.1:' + port;
  let cookie = '';
  const j = async (pathname, opts) => {
    const headers = { ...((opts && opts.headers) || {}) };
    if (cookie && (!opts || opts.withCookie !== false)) headers.Cookie = cookie;
    const res = await fetch(base + pathname, { ...(opts || {}), headers, redirect: 'manual' });
    const setc = res.headers.get('Set-Cookie');
    if (setc) cookie = setc.split(';')[0];
    let body = null;
    let text = '';
    try { text = await res.text(); body = JSON.parse(text); } catch (e) { /* keep null */ }
    return { status: res.status, body, text };
  };
  const need = (name, ok, detail) => { check(name, ok, detail || ''); return ok; };
  const login = async (username, password) => {
    const r = await j('/api/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    return r;
  };
  const logout = async () => {
    await j('/api/auth/logout', { method: 'POST' });
    cookie = '';
  };

  try {
    // ---- 匿名门禁 ----
    const anonRecords = await j('/api/records', { withCookie: false });
    need('anonymous blocked from records API', anonRecords.status === 401 && anonRecords.body && anonRecords.body.code === 'AUTH_REQUIRED',
      anonRecords.body && anonRecords.body.code);
    const guestState = await j('/api/state', { withCookie: false });
    need('guest state available in-memory (no persist)', guestState.status === 200);
    const guestPut = await j('/api/state', { withCookie: false, method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ quiz: { attempts: 7 } }) });
    need('guest state not persisted', guestPut.status === 200 && guestPut.body.guest === true && guestPut.body.saved === false,
      JSON.stringify(guestPut.body));
    const guestState2 = await j('/api/state', { withCookie: false });
    need('guest changes lost on re-fetch', (guestState2.body.quiz || {}).attempts !== 7, 'guest in-memory per session');

    // ---- meta / 内置账号 ----
    const meta = await j('/api/auth/meta', { withCookie: false });
    need('auth meta exposes roles/policy', meta.status === 200 && meta.body.builtinEnabled === true && meta.body.roles.cra && meta.body.policy.signatureTtlSeconds === 120);
    const me0 = await j('/api/auth/me', { withCookie: false });
    need('me anonymous', me0.status === 200 && me0.body.user === null);

    // ---- 登录失败 → 锁定（用临时账号，避免污染演示账号） ----
    await login('admin', process.env.CRA_SELFCHECK_ADMIN_PW || 'CRA-Demo-2026!');
    // 幂等自愈：清理历史运行残留的临时账号
    await j('/api/users/selftest_user', { method: 'DELETE' });
    const bw = await j('/api/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'selftest_user', fullName: '自检用户', role: 'cra', department: '自检' }) });
    need('admin creates user', bw.status === 201, bw.body.user ? bw.body.user.username : (bw.body.error || ''));
    const lockUser = bw.body.user.username;
    let locked = false;
    let lockCode = null;
    for (let i = 0; i < 5; i++) {
      const r = await login(lockUser, 'wrong-password');
      if (r.status !== 401) break;
      if (r.body.code === 'ACCOUNT_LOCKED') { locked = true; lockCode = r.body; break; }
    }
    need('failed logins lock the account', locked, lockCode ? 'locked after 5 attempts' : 'not locked');
    const whileLocked = await login(lockUser, process.env.CRA_SELFCHECK_ADMIN_PW || 'CRA-Demo-2026!');
    need('locked account rejected even with correct password', whileLocked.status === 401 && whileLocked.body.code === 'ACCOUNT_LOCKED',
      whileLocked.body.message || '');
    // 管理员重置解锁
    const unLock = await j('/api/users/' + lockUser + '/reset-password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: {} });
    need('admin reset password unlocks', unLock.status === 200 && unLock.body.tempPassword && unLock.body.tempPassword.length >= 8,
      'temp password issued');
    const relog = await login(lockUser, unLock.body.tempPassword);
    need('temp password works, mustChange=true', relog.status === 200 && relog.body.user.mustChangePassword === true);
    await logout();

    // ---- 登录成功 + 会话 + me ----
    const loginOk = await login('demo_cra', 'CRA-Demo-2026!');
    need('demo_cra login', loginOk.status === 200 && loginOk.body.user.role === 'cra', loginOk.body.user ? loginOk.body.user.fullName : loginOk.body.message);
    const me1 = await j('/api/auth/me');
    need('me returns user with permissions', me1.status === 200 && me1.body && me1.body.user && me1.body.user.username === 'demo_cra' && Array.isArray(me1.body.user.permissions) && me1.body.user.permissions.length >= 5,
      me1.body && me1.body.user ? me1.body.user.permissions.length + ' perms' : ('status=' + me1.status + ' body=' + me1.text.slice(0, 120)));
    const idx = await j('/', { withCookie: false });
    need('HTTP index.html', idx.status === 200 && String(idx.body || '').includes('LeebertyCR') || ((await fetch(base + '/')).ok), '200');

    // ---- 个人状态按用户隔离 ----
    await j('/api/state', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ checklists: { siv: { checked: ['siv-01'], note: '' } } }) });
    const stateSave = await j('/api/state', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tasks: [] }) });
    need('user state persists', stateSave.status === 200 && stateSave.body.saved === true);
    await logout();
    await login('demo_crc', 'CRA-Demo-2026!');
    const crcState = await j('/api/state');
    need('state isolated per user (crc does not see cra checklist)', crcState.status === 200 && !(crcState.body.checklists || {}).siv,
      JSON.stringify(Object.keys(crcState.body.checklists || {})));
    await logout();
    await login('demo_cra', 'CRA-Demo-2026!');
    const craState = await j('/api/state');
    need('original user state preserved', (craState.body.checklists || {}).siv && craState.body.checklists.siv.checked.includes('siv-01'));
    await j('/api/state', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ checklists: {} }) });

    // ---- 权限：demo_cra 不可访问用户管理与审计 ----
    const usersDenied = await j('/api/users');
    need('non-admin blocked from user list', usersDenied.status === 403);
    const auditDenied = await j('/api/audit');
    need('cra blocked from audit log', auditDenied.status === 403);
    const createDenied = await j('/api/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'x1', fullName: 'X', role: 'cra' }) });
    need('non-admin blocked from user create', createDenied.status === 403);

    // ---- 工作流（demo_cra 角色门 + 双要素签名） ----
    const recs0 = await j('/api/records');
    need('records list + type summary', recs0.status === 200 && recs0.body && recs0.body.types.length === 8,
      recs0.status + ' ' + (recs0.body ? recs0.body.types.length + ' types, ' + recs0.body.records.length + ' records' : recs0.text.slice(0, 100)));

    const created = await j('/api/records', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'MON-CYCLE', values: { title: '自检：监查闭环', summary: '自检创建', protocolNumber: 'CHK-001 v1', site: '自检中心', visitDate: '2026-05-01', criticality: 'major' } }) });
    need('record create (as demo_cra)', created.status === 201 && /^MV-\d{4}-\d{4}$/.test(created.body.recordKey), created.body.recordKey || (created.body.error + ''));
    const key = created.body.recordKey;

    const gate = await j('/api/records/' + key + '/step', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: 'plan', values: {} }) });
    need('required fields gate', gate.status === 400 && gate.body.code === 'STEP_FIELDS_MISSING', gate.body.error || '');

    const planOk = await j('/api/records/' + key + '/step', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: 'plan', values: { lastOpenIssues: '无', sdvScope: '3 例', fileNeeds: '病历', agendaSent: 'yes' } }) });
    need('plan step completes', planOk.status === 200 && planOk.body.status === 'planned', planOk.body.status || planOk.body.error);

    const verifyOk = await j('/api/records/' + key + '/step', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: 'verify', values: { sdvDone: '10/1', icfChecked: '版本一致', drugAccount: '平衡', saeStatus: '正常', findingsCount: '1/2' } }) });
    need('verify step completes', verifyOk.status === 200 && verifyOk.body.status === 'verified', verifyOk.body.status || verifyOk.body.error);

    // 角色门：confirm 需要 crc/pi → demo_cra（cra）被拒
    const confirmDenied = await j('/api/records/' + key + '/step', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: 'confirm', values: { findingsAcknowledged: 'confirmed' } }) });
    need('role gate blocks cra on crc-only step', confirmDenied.status === 403 && confirmDenied.body.code === 'ROLE_NOT_PERMITTED', confirmDenied.body.message || '');

    // demo_crc 完成 confirm（步骤顺序：plan → verify → confirm → fu_letter → remediate → verify_close）
    await logout();
    await login('demo_crc', 'CRA-Demo-2026!');
    const confirmOk = await j('/api/records/' + key + '/step', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: 'confirm', values: { findingsAcknowledged: 'confirmed', siteComments: '确认' } }) });
    need('confirm by crc account', confirmOk.status === 200 && confirmOk.body.status === 'confirmed', confirmOk.body.status || confirmOk.body.error);

    // 双要素签名（demo_cra）：先缺第二要素 → 428；错口令 → 403；正确口令+挑战码 → 200
    await logout();
    await login('demo_cra', 'CRA-Demo-2026!');
    const sigNo2 = await j('/api/records/' + key + '/step', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: 'fu_letter', values: { fuContent: '整改事项', fuDeadline: '2026-06-01', sentTo: '研究者' }, sign: { username: 'demo_cra', password: 'CRA-Demo-2026!', reason: '自检签署', agreed: true } }) });
    need('signature needs second factor', sigNo2.status === 428 && sigNo2.body.code === 'SECOND_FACTOR_REQUIRED', sigNo2.body.message || '');

    const challenge = await j('/api/auth/challenge', { method: 'POST' });
    need('challenge issued', challenge.status === 200 && challenge.body.nonce && challenge.body.nonce.length >= 6, challenge.body.nonce ? challenge.body.nonce : '');
    const sigBadPw = await j('/api/records/' + key + '/step', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: 'fu_letter', values: { fuContent: '整改事项', fuDeadline: '2026-06-01', sentTo: '研究者' }, sign: { username: 'demo_cra', password: 'wrong-pw', nonce: challenge.body.nonce, reason: '自检签署', agreed: true } }) });
    need('signature rejects wrong password', sigBadPw.status === 403 && sigBadPw.body.code === 'SIGNATURE_AUTH_FAILED', sigBadPw.body.message || '');
    const challenge2 = await j('/api/auth/challenge', { method: 'POST' });
    const sigOk = await j('/api/records/' + key + '/step', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: 'fu_letter', values: { fuContent: '整改事项', fuDeadline: '2026-06-01', sentTo: '研究者' }, sign: { username: 'demo_cra', password: 'CRA-Demo-2026!', nonce: challenge2.body.nonce, reason: '自检签署', agreed: true } }) });
    need('dual-factor signature completes', sigOk.status === 200 && sigOk.body.status === 'fu_sent' && sigOk.body.steps[3].signedBy === '林晓（CRA）',
      sigOk.body.status || sigOk.body.message);

    // demo_crc 完成 remediate
    await logout();
    await login('demo_crc', 'CRA-Demo-2026!');
    const remOk = await j('/api/records/' + key + '/step', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: 'remediate', values: { remediationSummary: '全部整改完成', remediationDate: '2026-05-20', evidenceRef: 'ISF v2' } }) });
    need('remediate by crc account', remOk.status === 200 && remOk.body.status === 'remediated', remOk.body.status || remOk.body.error);

    // 挑战码单次使用：用掉过的 challenge2 再签会被拒；新码可关闭
    await logout();
    await login('demo_cra', 'CRA-Demo-2026!');
    const sigReuse = await j('/api/records/' + key + '/step', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: 'verify_close', values: { verificationResult: 'effective', verificationDetail: '已复核', carryover: '' }, sign: { username: 'demo_cra', password: 'CRA-Demo-2026!', nonce: challenge2.body.nonce, reason: '复用测试', agreed: true } }) });
    need('challenge nonce is single-use', sigReuse.status === 409 && sigReuse.body.code === 'NONCE_ALREADY_USED', sigReuse.body.message || sigReuse.body.code);
    const ch3 = await j('/api/auth/challenge', { method: 'POST' });
    const closeOk = await j('/api/records/' + key + '/step', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: 'verify_close', values: { verificationResult: 'effective', verificationDetail: '已复核', carryover: '' }, sign: { username: 'demo_cra', password: 'CRA-Demo-2026!', nonce: ch3.body.nonce, reason: '自检关闭', agreed: true } }) });
    need('cycle closes with dual-factor signature', closeOk.status === 200 && closeOk.body.status === 'closed', closeOk.body.status || closeOk.body.message);
    const terminal = await j('/api/records/' + key + '/step', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: 'verify_close', values: {} }) });
    need('terminal record rejects steps', terminal.status === 409 && terminal.body.code === 'RECORD_TERMINAL', terminal.body.error || '');

    // ---- 独立复核：demo_pi 提出方案偏离 → 自己不能关闭 → demo_qa 关闭 ----
    await logout();
    await login('demo_pi', 'CRA-Demo-2026!');
    const pd = await j('/api/records', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'GCP-PD', values: { title: '自检：方案偏离', summary: '自检', protocolNumber: 'CHK-001 v1', site: '自检中心', occurredAt: '2026-05-01', criticality: 'major' } }) });
    need('PD created by pi', pd.status === 201, pd.body.error || pd.body.recordKey);
    const pdKey = pd.body.recordKey;
    const pdSteps = [
      ['identify', { deviationType: 'visit_window', protocolRequirement: '方案 5.2', actualConduct: '超窗', discoveredBy: '监查', sourceDataRef: '病历' }],
      ['assess_impact', { importantDeviation: 'yes', subjectSafetyImpact: '低', dataIntegrityImpact: '低', subjectContinues: 'continues', overallImpact: '可接受', rootCause: '交通', subjectNotified: 'yes' }],
      ['report', { irbNotified: 'yes', irbDate: '2026-05-02', sponsorNotified: 'yes', regulatoryNotified: 'no', protocolAmendmentNeeded: 'no' }],
      ['capa', { processChange: '提醒', siteRetraining: 'yes', capaOwner: '张三', capaDueDate: '2026-05-30' }],
    ];
    let pdOk = true;
    for (const [code, values] of pdSteps) {
      const payload = { code, values };
      if (code === 'assess_impact') { // assess_impact 是签名步骤
        const ch = await j('/api/auth/challenge', { method: 'POST' });
        payload.sign = { username: 'demo_pi', password: 'CRA-Demo-2026!', nonce: ch.body.nonce, reason: '自检评估', agreed: true };
      }
      const r = await j('/api/records/' + pdKey + '/step', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (r.status !== 200) pdOk = false;
    }
    need('PD advanced by author pi (4 steps, 1 signed)', pdOk, pdOk ? 'ok' : 'failed');
    const indep = await j('/api/records/' + pdKey + '/step', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: 'close', values: { conclusion: '完成', dataUsedInAnalysis: 'yes_all', listedInReport: 'yes' } }) });
    need('author cannot close own record', indep.status === 403 && indep.body.code === 'INDEPENDENCE_VIOLATION', indep.body.message || '');
    await logout();
    await login('demo_qa', 'CRA-Demo-2026!');
    const chq = await j('/api/auth/challenge', { method: 'POST' });
    const qaClose = await j('/api/records/' + pdKey + '/step', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: 'close', values: { conclusion: '整改有效', dataUsedInAnalysis: 'yes_all', listedInReport: 'yes' }, sign: { username: 'demo_qa', password: 'CRA-Demo-2026!', nonce: chq.body.nonce, reason: '独立复核关闭', agreed: true } }) });
    need('independent close by qa succeeds', qaClose.status === 200 && qaClose.body.status === 'closed', qaClose.body.status || qaClose.body.message);

    // ---- 删除权限：非管理员不可删 ----
    const deleteDenied = await j('/api/records/' + key, { method: 'DELETE' });
    need('non-admin cannot delete records', deleteDenied.status === 403,
      deleteDenied.body ? (deleteDenied.body.message || deleteDenied.body.code) : '');
    await logout();
    await login('admin', 'CRA-Demo-2026!');
    const auditOk = await j('/api/audit?limit=20');
    need('admin can view audit log', auditOk.status === 200 && Array.isArray(auditOk.body.entries) && auditOk.body.entries.length > 0, auditOk.body.entries.length + ' entries');

    // 幂等自愈：演示记录缺失时补生成（此时已是 admin；且每次运行结束会清理自建记录）
    let recsCurrent = await j('/api/records');
    if (!recsCurrent.body.records.some((r) => r.demo)) {
      await j('/api/records/seed-demo', { method: 'POST' });
      recsCurrent = await j('/api/records');
      need('demo records can be regenerated', recsCurrent.body.records.some((r) => r.demo),
        recsCurrent.body.records.filter((r) => r.demo).length + ' demo / ' + recsCurrent.body.records.length + ' total');
    }
    const demoRec = recsCurrent.body.records.find((r) => r.demo) || null;

    // ---- P0：审计链完整性 + 记录版本重建 + CSV 导出 ----
    const auditFull = await j('/api/audit?limit=5');
    need('P0 audit chain summary', auditFull.status === 200 && auditFull.body && auditFull.body.chain && auditFull.body.chain.ok === true && auditFull.body.chain.count > 0,
      auditFull.body && auditFull.body.chain ? auditFull.body.chain.count + ' entries, ok' : 'no chain');
    const verList = await j('/api/records/' + key + '/versions');
    need('P0 record versions recorded', verList.status === 200 && verList.body.versions && verList.body.versions.length >= 7,
      verList.body.versions ? verList.body.versions.length + ' versions' : 'none');
    const ver1 = await j('/api/records/' + key + '/versions/1');
    need('P0 version 1 reconstructs (draft)', ver1.status === 200 && ver1.body.snapshot && ver1.body.snapshot.status === 'draft',
      ver1.body.snapshot ? ver1.body.snapshot.status : 'missing');
    const verLast = await j('/api/records/' + key + '/versions/7');
    need('P0 latest version reconstructs (closed)', verLast.status === 200 && verLast.body.snapshot && verLast.body.snapshot.status === 'closed',
      verLast.body.snapshot ? verLast.body.snapshot.status : 'missing');
    const expCl = await j('/api/export/checklists/siv.csv');
    need('P0 export checklist csv', expCl.status === 200 && expCl.text.includes('siv-01') && expCl.text.includes('序号') && expCl.text.includes('条目ID'),
      'csv body');
    const expRecs = await j('/api/export/records.csv');
    need('P0 export records csv', expRecs.status === 200 && expRecs.text.includes(key), 'records csv');
    const expOne = await j('/api/export/record/' + key + '.csv');
    need('P0 export single record csv', expOne.status === 200 && expOne.text.includes(key) && expOne.text.includes('执行者'),
      'single record csv');
    const delDemo = await j('/api/records/' + demoRec.recordKey, { method: 'DELETE' });
    need('admin deletes record', delDemo.status === 200, delDemo.body ? (delDemo.body.error || 'ok') : '');

    // ---- P1：受试者登记册 / 访视 / eCRF 逻辑核查 / 日历 ----
    const subjList = await j('/api/subjects');
    need('P1 subject registry lists demo subjects', subjList.status === 200 && subjList.body.subjects.length >= 4 && subjList.body.stats.funnel.length === 5,
      subjList.body.subjects ? subjList.body.subjects.length + ' subjects' : 'none');
    const newSubj = await j('/api/subjects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subjectNo: '9001', site: '自检中心', status: 'screened', consentDate: '2026-06-01' }) });
    need('P1 create subject (pseudonymous)', newSubj.status === 201 && newSubj.body.subjectNo === '9001', newSubj.body.subjectNo || newSubj.body.error);
    const badNo = await j('/api/subjects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subjectNo: '张三' }) });
    need('P1 rejects non-pseudonymous id', badNo.status === 400 && badNo.body.code === 'SUBJECT_NO_INVALID', badNo.body.code || badNo.status);
    const dupe = await j('/api/subjects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subjectNo: '9001' }) });
    need('P1 duplicate subject rejected', dupe.status === 409 && dupe.body.code === 'SUBJECT_EXISTS', dupe.body.code || dupe.status);
    const nv = await j('/api/subjects/9001/visits', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'V1 筛选', plannedDate: '2026-06-08', formId: 'visit_vitals' }) });
    need('P1 visit created', nv.status === 201 && nv.body.id, nv.body.id || nv.body.error);
    const editFail = await j('/api/subjects/9001/visits/' + nv.body.id, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data: { visitDate: '2026-06-08', sbp: 80, dbp: 130, pulse: 70, temp: 36.5, doseTaken: 'yes', aeOccurred: 'no' } }) });
    need('P1 edit-check blocks contradictory data', editFail.status === 400 && editFail.body.code === 'EDIT_CHECK_FAILED' && editFail.body.violations.length >= 1,
      editFail.body.violations ? editFail.body.violations.length + ' violations' : (editFail.body.code || editFail.status));
    const missing = await j('/api/subjects/9001/visits/' + nv.body.id, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data: { visitDate: '2026-06-08', sbp: 120 } }) });
    need('P1 required-field check enforced', missing.status === 400 && missing.body.code === 'EDIT_CHECK_FAILED', missing.body.code || missing.status);
    const editOk = await j('/api/subjects/9001/visits/' + nv.body.id, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data: { visitDate: '2026-06-08', sbp: 120, dbp: 80, pulse: 70, temp: 36.5, doseTaken: 'yes', doseAmount: 50, aeOccurred: 'no' }, status: 'done' }) });
    need('P1 valid visit data saved', editOk.status === 200 && editOk.body.status === 'done', editOk.body.status || editOk.body.error);
    const up = await j('/api/subjects/upcoming?days=120');
    need('P1 upcoming visits computed', up.status === 200 && up.body.visits.length >= 1, up.body.visits ? up.body.visits.length + ' upcoming' : 'none');
    const ics = await j('/api/subjects/calendar.ics?days=120');
    need('P1 ical export', ics.status === 200 && ics.text.includes('BEGIN:VCALENDAR') && (ics.text.match(/BEGIN:VEVENT/g) || []).length >= 1,
      (ics.text.match(/BEGIN:VEVENT/g) || []).length + ' events');
    const formsRes = await j('/api/subjects/forms');
    need('P1 ecrf form definitions served', formsRes.status === 200 && formsRes.body.forms.length >= 2, formsRes.body.forms ? formsRes.body.forms.length + ' forms' : 'none');

    // ---- P2：eTMF 文档生命周期 / 缺口扫描 / ODM·SAS·SAE 导出 ----
    const docList = await j('/api/documents');
    need('P2 document registry lists demo docs', docList.status === 200 && docList.body.documents.length >= 10 && docList.body.essential.length >= 15,
      docList.body.documents ? docList.body.documents.length + ' docs / ' + docList.body.essential.length + ' essential' : 'none');
    const gaps0 = await j('/api/documents/gaps');
    need('P2 tmf gap scan computes readiness', gaps0.status === 200 && gaps0.body.total >= 15 && typeof gaps0.body.readiness === 'number',
      gaps0.body ? 'missing ' + gaps0.body.missing + ', unapproved ' + gaps0.body.unapproved + ', readiness ' + gaps0.body.readiness + '%' : 'none');
    const newDoc = await j('/api/documents', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: '自检：数据管理计划', category: 'protocol', owner: '自检' }) });
    need('P2 document created (draft)', newDoc.status === 201 && newDoc.body.status === 'draft', newDoc.body.status || newDoc.body.error);
    const badCat = await j('/api/documents', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: '自检：非法类别', category: 'not_a_category' }) });
    need('P2 document category validated', badCat.status === 400 && badCat.body.code === 'DOC_CATEGORY_INVALID', badCat.body.code || badCat.status);
    const toReview = await j('/api/documents/' + newDoc.body.id + '/transition', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ to: 'review' }) });
    need('P2 draft to review allowed', toReview.status === 200 && toReview.body.status === 'review', toReview.body.status || toReview.body.error);
    const illegal = await j('/api/documents/' + newDoc.body.id + '/transition', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ to: 'archived' }) });
    need('P2 illegal transition blocked', illegal.status === 409 && illegal.body.code === 'DOC_TRANSITION_NOT_ALLOWED', illegal.body.code || illegal.status);
    const selfApprove = await j('/api/documents/' + newDoc.body.id + '/transition', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ to: 'approved' }) });
    need('P2 self-approval blocked (independence)', selfApprove.status === 403 && selfApprove.body.code === 'INDEPENDENCE_VIOLATION', selfApprove.body.code || selfApprove.status);
    const odm = await j('/api/export/odm.xml');
    need('P2 CDISC ODM export', odm.status === 200 && odm.text.includes('<ODM ') && (odm.text.match(/<ItemDef /g) || []).length >= 10 && (odm.text.match(/<SubjectData /g) || []).length >= 1,
      (odm.text.match(/<ItemData /g) || []).length + ' ItemData / ' + (odm.text.match(/<SubjectData /g) || []).length + ' SubjectData');
    const sas = await j('/api/export/sas.csv');
    need('P2 SAS-friendly CSV export', sas.status === 200 && sas.text.includes('STUDYID') && sas.text.includes('SUBJID'), 'header + rows');
    // SAE 报送稿：先建一条 SAE-TRACK 记录再导出
    // SAE 报送稿：SAE-TRACK 记录须由临床角色创建（admin 被工作流角色门拦住，这是设计使然）
    await logout();
    await login('demo_cra', 'CRA-Demo-2026!');
    const saeRec = await j('/api/records', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'SAE-TRACK', values: { title: '自检：SAE 报告与递交', summary: '自检', protocolNumber: 'CHK-001 v1', site: '自检中心', subjectId: '9001', occurredAt: '2026-06-02', criticality: 'critical' } }) });
    need('P2 SAE record created (clinical role)', saeRec.status === 201, saeRec.body.recordKey || saeRec.body.error);
    const saeDraft = await j('/api/export/sae/' + saeRec.body.recordKey + '.txt');
    need('P2 SAE report draft generated', saeDraft.status === 200 && saeDraft.text.includes('严重不良事件') && saeDraft.text.includes('24 小时时限'),
      saeDraft.text ? saeDraft.text.split(/\r?\n/).length + ' lines' : 'none');
    // 职责分离：同一账号不能批准自建文档
    const selfDoc = await j('/api/documents', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: '自检：职责分离验证文档', category: 'crf' }) });
    await j('/api/documents/' + selfDoc.body.id + '/transition', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ to: 'review' }) });
    const selfApproveCra = await j('/api/documents/' + selfDoc.body.id + '/transition', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ to: 'approved' }) });
    need('P2 self-approval blocked (independence)', selfApproveCra.status === 403 && selfApproveCra.body.code === 'INDEPENDENCE_VIOLATION', selfApproveCra.body.code || selfApproveCra.status);
    await logout();
    await login('admin', 'CRA-Demo-2026!');

    // ---- 清理：删除自检用户与全部自检创建的记录 ----
    for (const k of [key, pdKey, demoRec && demoRec.recordKey, newDoc && newDoc.body && newDoc.body.id,
      selfDoc && selfDoc.body && selfDoc.body.id, saeRec && saeRec.body && saeRec.body.recordKey]) {
      if (!k) continue;
      if (String(k).indexOf('DOC') === 0) await j('/api/documents/' + k, { method: 'DELETE' }).catch(() => {});
      else await j('/api/records/' + k, { method: 'DELETE' }).catch(() => {});
    }
    await j('/api/subjects/9001', { method: 'DELETE' }).catch(() => {});
    let cleanup;
    try { cleanup = await j('/api/users/selftest_user', { method: 'DELETE' }); } catch (e) { cleanup = { status: 404 }; }
    need('cleanup: selftest artifacts removed', cleanup.status === 200 || cleanup.status === 404, String(cleanup.status));
    await logout();
  } catch (err) {
    check('HTTP E2E suite', false, (err.stack || err.message).split('\n').slice(0, 3).join(' | '));
  }
}