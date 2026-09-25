E.pages.ownership = {
  state: { basis: null, query: '', selected: null },

  rows(data, basis) {
    const cap = E.Model.capTable(data);
    const companyId = Number(data.Companies[0].id);
    const activeGrants = data.Grants.filter(grant => Number(grant.Company) === companyId && E.Model.isActiveGrant(grant));
    activeGrants.forEach(grant => {
      if (!data.Stakeholders.some(holder => String(holder.id) === String(grant.Holder))) throw new Error(`Option grant ${grant.id} has no matching stakeholder.`);
    });
    const rows = data.Stakeholders.map(holder => {
      const issued = cap.rows.find(row => String(row.id) === String(holder.id));
      const grants = activeGrants.filter(grant => String(grant.Holder) === String(holder.id));
      const options = grants.reduce((sum, grant) => sum + Number(grant.Units || 0), 0);
      const shares = issued ? issued.shares : 0;
      const units = shares + (basis === 'fd' ? options : 0);
      return {
        id: String(holder.id), name: holder.Name, role: holder.Role, title: holder.Title || '',
        color: /^#[\da-f]{6}$/i.test(holder.Color || '') ? holder.Color : '#4b6fff',
        shares, options, units, percent: units / (basis === 'fd' ? cap.fullyDiluted : cap.issued || 1),
        holder, grants,
      };
    }).filter(row => row.units > 0);
    if (basis === 'fd' && cap.available > 0) rows.push({
      id: 'reserve', name: 'Available option pool', role: 'Reserve', title: 'Unallocated · no holder yet',
      color: '#c5cbd9', shares: 0, options: cap.available, units: cap.available,
      percent: cap.available / (cap.fullyDiluted || 1), holder: null, grants: [],
    });
    return rows.sort((a, b) => b.units - a.units || a.name.localeCompare(b.name));
  },

  render(root, data) {
    const page = E.pages.ownership;
    const state = page.state;
    // Grist options may arrive after the first record render.
    state.basis = E.getOption('ownershipBasis', state.basis || 'issued') === 'fd' ? 'fd' : 'issued';
    const cap = E.Model.capTable(data);
    const company = data.Companies[0] || { Name: 'Company' };
    const activeGrants = data.Grants.filter(grant => Number(grant.Company) === Number(company.id) && E.Model.isActiveGrant(grant));
    root.innerHTML = `
      <section class="ow-page">
        <div class="ow-page-head"><div><div class="ow-eyebrow">CAPITAL STRUCTURE</div>
          <h1>Ownership, in perspective.</h1><p>The people behind ${E.html(company.Name)}. A clear view of shares and the team’s option reserve.</p></div>
          <button class="ow-button" data-own-export>${E.icon('download')} Export table</button>
        </div>
        <div class="ow-summary">
          <div class="ow-stat"><span>Issued shares</span><strong>${E.num(cap.issued)}</strong><small>Outstanding baseline shares</small></div>
          <div class="ow-stat"><span>Option reserve</span><strong>${E.num(cap.pool)}</strong><small>${E.num(cap.available)} units still available</small></div>
          <div class="ow-stat"><span>Employee grants</span><strong>${E.num(cap.granted)}</strong><small>${activeGrants.length} active awards · not issued shares</small></div>
          <div class="ow-stat"><span>Fully diluted units</span><strong>${E.num(cap.fullyDiluted)}</strong><small>Issued shares + entire option reserve</small></div>
        </div>
        <section class="ow-card ow-capital-card">
          <div class="ow-card-head"><div><h2>The ownership picture</h2><p>One baseline. Two useful lenses.</p></div>
            <div class="ow-segment" role="group" aria-label="Ownership basis">
              <button data-own-basis="issued" aria-pressed="${state.basis === 'issued'}">Issued shares</button>
              <button data-own-basis="fd" aria-pressed="${state.basis === 'fd'}">Fully diluted</button>
            </div>
          </div><div class="ow-chart-host"></div>
        </section>
        <section class="ow-card ow-holder-card">
          <div class="ow-card-head"><div><h2>Stakeholders</h2><p class="ow-table-caption"></p></div>
            <label class="ow-search">${E.icon('search')}<input type="search" aria-label="Search stakeholders" placeholder="Find a stakeholder…" value="${E.html(state.query)}"></label>
          </div><div class="ow-table-host"></div>
          <div class="ow-card-note">${E.icon('info')} Baseline is read-only here. Explore changes in the Funding Lab; simulations never change issued ownership.</div>
        </section>
        <div class="ow-detail-host"></div>
      </section>`;

    function renderChart() {
      const rows = page.rows(data, state.basis);
      root.querySelectorAll('[data-own-basis]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.ownBasis === state.basis)));
      root.querySelector('.ow-chart-host').innerHTML = `
        <div class="ow-capital-chart">
          <div class="ow-donut">${rows.length ? E.donut(rows.map(row => ({label:row.name,value:row.units,color:row.color})), {size:230,label:E.num(state.basis === 'fd' ? cap.fullyDiluted : cap.issued),sublabel:state.basis === 'fd' ? 'fully diluted units' : 'issued shares'}) : '<div class="ow-empty">No ownership records yet.</div>'}</div>
          <div class="ow-legend">${rows.map(row => `<button class="ow-legend-row" data-own-detail="${E.html(row.id)}"><span class="ow-dot" style="background:${row.color}"></span><span class="ow-legend-name">${E.html(row.name)}<small>${row.id === 'reserve' ? 'Unallocated options' : row.shares && row.options && state.basis === 'fd' ? 'Shares + unexercised options' : row.shares ? 'Issued shares' : 'Unexercised options'}</small></span><strong>${E.pct(row.percent)}</strong></button>`).join('')}</div>
        </div>
        <div class="ow-basis-note">${state.basis === 'fd' ? 'Fully diluted assumes the entire reserved pool is issued. Employee grants are already inside that pool—not added again.' : 'Issued ownership excludes unexercised option grants and the available reserve. Switch to fully diluted to include both.'}</div>`;
    }

    function renderTable() {
      const rows = page.rows(data, state.basis).filter(row => `${row.name} ${row.role} ${row.title}`.toLowerCase().includes(state.query.toLowerCase()));
      root.querySelector('.ow-table-caption').textContent = `${rows.length} ${rows.length === 1 ? 'entry' : 'entries'} · ${state.basis === 'fd' ? 'fully diluted basis' : 'issued basis'} · select a name for details`;
      root.querySelector('.ow-table-host').innerHTML = `<div class="ow-table-scroll"><table class="ow-table"><thead><tr><th>Stakeholder</th><th>Interest</th><th class="ow-numeric">${state.basis === 'fd' ? 'FD units' : 'Issued shares'}</th><th class="ow-numeric">Ownership</th></tr></thead><tbody>${rows.map(row => `<tr data-own-row="${E.html(row.id)}" class="${state.selected === row.id ? 'is-selected' : ''}">
        <td><button class="ow-person" data-own-detail="${E.html(row.id)}" aria-expanded="${state.selected === row.id}"><span class="ow-avatar" style="--person-color:${row.color}">${row.id === 'reserve' ? E.icon('layers') : E.html(row.name.split(/\s+/).slice(0,2).map(word => word[0]).join(''))}</span><span><strong>${E.html(row.name)}</strong><small>${E.html(row.title || row.role)}</small></span></button></td>
        <td><span class="ow-security">${row.shares && row.options && state.basis === 'fd' ? 'Shares + options' : row.shares ? 'Issued shares' : row.id === 'reserve' ? 'Available reserve' : 'Option grant'}</span></td>
        <td class="ow-numeric">${E.num(row.units)}</td><td class="ow-numeric"><span class="ow-percent">${E.pct(row.percent)}<span class="ow-mini-track"><i style="width:${Math.max(0,Math.min(100,row.percent*100))}%;background:${row.color}"></i></span></span></td>
      </tr>`).join('') || '<tr><td colspan="4" class="ow-empty">No matching stakeholders. Try another name.</td></tr>'}</tbody><tfoot><tr><td colspan="2">${state.query ? 'Matching subtotal' : 'Total'}</td><td class="ow-numeric">${E.num(rows.reduce((sum,row) => sum+row.units,0))}</td><td class="ow-numeric">${E.pct(rows.reduce((sum,row) => sum+row.percent,0))}</td></tr></tfoot></table></div>`;
    }

    function renderDetail() {
      const row = page.rows(data, state.basis).find(item => item.id === state.selected);
      const host = root.querySelector('.ow-detail-host');
      if (!row) { host.innerHTML = ''; return; }
      const holdings = data.Holdings.filter(holding => String(holding.Holder) === row.id);
      host.innerHTML = `<aside class="ow-detail" role="dialog" aria-modal="false" aria-label="${E.html(row.name)} details">
        <div class="ow-detail-top"><span class="ow-eyebrow">${row.id === 'reserve' ? 'OPTION RESERVE' : E.html(row.role || 'STAKEHOLDER')}</span><button class="ow-icon-button" data-own-close aria-label="Close stakeholder details">${E.icon('close')}</button></div>
        <span class="ow-avatar ow-avatar-large" style="--person-color:${row.color}">${row.id === 'reserve' ? E.icon('layers') : E.html(row.name.split(/\s+/).slice(0,2).map(word => word[0]).join(''))}</span>
        <h2>${E.html(row.name)}</h2><p>${E.html(row.title)}</p>
        <div class="ow-detail-metric"><strong>${E.pct(row.percent)}</strong><span>${state.basis === 'fd' ? 'Fully diluted ownership' : 'Issued ownership'}</span></div>
        <dl class="ow-details"><div><dt>Issued shares</dt><dd>${E.num(row.shares)}</dd></div><div><dt>${row.id === 'reserve' ? 'Available options' : 'Unexercised options'}</dt><dd>${E.num(row.options)}</dd></div>${row.holder && row.holder.Email ? `<div><dt>Contact</dt><dd>${E.html(row.holder.Email)}</dd></div>` : ''}</dl>
        ${holdings.length ? `<h3>Baseline holdings</h3>${holdings.map(holding => `<div class="ow-detail-record"><strong>${E.num(holding.Shares)} ${E.html(holding.ShareClass || 'shares')}</strong><small>${E.html(holding.Issued || 'Issue date not set')}</small>${holding.Note ? `<p>${E.html(holding.Note)}</p>` : ''}</div>`).join('')}` : ''}
        ${row.grants.length ? `<h3>Option awards</h3>${row.grants.map(grant => `<div class="ow-detail-record"><strong>${E.num(grant.Units)} option units</strong><small>${E.html(grant.DurationMonths)} months · ${E.html(grant.CliffMonths)}-month cliff</small><p>Start ${E.html(grant.Start)} · exercise price ${E.money(grant.ExercisePrice)}</p></div>`).join('')}<button class="ow-button ow-wide" data-own-vesting>Explore vesting ${E.icon('arrow-right')}</button>` : ''}
        <div class="ow-detail-note">${row.id === 'reserve' ? 'This is a reserved allocation, not an issued security or a shareholder. Grants draw from this pool.' : 'Option grants are not issued shares. The fully diluted view is a planning assumption, not a legal ownership record.'}</div>
      </aside>`;
    }

    renderChart(); renderTable(); renderDetail();
    root.querySelector('.ow-search input').addEventListener('input', event => { state.query = event.target.value; renderTable(); });
    root.querySelector('[data-own-export]').addEventListener('click', () => {
      const rows = page.rows(data, state.basis);
      E.downloadCSV(`softdv-ownership-${state.basis}.csv`, [
        ['Stakeholder','Role','Issued shares','Unexercised / reserved options','Basis units','Ownership percent','Basis'],
        ...rows.map(row => [row.name,row.role,row.shares,row.options,row.units,(row.percent*100).toFixed(6),state.basis === 'fd' ? 'Fully diluted' : 'Issued shares']),
      ]);
      E.toast('Ownership table exported.');
    });
    root.querySelector('.ow-page').addEventListener('click', event => {
      const basis = event.target.closest('[data-own-basis]');
      const detail = event.target.closest('[data-own-detail]');
      const tableRow = event.target.closest('[data-own-row]');
      if (basis) {
        state.basis = basis.dataset.ownBasis;
        E.saveOptions('ownershipBasis', state.basis).catch(error => E.toast(error.message, 'error'));
        renderChart(); renderTable(); renderDetail();
      } else if (detail || tableRow) {
        state.selected = detail ? detail.dataset.ownDetail : tableRow.dataset.ownRow;
        renderTable(); renderDetail();
        const selectedButton = root.querySelector(`.ow-table [data-own-detail="${state.selected}"]`);
        if (selectedButton) selectedButton.focus({preventScroll:true});
      } else if (event.target.closest('[data-own-close]')) {
        const previous = state.selected;
        state.selected = null; renderTable(); renderDetail();
        root.querySelector(`.ow-table [data-own-detail="${previous}"]`)?.focus({preventScroll:true});
      } else if (event.target.closest('[data-own-vesting]')) E.navigate('vesting');
    });
    root.querySelector('.ow-page').addEventListener('keydown', event => {
      if (event.key === 'Escape' && state.selected !== null) {
        const previous = state.selected;
        state.selected = null; renderTable(); renderDetail(); event.preventDefault();
        root.querySelector(`.ow-table [data-own-detail="${previous}"]`)?.focus({preventScroll:true});
      }
      if (event.target.matches('.ow-person') && ['ArrowDown','ArrowUp'].includes(event.key)) {
        const buttons = [...root.querySelectorAll('.ow-person')];
        const next = buttons[buttons.indexOf(event.target) + (event.key === 'ArrowDown' ? 1 : -1)];
        if (next) next.focus();
        event.preventDefault();
      }
    });
  },
};
