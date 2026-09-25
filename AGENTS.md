# Egersheld

Static Grist custom-widget prototype for fictional SoftDV. This is a planning
and simulation tool, not a securities register or legal/accounting product.

- Five entry widgets: overview.html, ownership.html, funding.html, vesting.html,
  scenarios.html; index.html is the standalone home/overview.
- Classic scripts share the `E` namespace. No framework, build step, IIFEs, or
  ES modules. Each widget implements `E.pages[name] = { render(root, data) }`.
- Shared UI patterns originate from arkhivar/grist: keyboard-friendly cells,
  non-blocking feedback, Grist option persistence, explicit write errors.
- No credentials in files, git, browser storage, or HTML. Grist embedded access
  uses the widget API; provisioning scripts read GRIST_API_KEY from the process.
- Demo mode uses clearly labeled synthetic fixtures; an embedded Grist load
  failure must never silently fall back to demo data.
- Baseline and hypothetical scenarios stay separate. Never apply a financing
  simulation to the baseline. Saved scenarios contain assumptions only.
- Update E.VERSION and all HTML asset version keys together. Run `node --test
  tests/*.test.cjs` before commits. Direct-to-main pushes are authorized.
- Do not change arkhivar/grist while building this project.

## Shared contract

`E.data` is {Companies, Stakeholders, Holdings, Grants, Scenarios, Milestones},
each an array of {id, ...fields}. Company is Companies[0] (SoftDV). Schema is in
PROJECT.md. `E.store` exposes load(), saveScenario(fields), deleteScenario(id),
update(table,id,fields), subscribe(callback), mode ('demo'|'grist'), and status.
Writes notify subscribers and surface errors; callers use try/catch with E.toast.

UI helpers: E.html(value) escape, E.money(value,compact=false), E.num(value,
digits=0), E.pct(fraction,digits=1), E.icon(name), E.toast(message,tone='success'),
E.donut(segments,{size=200,label='',sublabel=''}), E.bars(rows), E.lineChart(points,
{color='#4b6fff',format='number'}), E.downloadCSV(name,rows), E.saveOptions(key,value),
E.getOption(key,fallback), E.navigate(page). Chart segments use {label,value,color}.
Line points use {label,value}. Bar rows use {label,value,color}.

Financial helpers: E.Model.capTable(data) returns {rows,issued,pool,granted,
available,fullyDiluted}; rows {id,name,role,color,shares,issuedPct,fdPct}.
E.Model.simulateRound(data,{preMoney,investment,poolPercent}) uses poolPercent
as 0..100, and returns {preMoney,investment,postMoney,pricePerShare,issuedShares,
originalPool,topUp,poolShares,newInvestorShares,totalShares,investorPct,dilution,
rows}; rows {id,name,role,color,beforeShares,afterShares,beforePct,afterPct}.
E.Model.vesting(grant,asOfISO) returns {vested,unvested,percent,months,cliffDate,
endDate,nextDate}; E.Model.addMonths(ISO,n) returns ISO calendar date.

Root renders shell into #app and calls page.render(#page-content,E.data). It
rerenders on store changes. Widgets attach scoped listeners in render, no
per-render document listeners. Use CSS classes from shared/ui.css; additional
widget-specific styles belong to that widget's CSS file.
