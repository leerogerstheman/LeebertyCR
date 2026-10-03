/* 案例学习：先思考，再展开看处理与教训 */

window.Views.register('cases', function (root, ctx) {
  const App = ctx.app;
  const C = App.content.cases;
  const U = UI;

  root.appendChild(U.el('div', { class: 'page-head' }));
  const head = root.querySelector('.page-head');
  head.appendChild(U.el('h1', { text: '案例学习' }));
  head.appendChild(U.el('div', { class: 'intro', text: C.intro }));

  for (const c of C.cases) {
    const card = U.el('div', { class: 'card case-card' });
    const headEl = U.el('div', { class: 'tc-head', style: 'cursor:pointer;display:flex;gap:10px;align-items:center;padding:12px 16px;margin:-16px -18px 0' });
    headEl.style.margin = '-16px -18px 0';
    headEl.appendChild(U.roleBadge(c.role));
    headEl.appendChild(U.el('span', { class: 'badge badge-muted', text: c.tag }));
    const ttl = U.el('span', { class: 'tc-title', style: 'flex:1;font-weight:700;font-size:14.5px', text: c.title });
    headEl.appendChild(ttl);
    headEl.appendChild(U.el('span', { text: '▾', style: 'color:#8a97a5' }));
    headEl.addEventListener('click', () => card.classList.toggle('open'));
    card.appendChild(headEl);

    const body = U.el('div', { class: 'cc-body' });
    body.appendChild(U.el('div', { class: 'tc-section', html: '<h4>📄 背景</h4><p style="margin:2px 0 0">' + U.esc(c.background) + '</p>' }));
    body.appendChild(U.el('div', { class: 'tc-section', html: '<h4>🔎 核查发现</h4><ul style="margin:4px 0 0;padding-left:20px">' + c.findings.map((f) => '<li>' + U.esc(f) + '</li>').join('') + '</ul>' }));
    body.appendChild(U.el('div', { class: 'tc-section', html: '<h4>🛠 处理</h4><ol style="margin:4px 0 0;padding-left:20px">' + c.handling.map((h) => '<li>' + U.esc(h) + '</li>').join('') + '</ol>' }));
    body.appendChild(U.el('div', { class: 'lesson-box', html: '<b>💡 教训</b>' + U.esc(c.lesson) }));
    card.appendChild(body);
    root.appendChild(card);
  }
});