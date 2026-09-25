E.pages.overview = {
  render(root, data) {
    const company = data.Companies[0];
    const cap = E.Model.capTable(data);
    const founders = cap.rows.filter(row => row.role === 'Founder').reduce((sum, row) => sum + row.fdPct, 0);
    const burn = E.Model.finite(company.MonthlyBurn, 'Monthly burn');
    const cash = E.Model.finite(company.Cash, 'Cash balance');
    const runway = burn > 0 ? cash / burn : null;
    const today = E.today();
    const grants = data.Grants.filter(row => row.Company === company.id && E.Model.isActiveGrant(row));
    const vested = grants.reduce((sum, row) => sum + E.Model.vesting(row, today).vested, 0);
    const slices = cap.rows.map(row => ({ label: row.name, value: row.shares, color: row.color }));
    slices.push({ label: 'Employee option pool', value: cap.pool, color: '#ccd5e7' });
    const horizon = Math.min(24, Math.max(12, Math.ceil(runway || 12)));
    const points = Array.from({ length: horizon + 1 }, (_, month) => ({ label: month === 0 ? 'Now' : `M${month}`, value: Math.max(0, cash - burn * month) }));
    const metrics = [
      ['Baseline valuation', E.money(company.PreMoney, true), 'Pre-money planning assumption', 'chart'],
      ['Founder ownership', E.pct(founders), 'Fully diluted · includes reserved pool', 'users'],
      ['Cash runway', runway === null ? 'No burn' : `${E.num(runway, 1)} <small>months</small>`, `${E.money(burn, true)} net burn per month`, 'clock'],
      ['Employee pool', E.num(cap.pool), `${E.num(cap.available)} units still unallocated`, 'layers']
    ];
    root.innerHTML = `<div class="page-intro"><div><div class="eyebrow">Your company, in perspective</div><h1>A clearer view of what’s next.</h1><p>${E.html(company.Name)} · ${E.html(company.City)} · Ownership & capital planning</p></div><a class="button primary" href="funding.html">Explore a funding round ${E.icon('arrow-up-right')}</a></div>
      <section class="metrics" aria-label="Company metrics">${metrics.map(([label, value, foot, icon]) => `<article class="card metric"><div class="metric-label">${label}${E.icon(icon)}</div><div class="metric-value">${value}</div><div class="metric-foot">${foot}</div></article>`).join('')}</section>
      <div class="overview-main-grid">
        <section class="card ownership-snapshot"><div class="card-head"><div><h2>Who owns the next chapter?</h2><p class="card-subtitle">Fully diluted ownership · ${E.num(cap.fullyDiluted)} units</p></div><a class="button ghost" href="ownership.html">View table ${E.icon('arrow-right')}</a></div><div class="overview-ownership-body"><div class="overview-ring">${E.donut(slices, { size: 211, label: E.num(cap.rows.length), sublabel: 'shareholders' })}</div><div class="overview-legend">${slices.map(row => `<div><span class="swatch" style="background:${E.color(row.color)}"></span><span>${E.html(row.label)}</span><b>${E.pct(row.value / cap.fullyDiluted)}</b></div>`).join('')}<p>Granted options are included in the pool,<br>not counted a second time.</p></div></div></section>
        <section class="card runway-card"><div class="card-head"><div><h2>A little breathing room</h2><p class="card-subtitle">Projected cash balance · constant net burn</p></div><span class="pill green">${E.money(cash, true)} cash</span></div><div class="card-body">${E.lineChart(points, { color: '#5f91a9', format: 'money' })}<div class="runway-caption"><span>${E.icon('info')} No new financing or changes in burn assumed.</span><a href="funding.html">What if we raised? ↗</a></div></div></section>
      </div>
      <div class="overview-bottom-grid">
        <section class="card overview-team"><div class="card-head"><div><h2>Building ownership together</h2><p class="card-subtitle">Employee option grants · as of ${E.date(today)}</p></div><a class="button ghost" href="vesting.html">Explore ${E.icon('arrow-right')}</a></div><div class="card-body"><div class="grant-summary"><b>${E.num(vested)} <span>vested units</span></b><span class="pill blue">${grants.length} active grants</span></div><div class="vesting-track"><i style="width:${cap.granted ? 100 * vested / cap.granted : 0}%"></i></div><div class="vesting-track-labels"><span>${E.pct(cap.granted ? vested / cap.granted : 0)} vested</span><span>${E.num(cap.granted)} granted</span></div><div class="overview-people">${grants.slice(0, 4).map(grant => { const holder = data.Stakeholders.find(row => row.id === grant.Holder); return `<span title="${E.html(holder?.Name || 'Employee')}" style="background:${E.color(holder?.Color || '#8b9cc3')}22;color:${E.color(holder?.Color || '#8b9cc3')}">${E.html((holder?.Name || '?').split(' ').map(name => name[0]).slice(0, 2).join(''))}</span>`; }).join('')}<p>A shared stake in the journey.<br><span>Monthly vesting with a one-year cliff.</span></p></div></div></section>
        <section class="card overview-timeline"><div class="card-head"><div><h2>The story so far</h2><p class="card-subtitle">SoftDV milestones</p></div>${E.icon('clock')}</div><div class="card-body timeline-list">${data.Milestones.filter(row => row.Company === company.id).sort((a, b) => a.Date.localeCompare(b.Date)).map(row => `<div class="timeline-item"><i class="${row.Date > today ? 'future' : ''}"></i><div><time>${E.date(row.Date)}</time><b>${E.html(row.Title)}</b></div><span class="pill ${row.Kind === 'Planning' ? 'blue' : ''}">${E.html(row.Kind)}</span></div>`).join('')}</div></section>
        <section class="overview-next card"><span class="eyebrow">A space for what if</span><div class="next-illustration" aria-hidden="true"><span></span><span></span><span></span><i>↗</i></div><h2>Try the next chapter<br>before you write it.</h2><p>Compare a funding round, protect your hiring pool, and see what changes.</p><a class="button primary" href="scenarios.html">Your scenarios ${E.icon('arrow-right')}</a><small>${data.Scenarios.filter(row => row.Company === company.id).length} saved starting points</small></section>
      </div>`;
  }
};
