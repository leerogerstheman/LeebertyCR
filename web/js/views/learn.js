/* 理念课堂：角色、对比、GCP 原则、ALCOA+、受试者权益 */

window.Views.register('learn', function (root, ctx) {
  const App = ctx.app;
  const C = App.content.concepts;
  const U = UI;

  root.appendChild(U.el('div', { class: 'page-head' }));
  const head = root.querySelector('.page-head');
  head.appendChild(U.el('h1', { text: '理念课堂' }));
  head.appendChild(U.el('div', { class: 'sub', text: C.title.replace('：', '：') }));
  head.appendChild(U.el('div', { class: 'intro', text: C.intro }));

  // ---- 一分钟理解
  const om = U.el('div', { class: 'grid grid-2' });
  om.appendChild(U.el('div', { class: 'card', html: '<div class="card-title"><span class="badge badge-cra">CRA</span>一分钟理解</div><p style="font-size:14px">' + U.esc(C.oneMinute.cra) + '</p>' }));
  om.appendChild(U.el('div', { class: 'card', html: '<div class="card-title"><span class="badge badge-crc">CRC</span>一分钟理解</div><p style="font-size:14px">' + U.esc(C.oneMinute.crc) + '</p>' }));
  root.appendChild(om);

  // ---- 角色卡片
  root.appendChild(U.el('h2', { text: '① 三个角色：CRA、CRC、研究者（PI）' }));
  for (const rc of C.roleCards) {
    const badgeCls = rc.id === 'cra' ? 'badge-cra' : rc.id === 'crc' ? 'badge-crc' : 'badge-pi';
    const card = U.el('details', { class: 'acc', open: rc.id === 'cra' || rc.id === 'crc' ? '' : null });
    card.appendChild(U.el('summary', { html: '<span class="badge ' + badgeCls + '" style="margin-right:8px">' + rc.title.split(' ')[0] + '</span>' + rc.title + ' <span style="font-weight:400;color:#8a97a5;font-size:12px">' + rc.en + '</span>' }));
    const body = U.el('div', { style: 'padding:6px 4px 2px' });
    body.appendChild(U.el('p', { html: '<b>受雇于谁：</b>' + U.esc(rc.employer) }));
    body.appendChild(U.el('div', { class: 'why-box', html: '<b>使命：</b>' + U.esc(rc.mission) }));
    body.appendChild(U.el('div', { class: 'tc-section', html: '<h4>📌 一天是什么样的</h4><ul>' + rc.day.map((d) => '<li>' + U.esc(d) + '</li>').join('') + '</ul>' }));
    body.appendChild(U.el('div', { class: 'tc-section', html: '<h4>⚡ 权力与边界</h4>' + U.esc(rc.authority) }));
    body.appendChild(U.el('div', { class: 'tc-section', html: '<h4>🚫 这不是我的活</h4><ul>' + rc.notJob.map((d) => '<li>' + U.esc(d) + '</li>').join('') + '</ul>' }));
    body.appendChild(U.el('div', { class: 'lesson-box', html: '<b>💡 心法</b>' + U.esc(rc.philosophy) }));
    card.appendChild(body);
    root.appendChild(card);
  }

  // ---- 对比表
  root.appendChild(U.el('h2', { text: '② 一张表看懂：一个查，一个管' }));
  const cmp = U.el('div', { class: 'card flush' });
  const tbl = U.el('table', { class: 'tbl' });
  let html = '<thead><tr><th style="width:18%">维度</th><th style="width:41%"><span class="badge badge-cra">CRA</span></th><th><span class="badge badge-crc">CRC</span></th></tr></thead><tbody>';
  for (const row of C.comparison.rows) {
    html += '<tr><td><b>' + U.esc(row.dim) + '</b></td><td>' + U.esc(row.cra) + '</td><td>' + U.esc(row.crc) + '</td></tr>';
  }
  html += '</tbody>';
  tbl.innerHTML = html;
  cmp.appendChild(tbl);
  root.appendChild(cmp);
  root.appendChild(U.el('div', { class: 'card', html: '<div class="card-title">🤝 他们如何配合（典型的监查循环）</div><p style="margin:0">' + U.esc(C.comparison.handshake) + '</p>' }));

  // ---- GCP 13 条
  root.appendChild(U.el('h2', { text: '③ GCP 十三条原则 · 大白话' }));
  root.appendChild(U.el('div', { class: 'callout info', html: '<b>出处：</b>' + U.esc(C.principles.source) + '。' + U.esc(C.principles.intro) }));
  for (const p of C.principles.items) {
    const d = U.el('details', { class: 'acc' });
    d.appendChild(U.el('summary', { html: '<span class="step-num" style="width:22px;height:22px;font-size:11px;margin-right:8px">' + p.n + '</span>' + U.esc(p.text) }));
    const body = U.el('div', { style: 'padding:6px 4px 2px' });
    body.appendChild(U.el('p', { html: '<b>大白话：</b>' + U.esc(p.plain) }));
    body.appendChild(U.el('div', { class: 'grid grid-2', style: 'margin-top:8px' }));
    const g = body.querySelector('.grid');
    g.appendChild(U.el('div', { html: '<span class="badge badge-cra" style="margin-bottom:4px">对 CRA 意味着</span><p style="margin:4px 0 0;font-size:13px">' + U.esc(p.cra) + '</p>' }));
    g.appendChild(U.el('div', { html: '<span class="badge badge-crc" style="margin-bottom:4px">对 CRC 意味着</span><p style="margin:4px 0 0;font-size:13px">' + U.esc(p.crc) + '</p>' }));
    d.appendChild(body);
    root.appendChild(d);
  }

  // ---- ALCOA+
  root.appendChild(U.el('h2', { text: '④ 数据完整性 · ALCOA+ 八个字母' }));
  root.appendChild(U.el('div', { class: 'card', html: '<p style="margin:0 0 10px">' + U.esc(C.alcoa.intro) + '</p><div class="grid grid-3">' +
    C.alcoa.letters.map((l) =>
      '<div class="card flush" style="padding:12px 14px"><div style="font-family:Consolas,monospace;font-size:26px;font-weight:800;color:#0f766e">' + l.letter + '</div>' +
      '<div style="font-weight:700;font-size:13.5px">' + U.esc(l.term) + '</div>' +
      '<div style="font-size:13px;margin-top:5px">' + U.esc(l.plain) + '</div>' +
      '<div style="font-size:12.5px;color:#b91c1c;margin-top:6px;background:#fdeaea;border-radius:6px;padding:5px 8px">✗ ' + U.esc(l.bad) + '</div></div>'
    ).join('') + '</div>' }));
  root.appendChild(U.el('div', { class: 'callout ok', html: '<b>黄金规则：</b>' + U.esc(C.alcoa.goldenRule) }));

  // ---- 受试者权益
  root.appendChild(U.el('h2', { text: '⑤ 受试者权益保护 · 四条底线' }));
  const sr = U.el('div', { class: 'grid grid-2' });
  for (const it of C.subjectRights.items) {
    sr.appendChild(U.el('div', { class: 'card', html: '<div class="card-title">🛡 ' + U.esc(it.title) + '</div><p style="margin:0;font-size:13.5px">' + U.esc(it.plain) + '</p>' }));
  }
  root.appendChild(sr);

  root.appendChild(U.el('div', { class: 'callout warn', style: 'margin-top:14px', html: '<b>免责声明：</b>' + U.esc(C.regDisclaimer) }));
});