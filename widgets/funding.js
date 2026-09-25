/* Hypothetical rounds never write to baseline holdings. */
function egFundingInitial(data) {
  const company = data.Companies[0] || {};
  return { preMoney: Number(company.PreMoney) || 180000000, investment: 45000000,
    poolPercent: 15, name: '', notes: '', source: '', saving: false, error: '' };
}

function egFundingReadScenario(page, data) {
  const query = new URLSearchParams(window.location.search).get('scenario');
  if (!query || page.loadedQuery === query) return;
  const scenario = data.Scenarios.find(row => String(row.id) === query);
  if (!scenario) {
    page.loadedQuery = query;
    E.toast('That saved scenario is unavailable. Showing a new financing draft.', 'error');
    return;
  }
  page.state = { ...egFundingInitial(data), preMoney: Number(scenario.PreMoney),
    investment: Number(scenario.Investment), poolPercent: Number(scenario.PoolPercent),
    name: `${scenario.Name} · copy`, notes: scenario.Notes || '', source: scenario.Name };
  page.loadedQuery = query;
}

function egFundingFounderShare(rows, key) {
  return rows.filter(row => row.role === 'Founder').reduce((sum, row) => sum + (Number(row[key]) || 0), 0);
}

function egFundingField(key, label, value, min, max, step, suffix, description) {
  const display = key === 'poolPercent' ? value : value / 1000000;
  return `<div class="egf-field"><div class="egf-field-heading"><label for="funding-${key}">${label}</label>
    <div class="egf-number-wrap"><input id="funding-${key}" data-assumption="${key}" type="number" min="${min}" step="${step}" value="${E.html(display)}" inputmode="decimal" aria-describedby="funding-help-${key}"><span>${suffix}</span></div></div>
    <input class="egf-slider" data-slider="${key}" type="range" min="${min}" max="${Math.max(max, Math.ceil(display * 1.2))}" step="${step}" value="${E.html(display)}" aria-label="${label}">
    <p id="funding-help-${key}" class="egf-help">${description}</p></div>`;
}

function egFundingResultMarkup(data, result) {
  const beforeFounders = egFundingFounderShare(result.rows, 'beforePct');
  const afterFounders = egFundingFounderShare(result.rows, 'afterPct');
  const chartRows = result.rows.map(row => `<div class="egf-impact-chart-row"><div class="egf-chart-name"><span>${E.html(row.name)}</span><strong>${E.pct(row.afterPct)}</strong></div><div class="egf-paired-bars" aria-label="${E.html(row.name)}: ${E.pct(row.beforePct)} before, ${E.pct(row.afterPct)} after"><span class="egf-before-bar" style="width:${Math.max(0, Math.min(100, row.beforePct * 100))}%"></span><span class="egf-after-bar" style="width:${Math.max(0, Math.min(100, row.afterPct * 100))}%;background:${egFundingColor(row.color)}"></span></div></div>`).join('');
  const tableRows = result.rows.map(row => `<tr><th scope="row"><span class="egf-dot" style="background:${egFundingColor(row.color)}"></span>${E.html(row.name)}<small>${E.html(row.role)}</small></th><td>${E.num(row.afterShares, 0)}</td><td>${E.pct(row.beforePct)}</td><td class="egf-strong">${E.pct(row.afterPct)}</td><td class="${row.afterPct < row.beforePct ? 'egf-negative' : 'egf-muted'}">${row.afterPct > row.beforePct ? '+' : ''}${E.num((row.afterPct - row.beforePct) * 100, 1)} pp</td></tr>`).join('');
  const burn = Number((data.Companies[0] || {}).MonthlyBurn);
  const runway = burn > 0 ? result.investment / burn : null;
  return `<div class="egf-stats"><div class="egf-stat"><span>Post-money valuation</span><strong>${E.money(result.postMoney, true)}</strong><small>Pre-money + new investment</small></div><div class="egf-stat"><span>New investor ownership</span><strong>${E.pct(result.investorPct)}</strong><small>Fully diluted, after the round</small></div><div class="egf-stat"><span>Founders retain</span><strong>${E.pct(afterFounders)}</strong><small>From ${E.pct(beforeFounders)} before financing</small></div></div>
    <section class="egf-card egf-chart-card"><div class="egf-card-heading"><div><p class="egf-eyebrow">THE TRADE-OFF</p><h2>More capital. A new balance.</h2></div><div class="egf-chart-legend"><span><i class="egf-legend-before"></i>Before</span><span><i class="egf-legend-after"></i>After</span></div></div><div class="egf-impact-chart">${chartRows}</div><p class="egf-help">Fully diluted ownership. Each bar uses the same 0–100% scale.</p></section>
    <div class="egf-round-details"><div><span>Modeled share price</span><strong>${E.money(result.pricePerShare)}</strong></div><div><span>Pool top-up</span><strong>${E.num(result.topUp, 0)} units</strong></div><div><span>Extra runway</span><strong>${runway === null ? '—' : `${E.num(runway, 1)} months`}</strong></div></div>
    <section class="egf-card"><div class="egf-card-heading"><div><p class="egf-eyebrow">STAKEHOLDER IMPACT</p><h2>The numbers behind the round</h2></div><button type="button" class="egf-button egf-button-quiet" data-export-round>Export CSV ↗</button></div><div class="egf-table-scroll"><table class="egf-table"><thead><tr><th>Stakeholder</th><th>Units after</th><th>Before</th><th>After</th><th>Change</th></tr></thead><tbody>${tableRows}</tbody></table></div><p class="egf-table-note">pp = percentage points. Units may be fractional in this planning model.</p></section>`;
}

function egFundingColor(color) {
  return /^#[0-9a-f]{3,8}$/i.test(String(color)) ? color : '#4b6fff';
}

function egFundingRefresh(page) {
  const area = page.root.querySelector('[data-round-results]');
  try {
    const result = E.Model.simulateRound(page.data, page.state);
    page.result = result;
    page.state.error = '';
    area.innerHTML = egFundingResultMarkup(page.data, result);
    area.querySelector('[data-export-round]').addEventListener('click', () => {
      E.downloadCSV('softdv-financing-impact.csv', [
        ['Scenario', page.state.name || 'Unsaved financing'], ['Pre-money RUB', result.preMoney],
        ['Investment RUB', result.investment], ['Target reserved pool percent', page.state.poolPercent],
        [], ['Stakeholder', 'Role', 'Units before', 'Units after', 'Ownership before percent', 'Ownership after percent'],
        ...result.rows.map(row => [row.name, row.role, row.beforeShares, row.afterShares, row.beforePct * 100, row.afterPct * 100])
      ]);
      E.toast('Financing comparison exported');
    });
  } catch (error) {
    page.result = null;
    page.state.error = error.message || String(error);
    area.innerHTML = `<div class="egf-empty egf-validation" role="status"><span class="egf-empty-icon">↔</span><h2>Adjust the assumptions</h2><p>${E.html(page.state.error)}</p><p class="egf-help">The post-round pool and new investor must leave room for existing shareholders.</p></div>`;
  }
  const save = page.root.querySelector('[data-save-scenario]');
  if (save) save.disabled = page.state.saving || !page.result;
}

E.pages.funding = {
  state: null, root: null, data: null, result: null, loadedQuery: null,
  render(root, data) {
    const page = this;
    page.root = root;
    page.data = data;
    if (!page.state) page.state = egFundingInitial(data);
    egFundingReadScenario(page, data);
    const state = page.state;
    root.innerHTML = `<div class="egf-page"><header class="egf-page-heading"><div><p class="egf-eyebrow">HYPOTHETICAL FINANCING</p><h1>Funding lab<span class="egf-title-dot">.</span></h1><p>Make room for what comes next. See every ownership trade-off before you commit.</p></div><span class="egf-badge"><i></i>Baseline stays untouched</span></header>
      <div class="egf-funding-layout"><aside class="egf-assumptions"><section class="egf-card"><div class="egf-card-heading"><div><p class="egf-eyebrow">YOUR NEXT ROUND</p><h2>Set the ambition</h2></div><button class="egf-button egf-button-quiet" type="button" data-reset-round>Reset</button></div>${state.source ? `<p class="egf-source">Based on ${E.html(state.source)} · saving creates a separate scenario.</p>` : ''}
      ${egFundingField('preMoney', 'Pre-money valuation', state.preMoney, 1, 600, 1, '₽m', 'Company value before the new money arrives.')}
      ${egFundingField('investment', 'New investment', state.investment, 0, 200, 1, '₽m', 'Primary capital only. No fees or secondary sales.')}
      ${egFundingField('poolPercent', 'Target option reserve', state.poolPercent, 0, 40, 0.5, '%', 'Total granted + available pool, as a share of post-round fully diluted units.')}
      <div class="egf-presets"><span class="egf-eyebrow">TRY A STARTING POINT</span><div><button type="button" data-preset="lean">Lean raise</button><button type="button" data-preset="seed">Seed round</button><button type="button" data-preset="growth">Growth round</button></div></div></section>
      <section class="egf-card egf-save-card"><p class="egf-eyebrow">KEEP THE WHAT-IF</p><h2>Save a scenario</h2><form data-scenario-form><label for="scenario-name">Scenario name</label><input class="egf-text-input" id="scenario-name" name="name" required maxlength="100" placeholder="e.g. Seed round · September" value="${E.html(state.name)}" ${state.saving ? 'disabled' : ''}><label for="scenario-notes">A note for future you <span>optional</span></label><textarea class="egf-text-input" id="scenario-notes" name="notes" rows="2" maxlength="1500" placeholder="What are we testing?" ${state.saving ? 'disabled' : ''}>${E.html(state.notes)}</textarea><button class="egf-button egf-button-primary egf-save-button" data-save-scenario type="submit" ${state.saving ? 'disabled' : ''}>${state.saving ? 'Saving…' : 'Save scenario →'}</button><p class="egf-help">${E.store.mode === 'demo' ? 'Saved in this browser’s demo workspace.' : 'Saved to the Scenarios table in Grist.'} Assumptions only—not an issuance.</p></form></section></aside>
      <div class="egf-results" data-round-results></div></div><aside class="egf-method"><strong>A transparent, simple model.</strong> A priced primary equity round with a pre-money option-pool top-up. Existing reserve is never reduced. Grants already sit inside the pool; they are not counted twice. No SAFEs, convertibles, liquidation preferences, taxes or legal issuance mechanics. Extra runway assumes today’s monthly burn stays unchanged.</aside></div>`;
    egFundingRefresh(page);
    if (state.saving) root.querySelectorAll('input, textarea, [data-preset], [data-reset-round]').forEach(control => { control.disabled = true; });
    root.querySelectorAll('[data-assumption], [data-slider]').forEach(input => input.addEventListener('input', () => {
      const key = input.dataset.assumption || input.dataset.slider;
      const multiplier = key === 'poolPercent' ? 1 : 1000000;
      state[key] = input.value === '' ? NaN : Number(input.value) * multiplier;
      state.source = '';
      const partner = root.querySelector(input.dataset.slider ? `[data-assumption="${key}"]` : `[data-slider="${key}"]`);
      if (input.dataset.slider) partner.value = input.value;
      else if (Number.isFinite(state[key])) {
        partner.max = String(Math.max(Number(partner.max), Math.ceil(Number(input.value) * 1.2)));
        partner.value = input.value;
      }
      egFundingRefresh(page);
    }));
    root.querySelector('[data-reset-round]').addEventListener('click', () => {
      if (state.saving) return;
      page.state = egFundingInitial(data);
      page.render(root, page.data);
    });
    root.querySelectorAll('[data-preset]').forEach(button => button.addEventListener('click', () => {
      if (state.saving) return;
      const presets = { lean: [180000000, 15000000, 12], seed: [180000000, 45000000, 15], growth: [300000000, 100000000, 15] };
      const values = presets[button.dataset.preset];
      [state.preMoney, state.investment, state.poolPercent] = values;
      state.source = '';
      page.render(root, page.data);
    }));
    root.querySelector('#scenario-name').addEventListener('input', event => { state.name = event.target.value; });
    root.querySelector('#scenario-notes').addEventListener('input', event => { state.notes = event.target.value; });
    root.querySelector('[data-scenario-form]').addEventListener('submit', async event => {
      event.preventDefault();
      if (state.saving || !page.result) return;
      const name = state.name.trim();
      if (!name) { root.querySelector('#scenario-name').focus(); return; }
      const fields = { Company: data.Companies[0].id, Name: name, PreMoney: state.preMoney,
        Investment: state.investment, PoolPercent: state.poolPercent, Notes: state.notes.trim(), CreatedAt: Date.now() / 1000 };
      state.saving = true;
      page.render(root, page.data);
      try {
        await E.store.saveScenario(fields);
        E.toast(`“${name}” saved. Compare it in Scenarios.`);
        state.source = name;
        state.name = '';
      } catch (error) { E.toast(error.message || String(error), 'error'); }
      finally { state.saving = false; if (page.root?.isConnected) page.render(page.root, page.data); }
    });
  }
};
