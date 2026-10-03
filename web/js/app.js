/* app.js - 应用外壳：登录门禁、布局、路由、用户与状态。加载顺序在 index.html 中控制。 */

(function () {
  'use strict';

  const registered = {};
  for (const [name, view] of window.Views.pending) registered[name] = view;

  const NAV = [
    { group: '学习' },
    { key: 'home', label: '首页', icon: '🏠' },
    { key: 'learn', label: '理念课堂', icon: '🧭' },
    { key: 'lifecycle', label: '试验生命周期', icon: '🗺️' },
    { key: 'cra', label: 'CRA 工作手册', icon: '🔍' },
    { key: 'crc', label: 'CRC 工作手册', icon: '🗂️' },
    { group: '执行' },
    { key: 'checklists', label: '核查清单', icon: '✅' },
    { key: 'workflow', label: '工作流执行', icon: '🌀' },
    { key: 'subjects', label: '受试者登记册', icon: '🧑🤝🧑' },
    { key: 'documents', label: 'eTMF 文档台账', icon: '📁' },
    { key: 'tasks', label: '任务台', icon: '📋' },
    { key: 'templates', label: '文件模板', icon: '📄' },
    { key: 'regs', label: '法规速查', icon: '⚖️' },
    { group: '检验' },
    { key: 'quiz', label: '场景练习', icon: '🎯' },
    { key: 'cases', label: '案例学习', icon: '🧩' },
    { key: 'glossary', label: '术语表', icon: '📖' },
    { group: '我的' },
    { key: 'security', label: '账号与权限', icon: '🔐' },
    { key: 'about', label: '关于', icon: 'ℹ️' },
  ];

  const App = {
    content: null,
    state: null,
    meta: null,      // /api/auth/meta：角色、权限、策略
    user: null,      // /api/auth/me
    nav: NAV,
    route: '',
    query: {},
    isLoggedIn: false,
  };

  /* ------------------------------------------------------------ 布局 --- */

  function sidebarNode() {
    const side = UI.el('aside', { class: 'sidebar' });

    const brand = UI.el('div', { class: 'brand' });
    brand.appendChild(UI.el('div', { class: 'brand-mark', text: 'CR' }));
    const bd = UI.el('div');
    bd.appendChild(UI.el('div', { class: 'brand-name', text: 'LeebertyCR' }));
    bd.appendChild(UI.el('div', { class: 'brand-sub', text: 'CRA / CRC 临床试验工作台' }));
    brand.appendChild(bd);
    side.appendChild(brand);

    // 当前用户卡
    const userCard = UI.el('div', { class: 'user-card' });
    userCard.appendChild(UI.el('div', { class: 'uc-line1', html:
      '<b>' + UI.esc(App.user.fullName) + '</b> <span class="badge ' + roleCls(App.user.role) + '" style="margin-left:4px">' + UI.esc(roleLabel(App.user.role)) + '</span>' +
      (App.user.isDemo ? ' <span class="badge badge-warn">演示</span>' : '') }));
    userCard.appendChild(UI.el('div', { class: 'uc-line2', html: '<span class="num">@' + UI.esc(App.user.username) + '</span>' }));
    const logoutBtn = UI.el('button', { class: 'btn small ghost', style: 'color:#dbe4ee;border-color:rgba(255,255,255,0.25)', text: '退出登录（切换身份）' });
    logoutBtn.addEventListener('click', async () => {
      try { await API.post('/api/auth/logout', {}); } catch (e) { /* ignore */ }
      location.hash = '';
      location.reload();
    });
    userCard.appendChild(logoutBtn);
    side.appendChild(userCard);

    for (const item of NAV) {
      if (item.group) {
        side.appendChild(UI.el('div', { class: 'nav-group', text: item.group }));
      } else {
        const a = UI.el('div', { class: 'nav-item', dataset: { key: item.key } });
        a.appendChild(UI.el('span', { class: 'ico', text: item.icon }));
        a.appendChild(UI.el('span', { text: item.label }));
        a.addEventListener('click', () => navigate('#' + item.key));
        side.appendChild(a);
      }
    }

    side.appendChild(UI.el('div', {
      class: 'sidebar-foot',
      html: '会话空闲 ' + (App.meta.policy.idleTimeoutMinutes) + ' 分钟超时<br>数据按账号保存在 data/users/<b>' + UI.esc(App.user.username) + '</b>/',
    }));
    return side;
  }

  function roleLabel(r) {
    return (App.meta.roles[r] || {}).labelZh || r;
  }
  function roleCls(r) {
    return { cra: 'badge-cra', crc: 'badge-crc', pi: 'badge-pi', qa: 'badge-qa', admin: 'badge-muted' }[r] || 'badge-muted';
  }

  function rootNode() {
    const root = document.getElementById('root');
    root.innerHTML = '';
    root.className = '';
    const layout = UI.el('div', { class: 'layout' });
    layout.appendChild(sidebarNode());
    App.main = UI.el('main', { class: 'main', id: 'main-content' });
    layout.appendChild(App.main);
    root.appendChild(layout);
  }

  /* ------------------------------------------------------------ 路由 --- */

  function parseHash() {
    const raw = location.hash.replace(/^#\/?/, '');
    const [path, qs] = raw.split('?');
    const route = path || 'home';
    const query = {};
    if (qs) {
      for (const pair of qs.split('&')) {
        const [k, v] = pair.split('=');
        if (k) query[decodeURIComponent(k)] = decodeURIComponent(v || '');
      }
    }
    return { route, query };
  }

  function navigate(hash) {
    location.hash = hash;
  }

  function render(route, query) {
    const view = registered[route];
    App.main.innerHTML = '';
    if (!view) {
      App.main.appendChild(UI.el('div', { class: 'card', html: '<h2>页面不存在</h2><p><a href="#home">返回首页</a></p>' }));
      return;
    }
    try {
      view(App.main, { route, query, app: App, meta: App.meta });
    } catch (err) {
      App.main.appendChild(UI.el('div', { class: 'card', html: '<h2>渲染出错</h2><pre>' + UI.esc(err.stack || err.message) + '</pre>' }));
    }
    document.querySelectorAll('.nav-item').forEach((n) => {
      n.classList.toggle('active', n.dataset.key === route);
    });
    document.title = pageTitle(route);
  }

  function pageTitle(route) {
    const found = NAV.find((n) => n.key === route);
    return (found ? found.label + ' · ' : '') + 'LeebertyCR · CRA/CRC 临床试验工作台';
  }

  /* ------------------------------------------------------------ 状态 --- */

  async function saveState() {
    try {
      const r = await API.saveState(App.state);
      if (!r.saved && !r.guest) UI.toast('提示：当前为匿名会话，进度不会保存，请登录后使用', 'warn');
    } catch (err) {
      UI.toast('保存失败：' + err.message, 'err');
    }
  }

  async function mutate(fn) {
    fn(App.state);
    await saveState();
    return App.state;
  }

  window.App = Object.assign(App, { parseHash, navigate, render, saveState, mutate, boot });

  /* ------------------------------------------------------------ 启动 --- */

  async function boot(force) {
    let meta = null;
    try {
      meta = await API.get('/api/auth/meta');
      App.meta = meta;
    } catch (err) {
      document.getElementById('root').innerHTML =
        '<div style="max-width:640px;margin:80px auto;padding:24px;background:#fff;border-radius:12px;border:1px solid #e2e8ef">' +
        '<h2>无法连接本地服务</h2><p>' + UI.esc(err.message) + '</p>' +
        '<p>请关闭本窗口，重新运行 start.bat 或 LeebertyCR.exe 启动服务。</p></div>';
      return;
    }

    let me = null;
    try {
      me = await API.get('/api/auth/me');
    } catch (err) {
      me = { user: null };
    }

    if (!me.user) {
      // 登录门禁（21 CFR Part 11.10(d)：仅限授权人员访问）
      App.user = null;
      App.isLoggedIn = false;
      document.getElementById('root').innerHTML = '';
      document.getElementById('root').className = 'login-root';
      const wrap = document.getElementById('root');
      registered['login'](wrap, { app: App, meta });
      document.title = '登录 · LeebertyCR';
      return;
    }

    App.user = me.user;
    App.isLoggedIn = true;
    try {
      const [content, state] = await Promise.all([API.content(), API.state()]);
      App.content = content;
      App.state = state;
    } catch (err) {
      document.getElementById('root').innerHTML =
        '<div style="max-width:640px;margin:80px auto;padding:24px;background:#fff;border-radius:12px;border:1px solid #e2e8ef">' +
        '<h2>加载失败</h2><p>' + UI.esc(err.message) + '</p></div>';
      return;
    }

    rootNode();
    window.addEventListener('hashchange', () => {
      const p = parseHash();
      App.route = p.route;
      App.query = p.query;
      render(p.route, p.query);
    });
    const p = parseHash();
    App.route = p.route;
    App.query = p.query;
    render(p.route, p.query);

    // 临时口令提示
    if (App.user.mustChangePassword) {
      setTimeout(() => {
        UI.toast('请立即修改口令（当前为临时口令）', 'warn');
        navigate('#security');
      }, 500);
    } else if (!force && !state.learnerName) {
      setTimeout(() => {
        const m = UI.modal(
          UI.el('div', { html:
            '<p>欢迎，<b>' + UI.esc(App.user.fullName) + '</b>！你的角色是 <b>' + UI.esc(roleLabel(App.user.role)) + '</b>。</p>' +
            '<p>建议按三条路线学习：</p>' +
            '<ol style="padding-left:20px;line-height:2">' +
            '<li><b>理念课堂</b>——先明白 CRA/CRC 为什么存在（10 分钟）</li>' +
            '<li><b>试验生命周期</b>——看懂一个试验从启动到归档的全过程</li>' +
            '<li><b>工作流执行 + 核查清单</b>——按角色推进流程、用清单自检</li></ol>' +
            '<div class="callout info" style="font-size:12.5px">切换身份 = 点左栏「退出登录」，用另一个演示账号登录（职责分离的体现）。</div>' }),
          { title: '欢迎使用' });
        setTimeout(() => m.close(), 10000);
      }, 600);
    }
  }

  boot();
})();