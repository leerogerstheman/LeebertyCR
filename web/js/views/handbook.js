/* 岗位手册：CRA 与 CRC 共用渲染器，注册两个视图 */

(function () {
  'use strict';

  function handbookView(roleKey) {
    return function (root, ctx) {
      const App = ctx.app;
      const role = roleKey === 'cra' ? App.content['cra-tasks'] : App.content['crc-tasks'];
      const other = roleKey === 'cra' ? App.content['crc-tasks'] : App.content['cra-tasks'];
      const U = UI;
      const badgeCls = roleKey === 'cra' ? 'badge-cra' : 'badge-crc';

      root.appendChild(U.el('div', { class: 'page-head' }));
      const head = root.querySelector('.page-head');
      head.appendChild(U.el('h1', { html: '<span class="badge ' + badgeCls + '" style="vertical-align:middle;margin-right:8px">' + (roleKey === 'cra' ? 'CRA' : 'CRC') + '</span>' + U.esc(role.title) }));
      head.appendChild(U.el('div', { class: 'intro', text: role.intro }));

      // 搜索 + 阶段过滤
      const filterCard = U.el('div', { class: 'card' });
      const row = U.el('div', { style: 'display:flex;gap:10px;flex-wrap:wrap;align-items:center' });
      const search = U.el('div', { class: 'search', style: 'flex:1;min-width:220px' });
      search.appendChild(U.el('span', { class: 's-ico', text: '🔍' }));
      search.appendChild(U.el('input', { placeholder: '搜索任务（如：SDV、知情同意、药物…）' }));
      row.appendChild(search);

      const stages = [...new Set(role.tasks.map((t) => t.stage))];
      const stageSel = U.el('select', { style: 'width:auto' });
      stageSel.appendChild(U.el('option', { value: '', text: '全部阶段' }));
      for (const s of stages) stageSel.appendChild(U.el('option', { value: s, text: s }));
      row.appendChild(stageSel);
      const otherLink = U.el('button', { class: 'btn ghost', html: '查看' + (roleKey === 'cra' ? ' CRC' : ' CRA') + '手册 →' });
      otherLink.addEventListener('click', () => App.navigate('#' + (other === App.content['cra-tasks'] ? 'cra' : 'crc')));
      row.appendChild(otherLink);
      filterCard.appendChild(row);
      root.appendChild(filterCard);

      const list = U.el('div');
      root.appendChild(list);

      function renderList() {
        const q = (search.querySelector('input').value || '').trim().toLowerCase();
        const stage = stageSel.value;
        const filtered = role.tasks.filter((t) => {
          if (stage && t.stage !== stage) return false;
          if (!q) return true;
          const hay = (t.title + t.en + t.why + t.how.join(' ') + (t.points || []).join(' ') + (t.mistakes || []).join(' ')).toLowerCase();
          return hay.includes(q);
        });
        list.innerHTML = '';
        if (!filtered.length) {
          list.appendChild(U.el('div', { class: 'callout info', text: '没有匹配的任务。换个关键词试试。' }));
          return;
        }
        for (const t of filtered) {
          const card = U.el('div', { class: 'task-card' });
          const headEl = U.el('div', { class: 'tc-head' });
          headEl.appendChild(U.el('span', { class: 'badge ' + badgeCls, text: roleKey.toUpperCase() }));
          headEl.appendChild(U.el('span', { class: 'badge badge-muted', text: t.stage }));
          const ttl = U.el('span', { class: 'tc-title', html: U.esc(t.title) + ' <span style="font-weight:400;color:#8a97a5;font-size:12px;font-family:Consolas,monospace">' + U.esc(t.en) + '</span>' });
          headEl.appendChild(ttl);
          headEl.appendChild(U.el('span', { text: '▾', style: 'color:#8a97a5' }));
          headEl.addEventListener('click', () => card.classList.toggle('open'));

          const body = U.el('div', { class: 'tc-body' });
          body.appendChild(U.el('div', { class: 'why-box', html: '<b>为什么做（理念）：</b>' + U.esc(t.why) }));
          body.appendChild(U.el('div', { class: 'tc-section', html: '<h4>🕐 什么时候做</h4><p style="margin:2px 0 0">' + U.esc(t.when) + '</p>' }));
          body.appendChild(U.el('div', { class: 'tc-section', html: '<h4>🛠 怎么做</h4><ol style="margin:4px 0 0;padding-left:20px">' + t.how.map((h) => '<li>' + U.esc(h) + '</li>').join('') + '</ol>' }));
          if (t.points && t.points.length) {
            body.appendChild(U.el('div', { class: 'tc-section', html: '<h4>⭐ 要点</h4><ul style="margin:4px 0 0;padding-left:20px">' + t.points.map((x) => '<li>' + U.esc(x) + '</li>').join('') + '</ul>' }));
          }
          if (t.mistakes && t.mistakes.length) {
            body.appendChild(U.el('div', { class: 'tc-section', html: '<h4>⚠️ 常见错误 / 红线</h4><ul style="margin:4px 0 0;padding-left:20px;color:#7a3636">' + t.mistakes.map((x) => '<li>' + U.esc(x) + '</li>').join('') + '</ul>' }));
          }
          if (t.tools && t.tools.length) {
            const names = t.tools.map((id) => App.content.checklists.checklists.find((c) => c.id === id)).filter(Boolean);
            if (names.length) {
              body.appendChild(U.el('div', { class: 'tc-section', html: '<h4>🧰 配套清单</h4><p style="margin:4px 0 0">' +
                names.map((c) => '<a href="#checklists?' + c.id + '">✅ ' + U.esc(c.title) + '</a>').join(' · ') + '</p>' }));
            }
          }
          if (t.refs) {
            body.appendChild(U.el('div', { class: 'tc-section', html: '<h4>📚 法规依据</h4><p style="margin:4px 0 0">' + t.refs.map((x) => '<span class="tag">' + U.esc(x) + '</span>').join('') + '</p>' }));
          }
          card.appendChild(headEl);
          card.appendChild(body);
          list.appendChild(card);
        }
      }

      search.querySelector('input').addEventListener('input', renderList);
      stageSel.addEventListener('change', renderList);
      renderList();
    };
  }

  window.Views.register('cra', handbookView('cra'));
  window.Views.register('crc', handbookView('crc'));
})();