'use strict';

/**
 * config.js - 集中配置（环境变量可覆盖）。
 * 安全策略参数与 GxP-Workbench 同构（可在此调整或经安全策略持久化）。
 */

const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

const config = {
  app: {
    name: 'LeebertyCR',
    nameEn: 'LeebertyCR - CRA & CRC Clinical Trial Workbench',
    version: '1.0.0',
  },
  http: {
    host: process.env.CRA_HOST || '127.0.0.1',
    port: Number(process.env.CRA_PORT || 8816),
  },
  dataDir: process.env.CRA_DATA_DIR ? path.resolve(process.env.CRA_DATA_DIR) : path.join(ROOT, 'data'),
  // 内置演示账号开关：开箱即用（GxP_BUILTIN_ACCOUNTS 同款）。关闭后首次使用走
  // 「创建第一个管理员账号」流程，并且不生成演示数据。
  builtinAccounts: process.env.CRA_BUILTIN_ACCOUNTS !== '0',
  security: {
    passwordMinLength: 8,
    passwordRequireClasses: 3,        // 小写/大写/数字/符号 至少几类
    passwordHistoryDepth: 3,          // 不可复用最近 N 个密码
    passwordMaxAgeDays: 180,          // 密码最长有效期（按需可关：设 null）
    maxFailedLogins: 5,               // 连续失败上限
    lockoutMinutes: 15,               // 超限锁定分钟数
    idleTimeoutMinutes: 30,           // 会话空闲超时
    sessionAbsoluteHours: 12,         // 会话绝对上限
    signatureTtlSeconds: 120,         // 一次性签名挑战码有效期
    signatureSecondFactor: true,      // 签名强制第二要素（挑战码）
    demoPassword: 'CRA-Demo-2026!',   // 演示账号统一口令（演示环境风险已标注）
  },
};

module.exports = config;