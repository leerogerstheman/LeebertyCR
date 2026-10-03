'use strict';

/**
 * LeebertyCR（CRA/CRC 临床试验工作台）- 应用入口。
 *
 *   node src/server.js                 启动于 http://127.0.0.1:8816
 *   CRA_PORT=9000 node src/server.js   换端口
 *   CRA_BUILTIN_ACCOUNTS=0 node src/server.js   关闭内置演示账号（首次走建号流程）
 *
 * 环境变量：
 *   CRA_HOST              绑定地址（默认 127.0.0.1；0.0.0.0 允许局域网访问）
 *   CRA_PORT              监听端口（默认 8816）
 *   CRA_DATA_DIR          数据目录（默认 <应用目录>/data）
 *   CRA_OPEN_BROWSER=1    启动后自动打开独立应用窗口（start.bat 已设置）
 *   CRA_BUILTIN_ACCOUNTS=0  不创建内置演示账号；首次使用先创建管理员
 *
 * 安全模型（参照 GxP-Workbench）：
 *   - 登录：账号库（data/accounts.json）+ scrypt 口令 + 失败锁定
 *   - 会话：HttpOnly Cookie + 空闲/绝对超时（data/sessions.json 持久化）
 *   - 权限：RBAC（auth.js 权限矩阵），服务端逐接口强制
 *   - 电子签名：双要素（口令 + 一次性挑战码），21 CFR Part 11.200(a)(1)(i)
 *   - 留痕：data/security.log 只追加安全日志；工作流记录全程历史
 */

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const config = require('./config');
const store = require('./store');
const auth = require('./auth');
const workflow = require('./workflow');
const subjects = require('./subjects');
const documents = require('./documents');

const APP = config.app;
const HOST = config.http.host;
const PORT = config.http.port;
const COOKIE = 'cra_sid';

/* ------------------------------------------------------------------ 内容与账号初始化 */

let content = null;
try {
  content = store.loadContent();
} catch (err) {
  console.error(err.message);
  process.exit(1);
}

// 账号：内置演示账号（开箱即用）或首次建号流程
const startUsers = auth.seedBuiltinAccounts();
if (startUsers.length) {
  console.log('  账号库 ready: ' + startUsers.length + ' 个账号' + (config.builtinAccounts ? '（内置演示账号，统一口令见横幅）' : ''));
}

// 旧版单用户状态迁移：data/state.json（v1 时代的全局状态）→ 归入管理员账号
migrateLegacyState();

function migrateLegacyState() {
  const legacy = path.join(store.DATA_DIR, 'state.json');
  if (!fs.existsSync(legacy)) return;
  try {
    const admin = auth.getUserByUsername('admin');
    if (!admin) return;
    const target = store.userStateFile('admin');
    if (fs.existsSync(target)) { fs.renameSync(legacy, legacy + '.bak'); return; }
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.renameSync(legacy, target);
    console.log('  已迁移旧版全局状态到管理员账号（data/users/admin/state.json）');
  } catch (err) {
    console.warn('  [警告] 旧状态迁移失败：' + err.message);
  }
}

/* ------------------------------------------------------------------ 会话状态 */

// token -> { user, state }；guest = 匿名（仅内存，不持久化）
const sessionCtx = new Map();

function cookieValue(req) {
  const raw = req.headers.cookie || '';
  for (const part of raw.split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (k === COOKIE) return rest.join('=');
  }
  return null;
}

function currentCtx(req) {
  const token = cookieValue(req);
  if (!token) return { token: null, user: null };
  const resolved = auth.resolveSession(token);
  if (!resolved.user) return { token, user: null, reason: resolved.reason };
  let ctx = sessionCtx.get(token);
  if (!ctx) {
    ctx = { user: resolved.user, state: store.loadUserState(resolved.user.username) };
    sessionCtx.set(token, ctx);
  }
  return { token, user: ctx.user, ctx };
}

function requireUser(req, res, perm) {
  const { user, token } = currentCtx(req);
  if (!user) {
    res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: '请先登录', code: 'AUTH_REQUIRED' }));
    return null;
  }
  if (perm && !auth.can(user.role, perm)) {
    res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: '权限不足：需要权限 ' + perm, code: 'PERMISSION_DENIED' }));
    return null;
  }
  return { user, token };
}

/* ------------------------------------------------------------------ 静态文件 */

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

function serveStatic(req, res, urlPath) {
  let rel = urlPath === '/' ? '/index.html' : urlPath;
  if (rel.includes('\0') || rel.includes('..')) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('Forbidden');
  }
  const file = path.join(store.ROOT, 'web', rel);
  if (!file.startsWith(path.join(store.ROOT, 'web') + path.sep)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('Forbidden');
  }
  fs.readFile(file, (err, buf) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Not found');
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    res.end(buf);
  });
}

/* ------------------------------------------------------------------ JSON 工具 */

function sendJson(res, code, obj, extraHeaders) {
  const body = JSON.stringify(obj);
  const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-cache', ...(extraHeaders || {}) };
  res.writeHead(code, headers);
  res.end(body);
}

function apiError(res, err) {
  const status = err.status || 500;
  if (status >= 500) console.error('  [api] ' + (err.stack || err.message));
  const body = { error: err.message, code: err.errCode || 'INTERNAL' };
  // 逻辑核查等场景附带明细，便于客户端逐条展示
  if (Array.isArray(err.violations)) body.violations = err.violations;
  if (Array.isArray(err.details)) body.details = err.details;
  return sendJson(res, status, body);
}

function readBody(req, limitBytes = 8 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limitBytes) {
        reject(new Error('body too large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

/* ------------------------------------------------------------------ API 路由 */

async function handleApi(req, res, url) {
  const parts = url.pathname.split('/').filter(Boolean);

  if (parts[1] === 'health') {
    return sendJson(res, 200, { ok: true, app: APP.name, appEn: APP.nameEn, version: APP.version, node: process.version });
  }

  if (parts[1] === 'content' && req.method === 'GET') {
    return sendJson(res, 200, content);
  }

  // ---- 认证 ----
  if (parts[1] === 'auth') {
    return handleAuth(req, res, parts);
  }

  // ---- 安全日志（admin / QA） ----
  if (parts[1] === 'audit' && req.method === 'GET') {
    const got = requireUser(req, res, auth.PERMISSIONS.AUDIT_VIEW);
    if (!got) return;
    const limit = Math.min(Number(url.searchParams.get('limit')) || 100, 500);
    return sendJson(res, 200, auth.readAudit(limit));
  }

  // ---- 导出（登录即可，本机工具） ----
  if (parts[1] === 'export') {
    return handleExport(req, res, parts);
  }

  // ---- 受试者登记册 / 访视 / eCRF（P1） ----
  if (parts[1] === 'subjects') {
    return handleSubjects(req, res, parts, url);
  }

  // ---- eTMF / ISF 文档生命周期与缺口扫描（P2） ----
  if (parts[1] === 'documents') {
    return handleDocuments(req, res, parts);
  }

  // ---- 用户管理（admin） ----
  if (parts[1] === 'users') {
    return handleUsers(req, res, parts);
  }

  // ---- 个人状态（按会话用户隔离；匿名=内存态，仅当前会话有效） ----
  if (parts[1] === 'state') {
    const { token, user } = currentCtx(req);
    let ctx = sessionCtx.get(token);
    let state;
    if (ctx) {
      state = ctx.state;
    } else if (user) {
      state = store.loadUserState(user.username);
      sessionCtx.set(token, { user, state });
    } else {
      state = store.loadState(); // 匿名：内存默认态（不持久化）
    }
    if (req.method === 'GET') {
      return sendJson(res, 200, state);
    }
    if (req.method === 'PUT') {
      const raw = await readBody(req);
      let next;
      try { next = JSON.parse(raw); } catch { return sendJson(res, 400, { error: 'JSON 解析失败' }); }
      if (typeof next !== 'object' || next === null || Array.isArray(next)) {
        return sendJson(res, 400, { error: '状态必须是对象' });
      }
      for (const key of Object.keys(next)) {
        if (MUTABLE_KEYS.has(key)) state[key] = next[key];
      }
      if (!Array.isArray(state.tasks)) state.tasks = [];
      if (typeof state.checklists !== 'object' || state.checklists === null) state.checklists = {};
      const saved = user ? saveCurrentState(user, state, token) : false;
      return sendJson(res, 200, { ok: true, saved: saved, guest: !user, savedAt: new Date().toISOString() });
    }
    return sendJson(res, 405, { error: 'Method Not Allowed' });
  }

  // ---- 工作流记录（需登录；角色来自账号） ----
  if (parts[1] === 'records') {
    return handleRecords(req, res, parts, url);
  }

  sendJson(res, 404, { error: '未知接口' });
  return true;
}

function defaultState() {
  return store.loadState(); // 匿名/占位：直接返回默认状态
}

function saveCurrentState(user, state, token) {
  try {
    store.saveUserState(user.username, state);
    const ctx = sessionCtx.get(token);
    if (ctx) ctx.state = state;
    return true;
  } catch (err) {
    return false;
  }
}

/* ------------------------------------------------------------------ 认证路由 */

async function handleAuth(req, res, parts) {
  const sub = parts[2];

  if (sub === 'meta' && req.method === 'GET') {
    return sendJson(res, 200, auth.publicMeta());
  }

  if (sub === 'me' && req.method === 'GET') {
    const { user, reason } = currentCtx(req);
    if (!user) return sendJson(res, 200, { user: null, reason: reason || 'NO_SESSION' });
    // 会话期间账号状态变化（如被禁用）也如实反映
    const fresh = auth.getUserByUsername(user.username);
    if (!fresh || fresh.status !== 'active') {
      auth.logEvent('session_account_inactive', { username: user.username, reason: (fresh && fresh.status) || 'gone' });
      return sendJson(res, 200, { user: null, reason: 'ACCOUNT_INACTIVE' });
    }
    return sendJson(res, 200, { user: auth.publicUser(fresh) });
  }

  if (sub === 'login' && req.method === 'POST') {
    const body = JSON.parse(await readBody(req));
    const result = auth.login({ username: body.username, password: body.password });
    if (!result.ok) {
      return sendJson(res, 401, { error: result.message, code: result.code, until: result.until, attemptsLeft: result.attemptsLeft });
    }
    const headers = {
      'Set-Cookie': `${COOKIE}=${result.token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${config.security.sessionAbsoluteHours * 3600}`,
    };
    // 会话首次使用：加载该用户的个人状态
    sessionCtx.set(result.token, { user: result.user, state: store.loadUserState(result.user.username) });
    return sendJson(res, 200, { ok: true, user: result.user }, headers);
  }

  if (sub === 'logout' && req.method === 'POST') {
    const token = cookieValue(req);
    const { user } = currentCtx(req);
    if (token) {
      if (user) store.saveUserState(user.username, (sessionCtx.get(token) || {}).state || store.loadUserState(user.username));
      auth.logout(token, user ? user.username : null);
      sessionCtx.delete(token);
    }
    return sendJson(res, 200, { ok: true });
  }

  if (sub === 'challenge' && req.method === 'POST') {
    const got = requireUser(req, res, auth.PERMISSIONS.SIGNATURE_USE);
    if (!got) return;
    return sendJson(res, 200, auth.issueSigningNonce(got.user, got.token));
  }

  if (sub === 'password' && req.method === 'POST') {
    const got = requireUser(req, res, auth.PERMISSIONS.PASSWORD_SELF);
    if (!got) return;
    const body = JSON.parse(await readBody(req));
    try {
      auth.changeOwnPassword(got.user, body.oldPassword, body.newPassword, got.token);
      auth.logEvent('password_changed_self', { username: got.user.username });
      return sendJson(res, 200, { ok: true });
    } catch (err) {
      return apiError(res, err);
    }
  }

  if (sub === 'first-admin' && req.method === 'POST') {
    try {
      if (config.builtinAccounts && auth.loadUsers().length) {
        return sendJson(res, 409, { error: '演示账号已存在；如不需要演示账号，请用 CRA_BUILTIN_ACCOUNTS=0 启动', code: 'ACCOUNTS_EXIST' });
      }
      const body = JSON.parse(await readBody(req));
      const r = auth.createFirstAdmin(body);
      return sendJson(res, 200, { ok: true, user: auth.publicUser(auth.getUserByUsername(body.username)) });
    } catch (err) {
      return apiError(res, err);
    }
  }

  sendJson(res, 404, { error: '未知接口' });
}

/* ------------------------------------------------------------------ 用户管理路由 */

async function handleUsers(req, res, parts) {
  if (parts.length === 2) {
    if (req.method === 'GET') {
      const got = requireUser(req, res, auth.PERMISSIONS.USER_VIEW);
      if (!got) return;
      return sendJson(res, 200, { users: auth.listUsers() });
    }
    if (req.method === 'POST') {
      const got = requireUser(req, res, auth.PERMISSIONS.USER_MANAGE);
      if (!got) return;
      const body = JSON.parse(await readBody(req));
      try {
        const r = auth.createUser(body, got.user);
        return sendJson(res, 201, r);
      } catch (err) {
        return apiError(res, err);
      }
    }
    return sendJson(res, 405, { error: 'Method Not Allowed' });
  }

  const username = decodeURIComponent(parts[2]);
  if (parts[3] === 'status' && req.method === 'PUT') {
    const got = requireUser(req, res, auth.PERMISSIONS.USER_MANAGE);
    if (!got) return;
    const body = JSON.parse(await readBody(req));
    try { return sendJson(res, 200, auth.setUserStatus(username, body.status, got.user)); }
    catch (err) { return apiError(res, err); }
  }
  if (parts[3] === 'reset-password' && req.method === 'POST') {
    const got = requireUser(req, res, auth.PERMISSIONS.USER_MANAGE);
    if (!got) return;
    try { return sendJson(res, 200, auth.resetPassword(username, got.user)); }
    catch (err) { return apiError(res, err); }
  }
  if (parts.length === 3 && req.method === 'DELETE') {
    const got = requireUser(req, res, auth.PERMISSIONS.USER_MANAGE);
    if (!got) return;
    try { return sendJson(res, 200, auth.deleteUser(username, got.user)); }
    catch (err) { return apiError(res, err); }
  }
  sendJson(res, 404, { error: '未知接口' });
}

/* ------------------------------------------------------------------ 导出辅助 */

function csvEscape(v) {
  const s = String(v == null ? '' : v);
  if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

function toCsv(rows) {
  return '\uFEFF' + rows.map((r) => r.map(csvEscape).join(',')).join('\r\n');
}

function sendCsv(res, filename, rows) {
  const body = toCsv(rows);
  res.writeHead(200, {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="${filename}"`,
    'Cache-Control': 'no-store',
  });
  res.end(body, 'utf8');
}

async function handleExport(req, res, parts) {
  const got = requireUser(req, res, auth.PERMISSIONS.RECORD_VIEW);
  if (!got) return;
  if (req.method !== 'GET') return sendJson(res, 405, { error: 'Method Not Allowed' });

  // 核查清单导出（含当前用户勾选状态）
  if (parts[2] === 'checklists' && parts[3] && parts[3].endsWith('.csv')) {
    const id = parts[3].replace(/\.csv$/, '');
    const cl = content.checklists.checklists.find((c) => c.id === id);
    if (!cl) return sendJson(res, 404, { error: '未找到清单 ' + id });
    const st = currentCtx(req).user ? store.loadUserState(currentCtx(req).user.username) : null;
    const rec = st && st.checklists ? st.checklists[id] : null;
    const checked = rec && Array.isArray(rec.checked) ? rec.checked : [];
    const rows = [['序号', '条目', '条目ID', '关键', '勾选', '怎么做', '为什么']];
    cl.items.forEach((it, i) => {
      rows.push([String(i + 1), it.text, it.id, it.critical ? '是' : '', checked.includes(it.id) ? '✓' : '', it.hint || '', it.why || '']);
    });
    return sendCsv(res, id + '.csv', rows);
  }

  // 记录清单导出
  if (parts[2] === 'records.csv') {
    const rows = [['编号', '流程', '标题', '状态', '进度', '严重度', '期限', '提出人', '更新']];
    for (const r of workflow.listRecords({})) {
      rows.push([r.recordKey, r.processName, r.title, r.status, r.stepIndex + '/' + r.stepCount, r.criticality || '', r.dueDate || '',
        (r.author && r.author.name) || '', r.updatedAt || '']);
    }
    return sendCsv(res, 'records.csv', rows);
  }

  // 单条记录导出（头 + 步骤 + 历史）
  if (parts[2] === 'record' && parts[3] && parts[3].endsWith('.csv')) {
    const key = parts[3].replace(/\.csv$/, '');
    try {
      const r = workflow.getRecord(key);
      const rowsTitle = [['编号', '流程', '标题', '状态', '版本']];
      rowsTitle.push([r.recordKey, r.processName, r.title, r.status, String(r.recordVersion || 1)]);
      const rowsStep = [['步骤', '状态', '执行者', '签署', '完成时间', '表单数据']];
      for (const s of r.steps || []) {
        rowsStep.push([(s.code || ''), (s.status || ''), (s.completedByRole || ''), (s.signedBy || ''),
          (s.completedAt || ''), JSON.stringify(s.formData || {})]);
      }
      const rowsHist = [['时间', '动作', '角色', '用户', '步骤', '说明', '→']];
      for (const h of r.history || []) {
        rowsHist.push([h.at || '', h.action || '', h.role || '', h.actor || '', h.stepCode || '', h.comment || '', h.to || '']);
      }
      return sendCsv(res, key + '.csv', [].concat(rowsTitle, [['']], rowsStep, [['']], rowsHist));
    } catch (err) {
      return apiError(res, err);
    }
  }

  // ---- P2：SAE 报送稿（由 SAE-TRACK 记录预填） ----
  if (parts[2] === 'sae' && parts[3]) {
    const key = parts[3].replace(/\.(txt|html)$/, '');
    try {
      const r = workflow.getRecord(key);
      if (r.processCode !== 'SAE-TRACK') {
        return sendJson(res, 400, { error: '该记录不是 SAE 追踪流程（SAE-TRACK），无法生成报送稿' });
      }
      const text = buildSaeReport(r);
      res.writeHead(200, {
        'Content-Type': 'text/plain; charset=utf-8',
        'Content-Disposition': 'attachment; filename="SAE-' + r.recordKey + '.txt"',
        'Cache-Control': 'no-store',
      });
      return res.end('\uFEFF' + text, 'utf8');
    } catch (err) { return apiError(res, err); }
  }

  // ---- P2：CDISC ODM XML 导出（受试者 + 访视数据） ----
  if (parts[2] === 'odm.xml') {
    const body = buildOdmXml();
    res.writeHead(200, {
      'Content-Type': 'application/xml; charset=utf-8',
      'Content-Disposition': 'attachment; filename="leebertycr-odm.xml"',
      'Cache-Control': 'no-store',
    });
    return res.end(body, 'utf8');
  }

  // ---- P2：SAS 友好 CSV 导出 ----
  if (parts[2] === 'sas.csv') {
    const rows = [['STUDYID', 'SITEID', 'SUBJID', 'STATUS', 'SCREEN_DATE', 'CONSENT_DATE', 'ENROLL_DATE', 'VISITS_PLANNED', 'VISITS_DONE']];
    const all = subjects.listSubjects({}).subjects;
    for (const s of all) {
      rows.push([(s.protocolCode || 'DEMO'), s.site, s.subjectNo, s.status,
        s.screenDate || '', s.consentDate || '', s.enrolledDate || '',
        String(s.visitCount), String(s.visitsDone)]);
    }
    return sendCsv(res, 'subjects-sas.csv', rows);
  }

  sendJson(res, 404, { error: '未知导出' });
  return true;
}

/** 由 SAE 追踪记录生成监管/伦理报送稿草稿（教学用：真实报送须走申办方安全数据库）。 */
function buildSaeReport(r) {
  const data = {};
  for (const s of r.steps || []) {
    if (s.formData) for (const k of Object.keys(s.formData)) data[s.code + '.' + k] = s.formData[k];
  }
  const val = (k) => (data[k] === undefined ? '（未填写）' : String(data[k]));
  const lines = [];
  lines.push('==============================================================');
  lines.push('  严重不良事件（SAE）报告稿 · 草稿');
  lines.push('  记录编号：' + r.recordKey + '　流程：' + r.processName + '　当前状态：' + r.status);
  lines.push('  生成时间：' + new Date().toISOString());
  lines.push('  生成人：' + (r.author && r.author.name ? r.author.name : '') + '（' + ((r.author && r.author.role) || '') + '）');
  lines.push('==============================================================');
  lines.push('');
  lines.push('【一、报告类型与时限】');
  lines.push('  报告类型：' + val('triage.category'));
  lines.push('  首次获知时间（第 0 天）：' + val('triage.awarenessAt'));
  lines.push('  24 小时时限（致死/危及生命）：' + val('triage.notifyDeadline'));
  lines.push('  ※ 法规提示：致死或危及生命的 SUSAR，申办方须在首次获知后 7 日内报告、15 日内补充；');
  lines.push('     严重且非预期者 15 日内报告。（ICH E2A / 《药物临床试验质量管理规范》相关要求）');
  lines.push('');
  lines.push('【二、受试者与事件基本信息】');
  lines.push('  受试者编号（伪匿名）：' + val('triage.subjectNo'));
  lines.push('  发生日期：' + val('triage.onsetDate'));
  lines.push('  事件描述：' + val('triage.eventDescription'));
  lines.push('  严重性判定：' + val('triage.seriousness'));
  lines.push('');
  lines.push('【三、因果关系与预期性判断】');
  lines.push('  与试验药物的因果关系：' + val('assess.causality'));
  lines.push('  是否预期（IB/说明书已列明）：' + val('assess.expected'));
  lines.push('  是否为 SUSAR：' + val('assess.susar'));
  lines.push('');
  lines.push('【四、报告与递交】');
  lines.push('  申办方安全部门接收时间：' + val('notify.sponsorAt'));
  lines.push('  伦理委员会递交时间：' + val('notify.irbAt'));
  lines.push('  监管机构递交时间：' + val('notify.regulatorAt'));
  lines.push('  随访报告安排：' + val('notify.followUpPlan'));
  lines.push('');
  lines.push('【五、处理与转归】');
  lines.push('  医疗处理：' + val('followup.treatment'));
  lines.push('  转归：' + val('followup.outcome'));
  lines.push('  是否揭盲：' + val('followup.unblinded'));
  lines.push('');
  lines.push('--------------------------------------------------------------');
  lines.push('【记录流转历史】');
  for (const h of r.history || []) {
    lines.push('  ' + h.at + '  ' + h.action + '  ' + (h.role || '') + '  ' + (h.actor || '') + '  ' + (h.comment || ''));
  }
  lines.push('');
  lines.push('※ 本文件由 LeebertyCR 生成，仅用于教学演练；不得直接作为真实 SAE 报告提交。');
  return lines.join('\r\n');
}

/** 最小可用 CDISC ODM 1.3.2 XML：Study/MetaData + ClinicalData（受试者与访视）。 */
function buildOdmXml() {
  const esc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const all = subjects.listSubjects({}).subjects;
  const forms = subjects.loadForms().forms || [];
  const odm = [];
  odm.push('<?xml version="1.0" encoding="UTF-8"?>');
  odm.push('<ODM xmlns="http://www.cdisc.org/ns/odm/v1.3" ODMVersion="1.3.2" FileType="Snapshot" FileOID="LeebertyCR.' + Date.now() + '" CreationDateTime="' + new Date().toISOString() + '">');
  odm.push('  <Study OID="LeebertyCR.DEMO">');
  odm.push('    <GlobalVariables><StudyName>LeebertyCR Demo Study</StudyName><StudyDescription>CRA/CRC 工作台教学数据（伪匿名）</StudyDescription><ProtocolName>DEMO-2026-001</ProtocolName></GlobalVariables>');
  odm.push('    <MetaData Version="1.0.0" OID="MD.1">');
  for (const f of forms) {
    odm.push('      <FormDef OID="FORM.' + esc(f.id) + '" Name="' + esc(f.title) + '" Repeating="Yes">');
    const ids = (f.fields || []).map((x) => 'IG.' + esc(f.id) + '.' + esc(x.key));
    odm.push('        <ItemGroupRef ItemGroupOID="IG.' + esc(f.id) + '"/>');
    odm.push('      </FormDef>');
    odm.push('      <ItemGroupDef OID="IG.' + esc(f.id) + '" Name="' + esc(f.id) + '" Repeating="Yes">');
    for (const fld of f.fields || []) {
      odm.push('        <ItemRef ItemOID="IT.' + esc(f.id) + '.' + esc(fld.key) + '" Mandatory="' + (fld.required ? 'Yes' : 'No') + '"/>');
    }
    odm.push('      </ItemGroupDef>');
    for (const fld of f.fields || []) {
      odm.push('      <ItemDef OID="IT.' + esc(f.id) + '.' + esc(fld.key) + '" Name="' + esc(fld.key) + '" DataType="' + (fld.type === 'number' ? 'float' : 'text') + '">');
      odm.push('        <Description><TranslatedText xml:lang="zh">' + esc(fld.label) + '</TranslatedText></Description>');
      odm.push('      </ItemDef>');
    }
    void ids;
  }
  odm.push('    </MetaData>');
  odm.push('    <ClinicalData StudyOID="LeebertyCR.DEMO" MetaDataVersionOID="1.0.0">');
  for (const s of all) {
    odm.push('      <SubjectData SubjectKey="' + esc(s.subjectNo) + '">');
    const full = safeGetSubject(s.id);
    for (const v of (full && full.visits) || []) {
      odm.push('        <StudyEventData StudyEventOID="SE.' + esc(v.name.replace(/\s+/g, '_')) + '" StudyEventRepeatKey="' + esc(v.id) + '">');
      if (v.formId) {
        odm.push('          <FormData FormOID="FORM.' + esc(v.formId) + '" FormRepeatKey="1">');
        odm.push('            <ItemGroupData ItemGroupOID="IG.' + esc(v.formId) + '" ItemGroupRepeatKey="1">');
        for (const k of Object.keys(v.data || {})) {
          odm.push('              <ItemData ItemOID="IT.' + esc(v.formId) + '.' + esc(k) + '" Value="' + esc(v.data[k]) + '"/>');
        }
        odm.push('            </ItemGroupData>');
        odm.push('          </FormData>');
      }
      odm.push('        </StudyEventData>');
    }
    odm.push('      </SubjectData>');
  }
  odm.push('    </ClinicalData>');
  odm.push('  </Study>');
  odm.push('</ODM>');
  return odm.join('\n');
}

function safeGetSubject(id) {
  try { return subjects.getSubject(id); } catch { return null; }
}

/* ------------------------------------------------------------------ 记录路由 */

async function handleRecords(req, res, parts, url) {
  const authorized = requireUser(req, res, auth.PERMISSIONS.RECORD_VIEW);
  if (!authorized) return;
  const user = authorized.user;

  if (parts.length === 2) {
    if (req.method === 'GET') {
      const filters = Object.fromEntries(url.searchParams);
      try {
        return sendJson(res, 200, { records: workflow.listRecords(filters), types: workflow.typeSummary() });
      } catch (err) { return apiError(res, err); }
    }
    if (req.method === 'POST') {
      const got = requireUser(req, res, auth.PERMISSIONS.RECORD_CREATE);
      if (!got) return;
      const body = JSON.parse(await readBody(req));
      try {
        return sendJson(res, 201, workflow.createRecord(body, got.user));
      } catch (err) { return apiError(res, err); }
    }
    return sendJson(res, 405, { error: 'Method Not Allowed' });
  }

  const recordKey = decodeURIComponent(parts[2]);
  if (parts.length === 3 && parts[2] === 'seed-demo' && req.method === 'POST') {
    const got = requireUser(req, res);
    if (!got) return;
    try { return sendJson(res, 200, workflow.reseedDemoRecords(got.user)); }
    catch (err) { return apiError(res, err); }
  }
  if (parts.length === 3 && req.method === 'GET') {
    try { return sendJson(res, 200, workflow.getRecord(recordKey)); }
    catch (err) { return apiError(res, err); }
  }
  if (parts.length === 3 && req.method === 'DELETE') {
    const got = requireUser(req, res, auth.PERMISSIONS.RECORD_DELETE);
    if (!got) return;
    try { return sendJson(res, 200, workflow.deleteRecord(recordKey, got.user)); }
    catch (err) { return apiError(res, err); }
  }
  if (parts.length === 4 && parts[3] === 'step' && req.method === 'POST') {
    const got = requireUser(req, res, auth.PERMISSIONS.RECORD_STEP);
    if (!got) return;
    const body = JSON.parse(await readBody(req));
    try { return sendJson(res, 200, workflow.completeStep(recordKey, body, got.user)); }
    catch (err) { return apiError(res, err); }
  }
  if (parts.length === 4 && parts[3] === 'cancel' && req.method === 'POST') {
    const got = requireUser(req, res, auth.PERMISSIONS.RECORD_CANCEL);
    if (!got) return;
    const body = JSON.parse(await readBody(req));
    try { return sendJson(res, 200, workflow.cancelRecord(recordKey, body, got.user)); }
    catch (err) { return apiError(res, err); }
  }
  // 版本历史与重建（P0）
  if (parts.length === 4 && parts[3] === 'versions' && req.method === 'GET') {
    try { return sendJson(res, 200, { key: recordKey, versions: workflow.listVersions(recordKey) }); }
    catch (err) { return apiError(res, err); }
  }
  if (parts.length === 5 && parts[3] === 'versions' && req.method === 'GET') {
    try { return sendJson(res, 200, workflow.getVersion(recordKey, Number(parts[4]))); }
    catch (err) { return apiError(res, err); }
  }
  sendJson(res, 404, { error: '未知接口' });
}

/* ------------------------------------------------------------------ 受试者 / 访视 / eCRF 路由 */

async function handleSubjects(req, res, parts, url) {
  const got = requireUser(req, res, auth.PERMISSIONS.RECORD_VIEW);
  if (!got) return;
  const user = got.user;

  // 日历导出（iCal）：可导入 Outlook / Google 日历
  if (parts[2] === 'calendar.ics' && req.method === 'GET') {
    const days = Number(url.searchParams.get('days')) || 60;
    const ics = subjects.toIcal(subjects.upcoming(days));
    res.writeHead(200, {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'attachment; filename="visit-calendar.ics"',
      'Cache-Control': 'no-store',
    });
    return res.end(ics, 'utf8');
  }

  // 临期/逾期访视
  if (parts[2] === 'upcoming' && req.method === 'GET') {
    const days = Number(url.searchParams.get('days')) || 30;
    return sendJson(res, 200, { days, visits: subjects.upcoming(days) });
  }

  // 表单定义（供原生/网页渲染 eCRF）
  if (parts[2] === 'forms' && req.method === 'GET') {
    return sendJson(res, 200, subjects.loadForms());
  }

  // 演示受试者补生成
  if (parts[2] === 'seed-demo' && req.method === 'POST') {
    try { return sendJson(res, 200, subjects.reseedDemoSubjects(user)); }
    catch (err) { return apiError(res, err); }
  }

  // 集合：GET 列表 / POST 新建
  if (parts.length === 2) {
    if (req.method === 'GET') {
      return sendJson(res, 200, subjects.listSubjects({
        status: url.searchParams.get('status') || null,
        site: url.searchParams.get('site') || null,
        search: url.searchParams.get('search') || null,
      }));
    }
    if (req.method === 'POST') {
      const body = JSON.parse(await readBody(req));
      try { return sendJson(res, 201, subjects.createSubject(body, user)); }
      catch (err) { return apiError(res, err); }
    }
    return sendJson(res, 405, { error: 'Method Not Allowed' });
  }

  const subjectId = decodeURIComponent(parts[2]);

  // 单个受试者：GET / PUT / DELETE
  if (parts.length === 3) {
    if (req.method === 'GET') {
      try { return sendJson(res, 200, subjects.getSubject(subjectId)); }
      catch (err) { return apiError(res, err); }
    }
    if (req.method === 'PUT') {
      const body = JSON.parse(await readBody(req));
      try { return sendJson(res, 200, subjects.updateSubject(subjectId, body, user)); }
      catch (err) { return apiError(res, err); }
    }
    if (req.method === 'DELETE') {
      try { return sendJson(res, 200, subjects.deleteSubject(subjectId, user)); }
      catch (err) { return apiError(res, err); }
    }
    return sendJson(res, 405, { error: 'Method Not Allowed' });
  }

  // 访视集合：POST /subjects/:id/visits
  if (parts.length === 4 && parts[3] === 'visits') {
    if (req.method === 'POST') {
      const body = JSON.parse(await readBody(req));
      try { return sendJson(res, 201, subjects.addVisit(subjectId, body, user)); }
      catch (err) { return apiError(res, err); }
    }
    return sendJson(res, 405, { error: 'Method Not Allowed' });
  }

  // 单个访视：PUT / DELETE /subjects/:id/visits/:visitId
  if (parts.length === 5 && parts[3] === 'visits') {
    const visitId = decodeURIComponent(parts[4]);
    if (req.method === 'PUT') {
      const body = JSON.parse(await readBody(req));
      try { return sendJson(res, 200, subjects.updateVisit(subjectId, visitId, body, user)); }
      catch (err) { return apiError(res, err); }
    }
    if (req.method === 'DELETE') {
      try { return sendJson(res, 200, subjects.deleteVisit(subjectId, visitId, user)); }
      catch (err) { return apiError(res, err); }
    }
    return sendJson(res, 405, { error: 'Method Not Allowed' });
  }

  sendJson(res, 404, { error: '未知接口' });
  return true;
}

/* ------------------------------------------------------------------ eTMF 文档路由 */

async function handleDocuments(req, res, parts) {
  const got = requireUser(req, res, auth.PERMISSIONS.RECORD_VIEW);
  if (!got) return;
  const user = got.user;

  // 缺口扫描（必需文件对照）
  if (parts[2] === 'gaps' && req.method === 'GET') {
    return sendJson(res, 200, documents.gaps());
  }
  if (parts[2] === 'seed-demo' && req.method === 'POST') {
    try { return sendJson(res, 200, documents.reseedDemoDocs(user)); }
    catch (err) { return apiError(res, err); }
  }

  if (parts.length === 2) {
    if (req.method === 'GET') {
      return sendJson(res, 200, documents.list({}));
    }
    if (req.method === 'POST') {
      const body = JSON.parse(await readBody(req));
      try { return sendJson(res, 201, documents.createDoc(body, user)); }
      catch (err) { return apiError(res, err); }
    }
    return sendJson(res, 405, { error: 'Method Not Allowed' });
  }

  const docId = decodeURIComponent(parts[2]);
  if (parts.length === 3) {
    if (req.method === 'GET') {
      try { return sendJson(res, 200, documents.getDoc(docId)); }
      catch (err) { return apiError(res, err); }
    }
    if (req.method === 'DELETE') {
      try { return sendJson(res, 200, documents.deleteDoc(docId, user)); }
      catch (err) { return apiError(res, err); }
    }
    return sendJson(res, 405, { error: 'Method Not Allowed' });
  }
  if (parts.length === 4 && parts[3] === 'transition' && req.method === 'POST') {
    const body = JSON.parse(await readBody(req));
    try { return sendJson(res, 200, documents.transitionDoc(docId, body, user)); }
    catch (err) { return apiError(res, err); }
  }
  sendJson(res, 404, { error: '未知接口' });
  return true;
}

/* ------------------------------------------------------------------ 权限声明 */

const MUTABLE_KEYS = new Set(['role', 'learnerName', 'checklists', 'tasks', 'quiz', 'read']);

/* ------------------------------------------------------------------ 启动 */

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://' + (req.headers.host || 'localhost'));
    if (url.pathname.startsWith('/api/')) {
      await handleApi(req, res, url);
      return;
    }
    serveStatic(req, res, url.pathname);
  } catch (err) {
    try {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Internal error: ' + err.message);
    } catch { /* 连接已断，忽略 */ }
  }
});

server.listen(PORT, HOST, () => {
  const url = `http://${HOST === '0.0.0.0' ? '127.0.0.1' : HOST}:${PORT}`;
  const nChecklists = content.checklists.checklists.length;
  const nTasks = content['cra-tasks'].tasks.length + content['crc-tasks'].tasks.length;
  const nQuiz = content.quiz.questions.length;
  const nWorkflows = content.workflows.workflows.length;
  let nRecords = 0;
  try { nRecords = store.loadRecords().records.length; } catch (e) { /* ignore */ }
  const banner = [
    '',
    '  ============================================================',
    `   ${APP.name}   v${APP.version}`,
    `   ${APP.nameEn}`,
    '  ============================================================',
    '',
    `   访问地址 / URL      ${url}`,
    `   数据目录 / Data     ${store.DATA_DIR}`,
    `   Node 版本           ${process.version}`,
    '',
    `   内容库   / Library  ${content.lifecycle.phases.length} 个生命周期阶段，${nTasks} 张岗位任务卡`,
    `                       ${nChecklists} 张核查清单，${content.templates.templates.length} 份文件模板`,
    `                       ${nQuiz} 道场景练习，${content.workflows.workflows ? nWorkflows + ' 条工作流' : ''}`,
    '',
    `   账号库   / Accounts ${startUsers.length} 个账号，工作流记录 ${nRecords} 条`,
    '',
  ];
  if (config.builtinAccounts) {
    banner.push(
      '   ------------------------------------------------------------',
      `   演示口令 / Demo password（内置演示账号，含 admin）:`,
      `     ${config.security.demoPassword}`,
      '',
      '   ⚠  演示配置：口令公开且各演示账号共用，仅用于学习。真实环境',
      '      必须为每人签发独立凭证（21 CFR Part 11.300(a) 账号唯一）。',
      '      关闭演示账号：CRA_BUILTIN_ACCOUNTS=0 重启（首次走建号流程）。',
      ''
    );
  } else {
    banner.push(
      '   ------------------------------------------------------------',
      '   未启用内置演示账号：首次使用请在登录页创建第一个管理员账号。',
      ''
    );
  }
  banner.push(
    '   安全：scrypt 口令 · 失败锁定 · 会话超时 · 双要素签名（口令+挑战码）',
    '   留痕：data/security.log（只追加安全日志）',
    '',
    '   界面：原生桌面窗口（LeebertyCR.exe）；Web 界面仅作为可选的备用访问方式',
    '         （浏览器访问本地址即可；应用窗口本身不依赖任何浏览器）',
    '',
    HOST === '127.0.0.1'
      ? '   仅监听本机 / localhost only. 局域网共享请设 CRA_HOST=0.0.0.0。'
      : `   已发布在 ${HOST} / published on LAN.`,
    '',
    '   Ctrl+C 停止 / press Ctrl+C to stop.',
    ''
  );
  console.log(banner.join('\n'));
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n  [错误] 端口 ${PORT} 已被占用 —— 工作台可能已经在运行。\n  换个端口：CRA_PORT=8817 node src/server.js\n`);
  } else {
    console.error('服务器错误:', err);
  }
  process.exit(1);
});