/* 任务台：个人任务管理（创建/状态/删除，按角色过滤），本地持久化 */

window.Views.register('tasks', function (root, ctx) {
  const App = ctx.app;
  const U = UI;
  const C = App.content;

  root.appendChild(U.el('div', { class: 'page-head' }));
  const head = root.querySelector('.page-head');
  head.appendChild(U.el('h1', { text: '任务台' }));
  head.appendChild(U.el('div', { class: 'intro', text: '管理自己的现场工作：访视准备、整改跟踪、文件待办……任务保存在本机 data/state.json。建议把「监查/访视」相关的任务与核查清单配合使用。' }));

  // ---- 新建任务
  const form = U.el('div', { class: 'card' });
  form.appendChild(U.el('div', { class: 'card-title', text: '＋ 新建任务' }));
  const row = U.el('div', { style: 'display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px' });

  const fTitle = U.el('div', { class: 'field' });
  fTitle.appendChild(U.el('label', { text: '任务内容' }));
  const inTitle = U.el('input', { type: 'text', placeholder: '例：XX 中心启动访视前文件预核' });
  fTitle.appendChild(inTitle);

  const fRole = U.el('div', { class: 'field' });
  fRole.appendChild(U.el('label', { text: '归属角色' }));
  const selRole = U.el('select');
  selRole.appendChild(U.el('option', { value: 'cra', text: 'CRA' }));
  selRole.appendChild(U.el('option', { value: 'crc', text: 'CRC' }));
  selRole.appendChild(U.el('option', { value: 'pi', text: '研究者' }));
  selRole.appendChild(U.el('option', { value: 'qa', text: 'QA 复核' }));
  selRole.appendChild(U.el('option', { value: 'self', text: '我自己' }));
  selRole.value = ['cra', 'crc'].includes(App.user.role) ? App.user.role : 'cra';
  fRole.appendChild(selRole);

  const fType = U.el('div', { class: 'field' });
  fType.appendChild(U.el('label', { text: '任务类型' }));
  const selType = U.el('select');
  selType.appendChild(U.el('option', { value: 'visit', text: '访视/监查' }));
  selType.appendChild(U.el('option', { value: 'file', text: '文件/归档' }));
  selType.appendChild(U.el('option', { value: 'data', text: '数据/录入' }));
  selType.appendChild(U.el('option', { value: 'sae', text: 'SAE/安全性' }));
  selType.appendChild(U.el('option', { value: 'drug', text: '药物管理' }));
  selType.appendChild(U.el('option', { value: 'meeting', text: '会议/培训' }));
  selType.appendChild(U.el('option', { value: 'other', text: '其他' }));
  fType.appendChild(selType);

  const fSite = U.el('div', { class: 'field' });
  fSite.appendChild(U.el('label', { text: '研究中心' }));
  const inSite = U.el('input', { type: 'text', placeholder: '如：XX 医院' });
  fSite.appendChild(inSite);

  const fDue = U.el('div', { class: 'field' });
  fDue.appendChild(U.el('label', { text: '截止日期' }));
  const inDue = U.el('input', { type: 'date' });
  fDue.appendChild(inDue);

  const fNote = U.el('div', { class: 'field', style: 'grid-column:1/-1' });
  fNote.appendChild(U.el('label', { text: '备注' }));
  const inNote = U.el('input', { type: 'text', placeholder: '补充要求、联系人等' });
  fNote.appendChild(inNote);

  row.appendChild(fTitle); row.appendChild(fRole); row.appendChild(fType); row.appendChild(fSite); row.appendChild(fDue); row.appendChild(fNote);
  form.appendChild(row);
  const addBtn = U.el('button', { class: 'btn primary', text: '＋ 添加到任务台' });
  addBtn.addEventListener('click', async () => {
    const title = inTitle.value.trim();
    if (!title) { U.toast('请填写任务内容', 'err'); return; }
    const task = {
      id: 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      title,
      role: selRole.value,
      type: selType.value,
      site: inSite.value.trim(),
      due: inDue.value || '',
      note: inNote.value.trim(),
      status: 'todo',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    App.state.tasks.push(task);
    await App.saveState();
    inTitle.value = ''; inSite.value = ''; inDue.value = ''; inNote.value = '';
    renderList();
    U.toast('已添加任务', 'ok');
  });
  form.appendChild(U.el('div', { style: 'text-align:right' })).appendChild(addBtn);
  root.appendChild(form);

  // ---- 筛选
  const filterCard = U.el('div', { class: 'card' });
  const frow = U.el('div', { style: 'display:flex;gap:10px;flex-wrap:wrap;align-items:center' });
  const statusSel = U.el('select', { style: 'width:auto' });
  statusSel.appendChild(U.el('option', { value: 'all', text: '全部状态' }));
  statusSel.appendChild(U.el('option', { value: 'todo', text: '待办' }));
  statusSel.appendChild(U.el('option', { value: 'doing', text: '进行中' }));
  statusSel.appendChild(U.el('option', { value: 'done', text: '已完成' }));
  frow.appendChild(statusSel);
  const roleSel2 = U.el('select', { style: 'width:auto' });
  roleSel2.appendChild(U.el('option', { value: 'all', text: '全部角色' }));
  roleSel2.appendChild(U.el('option', { value: 'cra', text: 'CRA' }));
  roleSel2.appendChild(U.el('option', { value: 'crc', text: 'CRC' }));
  roleSel2.appendChild(U.el('option', { value: 'pi', text: '研究者' }));
  roleSel2.appendChild(U.el('option', { value: 'qa', text: 'QA 复核' }));
  roleSel2.appendChild(U.el('option', { value: 'self', text: '我自己' }));
  frow.appendChild(roleSel2);
  const stats = U.el('span', { class: 'badge badge-muted', text: '' });
  frow.appendChild(stats);
  const sampleBtn = U.el('button', { class: 'btn small ghost', text: '添加 3 条演示任务' });
  sampleBtn.addEventListener('click', async () => {
    const base = new Date();
    const d = (n) => { const x = new Date(base); x.setDate(x.getDate() + n); const p = (m) => String(m).padStart(2, '0'); return x.getFullYear() + '-' + p(x.getMonth() + 1) + '-' + p(x.getDate()); };
    const demos = [
      { title: '准备 XX 中心常规监查：导出质疑清单与既往随访信', role: 'cra', type: 'visit', site: 'XX 医院', due: d(2), note: '对照 SDRP 确定 SDV 范围' },
      { title: '整理本周 3 位受试者随访后的 eCRF 录入', role: 'crc', type: 'data', site: 'XX 医院', due: d(1), note: '当日录完，核查 AE 页' },
      { title: '核对 ISF 缺项：PI 简历更新、培训记录', role: 'crc', type: 'file', site: 'XX 医院', due: d(4), note: '对照必备文件清单' },
    ];
    for (const t of demos) {
      App.state.tasks.push({ id: 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), ...t, status: 'todo', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    }
    await App.saveState();
    renderList();
    U.toast('已添加演示任务', 'ok');
  });
  frow.appendChild(sampleBtn);
  filterCard.appendChild(frow);
  root.appendChild(filterCard);

  const list = U.el('div');
  root.appendChild(list);

  function fmtType(t) {
    const map = { visit: '访视/监查', file: '文件/归档', data: '数据/录入', sae: 'SAE/安全性', drug: '药物管理', meeting: '会议/培训', other: '其他' };
    return map[t] || t;
  }

  function renderList() {
    const st = statusSel.value;
    const rl = roleSel2.value;
    let tasks = App.state.tasks.slice();
    if (st !== 'all') tasks = tasks.filter((t) => t.status === st);
    if (rl !== 'all') tasks = tasks.filter((t) => t.role === rl);
    tasks.sort((a, b) => {
      if (a.status === 'done' && b.status !== 'done') return 1;
      if (b.status === 'done' && a.status !== 'done') return -1;
      return String(a.due || '9999').localeCompare(String(b.due || '9999'));
    });

    stats.textContent = '共 ' + tasks.length + ' 条';
    list.innerHTML = '';
    if (!tasks.length) {
      list.appendChild(U.el('div', { class: 'callout info', text: '当前筛选下没有任务。用上方表单新建任务，或点「添加 3 条演示任务」看看效果。' }));
      return;
    }
    const roleName = { cra: 'CRA', crc: 'CRC', pi: '研究者', qa: 'QA 复核', self: '自己' };
    for (const t of tasks) {
      const row = U.el('div', { class: 'todo-row' + (t.status === 'done' ? ' done' : '') + (t.due && t.status !== 'done' && U.daysUntil(t.due) < 0 ? ' overdue' : '') });
      const main = U.el('div', { class: 'td-main' });
      main.appendChild(U.el('div', { class: 'td-title', text: t.title }));
      const meta = [];
      meta.push('<span class="badge ' + (t.role === 'cra' ? 'badge-cra' : t.role === 'crc' ? 'badge-crc' : t.role === 'qa' ? 'badge-qa' : 'badge-pi') + '">' + (roleName[t.role] || t.role) + '</span>');
      meta.push('<span class="badge badge-muted">' + fmtType(t.type) + '</span>');
      if (t.site) meta.push('<span class="badge badge-muted">🏥 ' + U.esc(t.site) + '</span>');
      if (t.due) {
        const dd = U.daysUntil(t.due);
        if (t.status !== 'done') {
          if (dd < 0) meta.push('<span class="badge badge-danger">已超期 ' + (-dd) + ' 天</span>');
          else if (dd === 0) meta.push('<span class="badge badge-warn">今天到期</span>');
          else meta.push('<span class="badge badge-muted">剩 ' + dd + ' 天</span>');
        } else {
          meta.push('<span class="badge badge-muted">' + U.fmtDate(t.due) + '</span>');
        }
      }
      if (t.note) meta.push('<span style="color:#8a97a5">' + U.esc(t.note) + '</span>');
      main.appendChild(U.el('div', { class: 'td-meta', html: meta.join(' ') }));
      row.appendChild(main);

      const sel = U.el('select', { style: 'width:110px' });
      sel.appendChild(U.el('option', { value: 'todo', text: '待办' }));
      sel.appendChild(U.el('option', { value: 'doing', text: '进行中' }));
      sel.appendChild(U.el('option', { value: 'done', text: '已完成' }));
      sel.value = t.status;
      sel.addEventListener('change', async () => {
        t.status = sel.value;
        t.updatedAt = new Date().toISOString();
        await App.saveState();
        renderList();
        if (sel.value === 'done') U.toast('已完成 ✔', 'ok');
      });
      row.appendChild(sel);

      const del = U.el('button', { class: 'btn small danger', text: '删除' });
      del.addEventListener('click', () => {
        U.confirmDlg('删除任务', '确定删除「' + t.title + '」吗？', async () => {
          App.state.tasks = App.state.tasks.filter((x) => x.id !== t.id);
          await App.saveState();
          renderList();
        });
      });
      row.appendChild(del);
      list.appendChild(row);
    }
  }

  statusSel.addEventListener('change', renderList);
  roleSel2.addEventListener('change', renderList);
  renderList();
});