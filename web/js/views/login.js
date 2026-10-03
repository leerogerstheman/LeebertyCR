/* 登录页：身份选择（演示账号）+ 口令登录 / 首次创建管理员 */

window.Views.register('login', function (root, ctx) {
  const U = UI;
  const A = API;
  const meta = ctx.meta; // { builtinEnabled, roles, permissions, policy, demoPassword? }
  const App = ctx.app;

  root.innerHTML = '';
  root.className = 'login-wrap';
  root.appendChild(U.el('div', { class: 'login-brand' }));
  const brand = root.firstChild;
  brand.appendChild(U.el('div', { class: 'brand-mark', text: 'CR', style: 'width:52px;height:52px;border-radius:14px;font-size:22px' }));
  brand.appendChild(U.el('h1', { text: 'LeebertyCR' }));
  brand.appendChild(U.el('div', { class: 'login-sub-en', text: 'CRA/CRC 临床试验工作台 · 本地运行 · 登录后使用' }));

  const card = U.el('div', { class: 'login-card' });
  root.appendChild(card);

  // ---- 演示账号身份卡（开箱即用） ----
  if (meta.builtinEnabled) {
    card.appendChild(U.el('div', { class: 'card-title', text: '① 选择你的演示身份' }));
    card.appendChild(U.el('div', { class: 'callout warn', style: 'font-size:12.5px', html:
      '<b>演示环境提示：</b>以下账号共用统一演示口令 <code style="font-weight:800">' + U.esc(meta.demoPassword || '') + '</code>，' +
      '公开口令做演示是已标注的风险（21 CFR Part 11.300(a) 要求账号唯一）。真实环境必须每人独立凭证。' }));
    const personas = [
      { u: 'demo_cra', label: 'CRA 临床监查员', name: '林晓', cls: 'badge-cra', desc: '申办者一方：监查、SDV、随访信、问题闭环' },
      { u: 'demo_crc', label: 'CRC 临床协调员', name: '陈语', cls: 'badge-crc', desc: '研究中心一方：受试者安排、数据录入、AE 上报' },
      { u: 'demo_pi', label: '主要研究者', name: '王建军', cls: 'badge-pi', desc: '医学判断、知情同意、评估与签署' },
      { u: 'demo_qa', label: 'QA 专员', name: '赵敏', cls: 'badge-qa', desc: '独立复核：关闭/放行类步骤的独立签署人' },
      { u: 'admin', label: '系统管理员', name: '管理员', cls: 'badge-muted', desc: '用户与权限管理（不参与 GxP 记录签署）' },
    ];
    const grid = U.el('div', { class: 'grid grid-4' });
    for (const p of personas) {
      const c = U.el('div', { class: 'persona-card', dataset: { u: p.u } });
      c.appendChild(U.el('span', { class: 'badge ' + p.cls, text: p.label }));
      c.appendChild(U.el('div', { class: 'pc-name', text: p.name }));
      const code = c.appendChild(U.el('div', { class: 'pc-code', text: p.u }));
      c.appendChild(U.el('div', { class: 'pc-desc', text: p.desc }));
      c.addEventListener('click', () => {
        document.querySelectorAll('.persona-card').forEach((x) => x.classList.remove('on'));
        c.classList.add('on');
        usernameInput.value = p.u;
        passwordInput.focus();
      });
      grid.appendChild(c);
    }
    card.appendChild(grid);
  } else {
    card.appendChild(U.el('div', { class: 'callout info', html: '未启用内置演示账号（CRA_BUILTIN_ACCOUNTS=0）。首次使用请先创建系统管理员账号，之后用它创建其他用户。' }));
  }

  // ---- 登录表单 ----
  card.appendChild(U.el('div', { class: 'card-title', style: 'margin-top:16px', text: '② 登录' }));
  const form = U.el('div');
  const f1 = U.el('div', { class: 'field' });
  f1.appendChild(U.el('label', { text: '用户名' }));
  const usernameInput = U.el('input', { type: 'text', placeholder: '用户名（demo_cra / demo_crc / …）', autocomplete: 'username' });
  f1.appendChild(usernameInput);
  const f2 = U.el('div', { class: 'field' });
  f2.appendChild(U.el('label', { text: '口令' }));
  const passwordInput = U.el('input', { type: 'password', placeholder: '演示口令见上方提示', autocomplete: 'current-password' });
  f2.appendChild(passwordInput);
  form.appendChild(f1);
  form.appendChild(f2);

  const errBox = U.el('div', { class: 'callout danger', style: 'display:none' });
  form.appendChild(errBox);

  const btnRow = U.el('div', { style: 'display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap' });
  btnRow.appendChild(U.el('span', { class: 'badge badge-muted', text: '安全策略：失败 ' + (meta.policy.maxFailedLogins) + ' 次锁定 ' + (meta.policy.lockoutMinutes) + ' 分钟 · 空闲 ' + (meta.policy.idleTimeoutMinutes) + ' 分钟超时' }));
  const submit = U.el('button', { class: 'btn primary', text: '登录' });
  btnRow.appendChild(submit);
  form.appendChild(btnRow);
  card.appendChild(form);

  // ---- 安全策略说明 ----
  const policyCard = U.el('details', { class: 'acc', style: 'margin-top:14px' });
  policyCard.appendChild(U.el('summary', { text: '安全设置说明（口令策略 / 会话 / 签名）' }));
  policyCard.appendChild(U.el('div', { style: 'padding:6px 8px;font-size:12.5px', html:
    '<table class="tbl"><tbody>' +
    '<tr><td>口令最小长度</td><td>' + meta.policy.passwordMinLength + ' 位</td></tr>' +
    '<tr><td>口令字符类别</td><td>至少 ' + meta.policy.passwordRequireClasses + ' 类（小写/大写/数字/符号）</td></tr>' +
    '<tr><td>连续失败锁定</td><td>' + meta.policy.maxFailedLogins + ' 次错 → 锁定 ' + meta.policy.lockoutMinutes + ' 分钟</td></tr>' +
    '<tr><td>会话空闲超时</td><td>' + meta.policy.idleTimeoutMinutes + ' 分钟</td></tr>' +
    '<tr><td>会话绝对上限</td><td>' + meta.policy.sessionAbsoluteHours + ' 小时</td></tr>' +
    '<tr><td>电子签名</td><td>双要素：口令 + 一次性挑战码（' + meta.policy.signatureTtlSeconds + ' 秒内有效）</td></tr>' +
    '</tbody></table>' }));
  policyCard.appendChild(U.el('div', { class: 'callout info', style: 'font-size:12.5px;margin-top:8px', html:
    '<b>为什么登录？</b>依据 21 CFR Part 11.10(d)：仅限授权人员访问系统。账号决定你的角色，角色决定你能执行哪些工作流步骤（职责分离）。' }));
  root.appendChild(policyCard);

  async function doLogin() {
    errBox.style.display = 'none';
    try {
      const r = await A.post('/api/auth/login', { username: usernameInput.value.trim(), password: passwordInput.value });
      if (r.ok) {
        U.toast('欢迎，' + (r.user.fullName || r.user.username), 'ok');
        await App.boot(true); // 重新引导应用外壳
      }
    } catch (err) {
      errBox.style.display = 'block';
      errBox.textContent = err.message;
      if (err.code === 'ACCOUNT_LOCKED') errBox.textContent += '\n请等待锁定时间结束后再试，或联系管理员重置口令。';
      passwordInput.value = '';
    }
  }
  submit.addEventListener('click', doLogin);
  passwordInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') doLogin(); });
});