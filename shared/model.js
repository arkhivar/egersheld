var E = globalThis.E || (globalThis.E = {});
E.pages = E.pages || {};
E.VERSION = '1.00';

// Pure, deterministic planning calculations. No network or document writes.
E.Model = {
  finite(value, label, minimum = 0) {
    const n = Number(value);
    if (value == null || typeof value === 'boolean' || String(value).trim() === '' || !Number.isFinite(n) || n < minimum)
      throw new Error(`${label} must be a finite number of at least ${minimum}.`);
    return n;
  },
  dateISO(value) {
    if (value == null || value === '') return '';
    const raw = String(value).slice(0, 10);
    const date = typeof value === 'number' ? new Date(value * 1000) : new Date(raw + 'T00:00:00Z');
    if (!Number.isFinite(date.getTime())) return '';
    const iso = date.toISOString().slice(0, 10);
    return typeof value === 'number' || /^\d{4}-\d{2}-\d{2}$/.test(raw) && iso === raw ? iso : '';
  },
  addMonths(value, count) {
    const iso = E.Model.dateISO(value);
    if (!iso || !Number.isInteger(count)) throw new Error('A valid date and whole month count are required.');
    const [y, m, d] = iso.split('-').map(Number);
    const end = new Date(Date.UTC(y, m + count, 0)).getUTCDate();
    return new Date(Date.UTC(y, m - 1 + count, Math.min(d, end))).toISOString().slice(0, 10);
  },
  isActiveGrant(grant) { return !/cancelled|canceled|forfeited/i.test(grant.Status || ''); },
  capTable(data) {
    const company = data.Companies[0];
    if (!company) throw new Error('The company baseline is missing.');
    const holdings = data.Holdings.filter(h => Number(h.Company) === Number(company.id));
    const pool = E.Model.finite(company.PoolReserved, 'Option reserve');
    const totals = new Map();
    holdings.forEach(h => totals.set(Number(h.Holder), (totals.get(Number(h.Holder)) || 0) + E.Model.finite(h.Shares, 'Holding units')));
    const issued = E.Model.finite([...totals.values()].reduce((sum, n) => sum + n, 0), 'Total issued units');
    if (issued <= 0) throw new Error('The baseline needs positive issued units.');
    const granted = data.Grants.filter(g => Number(g.Company) === Number(company.id) && E.Model.isActiveGrant(g))
      .reduce((sum, g) => sum + E.Model.finite(g.Units, 'Grant units'), 0);
    if (granted > pool) throw new Error('Active grants exceed the reserved pool. Correct the baseline before simulating.');
    const fullyDiluted = E.Model.finite(issued + pool, 'Fully diluted units');
    const rows = [...totals].map(([id, shares]) => {
      const holder = data.Stakeholders.find(s => Number(s.id) === id);
      if (!holder) throw new Error(`Holder ${id} is missing from Stakeholders.`);
      return { id, name: holder.Name, role: holder.Role, color: holder.Color || '#8291ad', shares,
        issuedPct: shares / issued, fdPct: shares / fullyDiluted };
    }).sort((a, b) => b.shares - a.shares);
    return { rows, issued, pool, granted, available: pool - granted, fullyDiluted };
  },
  simulateRound(data, assumptions) {
    const base = E.Model.capTable(data);
    const preMoney = E.Model.finite(assumptions.preMoney, 'Pre-money valuation', 1);
    const investment = E.Model.finite(assumptions.investment, 'New investment');
    const poolPercent = E.Model.finite(assumptions.poolPercent, 'Target pool percentage');
    if (poolPercent > 50) throw new Error('Target pool must be between 0% and 50% for this model.');
    const postMoney = E.Model.finite(preMoney + investment, 'Post-money valuation', 1);
    const investorPct = investment / postMoney;
    const target = poolPercent / 100;
    if (1 - investorPct - target <= 1e-9) throw new Error('This raise and target pool leave no ownership for existing holders. Reduce one of them.');
    const poolShares = Math.max(base.pool, target * base.issued / (1 - investorPct - target));
    const topUp = poolShares - base.pool;
    const pricePerShare = preMoney / (base.issued + poolShares);
    const newInvestorShares = investment / pricePerShare;
    const totalShares = base.issued + poolShares + newInvestorShares;
    if (![poolShares, pricePerShare, newInvestorShares, totalShares].every(Number.isFinite) || pricePerShare <= 0)
      throw new Error('These assumptions exceed the numerical range of the model. Use smaller values.');
    const rows = base.rows.map(r => ({ ...r, beforeShares: r.shares, afterShares: r.shares,
      beforePct: r.fdPct, afterPct: r.shares / totalShares }));
    rows.push({ id: 'pool', name: 'Employee pool', role: 'Pool', color: '#8f82d9', beforeShares: base.pool,
      afterShares: poolShares, beforePct: base.pool / base.fullyDiluted, afterPct: poolShares / totalShares });
    rows.push({ id: 'new-investor', name: 'New investor', role: 'New investor', color: '#f1a873', beforeShares: 0,
      afterShares: newInvestorShares, beforePct: 0, afterPct: investorPct });
    return { preMoney, investment, postMoney, pricePerShare, issuedShares: base.issued,
      originalPool: base.pool, topUp, poolShares, newInvestorShares, totalShares, investorPct,
      dilution: 1 - base.fullyDiluted / totalShares, rows };
  },
  vesting(grant, asOfISO) {
    const start = E.Model.dateISO(grant.Start);
    const asOf = E.Model.dateISO(asOfISO);
    if (!start || !asOf) throw new Error('Vesting requires valid start and as-of dates.');
    const units = E.Model.finite(grant.Units, 'Grant units');
    const duration = E.Model.finite(grant.DurationMonths, 'Vesting duration', 1);
    const cliff = E.Model.finite(grant.CliffMonths, 'Cliff');
    if (!Number.isInteger(duration) || !Number.isInteger(cliff) || cliff > duration)
      throw new Error('Cliff and duration must be whole months, with cliff no later than maturity.');
    if (duration > 1200) throw new Error('Vesting schedules are limited to 1,200 months in this prototype.');
    const cliffDate = E.Model.addMonths(start, cliff);
    const endDate = E.Model.addMonths(start, duration);
    const [sy, sm] = start.split('-').map(Number);
    const [ay, am] = asOf.split('-').map(Number);
    let months = Math.max(0, Math.min(duration, (ay - sy) * 12 + am - sm));
    if (months > 0 && asOf < E.Model.addMonths(start, months)) months--;
    const active = E.Model.isActiveGrant(grant);
    const vested = !active || asOf < cliffDate ? 0 : months >= duration ? units : Math.floor(units * months / duration);
    const nextDate = !active || asOf >= endDate ? null : asOf < cliffDate ? cliffDate : E.Model.addMonths(start, months + 1);
    return { vested, unvested: active ? units - vested : 0, percent: units ? vested / units : 0,
      months, cliffDate, endDate, nextDate };
  }
};
