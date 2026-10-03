/* 核查清单：选择清单 → 逐项勾选（勾选状态持久化） */

window.Views.register('checklists', function (root, ctx) {
  const App = ctx.app;
  const C = App.content.checklists;
  const U = UI;
  const current = ctx.query ? Object.keys(ctx.query)[0] : null;

  // ---- 清单选择卡
  const pick = U.el('div', { class: 'grid grid-3' });
  const progressOf = (cl) => {
    const rec = App.state.checklists[cl.id];
    return rec ? rec.checked.length : 0;
  };

  C.checklists.forEach((cl) => {
    const done = progressOf(cl);
    const pct = Math.round((done / cl.items.length) * 100);
    const card = U.el('div', { class: 'card', style: 'cursor:pointer', dataset: { cl: cl.id } });
    const roleTxt = cl.role === 'cra' ? '<span class="badge badge-cra">CRA</span>' : cl.role === 'crc' ? '<span class="badge badge-crc">CRC</span>' : '<span class="badge badge-both">共同</span>';
    card.appendChild(U.el('div', { class: 'card-title', html: roleTxt + ' ' + U.esc(cl.title) }));
    card.appendChild(U.el('div', { class: 'card-sub', html: U.esc(cl.stage) + ' · ' + U.esc(cl.en) + ' · ' + cl.items.length + ' 项' }));
    const prog = U.el('div', { style: 'display:flex;gap:8px;align-items:center' });
    const bar = U.el('div', { class: 'prog' });
    bar.appendChild(U.el('div', { style: 'width:' + pct + '%' }));
    prog.appendChild(bar);
    prog.appendChild(U.el('span', { class: 'prog-label', text: done + '/' + cl.items.length }));
    card.appendChild(prog);
    card.addEventListener('click', () => App.navigate('#checklists?' + cl.id));
    pick.appendChild(card);
  });
  root.appendChild(pick);

  const active = current && C.checklists.find((x) => x.id === current);
  if (!active) return;

  // ---- 当前清单
  root.appendChild(U.el('div', { class: 'card', style: 'margin-top:16px' }));
  const mainCard = root.lastChild;
  const headLine = U.el('div', { class: 'clist-head' });
  headLine.appendChild(U.el('h2', { style: 'margin:0', text: active.title }));
  headLine.appendChild(U.el('span', { class: 'badge badge-muted', text: '共 ' + active.items.length + ' 项' }));
  const resetBtn = U.el('button', { class: 'btn small', text: '重置本清单' });
  resetBtn.addEventListener('click', () => {
    U.confirmDlg('重置清单', '确定清空本清单的全部勾选状态吗？', async () => {
      App.state.checklists[active.id] = { checked: [], note: '' };
      await App.saveState();
      renderItems();
      U.toast('已重置', 'ok');
    });
  });
  headLine.appendChild(resetBtn);
  headLine.appendChild(U.el('a', { class: 'btn small', href: '/api/export/checklists/' + active.id + '.csv', text: '⬇ 导出 CSV（含勾选/提示）' }));
  mainCard.appendChild(headLine);
  mainCard.appendChild(U.el('div', { class: 'intro', style: 'font-size:13px', text: active.intro }));

  const barWrap = U.el('div', { style: 'display:flex;gap:10px;align-items:center;margin:10px 0' });
  const bar = U.el('div', { class: 'prog' });
  const barFill = U.el('div', { style: 'width:0%' });
  bar.appendChild(barFill);
  barWrap.appendChild(bar);
  const barLabel = U.el('span', { class: 'prog-label', text: '' });
  barWrap.appendChild(barLabel);
  mainCard.appendChild(barWrap);

  const itemWrap = U.el('div');
  mainCard.appendChild(itemWrap);

  const noteWrap = U.el('div');
  mainCard.appendChild(noteWrap);

  function currentRec() {
    if (!App.state.checklists[active.id]) App.state.checklists[active.id] = { checked: [], note: '' };
    return App.state.checklists[active.id];
  }

  function renderItems() {
    const rec = currentRec();
    itemWrap.innerHTML = '';
    const done = rec.checked.length;
    barFill.style.width = Math.round((done / active.items.length) * 100) + '%';
    barLabel.textContent = done + ' / ' + active.items.length + ' 已勾选';
    const critTotal = active.items.filter((i) => i.critical).length;
    const critDone = active.items.filter((i) => i.critical && rec.checked.includes(i.id)).length;

    if (done === active.items.length) {
      itemWrap.appendChild(U.el('div', { class: 'callout ok', html: '🎉 本清单全部完成。' }));
    } else if (critDone < critTotal) {
      itemWrap.appendChild(U.el('div', { class: 'callout danger', html: '⚠️ 还有 <b>' + (critTotal - critDone) + '</b> 项关键条目（红色 ●）未完成——关键条目不勾完，不要把清单当「完成」。' }));
    }

    active.items.forEach((it) => {
      const checked = rec.checked.includes(it.id);
      const row = U.el('div', { class: 'item' + (checked ? ' done' : ''), dataset: { id: it.id } });
      const chk = U.el('span', { class: 'chk', text: '✓' });
      row.appendChild(chk);
      const main = U.el('div', { class: 'it-main' });
      main.appendChild(U.el('div', { class: 'it-text', html: (it.critical ? '<span class="crit-mark" title="关键条目">●</span> ' : '') + U.esc(it.text) }));
      if (it.hint) main.appendChild(U.el('div', { class: 'it-hint', html: '<b>怎么做：</b>' + U.esc(it.hint) }));
      if (it.why) main.appendChild(U.el('div', { class: 'it-why', html: '<b>为什么：</b>' + U.esc(it.why) }));
      row.appendChild(main);
      row.addEventListener('click', () => {
        const idx = rec.checked.indexOf(it.id);
        if (idx >= 0) rec.checked.splice(idx, 1); else rec.checked.push(it.id);
        App.saveState();
        renderItems();
      });
      row.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        row.classList.toggle('open');
      });
      itemWrap.appendChild(row);
    });

    const tip = U.el('div', { class: 'callout info', style: 'font-size:12.5px', html: '💡 单击条目：勾选/取消。双击条目：展开「怎么做 / 为什么」。所有勾选状态自动保存在本机。' });
    itemWrap.appendChild(tip);

    // 备注
    noteWrap.innerHTML = '';
    const noteBox = U.el('div', { class: 'field', style: 'margin-top:8px' });
    noteBox.appendChild(U.el('label', { text: '本次使用备注（记录日期、中心、发现等，方便下次对照）' }));
    const ta = U.el('textarea', { rows: '3', placeholder: '例：2026-05-12 对 XX 中心使用；发现 2 项未完成已写入随访信。' });
    ta.value = rec.note || '';
    let timer = null;
    ta.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        rec.note = ta.value;
        App.saveState();
      }, 500);
    });
    noteBox.appendChild(ta);
    noteWrap.appendChild(noteBox);
  }

  renderItems();
});