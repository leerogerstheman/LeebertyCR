/* documents.js - eTMF / ISF 文档台账与必需文件缺口扫描（P2，与原生客户端同接口） */

window.Views.register('documents', function (root, ctx) {
  const App = ctx.app;
  const U = UI;
  const A = API;

  const STATE_CN = { draft: '草稿', review: '待审', approved: '已批准', superseded: '已被替代', archived: '已归档' };
  const PHASE_CN = { before: '试验前', during: '试验中', after: '试验后' };
  const CAN_EDIT = ['crc', 'cra', 'pi', 'qa', 'admin'].indexOf(App.user.role) >= 0;

  root.innerHTML = '';
  const head = U.el('div');
  head.appendChild(U.el('h1', { style: 'margin:0 0 6px', text: 'eTMF / ISF 文档台账与缺口扫描' }));
  head.appendChild(U.el('div', { class: 'card-sub', text: '文档生命周期：草稿 → 待审 → 已批准 → 已被替代 → 已归档；非法流转被拒，批准人不能是建档人（职责分离）。缺口扫描对照 ICH E6(R2) 必需文件清单。' }));
  root.appendChild(head);

  const tabs = U.el('div', { class: 'subtabs' });
  const body = U.el('div');
  root.appendChild(tabs);
  root.appendChild(body);

  const defs = [['registry', '文档台账与生命周期'], ['gaps', '必需文件缺口扫描']];
  let active = 'registry';
  defs.forEach(([key, label]) => {
    const t = U.el('div', { class: 'subtab' + (key === active ? ' active' : ''), text: label });
    t.addEventListener('click', () => {
      active = key;
      Array.from(tabs.children).forEach((c, i) => c.classList.toggle('active', defs[i][0] === active));
      draw();
    });
    tabs.appendChild(t);
  });
  function draw() {
    body.innerHTML = '';
    if (active === 'registry') registry();
    else gaps();
  }

  function registry() {
    const card = U.el('div', { class: 'card' });
    card.appendChild(U.el('div', { class: 'card-title', text: 'eTMF / ISF 文档台账' }));
    card.appendChild(U.el('div', { class: 'card-sub', text: 'ICH E6(R2) 8 节：必需文件分试验前 / 中 / 后三阶段。文件要有版本、有批准、有复核周期，且能被调阅。' }));

    const bar = U.el('div', { style: 'display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:10px' });
    const statusSel = U.el('select', { style: 'width:auto' });
    statusSel.appendChild(U.el('option', { value: '', text: '全部状态' }));
    Object.keys(STATE_CN).forEach((k) => statusSel.appendChild(U.el('option', { value: k, text: STATE_CN[k] })));
    const phaseSel = U.el('select', { style: 'width:auto' });
    phaseSel.appendChild(U.el('option', { value: '', text: '全部阶段' }));
    Object.keys(PHASE_CN).forEach((k) => phaseSel.appendChild(U.el('option', { value: k, text: PHASE_CN[k] })));
    bar.appendChild(statusSel);
    bar.appendChild(phaseSel);
    if (CAN_EDIT) {
      const addBtn = U.el('button', { class: 'btn small', text: '＋ 建档' });
      addBtn.addEventListener('click', newDocDialog);
      bar.appendChild(addBtn);
    }
    if (App.user.role === 'admin') {
      const reseed = U.el('button', { class: 'btn small ghost', text: '↻ 重新生成演示文档' });
      reseed.addEventListener('click', async () => {
        try { const r = await A.post('/api/documents/seed-demo', {}); U.toast('已补充 ' + r.added + ' 份演示文档', 'ok'); load(); }
        catch (e) { U.toast(e.message, 'danger'); }
      });
      bar.appendChild(reseed);
    }
    const refresh = U.el('button', { class: 'btn small ghost', text: '刷新' });
    refresh.addEventListener('click', load);
    bar.appendChild(refresh);
    card.appendChild(bar);

    const listWrap = U.el('div');
    const detail = U.el('div', { style: 'margin-top:14px' });
    card.appendChild(listWrap);
    card.appendChild(detail);
    root.appendChild(card);

    let docs = [];

    async function load() {
      const r = await A.get('/api/documents');
      docs = r.documents;
      listWrap.innerHTML = '';
      const tbl = U.el('table', { class: 'tbl' });
      tbl.innerHTML = '<thead><tr><th>编号</th><th>名称</th><th>类别</th><th>阶段</th><th>状态</th><th>版本</th><th>责任人</th><th>复核到期</th></tr></thead><tbody>' +
        docs.filter((d) => (!statusSel.value || d.status === statusSel.value) && (!phaseSel.value || d.phase === phaseSel.value))
          .map((d) => '<tr data-id="' + U.esc(d.id) + '" style="cursor:pointer' + (d.overdue ? ';color:#b91c1c' : '') + '">' +
            '<td class="num">' + U.esc(d.id) + '</td><td>' + U.esc(d.title) + '</td><td>' + U.esc(d.category) + '</td>' +
            '<td>' + U.esc(PHASE_CN[d.phase] || d.phase) + '</td>' +
            '<td><span class="badge ' + (d.status === 'approved' ? 'badge-ok' : 'badge-muted') + '">' + U.esc(STATE_CN[d.status] || d.status) + '</span></td>' +
            '<td class="num">v' + d.version + '</td><td>' + U.esc(d.owner) + '</td>' +
            '<td class="num">' + U.esc(d.reviewDueDate || '—') + (d.overdue ? ' ⚠' : '') + '</td></tr>').join('') +
        '</tbody>';
      listWrap.appendChild(tbl);
      tbl.querySelectorAll('tbody tr').forEach((tr) => tr.addEventListener('click', () => openDetail(tr.getAttribute('data-id'))));
    }

    async function openDetail(id) {
      const d = await A.get('/api/documents/' + id);
      detail.innerHTML = '';
      const head = U.el('div');
      head.appendChild(U.el('div', { class: 'card-title', text: d.id + ' · ' + d.title }));
      head.appendChild(U.el('div', { class: 'card-sub', html:
        '类别：' + U.esc(d.category) + '　阶段：' + U.esc(PHASE_CN[d.phase] || d.phase) +
        '　状态：<b>' + U.esc(STATE_CN[d.status] || d.status) + '</b>　版本：v' + d.version +
        '　责任人：' + U.esc(d.owner) + '　生效：' + U.esc(d.effectiveDate || '—') +
        '<br>存放位置：' + U.esc(d.location || '—') + '　复核到期：' + U.esc(d.reviewDueDate || '—') }));
      const ops = U.el('div', { style: 'display:flex;gap:8px;flex-wrap:wrap;margin:8px 0' });
      (d.allowedNext || []).forEach((to) => {
        const b = U.el('button', { class: 'btn small' + (to === 'approved' ? '' : ' ghost'), text: '→ ' + (STATE_CN[to] || to) });
        b.addEventListener('click', () => transitionDialog(d, to));
        ops.appendChild(b);
      });
      if (!(d.allowedNext || []).length) ops.appendChild(U.el('span', { class: 'badge badge-muted', text: '终态：无可用流转' }));
      head.appendChild(ops);
      detail.appendChild(head);

      const vt = U.el('table', { class: 'tbl' });
      vt.innerHTML = '<thead><tr><th>版本</th><th>时间</th><th>操作</th><th>由</th><th>从 → 到</th><th>说明</th></tr></thead><tbody>' +
        (d.versions || []).map((v) => '<tr><td class="num">v' + v.version + '</td><td class="num" style="font-size:12px">' + U.esc(v.at) + '</td>' +
          '<td>' + U.esc(v.action) + '</td><td>' + U.esc(v.by) + '</td>' +
          '<td>' + U.esc((v.from ? (STATE_CN[v.from] || v.from) : '—') + ' → ' + (STATE_CN[v.to] || v.to)) + '</td>' +
          '<td style="font-size:12.5px">' + U.esc(v.comment || '') + '</td></tr>').join('') + '</tbody>';
      detail.appendChild(vt);
    }

    function transitionDialog(d, to) {
      const needComment = to === 'superseded' || to === 'draft';
      const form = U.el('div');
      form.appendChild(U.el('p', { text: '将文档 ' + d.id + ' 流转为「' + (STATE_CN[to] || to) + '」。' }));
      if (to === 'approved') form.appendChild(U.el('div', { class: 'callout info', text: '职责分离：批准人不能是建档人，系统会用当前账号核对。' }));
      form.appendChild(U.el('label', { text: needComment ? '理由（必填，至少 3 个字）' : '备注（可选）' }));
      const comment = U.el('textarea', { rows: '3' });
      form.appendChild(comment);
      const err = U.el('div', { class: 'callout danger', style: 'display:none' });
      form.appendChild(err);
      const ok = U.el('button', { class: 'btn', text: '确认流转' });
      form.appendChild(ok);
      const m = U.modal(form, { title: '文档流转', onClose: false });
      ok.addEventListener('click', async () => {
        try {
          await A.post('/api/documents/' + d.id + '/transition', { to: to, comment: comment.value });
          m.close();
          U.toast('已流转为' + (STATE_CN[to] || to), 'ok');
          load();
          openDetail(d.id);
        } catch (e) { err.style.display = ''; err.textContent = e.message; }
      });
    }

    function newDocDialog() {
      A.get('/api/documents').then((r) => {
        const form = U.el('div');
        form.appendChild(U.el('label', { text: '文档名称' }));
        const title = U.el('input', { type: 'text' });
        form.appendChild(title);
        form.appendChild(U.el('label', { text: '文件类别（ICH E6(R2) 必需文件清单）' }));
        const cat = U.el('select');
        (r.essential || []).forEach((e) => cat.appendChild(U.el('option', { value: e.category, text: e.category + '　' + e.name })));
        form.appendChild(cat);
        form.appendChild(U.el('label', { text: '责任人' }));
        const owner = U.el('input', { type: 'text', value: App.user.name || App.user.username });
        form.appendChild(owner);
        form.appendChild(U.el('label', { text: '复核到期日' }));
        const due = U.el('input', { type: 'date', value: new Date(Date.now() + 365 * 864e5).toISOString().slice(0, 10) });
        form.appendChild(due);
        const err = U.el('div', { class: 'callout danger', style: 'display:none' });
        form.appendChild(err);
        const ok = U.el('button', { class: 'btn', text: '建档' });
        form.appendChild(ok);
        const m = U.modal(form, { title: '文档建档', onClose: false });
        ok.addEventListener('click', async () => {
          try {
            await A.post('/api/documents', { title: title.value, category: cat.value, owner: owner.value, reviewDueDate: due.value });
            m.close();
            U.toast('已建档', 'ok');
            load();
          } catch (e) { err.style.display = ''; err.textContent = e.message; }
        });
      });
    }

    statusSel.addEventListener('change', load);
    phaseSel.addEventListener('change', load);
    load();
  }

  function gaps() {
    const card = U.el('div', { class: 'card' });
    card.appendChild(U.el('div', { class: 'card-title', text: '必需文件缺口扫描' }));
    const summary = U.el('div', { class: 'callout info' });
    const wrap = U.el('div');
    const exportBtn = U.el('a', { class: 'btn small ghost', href: '#', text: '⬇ 导出缺口 CSV', style: 'margin-bottom:10px;display:inline-block' });
    card.appendChild(exportBtn);
    card.appendChild(summary);
    card.appendChild(wrap);
    card.appendChild(U.el('div', { class: 'card-sub', style: 'margin-top:10px', text: '缺口扫描回答稽查 / 检查前最常见的问题：「哪些必需文件还没有？」「哪些有文件但没批准？」——先补缺失，再补批准。' }));
    root.appendChild(card);

    A.get('/api/documents/gaps').then((r) => {
      summary.textContent = '必需文件 ' + r.total + ' 项　就绪 ' + r.ok + '　缺失 ' + r.missing +
        '　无已批准版本 ' + r.unapproved + '　建档就绪度 ' + r.readiness + '%';
      summary.className = 'callout ' + (r.missing ? 'danger' : 'ok');
      const tbl = U.el('table', { class: 'tbl' });
      tbl.innerHTML = '<thead><tr><th>阶段</th><th>类别</th><th>必需文件</th><th>现存</th><th>已批准</th><th>判定</th></tr></thead><tbody>' +
        r.rows.map((x) => '<tr' + (x.status !== 'ok' ? ' style="color:' + (x.status === 'missing' ? '#b91c1c' : '#b45309') + '"' : '') + '>' +
          '<td>' + U.esc(PHASE_CN[x.phase] || x.phase) + '</td><td>' + U.esc(x.category) + '</td><td>' + U.esc(x.name) + '</td>' +
          '<td class="num">' + x.present + '</td><td class="num">' + x.approved + '</td>' +
          '<td>' + (x.status === 'missing' ? '✗ 缺失' : (x.status === 'unapproved' ? '⚠ 无已批准版本' : '✓ 就绪')) + '</td></tr>').join('') +
        '</tbody>';
      wrap.appendChild(tbl);
      exportBtn.addEventListener('click', (e) => {
        e.preventDefault();
        const rows = [['阶段', '类别', '必需文件', '现存', '已批准', '判定']].concat(r.rows.map((x) =>
          [PHASE_CN[x.phase] || x.phase, x.category, x.name, x.present, x.approved,
            x.status === 'missing' ? '缺失' : (x.status === 'unapproved' ? '无已批准版本' : '就绪')]));
        const csv = '\uFEFF' + rows.map((row) => row.map((c) => {
          const s = String(c == null ? '' : c);
          return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
        }).join(',')).join('\r\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'tmf-gaps.csv';
        a.click();
        URL.revokeObjectURL(a.href);
      });
    }).catch((e) => { summary.className = 'callout danger'; summary.textContent = e.message; });
  }

  draw();
});