/* 术语表：搜索中英术语 */

window.Views.register('glossary', function (root, ctx) {
  const App = ctx.app;
  const C = App.content.glossary;
  const U = UI;

  root.appendChild(U.el('div', { class: 'page-head' }));
  const head = root.querySelector('.page-head');
  head.appendChild(U.el('h1', { text: '术语表' }));
  head.appendChild(U.el('div', { class: 'intro', text: C.intro }));

  const searchCard = U.el('div', { class: 'card' });
  const search = U.el('div', { class: 'search' });
  search.appendChild(U.el('span', { class: 's-ico', text: '🔍' }));
  const input = U.el('input', { placeholder: '输入中文或英文关键词，如「监查」「query」「SAE」…' });
  search.appendChild(input);
  searchCard.appendChild(search);
  root.appendChild(searchCard);

  const count = U.el('div', { class: 'badge badge-muted', style: 'margin:8px 2px', text: '' });
  root.appendChild(count);
  const grid = U.el('div', { class: 'term-grid' });
  root.appendChild(grid);

  function render() {
    const q = input.value.trim().toLowerCase();
    const list = C.terms.filter((t) => {
      if (!q) return true;
      return (t.term + ' ' + t.en + ' ' + t.plain).toLowerCase().includes(q);
    });
    count.textContent = list.length + ' / ' + C.terms.length + ' 条';
    grid.innerHTML = '';
    list.forEach((t) => {
      grid.appendChild(U.el('div', { class: 'term-item', html:
        '<div><span class="t-zh">' + U.esc(t.term) + '</span> <span class="t-en">' + U.esc(t.en) + '</span></div>' +
        '<div class="t-plain">' + U.esc(t.plain) + '</div>' }));
    });
    if (!list.length) grid.appendChild(U.el('div', { class: 'callout info', text: '没有匹配的术语。' }));
  }

  input.addEventListener('input', render);
  render();
});