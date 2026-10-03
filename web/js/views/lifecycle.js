/* 试验生命周期：8 阶段全览与逐阶段细节 */

window.Views.register('lifecycle', function (root, ctx) {
  const App = ctx.app;
  const C = App.content.lifecycle;
  const U = UI;
  const phases = C.phases;

  root.appendChild(U.el('div', { class: 'page-head' }));
  const head = root.querySelector('.page-head');
  head.appendChild(U.el('h1', { text: '试验生命周期' }));
  head.appendChild(U.el('div', { class: 'sub', text: C.title }));
  head.appendChild(U.el('div', { class: 'intro', text: C.intro }));

  // 阶段选择胶囊
  const nav = U.el('div', { class: 'phase-nav' });
  phases.forEach((p, i) => {
    const pill = U.el('button', { class: 'phase-pill', dataset: { i } });
    pill.appendChild(U.el('span', { text: p.n + '. ' + p.title }));
    pill.addEventListener('click', () => {
      document.querySelectorAll('.phase-pill').forEach((x) => x.classList.remove('on'));
      pill.classList.add('on');
      document.querySelectorAll('.phase-detail').forEach((x) => x.classList.remove('on'));
      document.getElementById('phase-' + p.id).classList.add('on');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
    nav.appendChild(pill);
  });
  root.appendChild(nav);

  // 阶段细节容器
  phases.forEach((p) => {
    const d = U.el('div', { class: 'phase-detail' + (p.n === 1 ? ' on' : ''), id: 'phase-' + p.id });

    const headCard = U.el('div', { class: 'card' });
    headCard.appendChild(U.el('div', { class: 'card-title', html: '<span class="step-num" style="margin-right:8px">' + p.n + '</span>' + U.esc(p.title) + ' <span style="font-weight:400;color:#8a97a5;font-size:13px">' + U.esc(p.subtitle) + '</span>' }));
    headCard.appendChild(U.el('div', { class: 'badge badge-muted', html: '🕐 ' + U.esc(p.timeline) }));
    headCard.appendChild(U.el('div', { class: 'why-box', style: 'margin-top:10px', html: '<b>这一阶段要干什么（大白话）：</b>' + U.esc(p.goal) }));

    // 步骤流
    const flow = U.el('div', { class: 'flow' });
    p.flow.forEach((s, i) => {
      flow.appendChild(U.el('div', { class: 'flow-step', html:
        '<span class="fs-n">' + (i + 1) + '</span>' +
        '<div class="fs-name">' + U.esc(s.step) + '</div>' +
        '<div class="fs-who">负责：' + U.esc(s.who) + '</div>' +
        '<div style="font-size:12px;margin-top:4px">' + U.esc(s.what) + '</div>' +
        '<div style="font-size:11.5px;color:#0f766e;margin-top:4px;font-family:Consolas,monospace">产：' + U.esc(s.out) + '</div>'
      }));
    });
    headCard.appendChild(flow);
    d.appendChild(headCard);

    // 职责分工
    const jobs = U.el('div', { class: 'grid grid-2' });
    jobs.appendChild(U.el('div', { class: 'card', html: '<div class="card-title"><span class="badge badge-cra">CRA 在这里</span></div><ul style="margin:0;padding-left:20px">' + p.craDuties.map((x) => '<li style="margin-bottom:4px">' + U.esc(x) + '</li>').join('') + '</ul>' }));
    jobs.appendChild(U.el('div', { class: 'card', html: '<div class="card-title"><span class="badge badge-crc">CRC 在这里</span></div><ul style="margin:0;padding-left:20px">' + p.crcDuties.map((x) => '<li style="margin-bottom:4px">' + U.esc(x) + '</li>').join('') + '</ul>' }));
    d.appendChild(jobs);

    // 产出与坑
    const outPit = U.el('div', { class: 'grid grid-2' });
    outPit.appendChild(U.el('div', { class: 'card', html: '<div class="card-title">📦 本阶段要产出</div><div class="tag-line">' + p.deliverables.map((x) => '<span class="tag">' + U.esc(x) + '</span>').join('') + '</div>' }));
    outPit.appendChild(U.el('div', { class: 'card', html: '<div class="card-title" style="color:#b45309">⚠️ 常见的坑</div><ul style="margin:0;padding-left:20px">' + p.pitfalls.map((x) => '<li style="margin-bottom:4px">' + U.esc(x) + '</li>').join('') + '</ul>' }));
    d.appendChild(outPit);

    // 法规
    d.appendChild(U.el('div', { class: 'card', html: '<div class="card-title">📚 法规依据</div><p style="margin:0">' + p.refs.map((x) => '<span class="tag">' + U.esc(x) + '</span>').join('') + '</p>' }));

    // 配套清单
    const clMap = { prep: ['site'], submission: ['essdoc'], siv: ['siv', 'essdoc'], enrollment: ['icf'], treatment: ['imv', 'sdv', 'sae', 'drug', 'crc-visit'], data_clean: ['sdv'], closeout: ['cov'], archive: ['essdoc'] };
    const clIds = clMap[p.id] || [];
    const clNames = clIds.map((id) => App.content.checklists.checklists.find((x) => x.id === id)).filter(Boolean);
    if (clNames.length) {
      d.appendChild(U.el('div', { class: 'card', html: '<div class="card-title">🧰 配套核查清单</div>' +
        clNames.map((cl) => '<span class="tag" style="cursor:pointer;font-size:13px;padding:4px 12px" data-cl="' + cl.id + '" onclick="location.hash=\'#checklists?' + cl.id + '\'">✅ ' + U.esc(cl.title) + '</span>').join('') }));
    }

    // 上下页
    const navRow = U.el('div', { style: 'display:flex;justify-content:space-between;margin-top:6px' });
    if (p.n > 1) {
      const prev = phases[p.n - 2];
      navRow.appendChild(U.el('button', { class: 'btn', html: '← ' + prev.n + '. ' + U.esc(prev.title) }));
      navRow.firstChild.addEventListener('click', () => document.querySelectorAll('.phase-pill')[p.n - 2].click());
    } else {
      navRow.appendChild(U.el('span'));
    }
    if (p.n < phases.length) {
      const next = phases[p.n];
      const nb = U.el('button', { class: 'btn primary', html: next.n + '. ' + U.esc(next.title) + ' →' });
      nb.addEventListener('click', () => document.querySelectorAll('.phase-pill')[p.n].click());
      navRow.appendChild(nb);
    }
    d.appendChild(navRow);

    root.appendChild(d);
  });
});