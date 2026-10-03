/* ui.js - DOM 与交互小工具（零依赖） */

window.UI = (function () {
  'use strict';

  /** 转义 HTML，防注入 */
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /** 创建元素：el('div', {class:'x'}, htmlOrChildren) */
  function el(tag, attrs, children) {
    const node = document.createElement(tag);
    if (attrs) {
      for (const k of Object.keys(attrs)) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k.startsWith('on') && typeof attrs[k] === 'function') {
          node.addEventListener(k.slice(2).toLowerCase(), attrs[k]);
        } else if (k === 'dataset') {
          Object.assign(node.dataset, attrs[k]);
        } else {
          node.setAttribute(k, attrs[k]);
        }
      }
    }
    if (children != null) {
      if (Array.isArray(children)) {
        for (const c of children) {
          if (c == null) continue;
          node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
        }
      } else if (typeof children === 'string') {
        node.textContent = children;
      } else {
        node.appendChild(children);
      }
    }
    return node;
  }

  function toast(msg, kind) {
    let wrap = document.querySelector('.toast-wrap');
    if (!wrap) {
      wrap = el('div', { class: 'toast-wrap' });
      document.body.appendChild(wrap);
    }
    const t = el('div', { class: 'toast' + (kind ? ' ' + kind : ''), text: msg });
    wrap.appendChild(t);
    setTimeout(() => {
      t.style.opacity = '0';
      t.style.transition = 'opacity 0.3s';
      setTimeout(() => t.remove(), 320);
    }, 2600);
  }

  function modal(bodyNode, opts) {
    opts = opts || {};
    const mask = el('div', { class: 'modal-mask' });
    const box = el('div', { class: 'modal' });
    if (opts.title) box.appendChild(el('h3', { text: opts.title }));
    box.appendChild(bodyNode);
    if (opts.onClose !== false) {
      mask.addEventListener('click', (e) => {
        if (e.target === mask) mask.remove();
      });
    }
    mask.appendChild(box);
    document.body.appendChild(mask);
    return { mask, box, close: () => mask.remove() };
  }

  function confirmDlg(title, message, onYes, yesLabel) {
    const body = el('div');
    if (message) body.appendChild(el('p', { text: message, style: 'margin:0 0 14px' }));
    const row = el('div', { style: 'display:flex;gap:8px;justify-content:flex-end' });
    const cancel = el('button', { class: 'btn', text: '取消' });
    const ok = el('button', { class: 'btn danger', text: yesLabel || '确认' });
    cancel.addEventListener('click', () => { m.close(); });
    ok.addEventListener('click', () => { m.close(); onYes(); });
    row.appendChild(cancel);
    row.appendChild(ok);
    body.appendChild(row);
    const m = modal(body, { title, onClose: false });
  }

  function badge(text, cls) {
    return el('span', { class: 'badge ' + (cls || 'badge-muted'), text: text });
  }

  function roleBadge(role) {
    const map = { cra: ['CRA', 'badge-cra'], crc: ['CRC', 'badge-crc'], pi: ['研究者', 'badge-pi'], both: ['共同', 'badge-both'] };
    const m = map[role] || [role, 'badge-muted'];
    return badge(m[0], m[1]);
  }

  function fmtDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    const p = (n) => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }

  function todayISO() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }

  function daysUntil(iso) {
    if (!iso) return null;
    const a = new Date(iso + 'T00:00:00');
    const b = new Date(todayISO() + 'T00:00:00');
    return Math.round((a - b) / 86400000);
  }

  return { esc, el, toast, modal, confirmDlg, badge, roleBadge, fmtDate, todayISO, daysUntil };
})();