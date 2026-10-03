'use strict';

/**
 * scripts/explore.js - 用 Edge 无头浏览器做真实的渲染与交互验证（CDP，零依赖）。
 *
 *   node scripts/explore.js [url] [outDir]
 *
 * 流程：登录页渲染 → UI 登录（demo_cra）→ 逐路由渲染检查与交互 → 退出 →
 *       管理员登录 → 用户管理/审计检查。任何应用级 JS 异常都视为失败。
 * 需要 Node >= 21（使用内置 WebSocket）。
 */

const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const BASE = process.argv[2] || 'http://127.0.0.1:8816';
const OUT = path.resolve(process.argv[3] || path.join(__dirname, '..', 'docs', 'screenshots'));
const PORT = 9333;
const EDGE = [
  path.join(process.env['ProgramFiles(x86)'] || '', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
  path.join(process.env.ProgramFiles || '', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
].find((c) => c && fs.existsSync(c));

const ROUTES = ['home', 'learn', 'lifecycle', 'cra', 'crc', 'checklists', 'workflow', 'subjects', 'documents', 'tasks', 'templates', 'regs', 'quiz', 'cases', 'glossary', 'security', 'about'];

if (!EDGE) { console.error('Edge not found'); process.exit(1); }

fs.mkdirSync(OUT, { recursive: true });

/* ---------------- CDP 最小客户端 ---------------- */
class CDP {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.id = 0;
    this.pending = new Map();
    this.events = [];
    this.ready = new Promise((res, rej) => {
      this.ws.onopen = () => res();
      this.ws.onerror = (e) => rej(new Error('ws error'));
    });
    this.ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id) {
        const p = this.pending.get(msg.id);
        if (p) { this.pending.delete(msg.id); msg.error ? p.reject(new Error(JSON.stringify(msg.error))) : p.resolve(msg.result); }
      } else {
        this.events.push(msg);
      }
    };
  }
  async send(method, params) {
    await this.ready;
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params: params || {} }));
    });
  }
  close() { try { this.ws.close(); } catch (e) { /* ignore */ } }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 用 BASE 里的端口启动本应用服务（仅当外部没有服务时）。 */
function startOwnServer() {
  const port = BASE.replace(/^https?:\/\//, '').replace(/\/.*$/, '').split(':')[1] || '8816';
  const root = path.join(__dirname, '..');
  const child = spawn(process.execPath, ['src/server.js'], {
    cwd: root,
    env: Object.assign({}, process.env, { CRA_PORT: String(port), CRA_OPEN_BROWSER: '0' }),
    stdio: 'ignore',
  });
  return child;
}

async function main() {
  // 若目标地址没有服务在跑，自动起一个（保证「一条命令即可验证」，无需人工先开服务）
  let ownServer = null;
  try {
    const probe = await fetch(BASE + '/api/health');
    const h = await probe.json();
    if (!h || h.app !== 'LeebertyCR') ownServer = startOwnServer();
  } catch (e) {
    ownServer = startOwnServer();
  }
  if (ownServer) await sleep(1800);

  // 用系统临时目录下的独立空白资料：避免复用开发机上已登录账号的浏览器资料
  // （已登录 profile 会在启动时弹出「同步确认」页并抢占窗口，导致抓到错误 target）
  const profile = path.join(os.tmpdir(), 'leebertycr-explore-profile');
  fs.rmSync(profile, { recursive: true, force: true });
  fs.mkdirSync(profile, { recursive: true });
  const child = spawn(EDGE, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--disable-sync', '--disable-features=msEdgeSyncPromo,msSyncConfirmationDialog',
    '--disable-background-networking', '--disable-component-update',
    `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
    '--window-size=1440,1000', BASE + '/#home',
  ], { stdio: 'ignore' });

  let failures = 0;
  const check = (name, ok, detail) => {
    console.log((ok ? '  PASS  ' : '  FAIL  ') + name + (detail ? '  [' + detail + ']' : ''));
    if (!ok) failures++;
  };

  try {
    let targets = null;
    for (let i = 0; i < 40; i++) {
      try {
        const res = await fetch('http://127.0.0.1:' + PORT + '/json');
        targets = await res.json();
        if (targets.length) break;
      } catch (e) { /* retry */ }
      await sleep(250);
    }
    if (!targets || !targets.length) { check('CDP target available', false); return; }
    check('CDP target available', true);

    // 选目标页面：优先 URL 命中本应用的 target（避免被浏览器自身的同步/推广页抢占）
    const APP_HOSTPORT = BASE.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    const isOurs = (t) => t.type === 'page' && typeof t.url === 'string' && t.url.indexOf(APP_HOSTPORT) >= 0;
    let page = targets.find(isOurs);
    if (!page) {
      // 同步页抢占了窗口：主动把应用地址导航到该 target 上
      page = targets.find((t) => t.type === 'page');
      if (page) {
        try {
          await fetch('http://127.0.0.1:' + PORT + '/json/new?' + encodeURIComponent(BASE + '/#home'), { method: 'PUT' });
          await sleep(1200);
          const again = await (await fetch('http://127.0.0.1:' + PORT + '/json')).json();
          page = again.find(isOurs) || page;
        } catch (e) { /* 退回原 target */ }
      }
    }
    const cdp = new CDP(page.webSocketDebuggerUrl);
    await cdp.send('Runtime.enable');
    await cdp.send('Page.enable');

    const errors = [];
    const watchEvents = () => {
      for (const ev of cdp.events) {
        if (ev.method === 'Runtime.exceptionThrown') {
          const d = ev.params.exceptionDetails;
          errors.push('exception@' + (d.url || '?') + ': ' + (d.exception?.description || d.text));
        }
        if (ev.method === 'Runtime.consoleAPICalled' && ['error', 'assert'].includes(ev.params.type)) {
          const url = (ev.params.stackTrace && ev.params.stackTrace.callFrames && ev.params.stackTrace.callFrames[0] && ev.params.stackTrace.callFrames[0].url) || '';
          errors.push('console.' + ev.params.type + '@' + url + ': ' + ev.params.args.map((a) => a.value || a.description || '').join(' '));
        }
      }
      cdp.events = [];
    };

    const evaluate = async (expr) => {
      const r = await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.text);
      return r.result.value;
    };

    // SPA 内部跳转：与应用内行为一致，通过 location.hash 触发 hashchange
    // （Edge 无头下对纯 fragment 差异的 Page.navigate 不可靠，会丢失片段）
    const goto = async (fragment) => {
      await evaluate('location.hash = ' + JSON.stringify(fragment));
    };

    await cdp.send('Page.navigate', { url: BASE + '/#home' });
    await sleep(2500);
    watchEvents();

    // ---- 登录门禁页 ----
    const loginRendered = await evaluate(`({
      personas: document.querySelectorAll('.persona-card').length,
      hasLogin: !!document.querySelector('main') === false && !!document.querySelector('.login-card'),
      hasDemoHint: !!document.querySelector('.callout.warn'),
    })`);
    check('login gate renders (persona cards + demo hint)', loginRendered.personas === 5 && loginRendered.hasLogin && loginRendered.hasDemoHint,
      'personas=' + loginRendered.personas);

    // ---- 图标完整性：蓝黑底哥特体 CR 必须完整落在图标框内（不裁切） ----
    const brandCheck = await evaluate(`(() => {
      const marks = [...document.querySelectorAll('.brand-mark')].filter((m) => { const r = document.createRange(); r.selectNodeContents(m); const t = r.getBoundingClientRect(); return t.width > 0; });
      return marks.map((m) => {
        const r = document.createRange(); r.selectNodeContents(m);
        const t = r.getBoundingClientRect();
        const b = m.getBoundingClientRect();
        const inside = t.left >= b.left - 1 && t.right <= b.right + 1 && t.top >= b.top - 1 && t.bottom <= b.bottom + 1;
        const font = getComputedStyle(m).fontFamily;
        return { inside: inside, textW: Math.round(t.width), boxW: Math.round(b.width), textH: Math.round(t.height), boxH: Math.round(b.height), gothic: /Old English/i.test(font) };
      });
    })()`);
    const brandOk = Array.isArray(brandCheck) && brandCheck.length >= 1 && brandCheck.every((x) => x.inside);
    check('icon: CR letters complete inside mark (no clipping)' + (brandCheck[0] && brandCheck[0].gothic ? '' : ', fallback font'), brandOk,
      brandCheck.map((x) => 'text ' + x.textW + 'x' + x.textH + ' in ' + x.boxW + 'x' + x.boxH).join(' / '));

    // ---- 错误口令提示 ----
    await evaluate(`(() => {
      const u = document.querySelector('.login-card input[type=text]');
      const p = document.querySelector('.login-card input[type=password]');
      const set = (el, v) => { const s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set; s.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); };
      set(u, 'demo_cra'); set(p, 'wrong-password');
      [...document.querySelectorAll('.login-card button')].find((b) => b.textContent.trim() === '登录').click();
    })()`);
    await sleep(1200);
    watchEvents();
    const loginErr = await evaluate(`(() => { const e = document.querySelector('.callout.danger'); return e ? e.textContent : ''; })()`);
    check('login error message shown', loginErr.includes('用户名或口令不正确'), loginErr.slice(0, 30) || 'no error box');

    // ---- UI 成功登录（demo_cra） ----
    await evaluate(`(() => {
      const u = document.querySelector('.login-card input[type=text]');
      const p = document.querySelector('.login-card input[type=password]');
      const set = (el, v) => { const s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set; s.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); };
      set(u, 'demo_cra'); set(p, 'CRA-Demo-2026!');
      [...document.querySelectorAll('.login-card button')].find((b) => b.textContent.trim() === '登录').click();
    })()`);
    await sleep(2200);
    watchEvents();
    const brandSidebar = await evaluate(`(() => {
      const m = document.querySelector('.sidebar .brand-mark');
      if (!m) return null;
      const r = document.createRange(); r.selectNodeContents(m);
      const t = r.getBoundingClientRect();
      const b = m.getBoundingClientRect();
      return { inside: t.left >= b.left - 1 && t.right <= b.right + 1 && t.top >= b.top - 1 && t.bottom <= b.bottom + 1, gothic: /Old English/i.test(getComputedStyle(m).fontFamily) };
    })()`);
    check('icon: sidebar brand mark CR complete', !!brandSidebar && brandSidebar.inside, brandSidebar ? (brandSidebar.gothic ? 'Old English font' : 'fallback serif') : 'no mark');
    const afterLogin = await evaluate(`({
      userCard: (document.querySelector('.user-card') || {}).textContent || '',
      h1: (document.querySelector('main h1') || {}).textContent || '',
      shell: !!document.querySelector('.sidebar'),
    })`);
    check('UI login enters shell', afterLogin.shell && afterLogin.userCard.includes('demo_cra') && afterLogin.userCard.includes('林晓'),
      afterLogin.userCard.replace(/\s+/g, ' ').slice(0, 40));

    // ---- 逐路由渲染检查 ----
    for (const route of ROUTES) {
      await goto('/' + route);
      await sleep(1600);
      watchEvents();
      const info = await evaluate(`({
        title: document.title,
        h1: (document.querySelector('main h1')||{}).textContent || '(none)',
        cards: document.querySelectorAll('main .card').length,
        mainText: (document.querySelector('main')||{}).textContent ? document.querySelector('main').textContent.length : 0,
        bootStuck: !!document.querySelector('.boot-splash'),
        appLoaded: !!window.App && !!window.App.content && !!window.App.user,
      })`).catch((e) => ({ error: String(e) }));
      const ok = info && !info.bootStuck && info.appLoaded && info.mainText > 200 && !info.error;
      check('render #' + route, ok, ok ? `h1="${(info.h1 || '').slice(0, 26)}" · text=${info.mainText}` : JSON.stringify(info));
      if (!ok) {
        const diag = await evaluate(`(() => { const m = document.querySelector('main'); return m ? m.innerHTML.slice(0, 600) : 'NO MAIN'; })()`).catch((e) => 'diag error: ' + e.message);
        console.log('        ↳ main HTML: ' + String(diag).replace(/\s+/g, ' ').slice(0, 500));
      }

      if (route === 'home') {
        const persist = await evaluate(`(async()=>{ window.App.state.quiz.attempts = (window.App.state.quiz.attempts||0)+1; await window.App.saveState(); const r = await fetch('/api/state').then(x=>x.json()); return r.quiz.attempts; })()`);
        check('state persists to user file', persist >= 1, 'attempts=' + persist);
        await evaluate(`(async()=>{ window.App.state.quiz.attempts = 0; await window.App.saveState(); return true; })()`);
        // 截图
        const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(path.join(OUT, route + '.png'), Buffer.from(shot.data, 'base64'));
        continue;
      }
      if (route === 'checklists') {
        await goto('/checklists?sdv');
        await sleep(1200);
        watchEvents();
        const info2 = await evaluate(`({items: document.querySelectorAll('main .item').length, title: (document.querySelector('main h2')||{}).textContent||''})`).catch(() => null);
        check('checklist detail (?sdv)', info2 && info2.items >= 10, info2 ? info2.title + ' · items=' + info2.items : 'none');
      }
      if (route === 'quiz') {
        const started = await evaluate(`(()=>{ const b=document.querySelector('main .btn.primary'); if(b){b.click();return true;} return false; })()`);
        await sleep(500);
        const opts = await evaluate(`document.querySelectorAll('main .opt').length`);
        const clicked = await evaluate(`(()=>{ const o=document.querySelector('main .opt'); if(o){o.click();return true;} return false; })()`);
        await sleep(500);
        const fb = await evaluate(`!!document.querySelector('main .feedback.show')`);
        check('quiz interaction', started && opts >= 3 && clicked && fb, `options=${opts} feedback=${fb}`);
      }
      if (route === 'tasks') {
        const added = await evaluate(`(()=>{ const btns=[...document.querySelectorAll('main button')]; const b=btns.find(x=>x.textContent.includes('演示任务')); if(b){b.click();return true;} return false; })()`);
        await sleep(900);
        const rows = await evaluate(`document.querySelectorAll('main .todo-row').length`);
        check('task demo add', added && rows >= 1, 'todo rows=' + rows);
      }
      if (route === 'workflow') {
        const lib = await evaluate(`document.querySelectorAll('main .grid-2 > .card').length`);
        check('workflow library cards', lib >= 6, 'cards=' + lib);
        // 任意演示记录（演示数据可能被清理过；这里不依赖具体流程）
        const demo = await evaluate(`(async()=>{ const r=await fetch('/api/records').then(x=>x.json()); const d=r.records.find(x=>x.demo) || r.records[0]; return d?d.recordKey:null; })()`);
        if (demo) {
          await goto('/workflow?rec=' + demo);
          await sleep(1500);
          watchEvents();
          const detail = await evaluate(`({key: !!document.querySelector('main .num'), steps: document.querySelectorAll('main .wstep').length})`);
          check('workflow record detail renders', detail.key && detail.steps >= 5, detail.steps + ' step chips');
          await goto('/workflow');
          await sleep(1200);
          watchEvents();
        } else {
          check('workflow record detail renders', false, 'no records at all - run build-exe / admin seed-demo first');
        }
      }
      if (route === 'security') {
        const mine = await evaluate(`(document.querySelector('main')||{}).textContent ? (document.querySelector('main').textContent.includes('我的口令') || document.querySelector('main').textContent.includes('权限矩阵')) : false`);
        check('security view (my account)', mine, 'my account / matrix present');
      }

      // 截图
      const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.join(OUT, route + '.png'), Buffer.from(shot.data, 'base64'));
    }

    // ---- 退出 → 管理员登录 → 用户管理/审计 ----
    await goto('/home');
    await sleep(800);
    await evaluate(`(()=>{ const b=[...document.querySelectorAll('.sidebar button')].find(x=>x.textContent.includes('退出登录')); if(b){b.click(); return true;} return false; })()`);
    await sleep(2200);
    watchEvents();
    const loggedOut = await evaluate(`!!document.querySelector('.login-card')`);
    check('logout returns to login gate', loggedOut);
    await evaluate(`(() => {
      const u = document.querySelector('.login-card input[type=text]');
      const p = document.querySelector('.login-card input[type=password]');
      const set = (el, v) => { const s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set; s.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); };
      set(u, 'admin'); set(p, 'CRA-Demo-2026!');
      [...document.querySelectorAll('.login-card button')].find((b) => b.textContent.trim() === '登录').click();
    })()`);
    await sleep(2200);
    watchEvents();
    await goto('/security');
    await sleep(1800);
    watchEvents();
    const adminView = await evaluate(`(() => { const t = (document.querySelector('main')||{}).textContent || ''; return { hasUsers: t.includes('用户管理'), hasAudit: t.includes('安全日志'), rows: document.querySelectorAll('main table tbody tr').length }; })()`);
    check('admin user management + audit view', adminView.hasUsers && adminView.hasAudit && adminView.rows >= 5,
      'rows=' + adminView.rows);

    // ---- 非管理员看不到审计 ----
    await evaluate(`(()=>{ const b=[...document.querySelectorAll('.sidebar button')].find(x=>x.textContent.includes('退出登录')); if(b){b.click(); return true;} return false; })()`);
    await sleep(2000);
    await evaluate(`(() => {
      const u = document.querySelector('.login-card input[type=text]');
      const p = document.querySelector('.login-card input[type=password]');
      const set = (el, v) => { const s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set; s.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); };
      set(u, 'demo_cra'); set(p, 'CRA-Demo-2026!');
      [...document.querySelectorAll('.login-card button')].find((b) => b.textContent.trim() === '登录').click();
    })()`);
    await sleep(2000);
    watchEvents();
    await goto('/security');
    await sleep(1400);
    const craSecurity = await evaluate(`(() => { const t = (document.querySelector('main')||{}).textContent || ''; return { noUsers: !t.includes('用户管理'), mine: t.includes('我的口令'), matrix: t.includes('权限矩阵') }; })()`);
    check('non-admin security view scoped', craSecurity.noUsers && craSecurity.mine && craSecurity.matrix, 'scoped to own account');

    watchEvents();
    cdp.close();
    child.kill();
    if (ownServer) ownServer.kill();
    await sleep(400);
    console.log();
    const appErrors = errors.filter((e) => /127\.0\.0\.1:|localhost:/.test(e));
    if (appErrors.length) {
      check('no application JavaScript errors', false, appErrors.slice(0, 6).join(' | '));
    } else {
      check('no application JavaScript errors', true, undefined);
    }
    console.log();
    console.log(failures === 0 ? '  EXPLORE PASSED - login, permissions and every route work' : '  EXPLORE FAILED - ' + failures + ' check(s) failed');
    console.log();
    process.exit(failures === 0 ? 0 : 1);
  } catch (err) {
    console.error('EXPLORE ERROR:', err);
    try { child.kill(); } catch (e) { /* ignore */ }
    process.exit(1);
  }
}

main();