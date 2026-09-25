E.navigation = [
  ['overview', 'Overview', 'grid'], ['ownership', 'Ownership', 'users'],
  ['funding', 'Funding lab', 'sliders'], ['vesting', 'Vesting', 'calendar'],
  ['scenarios', 'Scenarios', 'layers']
];
E.currentPage = document.body.dataset.page || 'overview';
E.mount = function () {
  const active = E.navigation.find(item => item[0] === E.currentPage) || E.navigation[0];
  document.body.classList.toggle('embedded', E.store.mode === 'grist');
  const links = E.navigation.map(([id, label, icon]) => `<a href="${id}.html" class="${id === E.currentPage ? 'active' : ''}" ${id === E.currentPage ? 'aria-current="page"' : ''}>${E.icon(icon)}<span>${label}</span></a>`).join('');
  document.getElementById('app').innerHTML = `
    <aside class="sidebar">
      <a class="brand" href="index.html" aria-label="Egersheld home"><svg class="brand-mark" viewBox="0 0 32 32" fill="none" aria-hidden="true"><path d="M5 9 16 3l11 6v14l-11 6-11-6V9Z" stroke="currentColor" stroke-width="2"/><path d="m5 9 11 7 11-7M16 16v13M10 12v8l6 4" stroke="currentColor" stroke-width="2"/></svg>egersheld<span style="color:#82a3f7">.</span></a>
      <div class="workspace-switch"><span class="workspace-avatar">S</span><div><b>SoftDV</b><small>Company workspace</small></div><span class="pill blue">RU</span></div>
      <div class="nav-label">Workspace</div><nav class="main-nav" aria-label="Workspace">${links}</nav>
      <div class="sidebar-bottom"><div class="eyebrow">Room to grow.</div><p class="sidebar-note">Make the next chapter<br>of your company a little clearer.</p><span class="prototype-label">PROTOTYPE · ${E.VERSION}</span></div>
    </aside>
    <main class="workspace-main"><header class="topbar">
      <div class="breadcrumb">Workspace <span>/</span> SoftDV <span>/</span> <strong>${active[1]}</strong></div>
      <nav class="compact-nav" aria-label="Workspace">${links}</nav>
      <div class="topbar-actions"><span class="connection-pill" id="connection" data-mode="${E.store.mode}">Connecting</span><button class="icon-button" id="refresh-data" aria-label="Refresh data" title="Refresh data">${E.icon('refresh')}</button><button class="icon-button" id="help-button" aria-label="About this prototype" aria-expanded="false">${E.icon('info')}</button><span class="top-avatar" title="Fictional SoftDV workspace">SD</span></div>
    </header><div class="page-scroll"><div id="page-content" tabindex="-1"></div><footer class="page-foot"><span>Fictional company. Real possibilities. &nbsp;·&nbsp; Planning only, not an ownership register.</span><a href="https://github.com/arkhivar/egersheld" target="_blank" rel="noopener">Egersheld v${E.VERSION} ↗</a></footer></div></main>`;
  document.getElementById('refresh-data').addEventListener('click', async event => {
    const button = event.currentTarget;
    button.disabled = true;
    try { await E.store.refresh(); E.toast(E.store.mode === 'grist' ? 'Fresh data loaded from Grist' : 'Demo data refreshed'); }
    catch (error) { E.toast(error.message, 'error'); }
    finally { button.disabled = false; }
  });
  document.getElementById('help-button').addEventListener('click', () => {
    const help = document.getElementById('help-popover');
    help.hidden = !help.hidden;
    document.getElementById('help-button').setAttribute('aria-expanded', String(!help.hidden));
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      document.getElementById('help-popover').hidden = true;
      document.getElementById('help-button').setAttribute('aria-expanded', 'false');
    }
  });
};
E.renderPage = function () {
  const root = document.getElementById('page-content');
  const badge = document.getElementById('connection');
  badge.dataset.status = E.store.status;
  badge.textContent = E.store.status === 'error' ? 'Connection issue' : E.store.mode === 'grist' ? 'Connected to Grist' : 'Synthetic demo';
  if (E.store.status === 'error') {
    root.innerHTML = `<section class="card empty-state" role="alert"><h2>We couldn’t load your workspace</h2><p>${E.html(E.store.error?.message || 'An unexpected data error occurred.')}</p><p>No demo data has been substituted. Use the refresh button to try again.</p></section>`;
    return;
  }
  if (E.store.status !== 'ready') {
    root.innerHTML = '<div class="eyebrow">SOFTDV WORKSPACE</div><h1 style="margin-top:10px">Getting everything in view.</h1><div class="skeleton" role="status" aria-label="Loading workspace"></div>';
    return;
  }
  try {
    E.Model.capTable(E.data);
    if (!E.pages[E.currentPage]) throw new Error('This workspace page is unavailable.');
    E.pages[E.currentPage].render(root, E.data);
  } catch (error) {
    root.innerHTML = `<section class="card empty-state" role="alert"><h2>Let’s check the baseline</h2><p>${E.html(error.message)}</p><p>Correct the source tables in Grist, then refresh.</p></section>`;
  }
};
E.mount();
E.store.subscribe(E.renderPage);
E.renderPage();
if (E.store.mode === 'grist' && window.grist?.onOptions) {
  window.grist.onOptions(options => { E.options = options || {}; if (E.store.status === 'ready') E.renderPage(); });
}
E.store.load().catch(error => console.error('Workspace load failed:', error));
