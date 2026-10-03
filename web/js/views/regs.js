/* 法规速查：法规卡片 + 时限速查表 */

window.Views.register('regs', function (root, ctx) {
  const App = ctx.app;
  const C = App.content.regulations;
  const U = UI;

  root.appendChild(U.el('div', { class: 'page-head' }));
  const head = root.querySelector('.page-head');
  head.appendChild(U.el('h1', { text: '法规速查' }));
  head.appendChild(U.el('div', { class: 'intro', text: C.intro }));

  // ---- 法规卡片
  for (const card of C.cards) {
    const d = U.el('details', { class: 'acc' });
    d.appendChild(U.el('summary', { html: '<b>' + U.esc(card.title) + '</b> <span style="font-weight:400;font-size:12px;color:#8a97a5">' + U.esc(card.en) + '</span>' }));
    const body = U.el('div', { style: 'padding:6px 4px 2px' });
    body.appendChild(U.el('div', { class: 'badge badge-muted', html: '适用范围：' + U.esc(card.scope) }));
    for (const kp of card.keyPoints) {
      body.appendChild(U.el('div', { class: 'kc', html: '<span class="kc-ref">' + U.esc(kp.ref) + '</span>' + U.esc(kp.point) }));
    }
    if (card.note) body.appendChild(U.el('div', { class: 'callout warn', style: 'font-size:12.5px', html: U.esc(card.note) }));
    d.appendChild(body);
    root.appendChild(d);
  }

  // ---- 时限速查表
  root.appendChild(U.el('h2', { style: 'margin-top:20px', text: C.deadlines.title }));
  root.appendChild(U.el('div', { class: 'callout info', style: 'font-size:12.5px', text: C.deadlines.note }));
  const card = U.el('div', { class: 'card flush' });
  const tbl = U.el('table', { class: 'tbl' });
  tbl.innerHTML = '<thead><tr><th style="width:34%">事项</th><th>常见要求</th><th style="width:16%">依据</th><th style="width:10%">责任方</th></tr></thead><tbody>' +
    C.deadlines.rows.map((r) => '<tr class="deadline-row"><td>' + U.esc(r.item) + '</td><td>' + U.esc(r.usual) + '</td><td>' + U.esc(r.basis) + '</td><td>' + U.esc(r.role) + '</td></tr>').join('') +
    '</tbody>';
  card.appendChild(tbl);
  root.appendChild(card);

  root.appendChild(U.el('div', { class: 'callout warn', style: 'font-size:12.5px', text: C.disclaimer }));
});