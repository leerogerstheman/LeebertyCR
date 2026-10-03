/* 首页：当前账号 + 今日概览 + 学习路线 */

window.Views.register('home', function (root, ctx) {
  const App = ctx.app;
  const C = App.content;
  const S = App.state;
  const U = UI;
  const user = App.user;
  const role = user.role;
  const ROLE_LABEL = { cra: 'CRA 临床监查员', crc: 'CRC 临床协调员', pi: '主要研究者', qa: 'QA 专员', admin: '系统管理员' };
  const ROLE_DESC = {
    cra: '申办者/CRO 一方。我的日常：中心评估、启动访视、现场监查、SDV、监查报告、问题闭环。',
    crc: '研究中心一方。我的日常：受试者安排、知情同意协助、数据录入、AE 上报、药物账目、文件整理。',
    pi: '研究中心责任主体。我的日常：知情同意谈话、医学评估、数据签认、SAE 判定。',
    qa: '质量保证。我的日常：独立复核关闭/放行步骤、查看安全日志、监督流程质量。',
    admin: '系统与权限管理。我不参与 GxP 工作流记录签署（职责分离），但负责账号生命周期的管理。',
  };

  root.appendChild(U.el('div', { class: 'page-head' }));
  const head = root.querySelector('.page-head');
  head.appendChild(U.el('h1', { text: 'LeebertyCR' }));
  head.appendChild(U.el('div', { class: 'sub', html: '<b>CRA/CRC 临床试验工作台</b> —— 辅助<b>临床监查员（CRA）</b>与<b>临床协调员（CRC）</b>理解并执行药物临床试验工作流程。' +
    '参照 <b>ICH E6(R2)</b> 与中国 <b>GCP 2020</b> · 本地运行 · 账号隔离 · 权限服务端强制。' }));

  // ---- 当前账号
  const acct = U.el('div', { class: 'card' });
  acct.appendChild(U.el('div', { class: 'card-title', html:
    '当前账号：<b>' + U.esc(user.fullName) + '</b> <span class="num" style="font-family:var(--mono);color:#5c6b7a">@' + U.esc(user.username) + '</span>' +
    '<span class="badge ' + roleBadgeCls(role) + '">' + U.esc(ROLE_LABEL[role]) + '</span>' +
    (user.isDemo ? '<span class="badge badge-warn">演示账号</span>' : '') }));
  acct.appendChild(U.el('p', { style: 'margin:0 0 8px;font-size:13.5px;color:#33455a', text: ROLE_DESC[role] || '' }));
  acct.appendChild(U.el('div', { class: 'callout info', style: 'font-size:12.5px;margin:0', html:
    '<b>你的权限：</b>' + user.permissions.map((p) => '<span class="tag">' + U.esc(p) + '</span>').join('') +
    '<br><b>切换身份：</b>点左栏「退出登录」，再用其他演示账号登录——账号决定角色，角色决定你能执行的工作流步骤（职责分离，Annex 11 §12.1）。' }));
  root.appendChild(acct);

  // ---- 一分钟理解
  const om = U.el('div', { class: 'grid grid-2' });
  om.appendChild(U.el('div', { class: 'card', html: '<div class="card-title"><span class="badge badge-cra">CRA</span>一句话理解</div><p style="font-size:14px">' + U.esc(C.concepts.oneMinute.cra) + '</p>' }));
  om.appendChild(U.el('div', { class: 'card', html: '<div class="card-title"><span class="badge badge-crc">CRC</span>一句话理解</div><p style="font-size:14px">' + U.esc(C.concepts.oneMinute.crc) + '</p>' }));
  root.appendChild(om);

  // ---- 统计
  const tasks = S.tasks; // 已是当前账号的任务（按用户隔离）
  const allItems = C.checklists.checklists.reduce((n, cl) => n + cl.items.length, 0);
  let doneItems = 0;
  for (const cl of C.checklists.checklists) {
    const rec = S.checklists[cl.id];
    if (rec) doneItems += rec.checked.length;
  }
  const quizKey = ['cra', 'crc'].includes(role) ? role : 'all';
  const quizBest = S.quiz.best[quizKey] || 0;
  const quizTotal = C.quiz.questions.length;

  const stats = U.el('div', { class: 'grid grid-4' });
  const stat = (n, label, cls) => U.el('div', { class: 'card', html: '<div class="stat-num" style="color:' + cls + '">' + n + '</div><div class="stat-label">' + label + '</div>' });
  stats.appendChild(stat(tasks.length, '我的任务', '#1d4ed8'));
  stats.appendChild(stat(doneItems + ' / ' + allItems, '核查清单已勾选', '#0f766e'));
  stats.appendChild(stat(quizBest + ' / ' + quizTotal, '场景练习最佳得分', '#b45309'));
  stats.appendChild(stat(C.workflows.workflows.length + ' 条流程', '可执行工作流', '#6d28d9'));
  root.appendChild(stats);

  // ---- 新手上路
  const guide = U.el('div', { class: 'card' });
  guide.appendChild(U.el('div', { class: 'card-title', text: '学习路线（角色：' + ROLE_LABEL[role] + '）' }));
  const g = U.el('div', { class: 'grid grid-3' });
  const stepCard = (n, title, desc, link) => {
    const c = U.el('div', { class: 'card flush', style: 'padding:14px 16px;cursor:pointer' });
    c.appendChild(U.el('div', { html: '<span class="step-num">' + n + '</span> <b style="margin-left:6px">' + title + '</b>' }));
    c.appendChild(U.el('p', { style: 'margin:8px 0 0;font-size:13px;color:#5c6b7a', text: desc }));
    c.addEventListener('click', () => App.navigate(link));
    return c;
  };
  const roleLink = role === 'crc' ? 'crc' : role === 'pi' ? 'learn' : role === 'qa' ? 'workflow' : 'cra';
  g.appendChild(stepCard(1, '先懂理念', 'CRA/CRC 是什么？GCP 十三条原则、ALCOA+ 数据完整性、受试者权益。', '#learn'));
  g.appendChild(stepCard(2, '再看全局', '一个试验从中心调研到归档的 8 个阶段，每阶段谁做什么、产出什么。', '#lifecycle'));
  g.appendChild(stepCard(3, '然后动手', '按角色手册执行任务，用核查清单自检，用工作流推进受控记录。', '#' + roleLink));
  guide.appendChild(g);
  root.appendChild(guide);

  // ---- 角色今日要点
  const roleToday = U.el('div', { class: 'card' });
  const todayLabel = { cra: 'CRA 今天可以做什么', crc: 'CRC 今天可以做什么', pi: '研究者视角：团队今天在做什么', qa: 'QA 今天可以做什么', admin: '系统管理员今天可以做什么' };
  roleToday.appendChild(U.el('div', { class: 'card-title', text: '③ ' + (todayLabel[role] || '今天可以做什么') }));
  const todayGrid = U.el('div', { class: 'grid grid-2' });
  if (role === 'cra') {
    todayGrid.appendChild(U.el('div', { html:
      '<div class="why-box" style="margin-bottom:8px">一句话：CRA 的价值 = 亲眼核对 + 问题闭环。</div>' +
      '<p style="margin:6px 0;font-size:13.5px">即将要做的事，先去手册里看「怎么做」：</p>' +
      '<p>· 准备监查访视 → <a href="#cra">CRA 手册 · 常规监查计划</a><br>' +
      '· 到现场查数据 → <a href="#checklists?sdv">直接打开 SDV 清单</a><br>' +
      '· 访视后 → <a href="#workflow?list">工作流：监查访视闭环</a> 与 <a href="#templates?fu">随访信模板</a></p>' }));
    todayGrid.appendChild(U.el('div', { html:
      '<div class="why-box" style="margin-bottom:8px">本周推荐练习：SDV 双向核对理念（场景练习第 2 题）与遗留问题闭环（第 5 题）。</div>' +
      '<p style="margin:6px 0;font-size:13.5px">若你是新手，先读：</p><p>· <a href="#learn">理念课堂：监查的目的</a><br>· <a href="#cases">案例：「幽灵数据」与「先检查后补签」</a><br>· <a href="#workflow">工作流：看看监查闭环怎么推进</a></p>' }));
  } else if (role === 'crc') {
    todayGrid.appendChild(U.el('div', { html:
      '<div class="why-box" style="margin-bottom:8px">一句话：CRC 的价值 = 安排到位 + 记录同步。</div>' +
      '<p style="margin:6px 0;font-size:13.5px">今日有访视 → 用「访视三阶段核对表」过一遍：</p>' +
      '<p>· <a href="#checklists?crc-visit">CRC 访视三阶段核对表</a><br>' +
      '· 录入 eCRF 前 → <a href="#checklists?sdv">对照源数据</a><br>' +
      '· 收到 SAE 线索 → <a href="#checklists?sae">SAE 报告核查表</a></p>' }));
    todayGrid.appendChild(U.el('div', { html:
      '<div class="why-box" style="margin-bottom:8px">本周推荐练习：知情同意流程归属（场景练习第 3 题）与「受试者随口一说」（案例学习）。</div>' +
      '<p style="margin:6px 0;font-size:13.5px">若你是新手，先读：</p><p>· <a href="#learn">理念课堂：CRC 是谁</a><br>· <a href="#crc">CRC 手册：随时调用任务卡</a><br>· <a href="#workflow">工作流：SAE 上报与跟踪</a></p>' }));
  } else if (role === 'qa') {
    todayGrid.appendChild(U.el('div', { html:
      '<div class="why-box" style="margin-bottom:8px">一句话：QA 的价值 = 独立复核，让「自己不能关自己的门」成为制度。</div>' +
      '<p style="margin:6px 0;font-size:13.5px">今天的典型动作：</p>' +
      '<p>· <a href="#workflow?list">工作流：看看有哪些记录等在关闭/放行</a><br>' +
      '· 用 demo_qa 登录执行 🔒 独立复核步骤（提出人不能自己执行）<br>' +
      '· <a href="#security">账号与权限：查看安全日志与权限矩阵</a></p>' }));
    todayGrid.appendChild(U.el('div', { html:
      '<div class="why-box" style="margin-bottom:8px">推荐练习：独立复核理念对应「偏差提出人不能自己关闭」（场景练习/案例）。</div>' +
      '<p style="margin:6px 0;font-size:13.5px">阅读：</p><p>· <a href="#learn">理念课堂：职责分离</a><br>· <a href="#checklists?imv">常规监查清单（看问题从发现到关闭）</a></p>' }));
  } else {
    todayGrid.appendChild(U.el('div', { html:
      '<p style="font-size:13.5px">· <a href="#learn">理念课堂</a>——先建立「为什么」<br>' +
      '· <a href="#lifecycle">试验生命周期</a>——看全局<br>' +
      '· <a href="#quiz">场景练习</a>——检验理解<br>' +
      '· <a href="#cases">案例学习</a>——看真实问题的处理</p>' }));
  }
  roleToday.appendChild(todayGrid);
  root.appendChild(roleToday);

  root.appendChild(U.el('div', { class: 'callout warn', html: '<b>请记住：</b>' + U.esc(C.concepts.regDisclaimer) }));

  function roleBadgeCls(r) {
    return { cra: 'badge-cra', crc: 'badge-crc', pi: 'badge-pi', qa: 'badge-qa', admin: 'badge-muted' }[r] || 'badge-muted';
  }
});