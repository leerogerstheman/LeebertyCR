/* subjects.js - 受试者登记册 / 访视日历 / eCRF 录入 / 入组漏斗（P1，与原生客户端同接口） */

window.Views.register('subjects', function (root, ctx) {
  const App = ctx.app;
  const U = UI;
  const A = API;

  const STATUS_CN = {
    screened: '筛选', enrolled: '已入组', ongoing: '随访中', completed: '已完成',
    withdrawn: '已退出', screen_failed: '筛选失败',
    planned: '计划中', done: '已完成', missed: '已错过', cancelled: '已取消',
  };
  const fmt = (d) => d || '—';
  const CAN_EDIT = ['crc', 'cra', 'pi', 'admin'].indexOf(App.user.role) >= 0;

  root.innerHTML = '';
  const head = U.el('div');
  head.appendChild(U.el('h1', { style: 'margin:0 0 6px', text: '受试者登记册 · 访视日历 · 入组漏斗' }));
  head.appendChild(U.el('div', { class: 'card-sub', text: '受试者用「中心 + 编号」伪匿名标识；访视绑定 eCRF 表单，录入时由服务端执行逻辑核查（必填、范围、跨字段矛盾），不通过则拒绝入库。' }));
  root.appendChild(head);

  const tabs = U.el('div', { class: 'subtabs' });
  const body = U.el('div');
  root.appendChild(tabs);
  root.appendChild(body);

  const defs = [
    ['registry', '受试者登记册'],
    ['calendar', '访视日历与提醒'],
    ['funnel', '入组漏斗与统计'],
  ];
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
    else if (active === 'calendar') calendar();
    else funnel();
  }

  /* ---------------------------------------------------------- 登记册 */

  function registry() {
    const card = U.el('div', { class: 'card' });
    card.appendChild(U.el('div', { class: 'card-title', text: '受试者登记册（伪匿名）' }));
    card.appendChild(U.el('div', { class: 'card-sub', text: '只用「中心 + 受试者编号」标识，不采集姓名 / 身份证 / 联系方式；编号与身份的对应表留在研究中心，不进数据库。' }));

    const bar = U.el('div', { style: 'display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:10px' });
    const statusSel = U.el('select', { style: 'width:auto' });
    statusSel.appendChild(U.el('option', { value: '', text: '全部状态' }));
    ['screened', 'enrolled', 'ongoing', 'completed', 'withdrawn', 'screen_failed'].forEach((k) =>
      statusSel.appendChild(U.el('option', { value: k, text: STATUS_CN[k] })));
    const q = U.el('input', { type: 'text', placeholder: '搜索编号/中心', style: 'width:170px' });
    const refresh = U.el('button', { class: 'btn small ghost', text: '刷新' });
    bar.appendChild(statusSel);
    bar.appendChild(q);
    if (CAN_EDIT) {
      const addBtn = U.el('button', { class: 'btn small', text: '＋ 登记受试者' });
      addBtn.addEventListener('click', newSubjectDialog);
      bar.appendChild(addBtn);
    }
    if (App.user.role === 'admin') {
      const reseed = U.el('button', { class: 'btn small ghost', text: '↻ 重新生成演示受试者' });
      reseed.addEventListener('click', async () => {
        try { const r = await A.post('/api/subjects/seed-demo', {}); U.toast('已补充 ' + r.added + ' 位演示受试者', 'ok'); loadList(); }
        catch (e) { U.toast(e.message, 'danger'); }
      });
      bar.appendChild(reseed);
    }
    bar.appendChild(refresh);
    card.appendChild(bar);

    const listWrap = U.el('div');
    const detail = U.el('div', { style: 'margin-top:14px' });
    card.appendChild(listWrap);
    card.appendChild(detail);
    root.appendChild(card);

    let current = null;

    async function loadList() {
      const r = await A.get('/api/subjects?status=' + encodeURIComponent(statusSel.value) + '&search=' + encodeURIComponent(q.value.trim()));
      listWrap.innerHTML = '';
      const tbl = U.el('table', { class: 'tbl' });
      tbl.innerHTML = '<thead><tr><th>编号</th><th>中心</th><th>状态</th><th>知情</th><th>入组</th><th>访视</th><th>下次访视</th></tr></thead><tbody>' +
        r.subjects.map((s) => '<tr data-id="' + U.esc(s.id) + '" style="cursor:pointer">' +
          '<td class="num">' + U.esc(s.subjectNo) + '</td><td>' + U.esc(s.site) + '</td>' +
          '<td><span class="badge ' + (s.status === 'screen_failed' || s.status === 'withdrawn' ? 'badge-danger' : 'badge-muted') + '">' + U.esc(STATUS_CN[s.status] || s.status) + '</span></td>' +
          '<td class="num">' + U.esc(fmt(s.consentDate)) + '</td><td class="num">' + U.esc(fmt(s.enrolledDate)) + '</td>' +
          '<td class="num">' + s.visitsDone + '/' + s.visitCount + '</td>' +
          '<td class="num" style="font-size:12.5px">' + (s.nextVisit ? U.esc(s.nextVisit.name + ' ' + s.nextVisit.plannedDate) : '—') + '</td></tr>').join('') +
        '</tbody>';
      listWrap.appendChild(tbl);
      tbl.querySelectorAll('tbody tr').forEach((tr) => {
        tr.addEventListener('click', () => { current = tr.getAttribute('data-id'); loadDetail(); });
      });
    }

    async function loadDetail() {
      detail.innerHTML = '';
      if (!current) return;
      const s = await A.get('/api/subjects/' + encodeURIComponent(current));
      const head = U.el('div');
      head.appendChild(U.el('div', { class: 'card-title', text: '受试者 ' + s.subjectNo + ' · ' + s.site }));
      head.appendChild(U.el('div', { class: 'card-sub', html:
        '状态：<b>' + U.esc(STATUS_CN[s.status] || s.status) + '</b>　筛选：' + U.esc(fmt(s.screenDate)) +
        '　知情同意：' + U.esc(fmt(s.consentDate)) + '　入组：' + U.esc(fmt(s.enrolledDate)) +
        '　队列：' + U.esc(fmt(s.cohort)) + '<br>备注：' + U.esc(fmt(s.note)) }));
      const ops = U.el('div', { style: 'display:flex;gap:8px;flex-wrap:wrap;margin:8px 0' });
      if (CAN_EDIT) {
        const addV = U.el('button', { class: 'btn small', text: '＋ 登记访视' });
        addV.addEventListener('click', () => visitDialog(s));
        const chSt = U.el('button', { class: 'btn small ghost', text: '变更状态' });
        chSt.addEventListener('click', () => statusDialog(s));
        ops.appendChild(addV);
        ops.appendChild(chSt);
      }
      head.appendChild(ops);
      detail.appendChild(head);

      const vt = U.el('table', { class: 'tbl' });
      vt.innerHTML = '<thead><tr><th>访视</th><th>计划日期</th><th>实际日期</th><th>窗口</th><th>状态</th><th>eCRF</th><th>操作</th></tr></thead><tbody>' +
        (s.visits || []).map((v) => '<tr>' +
          '<td>' + U.esc(v.name) + '</td><td class="num">' + U.esc(v.plannedDate) + '</td>' +
          '<td class="num">' + U.esc(fmt(v.actualDate)) + '</td><td>' + U.esc(fmt(v.window)) + '</td>' +
          '<td><span class="badge ' + (v.status === 'missed' ? 'badge-danger' : 'badge-muted') + '">' + U.esc(STATUS_CN[v.status] || v.status) + '</span></td>' +
          '<td>' + (v.formId ? (Object.keys(v.data || {}).length ? '已录入 ✓' : '待录入') : '—') + '</td>' +
          '<td>' + (v.formId && CAN_EDIT ? '<button class="btn small" data-vid="' + U.esc(v.id) + '">录入 eCRF</button>' : (v.formId ? '—' : '未绑定表单')) + '</td></tr>').join('') +
        '</tbody>';
      detail.appendChild(vt);
      vt.querySelectorAll('button[data-vid]').forEach((b) => {
        b.addEventListener('click', () => {
          const v = (s.visits || []).find((x) => x.id === b.getAttribute('data-vid'));
          ecrfDialog(s, v);
        });
      });
    }

    function statusDialog(s) {
      const form = U.el('div');
      const st = U.el('select');
      ['screened', 'enrolled', 'ongoing', 'completed', 'withdrawn', 'screen_failed'].forEach((k) =>
        st.appendChild(U.el('option', { value: k, text: STATUS_CN[k], selected: k === s.status ? 'selected' : null })));
      const reason = U.el('textarea', { rows: '3', placeholder: '退出/筛选失败原因（必填）' });
      form.appendChild(U.el('label', { text: '新状态' }));
      form.appendChild(st);
      form.appendChild(U.el('label', { text: '退出 / 筛选失败原因（用于解释漏斗，退出或失败时必填）' }));
      form.appendChild(reason);
      const err = U.el('div', { class: 'callout danger', style: 'display:none' });
      form.appendChild(err);
      const ok = U.el('button', { class: 'btn', text: '保存' });
      form.appendChild(ok);
      const m = U.modal(form, { title: '变更受试者状态', onClose: false });
      ok.addEventListener('click', async () => {
        const to = st.value;
        if ((to === 'withdrawn' || to === 'screen_failed') && reason.value.trim().length < 3) {
          err.style.display = '';
          err.textContent = '退出或筛选失败必须写明原因（至少 3 个字）';
          return;
        }
        try {
          await A.put('/api/subjects/' + s.id, { status: to, withdrawalReason: reason.value });
          m.close();
          U.toast('状态已更新', 'ok');
          loadList();
          loadDetail();
        } catch (e) { err.style.display = ''; err.textContent = e.message; }
      });
    }

    function visitDialog(s) {
      A.get('/api/subjects/forms').then((forms) => {
        const form = U.el('div');
        const name = U.el('input', { type: 'text', value: 'V2 第 2 次访视' });
        const date = U.el('input', { type: 'date', value: new Date(Date.now() + 14 * 864e5).toISOString().slice(0, 10) });
        const win = U.el('input', { type: 'text', value: '±3 天' });
        const formSel = U.el('select');
        (forms.forms || []).forEach((f) => formSel.appendChild(U.el('option', { value: f.id, text: f.title })));
        form.appendChild(U.el('label', { text: '访视名称' })); form.appendChild(name);
        form.appendChild(U.el('label', { text: '计划日期' })); form.appendChild(date);
        form.appendChild(U.el('label', { text: '允许窗口' })); form.appendChild(win);
        form.appendChild(U.el('label', { text: '绑定 eCRF 表单' })); form.appendChild(formSel);
        const err = U.el('div', { class: 'callout danger', style: 'display:none' });
        form.appendChild(err);
        const ok = U.el('button', { class: 'btn', text: '登记' });
        form.appendChild(ok);
        const m = U.modal(form, { title: '登记访视', onClose: false });
        ok.addEventListener('click', async () => {
          try {
            await A.post('/api/subjects/' + s.id + '/visits', { name: name.value, plannedDate: date.value, window: win.value, formId: formSel.value });
            m.close();
            U.toast('访视已登记', 'ok');
            loadDetail();
            loadList();
          } catch (e) { err.style.display = ''; err.textContent = e.message; }
        });
      });
    }

    function ecrfDialog(s, v) {
      A.get('/api/subjects/forms').then((defs) => {
        const def = (defs.forms || []).find((f) => f.id === v.formId);
        const form = U.el('div');
        if (!def) {
          form.appendChild(U.el('div', { class: 'callout danger', text: '未找到表单定义' }));
          U.modal(form, { title: 'eCRF 录入' });
          return;
        }
        form.appendChild(U.el('div', { class: 'card-sub', text: def.intro }));
        const inputs = {};
        def.fields.forEach((f) => {
          form.appendChild(U.el('label', { text: f.label + (f.required ? ' *' : '') }));
          let input;
          if (f.type === 'select') {
            input = U.el('select');
            input.appendChild(U.el('option', { value: '', text: '（未选）' }));
            (f.options || []).forEach((o) => input.appendChild(U.el('option', { value: o, text: o })));
            input.value = (v.data && v.data[f.key]) || '';
          } else {
            input = U.el('input', {
              type: f.type === 'number' ? 'number' : (f.type === 'date' ? 'date' : 'text'),
              value: (v.data && v.data[f.key] != null) ? v.data[f.key] : '',
            });
          }
          inputs[f.key] = { el: input, type: f.type };
          form.appendChild(input);
          if (f.hint) form.appendChild(U.el('div', { style: 'font-size:12px;color:#6b7a8c;margin:-4px 0 6px', text: '· ' + f.hint }));
        });
        const err = U.el('div', { class: 'callout danger', style: 'display:none' });
        form.appendChild(err);
        const ok = U.el('button', { class: 'btn', text: '保存（服务端执行逻辑核查）' });
        form.appendChild(ok);
        const m = U.modal(form, { title: 'eCRF 录入 · ' + v.name + '（' + s.subjectNo + '）', onClose: false });
        ok.addEventListener('click', async () => {
          const payload = {};
          Object.keys(inputs).forEach((k) => {
            const val = inputs[k].el.value;
            if (val === '' || val === null) return;
            payload[k] = inputs[k].type === 'number' ? Number(val) : val;
          });
          try {
            await A.put('/api/subjects/' + s.id + '/visits/' + v.id, { data: payload, status: 'done' });
            m.close();
            U.toast('eCRF 已保存并通过逻辑核查', 'ok');
            loadDetail();
          } catch (e) {
            err.style.display = '';
            err.innerHTML = '✗ <b>逻辑核查未通过，数据未入库：</b><br>' + U.esc(e.message);
          }
        });
      });
    }

    function newSubjectDialog() {
      const form = U.el('div');
      const no = U.el('input', { type: 'text', placeholder: '3–6 位数字，如 1005' });
      const site = U.el('input', { type: 'text', value: '演示中心 A' });
      const protocol = U.el('input', { type: 'text', value: 'DEMO-2026-001 v1.0' });
      const consent = U.el('input', { type: 'date', value: new Date().toISOString().slice(0, 10) });
      const note = U.el('textarea', { rows: '2' });
      form.appendChild(U.el('label', { text: '受试者编号（不要填姓名 / 身份证号）' })); form.appendChild(no);
      form.appendChild(U.el('label', { text: '中心' })); form.appendChild(site);
      form.appendChild(U.el('label', { text: '方案编号' })); form.appendChild(protocol);
      form.appendChild(U.el('label', { text: '知情同意日期' })); form.appendChild(consent);
      form.appendChild(U.el('label', { text: '备注' })); form.appendChild(note);
      const err = U.el('div', { class: 'callout danger', style: 'display:none' });
      form.appendChild(err);
      const ok = U.el('button', { class: 'btn', text: '登记' });
      form.appendChild(ok);
      const m = U.modal(form, { title: '登记受试者（伪匿名）', onClose: false });
      ok.addEventListener('click', async () => {
        try {
          await A.post('/api/subjects', {
            subjectNo: no.value.trim(), site: site.value, protocolCode: protocol.value,
            consentDate: consent.value, note: note.value, status: 'screened',
          });
          m.close();
          U.toast('受试者已登记', 'ok');
          loadList();
        } catch (e) { err.style.display = ''; err.textContent = e.message; }
      });
    }

    statusSel.addEventListener('change', loadList);
    q.addEventListener('input', () => { clearTimeout(q._t); q._t = setTimeout(loadList, 300); });
    refresh.addEventListener('click', () => { loadList(); loadDetail(); });
    loadList();
  }

  /* ---------------------------------------------------------- 日历 */

  function calendar() {
    const card = U.el('div', { class: 'card' });
    card.appendChild(U.el('div', { class: 'card-title', text: '访视日历与提醒' }));
    const bar = U.el('div', { style: 'display:flex;gap:10px;align-items:center;margin-bottom:10px' });
    const days = U.el('select', { style: 'width:auto' });
    [['14', '未来 14 天'], ['30', '未来 30 天'], ['60', '未来 60 天'], ['90', '未来 90 天']].forEach(([v, t], i) =>
      days.appendChild(U.el('option', { value: v, text: t, selected: i === 1 ? 'selected' : null })));
    bar.appendChild(days);
    bar.appendChild(U.el('a', { class: 'btn small', href: '/api/subjects/calendar.ics?days=90', text: '⬇ 导出 .ics（可导入 Outlook / Google 日历）' }));
    card.appendChild(bar);
    const warn = U.el('div', { class: 'callout info' });
    const wrap = U.el('div');
    card.appendChild(warn);
    card.appendChild(wrap);
    root.appendChild(card);

    async function load() {
      const r = await A.get('/api/subjects/upcoming?days=' + days.value);
      const overdue = r.visits.filter((v) => v.overdue).length;
      warn.className = 'callout ' + (overdue ? 'danger' : 'ok');
      warn.textContent = overdue
        ? '⚠ 有 ' + overdue + ' 个访视已逾期：超窗未做将构成方案偏离，需尽快联系中心并留痕。'
        : '✓ 当前没有逾期访视。';
      const tbl = U.el('table', { class: 'tbl' });
      tbl.innerHTML = '<thead><tr><th>计划日期</th><th>剩余</th><th>受试者</th><th>中心</th><th>访视</th><th>类型</th></tr></thead><tbody>' +
        r.visits.map((v) => '<tr' + (v.overdue ? ' style="color:#b91c1c"' : '') + '><td class="num">' + U.esc(v.plannedDate) + '</td>' +
          '<td>' + (v.overdue ? '逾期 ' + Math.abs(v.days) + ' 天' : '还有 ' + v.days + ' 天') + '</td>' +
          '<td class="num">' + U.esc(v.subjectNo) + '</td><td>' + U.esc(v.site) + '</td>' +
          '<td>' + U.esc(v.visit) + '</td><td>' + U.esc(v.visitType || '—') + '</td></tr>').join('') + '</tbody>';
      wrap.innerHTML = '';
      wrap.appendChild(tbl);
    }
    days.addEventListener('change', load);
    load();
  }

  /* ---------------------------------------------------------- 漏斗 */

  function funnel() {
    const card = U.el('div', { class: 'card' });
    card.appendChild(U.el('div', { class: 'card-title', text: '入组漏斗与统计' }));
    const wrap = U.el('div');
    const monthly = U.el('div', { style: 'margin-top:14px' });
    card.appendChild(wrap);
    card.appendChild(monthly);
    root.appendChild(card);

    A.get('/api/subjects').then((r) => {
      const st = r.stats;
      const max = Math.max.apply(null, st.funnel.map((f) => f.count).concat([1]));
      const colors = ['#1f4e79', '#2e74b5', '#4498d6', '#70ad47', '#007060'];
      wrap.innerHTML = st.funnel.map((f, i) =>
        '<div style="display:flex;align-items:center;gap:10px;margin:7px 0">' +
        '<div style="width:110px;font-size:13px">' + U.esc(f.stage) + '</div>' +
        '<div style="flex:1;background:#eef2f7;border-radius:4px;height:24px">' +
        '<div style="width:' + Math.round(f.count / max * 100) + '%;background:' + colors[i % colors.length] + ';height:24px;border-radius:4px"></div>' +
        '</div><div class="num" style="width:70px;text-align:right">' + f.count + ' 例</div></div>').join('');
      wrap.appendChild(U.el('div', { class: 'card-sub', style: 'margin-top:10px', text:
        '合计 ' + st.total + ' 例　入组 ' + st.enrolled + ' 例　随访中 ' + st.ongoing + ' 例　完成 ' + st.completed +
        ' 例　退出 ' + st.withdrawn + ' 例　筛选失败 ' + st.screenFailed + ' 例　筛选失败率 ' + st.screenFailureRate +
        '%　知情同意率 ' + st.consentRate + '%' }));
      monthly.appendChild(U.el('div', { class: 'card-title', text: '按月登记 / 入组例数' }));
      const tbl = U.el('table', { class: 'tbl' });
      tbl.innerHTML = '<thead><tr><th>月份</th><th>例数</th></tr></thead><tbody>' +
        (st.byMonth || []).map((m) => '<tr><td class="num">' + U.esc(m.month) + '</td><td class="num">' + m.count + '</td></tr>').join('') + '</tbody>';
      monthly.appendChild(tbl);
    }).catch((e) => { wrap.appendChild(U.el('div', { class: 'callout danger', text: e.message })); });
  }

  draw();
});