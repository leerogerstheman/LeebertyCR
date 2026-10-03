'use strict';

/**
 * auth.js - 认证、会话控制、权限矩阵与电子签名（参考 GxP-Workbench src/core/auth.js + rbac.js）。
 *
 * 法规锚点（与 GxP 相同）：
 *  - 21 CFR Part 11.10(d)  仅限授权人员访问系统
 *  - 21 CFR Part 11.200(a)(1)(i)  签名至少两个独立要素：标识码 + 口令 +（一次性挑战码）
 *  - 21 CFR Part 11.200(a)(2)/(3) 签名须含打印姓名、日期、含义并关联记录
 *  - EU GMP Annex 11 §12.1  唯一登录、禁用共享账号、职责分离
 *  - 21 CFR Part 11.300(b)  口令定期检查/回收
 */

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const config = require('./config');
const store = require('./store');
const audit = require('./core/audit');

const SEC = () => config.security;
const nowIso = () => new Date().toISOString();
const addMs = (ms) => new Date(Date.now() + ms).toISOString();

function httpError(status, code, message) {
  const err = new Error(message || code);
  err.status = status;
  err.errCode = code;
  return err;
}

/* ------------------------------------------------------------------ 权限矩阵 */

const PERMISSIONS = {
  CONTENT_VIEW: 'content.view',        // 浏览学习内容（含匿名）
  CHECKLIST_USE: 'checklist.use',      // 使用核查清单（匿名可用但不持久化）
  TASK_USE: 'task.use',                // 个人任务台（按账号隔离）
  RECORD_VIEW: 'record.view',          // 查看工作流记录
  RECORD_CREATE: 'record.create',      // 新建记录
  RECORD_STEP: 'record.step',          // 推进步骤（步骤角色门另行校验）
  RECORD_CANCEL: 'record.cancel',      // 取消记录
  RECORD_DELETE: 'record.delete',      // 删除记录（仅演示记录；仅管理员）
  SIGNATURE_USE: 'signature.use',      // 电子签名（双要素）
  USER_VIEW: 'user.view',              // 查看用户
  USER_MANAGE: 'user.manage',          // 管理用户（建号/禁启/重置密码）
  AUDIT_VIEW: 'audit.view',            // 查看安全日志
  PASSWORD_SELF: 'password.self',      // 自助修改本人密码
};

const READ_ONLY = [PERMISSIONS.CONTENT_VIEW, PERMISSIONS.CHECKLIST_USE, PERMISSIONS.RECORD_VIEW];

const ROLES = {
  admin: {
    label: 'System Administrator',
    labelZh: '系统管理员',
    description: '用户、角色与系统配置的技术管理员。拥有全部管理权限，但不得作为 GxP 工作流记录的唯一签署人（步骤角色门不含 admin）。',
    permissions: ['*'],
    isGxPRecordParty: false,
  },
  qa: {
    label: 'QA Specialist',
    labelZh: 'QA 专员 / 独立复核',
    description: '质量保证与独立复核：关闭、放行类步骤的独立签署人，可查看安全日志。',
    permissions: [
      ...READ_ONLY, PERMISSIONS.TASK_USE, PERMISSIONS.AUDIT_VIEW,
      PERMISSIONS.RECORD_CREATE, PERMISSIONS.RECORD_STEP, PERMISSIONS.RECORD_CANCEL,
      PERMISSIONS.SIGNATURE_USE, PERMISSIONS.PASSWORD_SELF,
    ],
    isGxPRecordParty: true,
  },
  cra: {
    label: 'Clinical Research Associate',
    labelZh: 'CRA 临床监查员',
    description: '申办者一方：监查、SDV、随访信、问题闭环；可新建并推进工作流记录。',
    permissions: [
      ...READ_ONLY, PERMISSIONS.TASK_USE,
      PERMISSIONS.RECORD_CREATE, PERMISSIONS.RECORD_STEP, PERMISSIONS.RECORD_CANCEL,
      PERMISSIONS.SIGNATURE_USE, PERMISSIONS.PASSWORD_SELF,
    ],
    isGxPRecordParty: true,
  },
  crc: {
    label: 'Clinical Research Coordinator',
    labelZh: 'CRC 临床协调员',
    description: '研究中心一方：受试者安排、数据录入、AE 上报、药物账目；可新建并推进工作流记录。',
    permissions: [
      ...READ_ONLY, PERMISSIONS.TASK_USE,
      PERMISSIONS.RECORD_CREATE, PERMISSIONS.RECORD_STEP, PERMISSIONS.RECORD_CANCEL,
      PERMISSIONS.SIGNATURE_USE, PERMISSIONS.PASSWORD_SELF,
    ],
    isGxPRecordParty: true,
  },
  pi: {
    label: 'Principal Investigator',
    labelZh: '主要研究者',
    description: '研究中心责任主体：知情同意、医学评估与签署；可新建并推进工作流记录。',
    permissions: [
      ...READ_ONLY, PERMISSIONS.TASK_USE,
      PERMISSIONS.RECORD_CREATE, PERMISSIONS.RECORD_STEP, PERMISSIONS.RECORD_CANCEL,
      PERMISSIONS.SIGNATURE_USE, PERMISSIONS.PASSWORD_SELF,
    ],
    isGxPRecordParty: true,
  },
};

const ROLE_ORDER = ['cra', 'crc', 'pi', 'qa', 'admin'];

function permissionsFor(role) {
  if (ROLES[role] && ROLES[role].permissions.includes('*')) return Object.values(PERMISSIONS);
  return ROLES[role] ? [...ROLES[role].permissions] : [];
}

function can(role, permission) {
  if (role === 'admin') return true;
  return permissionsFor(role).includes(permission);
}

function publicMeta() {
  return {
    builtinEnabled: config.builtinAccounts,
    // 演示实例契约：内置账号时公开演示口令（与 GxP 登录页给出演示口令提示相同）
    demoPassword: config.builtinAccounts ? SEC().demoPassword : null,
    roles: Object.fromEntries(Object.entries(ROLES).map(([code, r]) => [
      code, { label: r.label, labelZh: r.labelZh, description: r.description, isGxPRecordParty: r.isGxPRecordParty, permissions: permissionsFor(code) },
    ])),
    permissions: Object.values(PERMISSIONS),
    policy: {
      passwordMinLength: SEC().passwordMinLength,
      passwordRequireClasses: SEC().passwordRequireClasses,
      passwordHistoryDepth: SEC().passwordHistoryDepth,
      passwordMaxAgeDays: SEC().passwordMaxAgeDays,
      maxFailedLogins: SEC().maxFailedLogins,
      lockoutMinutes: SEC().lockoutMinutes,
      idleTimeoutMinutes: SEC().idleTimeoutMinutes,
      sessionAbsoluteHours: SEC().sessionAbsoluteHours,
      signatureTtlSeconds: SEC().signatureTtlSeconds,
    },
  };
}

/* ------------------------------------------------------------------ 口令 */

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, 64, { N: 16384, r: 8, p: 1 }).toString('hex');
  return `scrypt$16384$8$1$${salt}$${hash}`;
}

function verifyPassword(password, stored) {
  try {
    if (!stored || typeof stored !== 'string') return false;
    const parts = stored.split('$');
    if (parts[0] !== 'scrypt' || parts.length !== 6) return false;
    const salt = parts[4];
    const hash = parts[5];
    const expected = crypto.scryptSync(String(password || ''), salt, 64, { N: +parts[1], r: +parts[2], p: +parts[3] });
    const actual = Buffer.from(hash, 'hex');
    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

const COMMON_PASSWORDS = new Set([
  'password', 'password1', 'passw0rd', 'welcome', 'welcome1', 'letmein',
  'admin', 'admin123', 'administrator', 'qwerty', 'qwerty123', 'abc123',
  'iloveyou', '111111', '123123', '1q2w3e4r', 'changeme', 'root', '12345678',
]);

function validatePassword(password, user) {
  const errors = [];
  const p = String(password || '');
  const pol = SEC();
  if (p.length < pol.passwordMinLength) errors.push(`PASSWORD_TOO_SHORT: 至少 ${pol.passwordMinLength} 个字符`);
  if (p.length > 200) errors.push('PASSWORD_TOO_LONG');
  const classes = [/[a-z]/.test(p), /[A-Z]/.test(p), /[0-9]/.test(p), /[^A-Za-z0-9]/.test(p)].filter(Boolean).length;
  if (classes < pol.passwordRequireClasses) errors.push(`PASSWORD_TOO_SIMPLE: 至少包含 ${pol.passwordRequireClasses} 类字符（小写/大写/数字/符号）`);
  if (/^(.)\1+$/.test(p)) errors.push('PASSWORD_REPEATED_CHARACTER: 不能全部是同一个字符');
  if (COMMON_PASSWORDS.has(p.toLowerCase())) errors.push('PASSWORD_COMMON: 常用口令不安全');
  if (user && user.username && p.toLowerCase().includes(String(user.username).toLowerCase())) errors.push('PASSWORD_CONTAINS_USERNAME: 口令不能包含用户名');
  if (p.toLowerCase().includes('password') || p.includes('123456')) errors.push('PASSWORD_PREDICTABLE: 口令过于可预测');
  if (user && Array.isArray(user.passwordHistory)) {
    for (const h of user.passwordHistory) {
      if (verifyPassword(p, h)) { errors.push(`PASSWORD_REUSED: 不能复用最近 ${pol.passwordHistoryDepth} 次口令`); break; }
    }
  }
  return { ok: errors.length === 0, errors };
}

/* ------------------------------------------------------------------ 账号库 */

function emptyUsers() { return []; }

function loadUsers() {
  store.ensureDataDir();
  if (!fs.existsSync(store.USERS_FILE)) return emptyUsers();
  try {
    const raw = JSON.parse(fs.readFileSync(store.USERS_FILE, 'utf8'));
    return Array.isArray(raw) ? raw.filter((u) => u && u.username) : [];
  } catch {
    return emptyUsers();
  }
}

function saveUsers(users) {
  store.ensureDataDir();
  const tmp = store.USERS_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(users, null, 2), 'utf8');
  fs.renameSync(tmp, store.USERS_FILE);
}

function getUserByUsername(username) {
  return loadUsers().find((u) => u.username === String(username || '').trim()) || null;
}

function publicUser(u) {
  if (!u) return null;
  const ageDays = u.passwordChangedAt ? (Date.now() - Date.parse(u.passwordChangedAt)) / 86400000 : null;
  return {
    id: u.username,
    username: u.username,
    fullName: u.fullName || u.username,
    role: u.role,
    roleLabel: (ROLES[u.role] || {}).labelZh || u.role,
    department: u.department || null,
    status: u.status,
    isDemo: Boolean(u.isDemo),
    mustChangePassword: Boolean(u.mustChangePassword),
    passwordExpired: SEC().passwordMaxAgeDays ? (ageDays != null && ageDays > SEC().passwordMaxAgeDays) : false,
    lastLoginAt: u.lastLoginAt || null,
    permissions: permissionsFor(u.role),
    readOnly: false,
  };
}

/** 内置演示账号（GxP_BUILTIN_ACCOUNTS 同款）：统一口令，界面明确标注演示风险。 */
function seedBuiltinAccounts() {
  const users = loadUsers();
  if (users.length) return users;
  const pw = hashPassword(SEC().demoPassword);
  const at = nowIso();
  const personas = [
    { username: 'admin', fullName: '系统管理员', role: 'admin', department: 'IT/系统管理' },
    { username: 'demo_cra', fullName: '林晓（CRA）', role: 'cra', department: '临床运营（申办者侧）' },
    { username: 'demo_crc', fullName: '陈语（CRC）', role: 'crc', department: '临床研究机构' },
    { username: 'demo_pi', fullName: '王建军（研究者）', role: 'pi', department: '研究中心' },
    { username: 'demo_qa', fullName: '赵敏（QA）', role: 'qa', department: '质量保证' },
  ];
  const seeded = personas.map((p) => ({
    username: p.username,
    fullName: p.fullName,
    role: p.role,
    department: p.department || null,
    status: 'active',
    failedAttempts: 0,
    lockedUntil: null,
    passwordHash: pw,
    passwordChangedAt: at,
    mustChangePassword: false,
    passwordHistory: [],
    createdAt: at,
    lastLoginAt: null,
    isDemo: true,
  }));
  saveUsers(seeded);
  logEvent('accounts_seeded', { count: seeded.length, note: '内置演示账号已创建（统一演示口令）' });
  return seeded;
}

/* ------------------------------------------------------------------ 安全日志（哈希链审计） */

function logEvent(event, fields) {
  try {
    audit.append({ event, ...(fields || {}) });
  } catch { /* 日志失败不阻断业务 */ }
}

/** 返回 { entries, chain }：entries 为最近 limit 条；chain 为全链完整性摘要 */
function readAudit(limit = 100) {
  try {
    return {
      chain: audit.verify(),
      entries: audit.tail(limit),
    };
  } catch {
    return { chain: { ok: false, count: 0, error: 'audit 模块异常' }, entries: [] };
  }
}

function auditVerify() {
  return audit.verify();
}

/* ------------------------------------------------------------------ 会话 */

const SESSIONS_FILE = () => path.join(store.DATA_DIR, 'sessions.json');
let sessions = null; // { token: {userId, createdAt, lastSeenAt, expiresAt, revokedAt, revokeReason} }

function loadSessions() {
  if (sessions) return sessions;
  sessions = {};
  try {
    if (fs.existsSync(SESSIONS_FILE())) {
      sessions = JSON.parse(fs.readFileSync(SESSIONS_FILE(), 'utf8')) || {};
    }
  } catch { sessions = {}; }
  return sessions;
}

function persistSessions() {
  try {
    const tmp = SESSIONS_FILE() + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(sessions, null, 0), 'utf8');
    fs.renameSync(tmp, SESSIONS_FILE());
  } catch { /* 忽略 */ }
}

function createSession(user) {
  loadSessions();
  const token = crypto.randomBytes(32).toString('hex');
  const now = nowIso();
  sessions[token] = {
    userId: user.username,
    createdAt: now,
    lastSeenAt: now,
    expiresAt: addMs(SEC().sessionAbsoluteHours * 3600000),
    revokedAt: null,
    revokeReason: null,
  };
  persistSessions();
  return token;
}

function revokeSession(token, reason) {
  loadSessions();
  const s = sessions[token];
  if (s && !s.revokedAt) {
    s.revokedAt = nowIso();
    s.revokeReason = reason || 'logout';
    persistSessions();
  }
}

function revokeAllSessions(username, exceptToken, reason) {
  loadSessions();
  let changed = false;
  for (const t of Object.keys(sessions)) {
    const s = sessions[t];
    if (s.userId === username && !s.revokedAt && t !== exceptToken) {
      s.revokedAt = nowIso();
      s.revokeReason = reason || 'revoked';
      changed = true;
    }
  }
  if (changed) persistSessions();
}

/** 会话解析：空闲超时 / 绝对超时 / 撤销 / 账号状态（与 GxP resolveSession 同构）。 */
function resolveSession(token) {
  if (!token) return { user: null, reason: 'NO_SESSION' };
  loadSessions();
  const s = sessions[token];
  if (!s) return { user: null, reason: 'NO_SESSION' };
  if (s.revokedAt) return { user: null, reason: 'SESSION_REVOKED' };
  const now = Date.now();
  if (Date.parse(s.expiresAt) < now) {
    revokeSession(token, 'absolute timeout');
    return { user: null, reason: 'SESSION_EXPIRED' };
  }
  if (now - Date.parse(s.lastSeenAt) > SEC().idleTimeoutMinutes * 60000) {
    revokeSession(token, 'idle timeout');
    return { user: null, reason: 'IDLE_TIMEOUT' };
  }
  const user = getUserByUsername(s.userId);
  if (!user) return { user: null, reason: 'USER_NOT_FOUND' };
  if (user.status !== 'active') return { user: null, reason: `ACCOUNT_${String(user.status).toUpperCase()}` };
  s.lastSeenAt = nowIso();
  return { user, reason: null };
}

/* ------------------------------------------------------------------ 登录 */

function login({ username, password }) {
  const pol = SEC();
  const uname = String(username || '').trim();
  const user = getUserByUsername(uname);
  const record = (success, reason, userId, extra) => {
    logEvent(success ? 'login_success' : 'login_failure', {
      username: uname, userId: userId || null, reason: reason || null, ...(extra || {}),
    });
  };

  if (!user) {
    // 恒定工作量，避免暴露用户名是否存在（GxP 同款做法）
    verifyPassword(String(password || ''), 'scrypt$16384$8$1$00$00');
    record(false, 'unknown user');
    return { ok: false, code: 'INVALID_CREDENTIALS', message: '用户名或口令不正确' };
  }
  if (user.status === 'disabled') {
    record(false, 'account disabled', user.username);
    return { ok: false, code: 'ACCOUNT_DISABLED', message: '该账号已被禁用，请联系管理员' };
  }
  if (user.lockedUntil && Date.parse(user.lockedUntil) > Date.now()) {
    record(false, 'account locked', user.username, { until: user.lockedUntil });
    return { ok: false, code: 'ACCOUNT_LOCKED', message: '账号已因多次登录失败被锁定，请稍后再试', until: user.lockedUntil };
  }

  if (!verifyPassword(String(password || ''), user.passwordHash)) {
    const users = loadUsers();
    const u = users.find((x) => x.username === user.username);
    u.failedAttempts = (u.failedAttempts || 0) + 1;
    const lock = u.failedAttempts >= pol.maxFailedLogins;
    if (lock) {
      u.lockedUntil = addMs(pol.lockoutMinutes * 60000);
      u.status = 'locked';
    }
    saveUsers(users);
    record(false, `bad password (attempt ${u.failedAttempts}/${pol.maxFailedLogins})`, user.username);
    return {
      ok: false,
      code: lock ? 'ACCOUNT_LOCKED' : 'INVALID_CREDENTIALS',
      message: lock
        ? `口令错误次数已达上限，账号锁定 ${pol.lockoutMinutes} 分钟`
        : `用户名或口令不正确（还可尝试 ${Math.max(0, pol.maxFailedLogins - u.failedAttempts)} 次，超出将锁定 ${pol.lockoutMinutes} 分钟）`,
      attemptsLeft: Math.max(0, pol.maxFailedLogins - u.failedAttempts),
    };
  }

  const users = loadUsers();
  const u = users.find((x) => x.username === user.username);
  u.failedAttempts = 0;
  u.lockedUntil = null;
  u.status = 'active';
  u.lastLoginAt = nowIso();
  saveUsers(users);

  const token = createSession(u);
  record(true, 'ok', u.username, { role: u.role });
  return { ok: true, user: publicUser(getUserByUsername(u.username)), token };
}

function logout(token, username) {
  if (token) {
    revokeSession(token, 'logout');
    logEvent('logout', { username: username || null });
  }
}

/* ------------------------------------------------------------------ 签名挑战码 */

let signingNonces = new Map(); // nonce -> {userId, expiresAt, usedAt}

function issueSigningNonce(user, sessionToken) {
  const nonce = crypto.randomBytes(6).toString('base64').replace(/[^A-Za-z0-9]/g, '').slice(0, 8).toUpperCase() || 'ABCD1234';
  signingNonces.set(nonce, {
    userId: user.username,
    expiresAt: Date.now() + SEC().signatureTtlSeconds * 1000,
    usedAt: null,
    session: sessionToken || null,
  });
  // 清理过期
  for (const [k, v] of signingNonces) if (v.expiresAt < Date.now()) signingNonces.delete(k);
  logEvent('signature_challenge_issued', { username: user.username, ttlSeconds: SEC().signatureTtlSeconds });
  return { nonce, expiresInSec: SEC().signatureTtlSeconds };
}

function consumeSigningNonce(userId, nonce) {
  const v = signingNonces.get(String(nonce || ''));
  if (!v) return { ok: false, code: 'NONCE_INVALID', message: '验证码无效（请重新获取）' };
  if (v.userId !== userId) return { ok: false, code: 'NONCE_WRONG_USER', message: '验证码不属于当前用户' };
  if (v.usedAt) return { ok: false, code: 'NONCE_ALREADY_USED', message: '验证码已使用过（每次签署需新验证码）' };
  if (v.expiresAt < Date.now()) {
    signingNonces.delete(nonce);
    return { ok: false, code: 'NONCE_EXPIRED', message: '验证码已过期，请重新获取' };
  }
  v.usedAt = nowIso();
  return { ok: true };
}

/**
 * 双要素签名校验（21 CFR Part 11.200(a)(1)(i)）：
 *   要素 A：标识码（再次输入用户名）+ 口令
 *   要素 B：一次性挑战码（或 TOTP——本实现提供挑战码）
 */
function verifySignature(user, sign) {
  const username = String((sign && sign.username) || '');
  const password = String((sign && sign.password) || '');
  const nonce = String((sign && sign.nonce) || '');
  const reason = String((sign && sign.reason) || '').trim();

  if (username.toLowerCase() !== String(user.username).toLowerCase()) {
    logEvent('signature_failed', { username: user.username, reason: 'identity mismatch' });
    return { ok: false, code: 'SIGNATURE_IDENTITY_MISMATCH', message: '重新输入的用户名与登录账号不一致' };
  }
  const fresh = getUserByUsername(user.username);
  if (!fresh || !verifyPassword(password, fresh.passwordHash)) {
    logEvent('signature_failed', { username: user.username, reason: 'password component rejected' });
    return { ok: false, code: 'SIGNATURE_AUTH_FAILED', message: '口令不正确（签名必须重新输入口令）' };
  }
  if (!reason || reason.length < 3) {
    return { ok: false, code: 'REASON_REQUIRED', message: '签署说明至少 3 个字' };
  }
  if (SEC().signatureSecondFactor) {
    if (!nonce) {
      return { ok: false, code: 'SECOND_FACTOR_REQUIRED', message: '请先获取一次性验证码并输入（第二签名要素）' };
    }
    const consumed = consumeSigningNonce(user.username, nonce);
    if (!consumed.ok) return consumed;
  }
  return { ok: true, reason, method: 'password+challenge' };
}

/* ------------------------------------------------------------------ 用户管理 */

function listUsers() {
  return loadUsers().map(publicUser);
}

function createUser(input, actor) {
  if (!can(actor.role, PERMISSIONS.USER_MANAGE)) throw httpError(403, 'PERMISSION_DENIED', '仅系统管理员可创建用户');
  const username = String(input.username || '').trim();
  if (!/^[A-Za-z0-9_.-]{3,32}$/.test(username)) {
    throw httpError(400, 'USERNAME_INVALID', '用户名需为 3-32 位字母/数字/._-');
  }
  if (getUserByUsername(username)) throw httpError(409, 'USER_EXISTS', '用户名已存在: ' + username);
  const role = String(input.role || '');
  if (!ROLES[role]) throw httpError(400, 'ROLE_INVALID', '未知角色: ' + role);
  const fullName = String(input.fullName || '').trim();
  if (fullName.length < 2) throw httpError(400, 'NAME_REQUIRED', '姓名至少 2 个字');

  let password = String(input.password || '');
  const tempIssued = !password;
  if (!password) password = randomTempPassword();
  const check = validatePassword(password, { username });
  if (!check.ok) throw httpError(400, 'PASSWORD_POLICY', check.errors.join('; '));

  const at = nowIso();
  const users = loadUsers();
  users.push({
    username, fullName, role,
    department: String(input.department || '').trim() || null,
    status: 'active', failedAttempts: 0, lockedUntil: null,
    passwordHash: hashPassword(password), passwordChangedAt: at,
    mustChangePassword: true, passwordHistory: [],
    createdAt: at, lastLoginAt: null, isDemo: false,
  });
  saveUsers(users);
  logEvent('user_created', { actor: actor.username, username, role, tempPasswordIssued: tempIssued });
  return { ok: true, user: publicUser(getUserByUsername(username)), tempPassword: tempIssued ? password : null };
}

function randomTempPassword() {
  // 保证覆盖 4 类字符（大写/小写/数字/符号），避免被口令策略拒绝
  const sets = ['ABCDEFGHJKLMNPQRSTUVWXYZ', 'abcdefghjkmnpqrstuvwxyz', '23456789', '!@#$%'];
  let chars = '';
  let out = '';
  for (const s of sets) {
    chars += s;
    out += s[Math.floor(Math.random() * s.length)];
  }
  const rand = crypto.randomBytes(10);
  for (let i = 0; i < 10; i++) out += chars[rand[i] % chars.length];
  return out.split('').sort(() => Math.random() - 0.5).join('');
}

function setUserStatus(username, status, actor) {
  if (!can(actor.role, PERMISSIONS.USER_MANAGE)) throw httpError(403, 'PERMISSION_DENIED');
  const users = loadUsers();
  const u = users.find((x) => x.username === username);
  if (!u) throw httpError(404, 'USER_NOT_FOUND');
  if (username === actor.username && status === 'disabled') throw httpError(409, 'CANNOT_DISABLE_SELF', '不能禁用自己');
  if (!['active', 'disabled'].includes(status)) throw httpError(400, 'STATUS_INVALID');
  u.status = status;
  if (status === 'disabled') {
    u.lockedUntil = null;
    revokeAllSessions(username, null, 'account disabled');
  }
  saveUsers(users);
  logEvent('user_status_changed', { actor: actor.username, username, status });
  return { ok: true };
}

function resetPassword(username, actor) {
  if (!can(actor.role, PERMISSIONS.USER_MANAGE)) throw httpError(403, 'PERMISSION_DENIED');
  const users = loadUsers();
  const u = users.find((x) => x.username === username);
  if (!u) throw httpError(404, 'USER_NOT_FOUND');
  const temp = randomTempPassword();
  u.passwordHash = hashPassword(temp);
  u.passwordChangedAt = nowIso();
  u.mustChangePassword = true;
  u.failedAttempts = 0;
  u.lockedUntil = null;
  u.status = 'active';
  saveUsers(users);
  revokeAllSessions(username, null, 'password reset');
  logEvent('password_reset', { actor: actor.username, username });
  return { ok: true, tempPassword: temp, username };
}

function deleteUser(username, actor) {
  if (!can(actor.role, PERMISSIONS.USER_MANAGE)) throw httpError(403, 'PERMISSION_DENIED');
  if (username === actor.username) throw httpError(409, 'CANNOT_DELETE_SELF', '不能删除当前登录账号');
  const users = loadUsers();
  const idx = users.findIndex((x) => x.username === username);
  if (idx < 0) throw httpError(404, 'USER_NOT_FOUND');
  if (users[idx].role === 'admin' && users.filter((u) => u.role === 'admin' && u.status === 'active').length <= 1) {
    throw httpError(409, 'LAST_ADMIN', '系统必须保留至少一个启用的管理员账号');
  }
  users.splice(idx, 1);
  saveUsers(users);
  revokeAllSessions(username, null, 'account deleted');
  logEvent('user_deleted', { actor: actor.username, username });
  return { ok: true };
}

function changeOwnPassword(user, oldPassword, newPassword, exceptToken) {
  if (!can(user.role, PERMISSIONS.PASSWORD_SELF)) throw httpError(403, 'PERMISSION_DENIED');
  const fresh = getUserByUsername(user.username);
  if (!verifyPassword(String(oldPassword || ''), fresh.passwordHash)) {
    logEvent('password_change_failed', { username: user.username, reason: 'old password rejected' });
    throw httpError(403, 'OLD_PASSWORD_WRONG', '原口令不正确');
  }
  const check = validatePassword(newPassword, fresh);
  if (!check.ok) throw httpError(400, 'PASSWORD_POLICY', check.errors.join('; '));
  const users = loadUsers();
  const u = users.find((x) => x.username === user.username);
  u.passwordHash = hashPassword(newPassword);
  u.passwordChangedAt = nowIso();
  u.mustChangePassword = false;
  u.failedAttempts = 0;
  u.lockedUntil = null;
  u.passwordHistory = [...(u.passwordHistory || []).slice(-(SEC().passwordHistoryDepth - 1)), u.passwordHash];
  saveUsers(users);
  // 21 CFR Part 11.300(b)：改密后撤销其他会话（保留当前会话）
  revokeAllSessions(user.username, exceptToken || null, 'password changed');
  logEvent('password_changed', { username: user.username, method: 'self-service' });
  return { ok: true };
}

/** 首个管理员创建（无内置账号且账号库为空时的首次启动流程，与 GxP 相同）。 */
function createFirstAdmin(input) {
  const users = loadUsers();
  if (users.length) throw httpError(409, 'ACCOUNTS_EXIST', '账号库已存在用户');
  const username = String(input.username || '').trim();
  if (!/^[A-Za-z0-9_.-]{3,32}$/.test(username)) throw httpError(400, 'USERNAME_INVALID', '用户名需为 3-32 位字母/数字/._-');
  const password = String(input.password || '');
  if (password !== String(input.password2 || '')) throw httpError(400, 'PASSWORD_MISMATCH', '两次输入的口令不一致');
  const fullName = String(input.fullName || '').trim();
  if (fullName.length < 2) throw httpError(400, 'NAME_REQUIRED', '姓名至少 2 个字');
  const check = validatePassword(password, { username });
  if (!check.ok) throw httpError(400, 'PASSWORD_POLICY', check.errors.join('; '));
  const at = nowIso();
  saveUsers([{
    username, fullName, role: 'admin', department: '系统管理',
    status: 'active', failedAttempts: 0, lockedUntil: null,
    passwordHash: hashPassword(password), passwordChangedAt: at,
    mustChangePassword: false, passwordHistory: [],
    createdAt: at, lastLoginAt: null, isDemo: false,
  }]);
  logEvent('first_admin_created', { username });
  return { ok: true };
}

module.exports = {
  PERMISSIONS, ROLES, ROLE_ORDER, permissionsFor, can,
  publicMeta, publicUser, getUserByUsername,
  loadUsers, saveUsers, seedBuiltinAccounts,
  hashPassword, verifyPassword, validatePassword,
  login, logout, resolveSession, revokeSession, revokeAllSessions, createSession,
  issueSigningNonce, verifySignature, logEvent, readAudit, auditVerify,
  listUsers, createUser, setUserStatus, resetPassword, deleteUser, changeOwnPassword, createFirstAdmin,
};