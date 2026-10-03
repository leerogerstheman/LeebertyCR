/* 账号与权限：我的账号（所有人）/ 管理员：用户管理 + 权限矩阵 + 安全日志 */

window.Views.register('security', function (root, ctx) {
  const App = ctx.app;
  const U = UI;
  const A = API;
  const user = App.user;
  const isAdmin = user.role === 'admin';
  const canAudit = isAdmin || user.role === 'qa';

  root.appendChild(U.el('div', { class: 'page-head' }));
  const head = root.querySelector('.page-head');
  head.appendChild(U.el('h1', { text: '账号与权限' }));
  head.appendChild(U.el('div', { class: 'intro', text: '登录账号决定角色，角色决定权限（RBAC，参照 GxP-Workbench）。系统管理员管理账号；角色按职责分离设计——admin 不参与 GxP 记录签署。' }));

  // ---- 我的账号 ----
  const myCard = U.el('div', { class: 'card' });
  myCard.appendChild(U.el('div', { class: 'card-title', html:
    '<span class="badge ' + roleCls(user.role) + '">' + U.esc(roleLabel(user.role)) + '</span> ' + U.esc(user.fullName) +
    (user.isDemo ? ' <span class="badge badge-warn">演示账号</span>' : '') + ' <span class="num" style="font-family:var(--mono);color:#5c6b7a">@' + U.esc(user.username) + '</span>' }));
  myCard.appendChild(U.el('div', { style: 'display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px', html:
    '<span class="badge badge-muted">上次登录：' + U.esc(user.lastLoginAt ? fmtFull(user.lastLoginAt) : '首次') + '</span>' +
    '<span class="badge badge-muted">权限 ' + user.permissions.length + ' 项</span>' }));
  myCard.appendChild(U.el('div', { class: 'tag-line', html: user.permissions.map((p) => '<span class="tag">' + U.esc(p) + '</span>').join('') }));
  root.appendChild(myCard);

  // ---- 自助改密 ----
  const pwCard = U.el('div', { class: 'card' });
  pwCard.appendChild(U.el('div', { class: 'card-title', text: '修改我的口令' }));
  if (user.mustChangePassword) {
    pwCard.appendChild(U.el('div', { class: 'callout danger', text: '你的口令是管理员签发的临时口令，或已超期——请立即修改。' }));
  }
  const grid = U.el('div', { style: 'display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px' });
  const mkField = (label, type, placeholder) => {
    const w = U.el('div', { class: 'field' });
    w.appendChild(U.el('label', { text: label }));
    const i = U.el('input', { type, placeholder: placeholder || '' });
    w.appendChild(i);
    grid.appendChild(w);
    return i;
  };
  const oldPw = mkField('原口令', 'password');
  const newPw = mkField('新口令（≥' + (App.meta.policy.passwordMinLength) + ' 位，含 ' + App.meta.policy.passwordRequireClasses + ' 类字符）', 'password');
  const newPw2 = mkField('重复新口令', 'password');
  pwCard.appendChild(grid);
  const pwErr = U.el('div', { class: 'callout danger', style: 'display:none;margin-top:8px' });
  pwCard.appendChild(pwErr);
  const pwBtn = U.el('button', { class: 'btn primary', text: '修改口令' });
  pwBtn.addEventListener('click', async () => {
    pwErr.style.display = 'none';
    if (newPw.value !== newPw2.value) { pwErr.style.display = 'block'; pwErr.textContent = '两次输入的新口令不一致'; return; }
    try {
      await A.post('/api/auth/password', { oldPassword: oldPw.value, newPassword: newPw.value });
      U.toast('口令已修改', 'ok');
      oldPw.value = newPw.value = newPw2.value = '';
    } catch (err) {
      pwErr.style.display = 'block';
      pwErr.textContent = err.message;
    }
  });
  pwCard.appendChild(pwBtn);
  root.appendChild(pwCard);

  // ---- 权限矩阵（公开给登录用户） ----
  const matrixCard = U.el('div', { class: 'card' });
  matrixCard.appendChild(U.el('details', { class: 'acc' }));
  const det = matrixCard.lastChild;
  det.appendChild(U.el('summary', { text: '权限矩阵（各角色权限一览）' }));
  const body = U.el('div', { style: 'padding:6px 4px' });
  const roleRows = ['cra', 'crc', 'pi', 'qa', 'admin'];
  const perms = App.meta.permissions;
  let html = '<table class="tbl"><thead><tr><th style="width:30%">权限</th>' + roleRows.map((r) => '<th>' + U.esc(roleLabel(r)) + '</th>').join('') + '</tr></thead><tbody>';
  for (const p of perms) {
    html += '<tr><td><code>' + U.esc(p) + '</code></td>' + roleRows.map((r) => {
      const has = App.meta.roles[r].permissions.includes('*') || App.meta.roles[r].permissions.includes(p);
      return '<td style="text-align:center">' + (has ? '<span style="color:#15803d;font-weight:700">✓</span>' : '<span style="color:#cbd5e1">—</span>') + '</td>';
    }).join('') + '</tr>';
  }
  html += '</tbody></table>';
  body.appendChild(U.el('div', { html }));
  body.appendChild(U.el('div', { class: 'callout info', style: 'font-size:12.5px;margin-top:8px', html:
    'admin 持有全部权限，但工作流步骤的角色门不含 admin——系统管理员不能作为 GxP 记录的唯一签署人（GxP 同样的设计）。' }));
  det.appendChild(body);
  root.appendChild(matrixCard);

  // ---- 管理员：用户管理 ----
  if (isAdmin) {
    root.appendChild(U.el('h2', { style: 'margin-top:18px', text: '用户管理（仅系统管理员）' }));
    const addCard = U.el('div', { class: 'card' });
    addCard.appendChild(U.el('div', { class: 'card-title', text: '＋ 新建用户' }));
    const row = U.el('div', { style: 'display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px' });
    const f = (label, ph) => { const w = U.el('div', { class: 'field' }); w.appendChild(U.el('label', { text: label })); const i = U.el('input', { type: 'text', placeholder: ph || '' }); w.appendChild(i); row.appendChild(w); return i; };
    const uName = f('用户名', '如：zhang_san');
    const uFull = f('姓名', '如：张三');
    const uRole = U.el('select');
    for (const r of ['cra', 'crc', 'pi', 'qa', 'admin']) uRole.appendChild(U.el('option', { value: r, text: roleLabel(r) }));
    const wRole = U.el('div', { class: 'field' });
    wRole.appendChild(U.el('label', { text: '角色' }));
    wRole.appendChild(uRole);
    row.appendChild(wRole);
    const uDept = f('部门', '可选');
    const uPw = f('初始口令（留空则签发临时口令）', '可选');
    addCard.appendChild(row);
    const addErr = U.el('div', { class: 'callout danger', style: 'display:none;margin-top:8px' });
    addCard.appendChild(addErr);
    const addBtn = U.el('button', { class: 'btn primary', text: '创建用户' });
    addBtn.addEventListener('click', async () => {
      addErr.style.display = 'none';
      try {
        const r = await A.post('/api/users', { username: uName.value.trim(), fullName: uFull.value.trim(), role: uRole.value, department: uDept.value.trim(), password: uPw.value });
        U.toast('已创建 ' + r.user.username, 'ok');
        if (r.tempPassword) {
          U.modal(U.el('div', { html: '<p>初始临时口令（仅显示一次，请立即告知用户并提醒首次登录后修改）：</p><p style="font-family:var(--mono);font-size:18px;font-weight:800;text-align:center;background:#f7f9fb;padding:10px;border-radius:8px">' + U.esc(r.tempPassword) + '</p>' }), { title: '临时口令' });
        }
        uName.value = uFull.value = uDept.value = uPw.value = '';
        loadUsers();
      } catch (err) {
        addErr.style.display = 'block';
        addErr.textContent = err.message;
      }
    });
    addCard.appendChild(addBtn);
    root.appendChild(addCard);

    const listCard = U.el('div', { class: 'card flush' });
    root.appendChild(listCard);
    async function loadUsers() {
      const r = await A.get('/api/users');
      const tbl = U.el('table', { class: 'tbl' });
      tbl.innerHTML = '<thead><tr><th>用户名</th><th>姓名</th><th>角色</th><th>状态</th><th>上次登录</th><th>演示</th><th style="width:230px">操作</th></tr></thead><tbody>' +
        r.users.map((u) => {
          const canTouch = u.username !== user.username;
          return '<tr>' +
            '<td class="num">' + U.esc(u.username) + '</td>' +
            '<td>' + U.esc(u.fullName) + '</td>' +
            '<td><span class="badge ' + roleCls(u.role) + '">' + U.esc(roleLabel(u.role)) + '</span></td>' +
            '<td>' + (u.status === 'active' ? '<span class="badge badge-ok">启用</span>' : u.status === 'disabled' ? '<span class="badge badge-muted">禁用</span>' : '<span class="badge badge-danger">' + U.esc(u.status) + '</span>') + '</td>' +
            '<td class="num" style="font-size:12px">' + (u.lastLoginAt ? U.esc(fmtFull(u.lastLoginAt)) : '—') + '</td>' +
            '<td>' + (u.isDemo ? '<span class="badge badge-warn">演示</span>' : '') + '</td>' +
            '<td style="white-space:nowrap">' +
            (u.status === 'active'
              ? '<button class="btn small" data-act="disable" data-u="' + U.esc(u.username) + '" ' + (canTouch ? '' : 'disabled') + '>禁用</button>'
              : '<button class="btn small" data-act="enable" data-u="' + U.esc(u.username) + '">启用</button>') +
            ' <button class="btn small" data-act="reset" data-u="' + U.esc(u.username) + '">重置口令</button>' +
            (canTouch ? ' <button class="btn small danger" data-act="del" data-u="' + U.esc(u.username) + '">删除</button>' : '') +
            '</td></tr>';
        }).join('') + '</tbody>';
      listCard.innerHTML = '';
      listCard.appendChild(tbl);
      listCard.querySelectorAll('[data-act]').forEach((b) => {
        b.addEventListener('click', async () => {
          const act = b.dataset.act;
          const uname = b.dataset.u;
          try {
            if (act === 'disable') {
              U.confirmDlg('禁用账号', '确定禁用 ' + uname + '？其全部会话将立即失效。', async () => {
                await A.put('/api/users/' + encodeURIComponent(uname) + '/status', { status: 'disabled' });
                U.toast('已禁用', 'ok'); loadUsers();
              });
            } else if (act === 'enable') {
              await A.put('/api/users/' + encodeURIComponent(uname) + '/status', { status: 'active' });
              U.toast('已启用', 'ok'); loadUsers();
            } else if (act === 'reset') {
              const r = await A.post('/api/users/' + encodeURIComponent(uname) + '/reset-password', {});
              U.modal(U.el('div', { html: '<p>为 <b>' + U.esc(uname) + '</b> 签发的临时口令（仅显示一次；该用户所有其他会话已撤销，首次登录须修改口令）：</p><p style="font-family:var(--mono);font-size:18px;font-weight:800;text-align:center;background:#f7f9fb;padding:10px;border-radius:8px">' + U.esc(r.tempPassword) + '</p>' }), { title: '临时口令' });
            } else if (act === 'del') {
              U.confirmDlg('删除账号', '确定删除 ' + uname + '？该账号的个人状态文件将保留在 data/users 下。', async () => {
                await A.del('/api/users/' + encodeURIComponent(uname));
                U.toast('已删除', 'ok'); loadUsers();
              });
            }
          } catch (err) { U.toast(err.message, 'err'); }
        });
      });
    }
    loadUsers();
  }

  // ---- 安全日志 ----
  if (canAudit) {
    const logCard = U.el('div', { class: 'card' });
    logCard.appendChild(U.el('div', { class: 'card-title', text: '安全日志（' + (isAdmin ? '管理员/QA 可见' : 'QA 可见') + ' · 最近 100 条 · 只追加）' }));
    const wrap = U.el('div');
    logCard.appendChild(wrap);
    root.appendChild(logCard);
    A.get('/api/audit?limit=100').then((r) => {
      const chain = r.chain || {};
      const chainOk = chain.ok === true;
      wrap.appendChild(U.el('div', { class: 'callout ' + (chainOk ? 'ok' : 'danger'), style: 'font-size:12.5px;margin-bottom:8px', html:
        '<b>审计链完整性（HMAC 哈希链）：</b>' + (chainOk ? '完整 ✓（' + chain.count + ' 条）' : '已破坏！断点 seq=' + (chain.brokenAt != null ? chain.brokenAt : '?') + ' —— ' + U.esc(chain.error || '见脚本 scripts/verify-audit.js')) }));
      if (!r.entries.length) { wrap.appendChild(U.el('div', { class: 'callout info', text: '暂无日志' })); return; }
      const tbl = U.el('table', { class: 'tbl' });
      tbl.innerHTML = '<thead><tr><th style="width:150px">时间</th><th style="width:130px">事件</th><th style="width:100px">用户</th><th>说明</th></tr></thead><tbody>' +
        r.entries.slice().reverse().map((e) => '<tr><td class="num" style="font-size:12px">' + U.esc(fmtFull(e.at)) + '</td>' +
          '<td><span class="badge ' + (e.event.includes('failed') || e.event.includes('lock') ? 'badge-danger' : 'badge-muted') + '">' + U.esc(e.event) + '</span></td>' +
          '<td class="num">' + U.esc(e.username || e.actor || '—') + '</td>' +
          '<td style="font-size:12.5px">' + U.esc(JSON.stringify(e.reason || e.note || '')) + '</td></tr>').join('') + '</tbody>';
      wrap.appendChild(tbl);
    }).catch((e) => wrap.appendChild(U.el('div', { class: 'callout danger', text: e.message })));
  } else {
    root.appendChild(U.el('div', { class: 'callout muted', style: 'background:#eef1f5;border-color:#dde4ec;color:#5c6b7a', html: '安全日志仅系统管理员与 QA 可见。' }));
  }

  function roleLabel(r) {
    return (App.meta.roles[r] || {}).labelZh || r;
  }
  function roleCls(r) {
    return { cra: 'badge-cra', crc: 'badge-crc', pi: 'badge-pi', qa: 'badge-qa', admin: 'badge-muted' }[r] || 'badge-muted';
  }
  function fmtFull(iso) {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    const p = (n) => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }
});