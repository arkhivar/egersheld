/* Compare saved assumptions against today's baseline, without applying them. */
function egScenariosResults(data) {
  return data.Scenarios.map(scenario => {
    try {
      return { scenario, result: E.Model.simulateRound(data, { preMoney: scenario.PreMoney,
        investment: scenario.Investment, poolPercent: scenario.PoolPercent }), error: '' };
    } catch (error) { return { scenario, result: null, error: error.message || String(error) }; }
  });
}

function egScenariosDate(value) {
  if (!value) return 'Saved scenario';
  const date = typeof value === 'number' ? new Date(value * 1000) : new Date(String(value));
  return Number.isNaN(date.getTime()) ? 'Saved scenario' : date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Vladivostok' });
}

function egScenariosFounderShare(rows, key) {
  return rows.filter(row => row.role === 'Founder').reduce((sum, row) => sum + (Number(row[key]) || 0), 0);
}

function egScenariosCard(page, item) {
  const scenario = item.scenario;
  const id = String(scenario.id);
  const selected = page.selected.has(id);
  const busy = Boolean(page.busy);
  const founders = item.result ? egScenariosFounderShare(item.result.rows, 'afterPct') : null;
  return `<article class="egf-card egf-scenario-card ${selected ? 'is-selected' : ''}" data-scenario-card="${E.html(id)}"><div class="egf-scenario-top"><div><p class="egf-eyebrow">${E.html(egScenariosDate(scenario.CreatedAt))}</p><h2>${E.html(scenario.Name || 'Untitled scenario')}</h2></div><input class="egf-scenario-select" type="checkbox" data-select-scenario="${E.html(id)}" aria-label="Compare ${E.html(scenario.Name)}" ${selected ? 'checked' : ''} ${busy || !item.result ? 'disabled' : ''}></div>
    ${page.renaming === id ? `<form class="egf-rename-form" data-rename-form="${E.html(id)}"><label for="rename-${E.html(id)}">Scenario name</label><input id="rename-${E.html(id)}" class="egf-text-input" data-rename-input maxlength="100" required value="${E.html(page.renameDraft)}" ${busy ? 'disabled' : ''}><div><button class="egf-button egf-button-primary" type="submit" ${busy ? 'disabled' : ''}>${page.busy === `rename:${id}` ? 'Saving…' : 'Save name'}</button><button class="egf-button" data-cancel-rename type="button" ${busy ? 'disabled' : ''}>Cancel</button></div></form>` : ''}
    <p class="egf-scenario-number">${item.result ? E.money(item.result.investment, true) : '—'}</p><span class="egf-scenario-caption">${item.result ? 'new capital modeled' : 'Needs updated assumptions'}</span><div class="egf-scenario-metrics"><div><span>Pre-money valuation</span><strong>${E.money(scenario.PreMoney, true)}</strong></div><div><span>Founders retain</span><strong>${founders === null ? '—' : E.pct(founders)}</strong></div></div>
    <p class="egf-scenario-notes">${E.html(item.error || scenario.Notes || 'No note added. The assumptions tell the story.')}</p><div class="egf-scenario-actions"><a class="egf-button egf-button-quiet" href="funding.html?scenario=${encodeURIComponent(id)}">Explore round ↗</a><div><button type="button" class="egf-button egf-button-quiet" data-rename-scenario="${E.html(id)}" ${busy ? 'disabled' : ''}>Rename</button><button type="button" class="egf-button egf-button-quiet" data-delete-scenario="${E.html(id)}" ${busy ? 'disabled' : ''}>Delete</button></div></div>
    ${page.confirmDelete === id ? `<div class="egf-delete-prompt" role="status"><p>Delete these saved assumptions? Baseline ownership will not change. This cannot be undone.</p><div><button type="button" class="egf-button egf-button-danger" data-confirm-delete="${E.html(id)}" ${busy ? 'disabled' : ''}>${page.busy === `delete:${id}` ? 'Deleting…' : 'Delete scenario'}</button><button type="button" class="egf-button" data-cancel-delete ${busy ? 'disabled' : ''}>Keep it</button></div></div>` : ''}</article>`;
}

function egScenariosComparison(page, items) {
  if (!items.length) return `<section class="egf-empty"><span class="egf-empty-icon">⇄</span><h2>Choose the futures you want to compare</h2><p>Select up to three scenario cards. The current baseline stays alongside them for context.</p></section>`;
  const base = E.Model.capTable(page.data);
  const company = page.data.Companies[0];
  const founderBase = egScenariosFounderShare(base.rows, 'fdPct');
  const rows = [
    ['Pre-money valuation', E.money(company.PreMoney, true), ...items.map(item => E.money(item.result.preMoney, true))],
    ['New investment', '—', ...items.map(item => E.money(item.result.investment, true))],
    ['Post-money valuation', '—', ...items.map(item => E.money(item.result.postMoney, true))],
    ['Founders retain', E.pct(founderBase), ...items.map(item => E.pct(egScenariosFounderShare(item.result.rows, 'afterPct')))],
    ['Founder ownership change', '—', ...items.map(item => `${E.num((egScenariosFounderShare(item.result.rows, 'afterPct') - founderBase) * 100, 1)} pp`)],
    ['New investor ownership', '—', ...items.map(item => E.pct(item.result.investorPct))],
    ['Total pool ownership', E.pct(base.pool / base.fullyDiluted), ...items.map(item => E.pct(item.result.poolShares / item.result.totalShares))],
    ['Pool top-up · units', '—', ...items.map(item => E.num(item.result.topUp))],
    ['Modeled share price', E.money(Number(company.PreMoney) / base.fullyDiluted), ...items.map(item => E.money(item.result.pricePerShare))],
    ['Fully diluted units', E.num(base.fullyDiluted), ...items.map(item => E.num(item.result.totalShares))]
  ];
  const retention = [{ name: 'Current baseline', pct: founderBase, baseline: true }, ...items.map(item => ({ name: item.scenario.Name, pct: egScenariosFounderShare(item.result.rows, 'afterPct'), baseline: false }))];
  return `<section class="egf-card"><div class="egf-comparison-heading"><div><p class="egf-eyebrow">SIDE BY SIDE</p><h2>Different futures. One clear view.</h2></div><button class="egf-button egf-button-quiet" type="button" data-export-comparison>Export comparison ↗</button></div><div class="egf-table-scroll"><table class="egf-table egf-comparison-table"><thead><tr><th>Planning metric</th><th class="egf-muted">Current baseline</th>${items.map(item => `<th>${E.html(item.scenario.Name)}</th>`).join('')}</tr></thead><tbody>${rows.map(row => `<tr><th scope="row">${E.html(row[0])}</th>${row.slice(1).map((value, index) => `<td class="${index === 0 ? 'egf-muted' : ''}">${E.html(value)}</td>`).join('')}</tr>`).join('')}</tbody></table></div><div class="egf-retention"><h3>Combined founder ownership · fully diluted</h3>${retention.map(row => `<div class="egf-retention-row"><span>${E.html(row.name)}</span><div><i style="width:${Math.max(0, Math.min(100, row.pct * 100))}%;${row.baseline ? 'background:#bdc8df' : ''}"></i></div><strong>${E.pct(row.pct)}</strong></div>`).join('')}</div></section>`;
}

function egScenariosExport(page, items) {
  const base = E.Model.capTable(page.data);
  const founderBase = egScenariosFounderShare(base.rows, 'fdPct');
  E.downloadCSV('softdv-scenario-comparison.csv', [
    ['Synthetic planning comparison', 'Calculated against the current baseline, not historical snapshots'],
    ['Metric', 'Current baseline', ...items.map(item => item.scenario.Name)],
    ['Pre-money RUB', page.data.Companies[0].PreMoney, ...items.map(item => item.result.preMoney)],
    ['Investment RUB', 0, ...items.map(item => item.result.investment)],
    ['Post-money RUB', '', ...items.map(item => item.result.postMoney)],
    ['Founders ownership percent', founderBase * 100, ...items.map(item => egScenariosFounderShare(item.result.rows, 'afterPct') * 100)],
    ['Founder change percentage points', 0, ...items.map(item => (egScenariosFounderShare(item.result.rows, 'afterPct') - founderBase) * 100)],
    ['New investor ownership percent', 0, ...items.map(item => item.result.investorPct * 100)],
    ['Target pool percent', '', ...items.map(item => item.scenario.PoolPercent)],
    ['Actual pool ownership percent', base.pool / base.fullyDiluted * 100, ...items.map(item => item.result.poolShares / item.result.totalShares * 100)],
    ['Pool top-up units', 0, ...items.map(item => item.result.topUp)],
    ['Share price RUB', Number(page.data.Companies[0].PreMoney) / base.fullyDiluted, ...items.map(item => item.result.pricePerShare)],
    ['Fully diluted units', base.fullyDiluted, ...items.map(item => item.result.totalShares)],
    ['Notes', '', ...items.map(item => item.scenario.Notes || '')]
  ]);
  E.toast('Scenario comparison exported');
}

E.pages.scenarios = {
  root: null, data: null, selected: new Set(), initialized: false,
  busy: '', confirmDelete: '', renaming: '', renameDraft: '',
  render(root, data) {
    const page = this;
    page.root = root;
    page.data = data;
    const results = egScenariosResults(data);
    const validIds = new Set(results.filter(item => item.result).map(item => String(item.scenario.id)));
    if (!page.initialized) {
      results.filter(item => item.result).slice(0, 3).forEach(item => page.selected.add(String(item.scenario.id)));
      page.initialized = true;
    }
    page.selected = new Set([...page.selected].filter(id => validIds.has(id)));
    const selectedItems = results.filter(item => page.selected.has(String(item.scenario.id)));
    root.innerHTML = `<div class="egf-page"><header class="egf-page-heading"><div><p class="egf-eyebrow">YOUR PLANNING LIBRARY</p><h1>Scenario room<span class="egf-title-dot">.</span></h1><p>Keep the possibilities. Compare the trade-offs. Bring a clearer story to your next conversation.</p></div><a class="egf-button egf-button-primary" href="funding.html">+ New scenario</a></header>
      ${results.length ? `<div class="egf-scenario-toolbar"><p><strong>${results.length}</strong> saved ${results.length === 1 ? 'scenario' : 'scenarios'} · <strong>${selectedItems.length}/3</strong> selected for comparison</p><button class="egf-button egf-button-quiet" type="button" data-clear-comparison ${selectedItems.length ? '' : 'disabled'}>Clear selection</button></div><div class="egf-scenario-grid">${results.map(item => egScenariosCard(page, item)).join('')}</div>${egScenariosComparison(page, selectedItems)}` : `<section class="egf-empty"><span class="egf-empty-icon">↗</span><h2>Your first what-if starts in the funding lab</h2><p>Choose a valuation, investment and pool target. Save the assumptions, then come back here to compare.</p><a class="egf-button egf-button-primary" style="margin-top:20px" href="funding.html">Create a scenario →</a></section>`}
      <aside class="egf-method"><strong>Saved assumptions, not historical snapshots.</strong> Every scenario is recalculated against the current SoftDV baseline. The employee pool includes granted and available units. Founder changes are percentage points (pp), not percent dilution. This is a synthetic planning workspace—not a share register or investment recommendation.</aside></div>`;
    root.querySelectorAll('[data-select-scenario]').forEach(input => input.addEventListener('change', () => {
      if (input.checked && page.selected.size >= 3) {
        input.checked = false;
        E.toast('Choose up to three scenarios. Deselect one to make room.', 'info');
        return;
      }
      if (input.checked) page.selected.add(input.dataset.selectScenario);
      else page.selected.delete(input.dataset.selectScenario);
      page.render(root, page.data);
      root.querySelector(`[data-select-scenario="${input.dataset.selectScenario}"]`)?.focus();
    }));
    root.querySelector('[data-clear-comparison]')?.addEventListener('click', () => { page.selected.clear(); page.render(root, page.data); });
    root.querySelector('[data-export-comparison]')?.addEventListener('click', () => egScenariosExport(page, selectedItems));
    root.querySelectorAll('[data-rename-scenario]').forEach(button => button.addEventListener('click', () => {
      if (page.busy) return;
      page.renaming = button.dataset.renameScenario;
      page.renameDraft = data.Scenarios.find(row => String(row.id) === page.renaming).Name;
      page.confirmDelete = '';
      page.render(root, page.data);
      const input = root.querySelector('[data-rename-input]');
      input.focus(); input.select();
    }));
    root.querySelector('[data-rename-input]')?.addEventListener('input', event => { page.renameDraft = event.target.value; });
    root.querySelector('[data-cancel-rename]')?.addEventListener('click', () => { page.renaming = ''; page.render(root, page.data); });
    root.querySelector('[data-rename-form]')?.addEventListener('submit', async event => {
      event.preventDefault();
      if (page.busy || !page.renameDraft.trim()) return;
      const id = page.renaming;
      const name = page.renameDraft.trim();
      page.busy = `rename:${id}`;
      page.render(root, page.data);
      try {
        await E.store.update('Scenarios', Number(id), { Name: name });
        page.renaming = '';
        E.toast('Scenario renamed');
      } catch (error) { E.toast(error.message || String(error), 'error'); }
      finally { page.busy = ''; if (page.root?.isConnected) page.render(page.root, page.data); }
    });
    root.querySelectorAll('[data-delete-scenario]').forEach(button => button.addEventListener('click', () => {
      if (page.busy) return;
      page.confirmDelete = button.dataset.deleteScenario;
      page.renaming = '';
      page.render(root, page.data);
      root.querySelector('[data-cancel-delete]')?.focus();
    }));
    root.querySelector('[data-cancel-delete]')?.addEventListener('click', () => { page.confirmDelete = ''; page.render(root, page.data); });
    root.querySelector('[data-confirm-delete]')?.addEventListener('click', async event => {
      if (page.busy) return;
      const id = event.currentTarget.dataset.confirmDelete;
      page.busy = `delete:${id}`;
      page.render(root, page.data);
      try {
        await E.store.deleteScenario(Number(id));
        page.selected.delete(id);
        page.confirmDelete = '';
        E.toast('Saved scenario deleted. Baseline unchanged.');
      } catch (error) { E.toast(error.message || String(error), 'error'); }
      finally { page.busy = ''; if (page.root?.isConnected) page.render(page.root, page.data); }
    });
  }
};
