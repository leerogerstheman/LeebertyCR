/* 文件模板：模板卡片 → 分节预览 → 一键复制 */

window.Views.register('templates', function (root, ctx) {
  const App = ctx.app;
  const C = App.content.templates;
  const U = UI;
  const current = ctx.query ? Object.keys(ctx.query)[0] : null;

  root.appendChild(U.el('div', { class: 'page-head' }));
  const head = root.querySelector('.page-head');
  head.appendChild(U.el('h1', { text: '文件模板' }));
  head.appendChild(U.el('div', { class: 'intro', text: C.intro }));

  // ---- 选择卡
  const pick = U.el('div', { class: 'grid grid-3' });
  C.templates.forEach((t) => {
    const card = U.el('div', { class: 'card', style: 'cursor:pointer' });
    card.appendChild(U.el('div', { class: 'card-title', html: (t.role === 'cra' ? '<span class="badge badge-cra">CRA</span>' : '<span class="badge badge-crc">CRC</span>') + ' ' + U.esc(t.title) }));
    card.appendChild(U.el('div', { class: 'card-sub', html: U.esc(t.en) + '<br>' + U.esc(t.purpose) }));
    card.appendChild(U.el('div', { class: 'badge badge-muted', text: t.sections.length + ' 个部分' }));
    card.addEventListener('click', () => App.navigate('#templates?' + t.id));
    pick.appendChild(card);
  });
  root.appendChild(pick);

  const active = current && C.templates.find((t) => t.id === current);
  if (!active) return;

  // ---- 详情
  root.appendChild(U.el('div', { class: 'card', style: 'margin-top:14px' }));
  const det = root.lastChild;
  const hl = U.el('div', { class: 'clist-head' });
  hl.appendChild(U.el('h2', { style: 'margin:0', text: active.title }));
  const copyBtn = U.el('button', { class: 'btn primary small', text: '📋 复制全部内容' });
  copyBtn.addEventListener('click', () => {
    const plain = active.sections.map((s) => '【' + s.label + '】\n' + s.body.join('\n')).join('\n\n');
    navigator.clipboard.writeText(plain).then(
      () => U.toast('已复制到剪贴板', 'ok'),
      () => U.toast('复制失败，请手动选择文本', 'err')
    );
  });
  hl.appendChild(copyBtn);
  det.appendChild(hl);
  det.appendChild(U.el('div', { class: 'badge badge-muted', html: '适用：' + U.esc(active.role === 'cra' ? 'CRA' : 'CRC') + ' · ' + U.esc(active.purpose) }));
  det.appendChild(U.el('div', { class: 'callout info', style: 'font-size:12.5px', html: '<b>用法：</b>' + U.esc(active.usage) }));

  for (const s of active.sections) {
    const blk = U.el('div', { class: 'tpl-block' });
    blk.appendChild(U.el('div', { class: 'tb-label', text: s.label }));
    blk.appendChild(U.el('div', { class: 'tb-body', text: s.body.join('\n') }));
    det.appendChild(blk);
  }
});