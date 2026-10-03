/* api.js - 与本地服务通信 */

window.API = (function () {
  'use strict';

  async function get(path) {
    const res = await fetch(path, { cache: 'no-store' });
    if (!res.ok) throw new Error('GET ' + path + ' -> ' + res.status);
    return res.json();
  }

  async function fail(res, method, path) {
    let msg = method + ' ' + path + ' -> ' + res.status;
    let code = null;
    try {
      const body = await res.json();
      if (body && body.error) msg = body.error;
      if (body && body.code) code = body.code;
    } catch (e) { /* ignore */ }
    const err = new Error(msg);
    err.code = code;
    err.status = res.status;
    throw err;
  }

  async function put(path, body) {
    const res = await fetch(path, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) await fail(res, 'PUT', path);
    return res.json();
  }

  async function post(path, body) {
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}),
    });
    if (!res.ok) await fail(res, 'POST', path);
    return res.json();
  }

  async function del(path) {
    const res = await fetch(path, { method: 'DELETE' });
    if (!res.ok) await fail(res, 'DELETE', path);
    return res.json();
  }

  return {
    health: () => get('/api/health'),
    content: () => get('/api/content'),
    state: () => get('/api/state'),
    saveState: (state) => put('/api/state', state),
    get,
    post,
    del,
  };
})();