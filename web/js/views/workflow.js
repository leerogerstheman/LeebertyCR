/* 工作流执行：流程库 → 记录列表 → 记录执行（步骤推进/签名/留痕）。与 GxP-Workbench
   的「受控记录 = 一串有角色门槛、部分需签名步骤」引擎同构，界面直白呈现每一步。 */

window.Views.register('workflow', function (root, ctx) {
  const App = ctx.app;
  const C = App.content.workflows;
  const U = UI;
  const A = API;

  const ROLE_LABEL = { cra: 'CRA', crc: 'CRC', pi: '研究者', qa: 'QA 复核', viewer: '旁观' };
  const ROLE_CLS = { cra: 'badge-cra', crc: 'badge-crc', pi: 'badge-pi', qa: 'badge-qa' };
  const CRIT_LABEL = { minor: '一般', major: '重要', critical: '严重' };

  /* ------------------------------------------------------------ 头部导航 */

  const modeList = !!ctx.query.list;
  const modeRec = ctx.query.rec || null;

  const head = U.el('div', { class: 'page-head' });
  head.appendChild(U.el('h1', { text: '工作流执行' }));
  head.appendChild(U.el('div', { class: 'intro', text: C.intro }));
  root.appendChild(head);

  const tabs = U.el('div', { style: 'display:flex;gap:8px;margin-bottom:14px' });
  const tabLib = U.el('button', { class: 'btn' + (!modeList && !modeRec ? ' primary' : ''), text: '🗂 流程库（8 类定义）' });
  tabLib.addEventListener('click', () => App.navigate('#workflow'));
  const tabRec = U.el('button', { class: 'btn' + (modeList || modeRec ? ' primary' : ''), text: '📒 我的记录' });
  tabRec.addEventListener('click', () => App.navigate('#workflow?list'));
  tabs.appendChild(tabLib);
  tabs.appendChild(tabRec);
  root.appendChild(tabs);

  if (modeRec) { renderRecordDetail(modeRec); return; }
  if (modeList) { renderRecordList(); return; }
  renderLibrary();

  /* ------------------------------------------------------------ 流程库 */

  function renderLibrary() {
    const grid = U.el('div', { class: 'grid grid-2' });
    for (const w of C.workflows) {
      const card = U.el('div', { class: 'card', style: 'cursor:pointer' });
      card.appendChild(U.el('div', { class: 'card-title', html:
        '<span class="badge badge-muted num">' + U.esc(w.recordPrefix) + '</span> ' + U.esc(w.name) +
        ' <span style="font-weight:400;color:#8a97a5;font-size:12px">' + U.esc(w.nameEn || '') + '</span>' }));
      card.appendChild(U.el('div', { class: 'card-sub', html:
        U.esc(w.description || '') + '<br>' +
        '<span class="tag">' + w.stepCount + ' 步</span><span class="tag">' + U.esc(w.states.join(' → ')) + '</span>' +
        '<span class="tag">' + (w.recordCount || 0) + ' 条记录</span>' }));
      // 步骤条
      const flow = U.el('div', { style: 'display:flex;flex-wrap:wrap;gap:4px;margin-top:6px' });
      const roleSet = new Set();
      w.steps.forEach((s, i) => {
        s.role.forEach((r) => roleSet.add(r));
        flow.appendChild(U.el('span', { class: 'tag', style: 'margin:2px', html:
          (i + 1) + '. ' + U.esc(s.name) + (s.type === 'signature' ? ' ✍️' : '') + (s.independentOfAuthor ? ' 🔒' : '') }));
      });
      card.appendChild(flow);
      const roleBadges = [...roleSet].map((r) => '<span class="badge ' + ROLE_CLS[r] + '">' + ROLE_LABEL[r] + '</span>').join(' ');
      card.appendChild(U.el('div', { style: 'margin-top:8px', html: '参与身份：' + roleBadges }));
      const row = U.el('div', { style: 'display:flex;gap:8px;margin-top:10px' });
      const openBtn = U.el('button', { class: 'btn small', text: '查看流程图与启动记录' });
      openBtn.addEventListener('click', (e) => { e.stopPropagation(); renderTypeDetail(w.code); });
      const createBtn = U.el('button', { class: 'btn small primary', text: '＋ 新建' + (w.recordPrefix || '') + ' 记录' });
      createBtn.addEventListener('click', (e) => { e.stopPropagation(); openCreateModal(w.code); });
      row.appendChild(openBtn);
      row.appendChild(createBtn);
      card.appendChild(row);
      card.addEventListener('click', () => renderTypeDetail(w.code));
      grid.appendChild(card);
    }
    root.appendChild(grid);
    root.appendChild(U.el('div', { class: 'callout info', style: 'font-size:12.5px', html:
      '<b>怎么用：</b>点卡片查看流程图 → 「新建记录」填表创建 → 系统按步骤推进并校验你的当前身份（左栏切换）。' +
      '签名步骤（✍️）需输入姓名并勾选声明；独立复核步骤（🔒）要求由与提出人不同的身份执行。所有动作自动留痕。' }));
  }

  /* ------------------------------------------------------------ 类型详情 */

  function renderTypeDetail(code) {
    const w = C.workflows.find((x) => x.code === code);
    if (!w) return;
    const card = U.el('div', { class: 'card' });
    card.appendChild(U.el('div', { class: 'card-title', html:
      '<span class="badge badge-muted num">' + U.esc(w.recordPrefix) + '</span> ' + U.esc(w.name) }));
    card.appendChild(U.el('div', { class: 'card-sub', text: w.description }));
    card.appendChild(U.el('div', { class: 'callout info', style: 'font-size:12.5px', html:
      '<b>状态机：</b>' + w.states.map((s) => U.esc(s)).join(' → ') +
      '（初始 ' + w.states.indexOf(w.initialState) + ' → 终态 ' + w.terminalStates.join('/') + '）· SLA ' + (w.slaDays || '-') + ' 天' }));

    // 步骤定义流
    w.steps.forEach((s, i) => {
      const blk = U.el('div', { style: 'display:flex;gap:10px;padding:10px 0;border-bottom:1px dashed var(--line);' });
      const num = U.el('span', { class: 'step-num', text: String(i + 1) });
      blk.appendChild(num);
      const main = U.el('div', { style: 'flex:1;min-width:0' });
      const titleLine = U.el('div', { html:
        '<b>' + U.esc(s.name) + '</b> ' +
        (s.type === 'signature' ? '<span class="badge badge-qa">✍️ 签署（' + U.esc(s.signatureMeaning) + '）</span>' : '<span class="badge badge-muted">任务步骤</span>') +
        (s.independentOfAuthor ? '<span class="badge badge-danger">🔒 独立复核</span>' : '') +
        '<span class="badge badge-both">→ ' + U.esc(s.onComplete || s.name) + '</span>' });
      main.appendChild(titleLine);
      main.appendChild(U.el('div', { style: 'margin:4px 0', html: '执行身份：' + s.role.map((r) => '<span class="badge ' + ROLE_CLS[r] + '">' + ROLE_LABEL[r] + '</span>').join(' ') }));
      if (s.guidance) main.appendChild(U.el('div', { class: 'why-box', style: 'font-size:12.5px', html: '💡 ' + U.esc(s.guidance) }));
      if (s.form && s.form.length) {
        main.appendChild(U.el('div', { style: 'margin-top:6px;font-size:12px;color:#5c6b7a', html:
          '表单：' + s.form.map((f) => U.esc(f.label) + (f.required ? ' *' : '')).join(' · ') }));
      }
      blk.appendChild(main);
      card.appendChild(blk);
    });

    const row = U.el('div', { style: 'display:flex;gap:8px;margin-top:12px' });
    const back = U.el('button', { class: 'btn', text: '← 返回流程库' });
    back.addEventListener('click', () => App.navigate('#workflow'));
    const create = U.el('button', { class: 'btn primary', text: '＋ 启动一条新记录' });
    create.addEventListener('click', () => openCreateModal(w.code));
    const list = U.el('button', { class: 'btn', text: '查看此类记录' });
    list.addEventListener('click', () => App.navigate('#workflow?list'));
    row.appendChild(back);
    row.appendChild(create);
    row.appendChild(list);
    card.appendChild(row);
    root.appendChild(card);
  }

  /* ------------------------------------------------------------ 新建记录 */

  function openCreateModal(code) {
    const w = C.workflows.find((x) => x.code === code);
    if (!w) return;
    const body = U.el('div');
    body.appendChild(U.el('div', { class: 'callout info', style: 'font-size:12.5px', html:
      '当前账号：<b>' + U.esc(App.user.fullName) + '（' + (ROLE_LABEL[App.user.role] || App.user.role) + '）</b>——记录将以该账号为提出人创建；后续步骤需由步骤允许的角色账号执行（可退出后换账号）。' }));
    const fields = {};
    for (const f of w.fields) {
      const wrap = U.el('div', { class: 'field' });
      wrap.appendChild(U.el('label', { html: U.esc(f.label) + (f.required ? ' <span style="color:#b91c1c">*</span>' : '') }));
      const input = renderField(f);
      wrap.appendChild(input);
      if (f.help) wrap.appendChild(U.el('div', { style: 'font-size:12px;color:#8a97a5;margin-top:2px', text: f.help }));
      fields[f.key] = input;
      body.appendChild(wrap);
    }
    const errBox = U.el('div', { class: 'callout danger', style: 'display:none' });
    body.appendChild(errBox);

    const row = U.el('div', { style: 'display:flex;justify-content:flex-end;gap:8px' });
    const cancel = U.el('button', { class: 'btn', text: '取消' });
    const ok = U.el('button', { class: 'btn primary', text: '创建记录' });
    row.appendChild(cancel);
    row.appendChild(ok);
    body.appendChild(row);

    const m = U.modal(body, { title: '新建 ' + w.name + '（' + w.recordPrefix + '）' });

    ok.addEventListener('click', async () => {
      const values = {};
      let missing = false;
      for (const f of w.fields) {
        const v = fields[f.key].value !== undefined ? fields[f.key].value : '';
        if (f.type === 'select' && !v && f.options && f.options.length) {
          // 未选择时用第一个选项
          if (!f.required) { values[f.key] = ''; continue; }
          missing = true;
        }
        values[f.key] = f.type === 'number' ? Number(v) : String(v || '').trim();
        if (f.required && !values[f.key]) missing = true;
      }
      if (missing) {
        errBox.style.display = 'block';
        errBox.textContent = '请填写全部必填项（带 * 的字段）。';
        return;
      }
      try {
        const rec = await A.post('/api/records', { type: code, values });
        m.close();
        U.toast('已创建 ' + rec.recordKey, 'ok');
        App.navigate('#workflow?rec=' + rec.recordKey);
      } catch (err) {
        errBox.style.display = 'block';
        errBox.textContent = '创建失败：' + err.message;
      }
    });
    cancel.addEventListener('click', () => m.close());
  }

  function renderField(f, value) {
    const val = value !== undefined && value !== null ? String(value) : '';
    if (f.type === 'select') {
      const sel = U.el('select');
      sel.appendChild(U.el('option', { value: '', text: '— 请选择 —' }));
      for (const o of f.options || []) sel.appendChild(U.el('option', { value: o, text: o }));
      if (val) sel.value = val;
      return sel;
    }
    if (f.type === 'textarea') return U.el('textarea', { rows: '3', placeholder: f.help || '' });
    if (f.type === 'date') return U.el('input', { type: 'date' });
    return U.el('input', { type: 'text', placeholder: f.help || '' });
  }

  /* ------------------------------------------------------------ 记录列表 */

  async function renderRecordList() {
    let data = null;
    try {
      data = await A.get('/api/records?open=1');
    } catch (err) {
      root.appendChild(U.el('div', { class: 'callout danger', text: '加载记录失败：' + err.message }));
      return;
    }
    const { records, types } = data;

    const card = U.el('div', { class: 'card' });
    card.appendChild(U.el('div', { class: 'card-title', html: '进行中的记录 <a class="btn small" style="margin-left:8px" href="/api/export/records.csv" target="_blank">⬇ 导出记录 CSV</a>' }));
    card.appendChild(U.el('div', { class: 'card-sub', text: '演示记录以「演示」标记，可随时删除。已到终态（关闭/取消）的记录请查看全部记录。' }));
    if (App.user && App.user.role === 'admin') {
      const reseed = U.el('button', { class: 'btn small ghost', text: '↻ 重新生成演示记录' });
      reseed.addEventListener('click', async () => {
        reseed.disabled = true;
        try {
          const r = await A.post('/api/records/seed-demo', {});
          U.toast('已补充 ' + r.added + ' 条演示记录', 'ok');
          App.navigate('#workflow');
        } catch (e) { U.toast(e.message, 'danger'); reseed.disabled = false; }
      });
      card.appendChild(reseed);
    }
    const filterRow = U.el('div', { style: 'display:flex;gap:10px;align-items:center;flex-wrap:wrap' });
    const sel = U.el('select', { style: 'width:auto' });
    sel.appendChild(U.el('option', { value: '', text: '全部类型（' + records.length + '）' }));
    for (const t of types) sel.appendChild(U.el('option', { value: t.code, text: t.name + '（' + t.recordCount + '）' }));
    const showAll = U.el('button', { class: 'btn small ghost', text: '显示全部状态' });
    showAll.addEventListener('click', async () => {
      const all = await A.get('/api/records');
      renderRows(all.records);
      sel.value = '';
    });
    filterRow.appendChild(sel);
    filterRow.appendChild(showAll);
    card.appendChild(filterRow);
    root.appendChild(card);

    const list = U.el('div');
    root.appendChild(list);

    function renderRows(recordsArr) {
      list.innerHTML = '';
      if (!recordsArr.length) {
        list.appendChild(U.el('div', { class: 'callout info', text: '还没有记录。去「流程库」选一个流程，从新建一条开始吧。' }));
        return;
      }
      for (const r of recordsArr) {
        const row = U.el('div', { class: 'todo-row' + (r.overdue ? ' overdue' : '') + (r.status === 'closed' || r.status === 'cancelled' ? ' done' : '') });
        const main = U.el('div', { class: 'td-main', style: 'cursor:pointer' });
        const titleHtml = '<span class="num" style="font-family:var(--mono);color:#0f766e">' + U.esc(r.recordKey) + '</span> ' +
          (r.demo ? '<span class="badge badge-warn">演示</span>' : '') +
          '<b> ' + U.esc(r.title) + '</b>';
        main.appendChild(U.el('div', { class: 'td-title', html: titleHtml }));
        const meta = [
          '<span class="badge badge-muted">' + U.esc(r.processName) + '</span>',
          '<span class="badge ' + (r.status === 'closed' ? 'badge-ok' : r.status === 'cancelled' ? 'badge-muted' : 'badge-both') + '">' + U.esc(r.status) + '</span>',
          '<span class="badge badge-muted">' + stepProgress(r) + '</span>',
        ];
        if (r.criticality) meta.push('<span class="badge badge-warn">' + (CRIT_LABEL[r.criticality] || r.criticality) + '</span>');
        if (r.dueDate && !r.closedAt) {
          meta.push(r.overdue ? '<span class="badge badge-danger">已超期</span>' : '<span class="badge badge-muted">' + U.fmtDate(r.dueDate) + ' 前</span>');
        }
        main.appendChild(U.el('div', { class: 'td-meta', html: meta.join(' ') }));
        main.addEventListener('click', () => App.navigate('#workflow?rec=' + r.recordKey));
        row.appendChild(main);
        const open = U.el('button', { class: 'btn small', text: '打开' });
        open.addEventListener('click', () => App.navigate('#workflow?rec=' + r.recordKey));
        row.appendChild(open);
        list.appendChild(row);
      }
    }
    renderRows(records);

    sel.addEventListener('change', async () => {
      if (!sel.value) { renderRows(records); return; }
      const filtered = await A.get('/api/records?type=' + sel.value + '&open=1');
      renderRows(filtered.records);
    });
  }

  function stepProgress(r) {
    const total = r.stepCount || r.steps.length;
    return '步骤 ' + Math.min(r.stepIndex, total) + ' / ' + total;
  }

  /* ------------------------------------------------------------ 记录详情 */

  async function renderRecordDetail(key) {
    const wrap = U.el('div');
    root.appendChild(wrap);
    let record = null;
    try {
      record = await A.get('/api/records/' + encodeURIComponent(key));
    } catch (err) {
      wrap.appendChild(U.el('div', { class: 'callout danger', text: '加载失败：' + err.message }));
      return;
    }
    const def = C.workflows.find((w) => w.code === record.processCode);
    const terminal = def ? (def.terminalStates || []).includes(record.status) : false;

    // 返回行
    const backRow = U.el('div', { style: 'margin-bottom:10px' });
    const back = U.el('button', { class: 'btn small ghost', text: '← 返回记录列表' });
    back.addEventListener('click', () => App.navigate('#workflow?list'));
    backRow.appendChild(back);
    wrap.appendChild(backRow);

    // 头卡
    const hd = U.el('div', { class: 'card' });
    hd.appendChild(U.el('div', { class: 'card-title', html:
      '<span class="num" style="font-family:var(--mono);color:#0f766e">' + U.esc(record.recordKey) + '</span> ' +
      (record.demo ? '<span class="badge badge-warn">演示记录</span>' : '') +
      (record.overdue ? '<span class="badge badge-danger">已超期</span>' : '') }));
    hd.appendChild(U.el('div', { style: 'font-size:16px;font-weight:700;margin-bottom:4px', text: record.title }));
    if (record.summary) hd.appendChild(U.el('div', { class: 'card-sub', text: record.summary }));
    hd.appendChild(U.el('div', { style: 'display:flex;gap:6px;flex-wrap:wrap', html: [
      '<span class="badge badge-muted">' + U.esc(record.processName) + '</span>',
      '<span class="badge badge-both">状态：' + U.esc(record.status) + '</span>',
      record.criticality ? '<span class="badge badge-warn">' + (CRIT_LABEL[record.criticality] || record.criticality) + '</span>' : '',
      record.dueDate && !record.closedAt ? '<span class="badge badge-muted">期限：' + U.fmtDate(record.dueDate) + '</span>' : '',
      '<span class="badge badge-muted">提出：' + (ROLE_LABEL[record.author.role] || record.author.role) + '</span>',
      record.closedAt ? '<span class="badge badge-ok">已关闭：' + U.fmtDate(record.closedAt) + '</span>' : '',
    ].join('') }));
    if (record.data && record.data.record) {
      const kv = objectToKV(record.data.record, def);
      if (kv) hd.appendChild(U.el('div', { class: 'tag-line', html: kv }));
    }
    wrap.appendChild(hd);

    // 记录级字段速览
    if (def && record.data && record.data.record) {
      const kvCard = U.el('details', { class: 'acc' });
      kvCard.appendChild(U.el('summary', { text: '记录信息（创建时填写）' }));
      const tbl = U.el('table', { class: 'tbl' });
      const rows = (def.fields || []).map((f) => {
        const v = record.data.record[f.key];
        if (v === undefined || v === null || v === '') return null;
        return '<tr><td style="width:30%"><b>' + U.esc(f.label) + '</b></td><td>' + U.esc(String(v)) + '</td></tr>';
      }).filter(Boolean).join('');
      tbl.innerHTML = rows ? '<tbody>' + rows + '</tbody>' : '<tbody><tr><td>（无）</td></tr></tbody>';
      kvCard.appendChild(tbl);
      wrap.appendChild(kvCard);
    }

    // 步骤流
    if (def) {
      const flowCard = U.el('div', { class: 'card' });
      flowCard.appendChild(U.el('div', { class: 'card-title', text: '流程进度（状态机推进）' }));
      const flow = U.el('div', { class: 'flow' });
      def.steps.forEach((s, i) => {
        const st = i < record.stepIndex ? 'done' : i === record.stepIndex ? 'current' : 'pending';
        const el = U.el('div', { class: 'flow-step wstep ' + st });
        const meta = [];
        if (st === 'done') meta.push('<div class="fs-flag ok">✓ 完成' + (record.steps[i].completedByRole ? ' · ' + ROLE_LABEL[record.steps[i].completedByRole] : '') + '</div>');
        if (st === 'current') meta.push('<div class="fs-flag cur">▶ 当前步骤</div>');
        if (s.type === 'signature') meta.push('<div class="fs-flag sig">✍️ 签署</div>');
        if (s.independentOfAuthor) meta.push('<div class="fs-flag ind">🔒 独立复核</div>');
        el.innerHTML = '<span class="fs-n">' + (i + 1) + '</span>' +
          '<div class="fs-name">' + U.esc(s.name) + '</div>' +
          '<div class="fs-who">' + s.role.map((r) => '<span class="badge ' + ROLE_CLS[r] + '" style="margin:1px">' + ROLE_LABEL[r] + '</span>').join('') + '</div>' +
          meta.join('') +
          '<div class="fs-out">→ ' + U.esc(s.onComplete || '') + '</div>';
        flow.appendChild(el);
      });
      flowCard.appendChild(flow);
      if (terminal) {
        flowCard.appendChild(U.el('div', { class: 'callout ' + (record.status === 'cancelled' ? 'warn' : 'ok'), style: 'margin-top:10px', html:
          record.status === 'cancelled' ? '本记录已取消（终态）。' : '本记录已关闭（终态）：全部步骤走完，工作流结束。' }));
      } else if (record.stepIndex >= def.steps.length) {
        flowCard.appendChild(U.el('div', { class: 'callout ok', style: 'margin-top:10px', text: '全部步骤已完成，等待状态落定。' }));
      }
      // 持久化字段（影响评估/根因/有效性）
      if (record.data && record.data.persisted && Object.keys(record.data.persisted).length) {
        const p = record.data.persisted;
        const labels = { impact_assessment: '影响评估', root_cause: '根本原因', effectiveness_result: '有效性结论' };
        flowCard.appendChild(U.el('details', { class: 'acc', style: 'margin-top:10px' }));
        const det = flowCard.lastChild;
        det.appendChild(U.el('summary', { text: '流转摘要（步骤中沉淀的关键结论）' }));
        det.appendChild(U.el('div', { style: 'padding:4px 6px', html: Object.entries(p).map(([k, v]) =>
          '<div style="margin:6px 0"><b>' + (labels[k] || k) + '：</b>' + U.esc(String(v)) + '</div>').join('') }));
      }
      wrap.appendChild(flowCard);
    }

    // 权限提示 + 当前步骤执行区
    if (!terminal && record.stepIndex < def.steps.length) {
      renderStepPanel(wrap, record, def);
    }

    // 历史
    renderHistory(wrap, record);

    // 操作
    const ops = U.el('div', { class: 'card', style: 'display:flex;gap:8px;flex-wrap:wrap;align-items:center' });
    ops.appendChild(U.el('span', { style: 'font-size:12.5px;color:#8a97a5;font-weight:600;margin-right:auto', text: '记录操作' }));
    if (!terminal) {
      const cancelBtn = U.el('button', { class: 'btn danger small', text: '✖ 取消记录' });
      cancelBtn.addEventListener('click', () => {
        const body = U.el('div');
        body.appendChild(U.el('div', { class: 'field' }));
        const ta = body.firstChild;
        ta.appendChild(U.el('label', { text: '取消理由（至少 5 个字）' }));
        const input = U.el('textarea', { rows: '2' });
        ta.appendChild(input);
        const row = U.el('div', { style: 'display:flex;justify-content:flex-end;gap:8px;margin-top:8px' });
        const no = U.el('button', { class: 'btn', text: '再想想' });
        const yes = U.el('button', { class: 'btn danger', text: '确认取消' });
        row.appendChild(no);
        row.appendChild(yes);
        body.appendChild(row);
        const m = U.modal(body, { title: '取消 ' + record.recordKey });
        no.addEventListener('click', () => m.close());
        yes.addEventListener('click', async () => {
          try {
            await A.post('/api/records/' + encodeURIComponent(record.recordKey) + '/cancel', { reason: input.value });
            m.close();
            U.toast('记录已取消', 'ok');
            renderRecordDetail(record.recordKey);
          } catch (err) {
            U.toast(err.message, 'err');
          }
        });
      });
      ops.appendChild(cancelBtn);
    }
    const delBtn = U.el('button', { class: 'btn danger small', text: '🗑 删除记录' });
    delBtn.addEventListener('click', () => {
      U.confirmDlg('删除记录', '确定删除 ' + record.recordKey + ' 吗？此操作不可恢复（用于清理演示记录；真实系统不允许删除）。', async () => {
        try {
          await A.del('/api/records/' + encodeURIComponent(record.recordKey));
          U.toast('已删除', 'ok');
          App.navigate('#workflow?list');
        } catch (err) { U.toast(err.message, 'err'); }
      });
    });
    ops.appendChild(delBtn);
    wrap.appendChild(ops);
  }

  function objectToKV(obj, def) {
    if (!obj || !Object.keys(obj).length) return '';
    const labels = {};
    for (const f of def ? def.fields || [] : []) labels[f.key] = f.label;
    const skip = { title: 1, summary: 1 };
    const parts = Object.entries(obj).filter(([k]) => !skip[k] && obj[k] !== '').map(([k, v]) =>
      '<span class="tag"><b>' + U.esc(labels[k] || k) + '</b>：' + U.esc(String(v)) + '</span>');
    return parts.join('');
  }

  /* ------------------------------------------------------------ 步骤执行区 */

  function renderStepPanel(wrap, record, def) {
    const step = def.steps[record.stepIndex];
    const role = App.user.role;
    const allowed = step.role.includes(role);
    // 独立复核门按“提出账号”判定（与服务端一致：比较 author.userId 与当前登录用户）
    const blockedIndependence = step.independentOfAuthor && record.author.userId === App.user.username;
    const usable = allowed && !blockedIndependence && role !== 'viewer';

    const panel = U.el('div', { class: 'card' });
    panel.appendChild(U.el('div', { class: 'card-title', html:
      '▶ 当前步骤：' + U.esc(step.name) +
      (step.type === 'signature' ? ' <span class="badge badge-qa">✍️ 需签名</span>' : '') +
      (step.independentOfAuthor ? ' <span class="badge badge-danger">🔒 独立复核</span>' : '') }));

    if (step.guidance) panel.appendChild(U.el('div', { class: 'why-box', html: '💡 ' + U.esc(step.guidance) }));

    // 角色门提示
    if (!allowed) {
      panel.appendChild(U.el('div', { class: 'callout danger', html:
        '<b>角色门未通过（服务端强制）：</b>本步骤要求由 <b>' + step.role.map((r) => ROLE_LABEL[r]).join(' / ') + '</b> 角色执行。' +
        '当前账号「' + U.esc(App.user.fullName) + '」的角色是 <b>' + (ROLE_LABEL[role] || role) + '</b>。' }));
      panel.appendChild(U.el('div', { class: 'why-box', style: 'margin-bottom:8px', html:
        '<b>为什么不能临时切换：</b>角色属于账号，不属于请求（职责分离：角色由登录凭证决定，Annex 11 §12.1）。' +
        '要执行此步骤，请<b>退出登录</b>，再用 '+ step.role.map((r) => ROLE_LABEL[r]).join(' 或 ') +' 角色的账号（如演示账号）登录。' }));
      const logout = U.el('button', { class: 'btn', text: '退出登录（切换身份）' });
      logout.addEventListener('click', async () => {
        try { await A.post('/api/auth/logout', {}); } catch (e) { /* ignore */ }
        location.reload();
      });
      panel.appendChild(logout);
      wrap.appendChild(panel);
      return;
    }
    if (blockedIndependence) {
      panel.appendChild(U.el('div', { class: 'callout danger', html:
        '<b>独立复核门未通过：</b>本记录由 <b>' + U.esc(record.author.name || record.author.userId) + '（' + ROLE_LABEL[record.author.role] + '）</b> 提出，' +
        '而本步骤要求独立复核（Annex 11 §12.1 / ICH Q10 §3.2：提出人不能自己关闭/放行）。' }));
      panel.appendChild(U.el('div', { class: 'why-box', style: 'margin-bottom:8px', html:
        '与本账号相同角色的账号都不能执行（比较的是<b>提出账号</b>）。请退出登录，用 ' +
        step.role.filter((r) => r !== record.author.role).map((r) => ROLE_LABEL[r]).join(' 或 ') +
        ' 角色的账号执行（演示账号：demo_qa / demo_pi）。' }));
      const logout = U.el('button', { class: 'btn', text: '退出登录（切换身份）' });
      logout.addEventListener('click', async () => {
        try { await A.post('/api/auth/logout', {}); } catch (e) { /* ignore */ }
        location.reload();
      });
      panel.appendChild(logout);
      wrap.appendChild(panel);
      return;
    }

    // 表单
    panel.appendChild(U.el('div', { style: 'font-size:12.5px;color:#5c6b7a;margin-bottom:8px', html:
      '以 <b>' + ROLE_LABEL[role] + '</b> 身份执行本步骤。' +
      (step.type === 'signature' ? ' 完成后将记录签署（姓名、含义、时间）。' : ' 完成后自动流转到「' + U.esc(step.onComplete) + '」。') }));

    const inputs = {};
    for (const f of step.form) {
      const wrapEl = U.el('div', { class: 'field' });
      wrapEl.appendChild(U.el('label', { html: U.esc(f.label) + (f.required ? ' <span style="color:#b91c1c">*</span>' : '') }));
      const input = renderField(f);
      wrapEl.appendChild(input);
      if (f.help) wrapEl.appendChild(U.el('div', { style: 'font-size:12px;color:#8a97a5;margin-top:2px', text: f.help }));
      inputs[f.key] = input;
      panel.appendChild(wrapEl);
    }

    // 签名块（双要素：标识码+口令 + 一次性挑战码，21 CFR Part 11.200(a)(1)(i)）
    let signUsername, signPassword, signNonceInput, signNonceBtn, signNonceShow, signReason, signAgree;
    if (step.type === 'signature') {
      const sigBox = U.el('div', { style: 'border:1px solid #d8e2ec;border-radius:8px;padding:12px;background:#f8fafc;margin-bottom:10px' });
      sigBox.appendChild(U.el('div', { style: 'font-weight:700;margin-bottom:4px;font-size:13px', text: '✍️ 电子签名（两个独立要素）' }));
      sigBox.appendChild(U.el('div', { class: 'callout info', style: 'font-size:12px;padding:7px 10px;margin:4px 0 8px', html:
        '要素 A：<b>标识码 + 口令</b>（重新输入，不使用已登录会话）；要素 B：<b>一次性验证码</b>（点「获取验证码」后输入，' + App.meta.policy.signatureTtlSeconds + ' 秒内有效、只能用一次）。' +
        '签名将记录姓名、时间、含义并关联到本记录（21 CFR Part 11.200(a)(2)-(3)）。' }));
      const g2 = U.el('div', { style: 'display:grid;grid-template-columns:1fr 1fr;gap:10px' });
      const fId = U.el('div', { class: 'field' });
      fId.appendChild(U.el('label', { html: '① 标识码（重新输入用户名）<span style="color:#b91c1c">*</span>' }));
      signUsername = U.el('input', { type: 'text', placeholder: '与登录账号一致', value: App.user.username });
      fId.appendChild(signUsername);
      const fPw = U.el('div', { class: 'field' });
      fPw.appendChild(U.el('label', { html: '① 口令（要素 A）<span style="color:#b91c1c">*</span>' }));
      signPassword = U.el('input', { type: 'password', placeholder: '重新输入你的登录口令', autocomplete: 'off' });
      fPw.appendChild(signPassword);
      g2.appendChild(fId);
      g2.appendChild(fPw);
      sigBox.appendChild(g2);

      const nonceRow = U.el('div', { style: 'display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap' });
      const fN1 = U.el('div', { class: 'field', style: 'flex:1;min-width:200px' });
      fN1.appendChild(U.el('label', { html: '② 一次性验证码（要素 B）<span style="color:#b91c1c">*</span>' }));
      const nonceLine = U.el('div', { style: 'display:flex;gap:6px' });
      signNonceInput = U.el('input', { type: 'text', placeholder: '获取后输入，如 AB3K9XQ2', style: 'font-family:var(--mono)' });
      signNonceBtn = U.el('button', { class: 'btn small', text: '获取验证码' });
      nonceLine.appendChild(signNonceInput);
      nonceLine.appendChild(signNonceBtn);
      fN1.appendChild(nonceLine);
      signNonceShow = U.el('div', { style: 'font-size:12px;color:#1e4d8c;background:#eef6ff;border-radius:6px;padding:6px 10px;margin-top:4px;display:none' });
      fN1.appendChild(signNonceShow);
      nonceRow.appendChild(fN1);
      const fR = U.el('div', { class: 'field', style: 'flex:1;min-width:200px' });
      fR.appendChild(U.el('label', { html: '签署说明<span style="color:#b91c1c">*</span>（至少 3 个字）' }));
      signReason = U.el('input', { type: 'text', placeholder: '如：经核对源数据后签署' });
      fR.appendChild(signReason);
      nonceRow.appendChild(fR);
      sigBox.appendChild(nonceRow);

      signNonceBtn.addEventListener('click', async () => {
        try {
          const r = await A.post('/api/auth/challenge', {});
          signNonceShow.style.display = 'block';
          signNonceShow.innerHTML = '一次性验证码：<b style="font-size:15px;font-family:var(--mono)">' + U.esc(r.nonce) + '</b>（' + r.expiresInSec + ' 秒内有效，仅可使用一次，请手动输入上方输入框）';
          signNonceInput.focus();
        } catch (err) {
          UI.toast(err.message, 'err');
        }
      });

      const fA = U.el('div', { class: 'field', style: 'margin-top:8px' });
      signAgree = U.el('label', { style: 'display:flex;gap:8px;align-items:center;font-weight:400;color:inherit', html: '<input type="checkbox" style="width:16px;height:16px"> 我确认以上信息如实填写，自愿签署；签署将被记录并关联到本记录' });
      fA.appendChild(signAgree);
      sigBox.appendChild(fA);
      panel.appendChild(sigBox);
    }

    const errBox = U.el('div', { class: 'callout danger', style: 'display:none;margin-top:6px' });
    panel.appendChild(errBox);

    const submit = U.el('button', { class: 'btn primary', text: step.type === 'signature' ? '提交并签署（完成本步骤）' : '完成本步骤' });
    submit.addEventListener('click', async () => {
      const values = {};
      let missing = false;
      for (const f of step.form) {
        const v = inputs[f.key] ? inputs[f.key].value : '';
        values[f.key] = f.type === 'select' ? String(v || '') : String(v || '').trim();
        if (f.required && !values[f.key]) missing = true;
      }
      if (missing) {
        errBox.style.display = 'block';
        errBox.textContent = '请填写全部必填项（带 * 的字段）。';
        return;
      }
      const payload = { code: step.code, values };
      if (step.type === 'signature') {
        payload.sign = {
          username: signUsername ? signUsername.value.trim() : '',
          password: signPassword ? signPassword.value : '',
          nonce: signNonceInput ? signNonceInput.value.trim() : '',
          reason: signReason ? signReason.value.trim() : '',
          agreed: signAgree ? signAgree.querySelector('input').checked : false,
        };
      }
      try {
        await A.post('/api/records/' + encodeURIComponent(record.recordKey) + '/step', payload);
        U.toast('步骤「' + step.name + '」完成', 'ok');
        renderRecordDetail(record.recordKey);
      } catch (err) {
        errBox.style.display = 'block';
        errBox.textContent = err.message;
      }
    });
    panel.appendChild(submit);
    wrap.appendChild(panel);
  }

  /* ------------------------------------------------------------ 历史留痕 */

  function renderHistory(wrap, record) {
    const card = U.el('details', { class: 'acc', open: '' });
    card.appendChild(U.el('summary', { text: '活动历史（' + record.history.length + ' 条 · 只追加）' }));
    const body = U.el('div', { style: 'padding:4px 6px' });
    const rows = record.history.slice().reverse().map((h, idx) => {
      const cls = h.action === 'created' ? 'badge-both' : h.action === 'cancelled' ? 'badge-muted' : h.action === 'step_completed' && h.actor ? 'badge-qa' : 'badge-cra';
      const action = h.action === 'created' ? '创建' : h.action === 'cancelled' ? '取消' : '完成步骤';
      return U.el('div', { style: 'display:flex;gap:8px;padding:6px 0;border-bottom:1px dashed var(--line-soft);font-size:13px', html:
        '<span class="badge ' + cls + '">' + action + '</span>' +
        '<span class="badge badge-muted">' + (ROLE_LABEL[h.role] || h.role) + '</span>' +
        (h.stepCode ? '<span class="badge badge-muted num">' + U.esc(h.stepCode) + '</span>' : '') +
        '<span style="color:#5c6b7a;flex:1">' + U.esc(h.comment || '') + '</span>' +
        (h.actor ? '<span class="badge badge-qa">签署：' + U.esc(h.actor) + '</span>' : '') +
        (h.to ? '<span class="badge badge-both">→ ' + U.esc(h.to) + '</span>' : '') +
        '<span class="num" style="color:#8a97a5;font-size:12px">' + fmtFull(h.at) + '</span>' });
    });
    for (const r of rows) body.appendChild(r);
    card.appendChild(body);
    wrap.appendChild(card);
  }

  function fmtFull(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    const p = (n) => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }
});