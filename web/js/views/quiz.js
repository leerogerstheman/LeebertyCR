/* 场景练习：一题一答，即时解析，成绩记录 */

window.Views.register('quiz', function (root, ctx) {
  const App = ctx.app;
  const C = App.content.quiz;
  const U = UI;

  root.appendChild(U.el('div', { class: 'page-head' }));
  const head = root.querySelector('.page-head');
  head.appendChild(U.el('h1', { text: '场景练习' }));
  head.appendChild(U.el('div', { class: 'intro', text: C.intro }));

  const state = { filter: 'all', idx: 0, answers: [], started: false, done: false };

  const filterRow = U.el('div', { style: 'display:flex;gap:10px;align-items:center;margin-bottom:12px;flex-wrap:wrap' });
  const sel = U.el('select', { style: 'width:auto' });
  sel.appendChild(U.el('option', { value: 'all', text: '全部题目（' + C.questions.length + '）' }));
  const byRole = (r) => C.questions.filter((q) => q.role === r);
  sel.appendChild(U.el('option', { value: 'cra', text: '仅 CRA 题（' + byRole('cra').length + '）' }));
  sel.appendChild(U.el('option', { value: 'crc', text: '仅 CRC 题（' + byRole('crc').length + '）' }));
  sel.appendChild(U.el('option', { value: 'both', text: '仅共同题（' + byRole('both').length + '）' }));
  filterRow.appendChild(sel);
  filterRow.appendChild(U.el('span', { class: 'badge badge-muted', text: '最佳成绩：CRA ' + (App.state.quiz.best.cra || 0) + ' · CRC ' + (App.state.quiz.best.crc || 0) + ' · 共同 ' + (App.state.quiz.best.all || 0) }));
  const statBtn = U.el('button', { class: 'btn small ghost', text: '查看历史' });
  statBtn.addEventListener('click', showHistory);
  filterRow.appendChild(statBtn);
  root.appendChild(filterRow);

  const quizBox = U.el('div', { class: 'card quiz-card' });
  root.appendChild(quizBox);

  function questions() {
    if (state.filter === 'all') return C.questions;
    return byRole(state.filter);
  }

  function render() {
    quizBox.innerHTML = '';
    const qs = questions();
    if (!state.started || state.done) {
      // 开始页 / 结束页
      if (state.done) {
        const right = state.answers.filter((a) => a.correct).length;
        const total = state.answers.length;
        const pct = Math.round((right / total) * 100);
        quizBox.appendChild(U.el('h2', { text: '本轮完成：' + right + ' / ' + total + '（' + pct + '%）' }));
        const grade = pct >= 90 ? '🏆 优秀' : pct >= 70 ? '👍 良好' : pct >= 50 ? '💪 继续加油' : '📖 建议先回理念课堂';
        quizBox.appendChild(U.el('div', { class: 'callout ' + (pct >= 70 ? 'ok' : 'warn'), html: '<b>' + grade + '</b>　' + (pct === 100 ? '全对！你已具备很强的现场判断力。' : '没有全对也正常——错题就是最好的学习材料，点击下方题号回顾。') }));
        const wrong = state.answers.filter((a) => !a.correct);
        if (wrong.length) {
          quizBox.appendChild(U.el('div', { class: 'card-title', text: '错题回顾（点击查看解析）' }));
          const wList = U.el('div');
          wrong.forEach((a, i) => {
            const d = U.el('details', { class: 'acc' });
            d.appendChild(U.el('summary', { html: U.esc(a.q.q) }));
            const body = U.el('div', { style: 'padding:4px 6px' });
            body.appendChild(U.el('p', { html: '<b style="color:#b91c1c">你的答案：</b>' + U.esc(a.q.options[a.picked]) }));
            body.appendChild(U.el('p', { html: '<b style="color:#15803d">正确答案：</b>' + U.esc(a.q.options[a.q.answer]) }));
            body.appendChild(U.el('div', { class: 'why-box', html: U.esc(a.q.explain) }));
            d.appendChild(body);
            wList.appendChild(d);
          });
          quizBox.appendChild(wList);
        }
        const again = U.el('button', { class: 'btn primary', style: 'margin-top:12px', text: '再练一轮' });
        again.addEventListener('click', () => { state.started = false; state.done = false; state.answers = []; state.idx = 0; render(); });
        quizBox.appendChild(again);
        return;
      }
      // 开始页
      quizBox.appendChild(U.el('h2', { text: '准备好了吗？' }));
      quizBox.appendChild(U.el('p', { text: '共 ' + qs.length + ' 题。选完立即看解析，全部答完后给出分数与错题回顾。分数按当前角色记录最佳成绩。' }));
      const start = U.el('button', { class: 'btn primary', text: '开始练习' });
      start.addEventListener('click', () => { state.started = true; state.idx = 0; state.answers = []; render(); });
      quizBox.appendChild(start);
      return;
    }

    const q = qs[state.idx];
    const answered = state.answers[state.idx];

    const progLine = U.el('div', { style: 'display:flex;justify-content:space-between;align-items:center;margin-bottom:10px' });
    progLine.appendChild(U.el('span', { class: 'badge badge-muted', text: '第 ' + (state.idx + 1) + ' / ' + qs.length + ' 题' }));
    const bar = U.el('div', { class: 'prog', style: 'max-width:200px' });
    bar.appendChild(U.el('div', { style: 'width:' + Math.round((state.idx / qs.length) * 100) + '%' }));
    progLine.appendChild(bar);
    quizBox.appendChild(progLine);

    quizBox.appendChild(U.el('div', { html: U.roleBadge(q.role) + ' <span class="badge badge-muted">' + U.esc(q.tag) + '</span>' }));
    quizBox.appendChild(U.el('p', { style: 'font-size:16px;font-weight:600;margin:10px 0', text: q.q }));

    if (!answered) {
      q.options.forEach((opt, i) => {
        const b = U.el('button', { class: 'opt' });
        b.appendChild(U.el('span', { class: 'opt-key', text: String.fromCharCode(65 + i) + '.' }));
        b.appendChild(U.el('span', { text: opt }));
        b.addEventListener('click', () => {
          const correct = i === q.answer;
          state.answers[state.idx] = { q, picked: i, correct };
          render();
        });
        quizBox.appendChild(b);
      });
    } else {
      q.options.forEach((opt, i) => {
        let cls = '';
        if (i === q.answer) cls = 'reveal-correct';
        if (i === answered.picked) cls += answered.correct ? ' picked-correct' : ' picked-wrong';
        quizBox.appendChild(U.el('div', { class: 'opt ' + cls, html: '<span class="opt-key">' + String.fromCharCode(65 + i) + '.</span> ' + U.esc(opt) + (i === q.answer ? ' ✔' : '') + (i === answered.picked && !answered.correct ? ' ✘' : '') }));
      });
      const fb = U.el('div', { class: 'feedback show ' + (answered.correct ? 'correct' : 'wrong') });
      fb.appendChild(U.el('b', { text: answered.correct ? '✔ 正确！' : '✘ 答错了。' }));
      fb.appendChild(U.el('div', { style: 'margin-top:4px', text: answered.q.explain }));
      quizBox.appendChild(fb);

      const nav = U.el('div', { style: 'display:flex;justify-content:space-between;margin-top:12px' });
      if (state.idx > 0) {
        const prev = U.el('button', { class: 'btn', text: '← 上一题' });
        prev.addEventListener('click', () => { state.idx--; render(); });
        nav.appendChild(prev);
      } else {
        nav.appendChild(U.el('span'));
      }
      if (state.idx < qs.length - 1) {
        const next = U.el('button', { class: 'btn primary', text: '下一题 →' });
        next.addEventListener('click', () => { state.idx++; render(); });
        nav.appendChild(next);
      } else {
        const fin = U.el('button', { class: 'btn primary', text: '查看成绩' });
        fin.addEventListener('click', async () => {
          state.done = true;
          const right = state.answers.filter((a) => a.correct).length;
          const key = state.filter === 'cra' ? 'cra' : state.filter === 'crc' ? 'crc' : 'all';
          if (right > (App.state.quiz.best[key] || 0)) {
            App.state.quiz.best[key] = right;
            await App.saveState();
          }
          App.state.quiz.attempts = (App.state.quiz.attempts || 0) + 1;
          await App.saveState();
          render();
        });
        nav.appendChild(fin);
      }
      quizBox.appendChild(nav);
    }
  }

  function showHistory() {
    const body = U.el('div');
    body.appendChild(U.el('p', { html: '最佳成绩：<br>· CRA 题：<b>' + (App.state.quiz.best.cra || 0) + '</b> / ' + byRole('cra').length + '<br>· CRC 题：<b>' + (App.state.quiz.best.crc || 0) + '</b> / ' + byRole('crc').length + '<br>· 共同题：<b>' + (App.state.quiz.best.all || 0) + '</b> / ' + byRole('both').length + '<br>· 累计练习轮次：<b>' + (App.state.quiz.attempts || 0) + '</b>' }));
    U.modal(body, { title: '练习历史' });
  }

  sel.addEventListener('change', () => {
    state.filter = sel.value;
    state.started = false;
    state.done = false;
    state.answers = [];
    state.idx = 0;
    render();
  });

  render();
});