E.pages.vesting = {
  state: { selected: null, asOf: null },

  today() {
    const parts = new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Vladivostok',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
    return ['year','month','day'].map(type => parts.find(part => part.type === type).value).join('-');
  },

  dateLabel(iso, short = false) {
    if (!iso) return '—';
    return new Intl.DateTimeFormat('en-GB', {timeZone:'UTC',day:short ? undefined : 'numeric',month:'short',year:'numeric'}).format(new Date(`${iso}T12:00:00Z`));
  },

  chart(grant, asOf) {
    const page = E.pages.vesting;
    const start = grant.Start;
    const end = E.Model.addMonths(start, grant.DurationMonths);
    const current = E.Model.vesting(grant, asOf);
    const width = 740, height = 260, left = 54, right = 24, top = 28, bottom = 42;
    const time = value => Date.parse(`${value}T00:00:00Z`);
    const span = Math.max(1,time(end)-time(start));
    const x = value => left + Math.max(0,Math.min(1,(time(value)-time(start))/span))*(width-left-right);
    const y = value => height-bottom - (value/Math.max(1,Number(grant.Units)))*(height-top-bottom);
    const points = Array.from({length:Number(grant.DurationMonths)+1}, (_,month) => {
      const date = E.Model.addMonths(start,month);
      return {date, value:E.Model.vesting(grant,date).vested};
    });
    let path = `M ${x(start)} ${y(points[0].value)}`;
    points.slice(1).forEach(point => { path += ` H ${x(point.date)} V ${y(point.value)}`; });
    const fill = `${path} L ${x(end)} ${y(0)} L ${x(start)} ${y(0)} Z`;
    const cliffX = x(current.cliffDate);
    const currentX = x(asOf);
    const markerAnchor = currentX > width-125 ? 'end' : currentX < 125 ? 'start' : 'middle';
    return `<svg class="ve-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Monthly vesting schedule: ${E.num(grant.Units)} option units from ${E.html(start)} to ${E.html(end)}, with a ${grant.CliffMonths}-month cliff. ${E.num(current.vested)} vested as of ${E.html(asOf)}.">
      ${[0,.25,.5,.75,1].map(fraction => `<line x1="${left}" y1="${y(grant.Units*fraction)}" x2="${width-right}" y2="${y(grant.Units*fraction)}" class="ve-gridline"/><text x="${left-10}" y="${y(grant.Units*fraction)+4}" text-anchor="end" class="ve-axis">${E.num(grant.Units*fraction)}</text>`).join('')}
      <path d="${fill}" fill="#edf0ff"/><path d="${path}" fill="none" stroke="#4b6fff" stroke-width="2.5" stroke-linejoin="round"/>
      ${Number(grant.CliffMonths) > 0 ? `<line x1="${cliffX}" y1="${top}" x2="${cliffX}" y2="${height-bottom}" stroke="#b8bfd1" stroke-dasharray="4 4"/><text x="${cliffX+6}" y="${height-bottom-10}" class="ve-axis">Cliff</text>` : ''}
      <line x1="${currentX}" y1="${top}" x2="${currentX}" y2="${height-bottom}" stroke="#274fe7" stroke-dasharray="3 4" opacity=".6"/>
      <circle cx="${currentX}" cy="${y(current.vested)}" r="5" fill="#4b6fff" stroke="white" stroke-width="2"/>
      <text x="${currentX}" y="14" text-anchor="${markerAnchor}" class="ve-chart-asof">${!E.Model.isActiveGrant(grant) ? 'Inactive award' : asOf < start ? 'Before grant start' : asOf > end ? 'Fully vested by maturity' : page.dateLabel(asOf)}</text>
      <text x="${left}" y="${height-12}" class="ve-axis">${page.dateLabel(start,true)}</text><text x="${x(E.Model.addMonths(start,Math.floor(grant.DurationMonths/2)))}" y="${height-12}" text-anchor="middle" class="ve-axis">${page.dateLabel(E.Model.addMonths(start,Math.floor(grant.DurationMonths/2)),true)}</text><text x="${width-right}" y="${height-12}" text-anchor="end" class="ve-axis">${page.dateLabel(end,true)}</text>
    </svg>`;
  },

  render(root, data) {
    const page = E.pages.vesting;
    const state = page.state;
    const grants = data.Grants.filter(grant => Number(grant.Company) === Number(data.Companies[0]?.id));
    const activeGrants = grants.filter(grant => E.Model.isActiveGrant(grant));
    if (!state.asOf) state.asOf = page.today();
    if (!grants.some(grant => String(grant.id) === state.selected)) state.selected = grants.length ? String((activeGrants[0] || grants[0]).id) : null;
    const holderFor = grant => data.Stakeholders.find(holder => String(holder.id) === String(grant.Holder)) || {Name:'Unknown holder',Title:'',Color:'#4b6fff'};
    root.innerHTML = `<section class="ow-page ve-page">
      <div class="ow-page-head"><div><div class="ow-eyebrow">TEAM EQUITY</div><h1>Good things take time.</h1><p>Explore how the team’s option grants vest, one milestone at a time.</p></div><button class="ow-button" data-vesting-export>${E.icon('download')} Export schedule</button></div>
      <div class="ve-date-bar"><div><strong>Explore as of</strong><span>Move through time without changing any records.</span></div><div class="ve-date-controls"><label class="ve-date-input">${E.icon('calendar')}<input type="date" aria-label="Vesting as-of date" value="${E.html(state.asOf)}" min="1900-01-01" max="2199-12-31"></label><button class="ow-button" data-vesting-today>Today</button></div></div>
      <div class="ow-summary ve-summary-host"></div>
      ${grants.length ? `<div class="ve-layout"><section class="ow-card ve-grant-picker"><div class="ow-card-head"><div><h2>Option awards</h2><p>${grants.length} grants · select to explore</p></div></div><div class="ve-grants-host"></div><div class="ow-card-note">${E.icon('info')} Awards draw from the reserved pool. They are not issued shares.</div></section><section class="ow-card ve-schedule-card"><div class="ve-schedule-host"></div></section></div>` : '<div class="ow-card ow-empty">No option grants have been created for this company.</div>'}
      <div class="ow-basis-note ve-method-note"><strong>How to read this:</strong> completed calendar months vest on each anniversary, with month-end dates clamped to the last day. The cliff catches up previous months; units round down until maturity. No exercise, tax, leaver rules, or legal entitlement are modeled.</div>
    </section>`;

    function renderSummary() {
      const awarded = activeGrants.reduce((sum,grant) => sum+Number(grant.Units),0);
      const vested = activeGrants.reduce((sum,grant) => sum+E.Model.vesting(grant,state.asOf).vested,0);
      const next = activeGrants.map(grant => E.Model.vesting(grant,state.asOf).nextDate).filter(Boolean).sort()[0];
      root.querySelector('.ve-summary-host').innerHTML = `
        <div class="ow-stat"><span>Total awarded</span><strong>${E.num(awarded)}</strong><small>${activeGrants.length} active option grants</small></div>
        <div class="ow-stat"><span>Vested options</span><strong class="ve-accent">${E.num(vested)}</strong><small>${E.pct(awarded ? vested/awarded : 0)} of awarded units</small></div>
        <div class="ow-stat"><span>Still vesting</span><strong>${E.num(awarded-vested)}</strong><small>Unvested active option units</small></div>
        <div class="ow-stat"><span>Next vesting event</span><strong class="ve-date-value">${next ? page.dateLabel(next) : 'All caught up'}</strong><small>${next ? 'Across the team’s active awards' : 'No future active vesting events'}</small></div>`;
    }

    function renderGrants() {
      const host = root.querySelector('.ve-grants-host');
      if (!host) return;
      host.innerHTML = grants.map(grant => {
        const holder = holderFor(grant);
        const vest = E.Model.vesting(grant,state.asOf);
        const active = E.Model.isActiveGrant(grant);
        const color = /^#[\da-f]{6}$/i.test(holder.Color || '') ? holder.Color : '#4b6fff';
        return `<button class="ve-grant ${String(grant.id) === state.selected ? 'is-active' : ''}" data-vesting-grant="${grant.id}" aria-pressed="${String(grant.id) === state.selected}"><span class="ve-grant-person"><span class="ow-avatar" style="--person-color:${color}">${E.html(holder.Name.split(/\s+/).slice(0,2).map(word => word[0]).join(''))}</span><span><strong>${E.html(holder.Name)}</strong><small>${E.html(holder.Title || 'Team member')}</small></span><span class="ve-grant-arrow">${E.icon('arrow-right')}</span></span><span class="ve-grant-numbers"><span>${E.num(grant.Units)} options</span><strong>${active ? E.pct(vest.percent,0)+' vested' : E.html(grant.Status)}</strong></span><span class="ve-progress"><i style="width:${Math.max(0,Math.min(100,vest.percent*100))}%"></i></span></button>`;
      }).join('');
    }

    function renderSchedule(preserveSlider = false) {
      const grant = grants.find(item => String(item.id) === state.selected);
      const host = root.querySelector('.ve-schedule-host');
      if (!grant || !host) return;
      const holder = holderFor(grant);
      const vest = E.Model.vesting(grant,state.asOf);
      const active = E.Model.isActiveGrant(grant);
      const months = Math.min(Number(grant.DurationMonths),Math.max(0,vest.months));
      const markup = `<div class="ow-card-head ve-chart-head"><div><span class="ow-eyebrow">GRANT ${String(grant.id).padStart(3,'0')}</span><h2>${E.html(holder.Name)}’s timeline</h2><p>${E.num(grant.Units)} options · ${grant.DurationMonths} months · ${grant.CliffMonths}-month cliff</p></div><span class="ve-status ${!active ? 'is-inactive' : ''}">${!active ? E.html(grant.Status) : state.asOf < vest.cliffDate ? 'Before cliff' : vest.percent >= 1 ? 'Fully vested' : 'Vesting'}</span></div>
        <div class="ve-chart-wrap">${page.chart(grant,state.asOf)}</div>
        <div class="ve-slider-wrap"><label for="vesting-timeline">Travel through this grant <strong>${page.dateLabel(state.asOf)}</strong></label><input id="vesting-timeline" type="range" min="0" max="${grant.DurationMonths}" step="1" value="${months}" aria-label="Vesting timeline in completed months" aria-valuetext="${page.dateLabel(E.Model.addMonths(grant.Start,months))}"><div class="ve-slider-labels"><span>Grant start</span><span>Month ${grant.DurationMonths}</span></div></div>
        <div class="ve-schedule-stats"><div><span>Vested by this date</span><strong>${E.num(vest.vested)}<small> / ${E.num(grant.Units)}</small></strong></div><div><span>Unvested options</span><strong>${E.num(vest.unvested)}</strong></div><div><span>Exercise price / unit</span><strong>${E.money(grant.ExercisePrice)}</strong></div></div>
        <div class="ve-milestones"><button data-vesting-jump="${E.html(grant.Start)}"><span class="ve-milestone-dot"></span><small>Grant start</small><strong>${page.dateLabel(grant.Start)}</strong></button><button data-vesting-jump="${E.html(vest.cliffDate)}"><span class="ve-milestone-dot"></span><small>Cliff reached</small><strong>${page.dateLabel(vest.cliffDate)}</strong></button><button data-vesting-jump="${E.html(vest.endDate)}"><span class="ve-milestone-dot"></span><small>Fully vested</small><strong>${page.dateLabel(vest.endDate)}</strong></button></div>
        <div class="ow-card-note">${E.icon('info')} ${!active ? 'This inactive grant is excluded from team totals and has no modeled vested entitlement.' : vest.nextDate ? `Next vesting event: ${page.dateLabel(vest.nextDate)}. The blue line steps up only on a vesting date.` : 'This award has reached the end of its modeled schedule. Exercise and share issuance are separate steps.'}</div>`;
      if (preserveSlider && host.querySelector('#vesting-timeline')) {
        const updated = document.createElement('div');
        updated.innerHTML = markup;
        ['.ve-chart-head','.ve-chart-wrap','.ve-schedule-stats','.ve-milestones','.ow-card-note'].forEach(selector => {
          host.querySelector(selector).replaceWith(updated.querySelector(selector));
        });
        host.querySelector('.ve-slider-wrap label strong').textContent = page.dateLabel(state.asOf);
        host.querySelector('#vesting-timeline').setAttribute('aria-valuetext',page.dateLabel(state.asOf));
      } else host.innerHTML = markup;
    }

    function refresh() { renderSummary(); renderGrants(); renderSchedule(); }
    function setDate(value) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value < '1900-01-01' || value > '2199-12-31' || !Number.isFinite(Date.parse(`${value}T00:00:00Z`))) return;
      state.asOf = value;
      root.querySelector('.ve-date-input input').value = value;
      refresh();
    }
    refresh();
    root.querySelector('.ve-date-input input').addEventListener('change', event => {
      if (!event.target.value || !event.target.validity.valid) { event.target.value = state.asOf; return; }
      setDate(event.target.value);
    });
    root.querySelector('.ve-page').addEventListener('click', event => {
      const grant = event.target.closest('[data-vesting-grant]');
      const jump = event.target.closest('[data-vesting-jump]');
      if (grant) {
        state.selected = grant.dataset.vestingGrant;
        renderGrants(); renderSchedule();
        root.querySelector(`[data-vesting-grant="${state.selected}"]`).focus({preventScroll:true});
      } else if (jump) setDate(jump.dataset.vestingJump);
      else if (event.target.closest('[data-vesting-today]')) setDate(page.today());
    });
    root.querySelector('.ve-page').addEventListener('input', event => {
      if (event.target.id !== 'vesting-timeline') return;
      const grant = grants.find(item => String(item.id) === state.selected);
      state.asOf = E.Model.addMonths(grant.Start,Number(event.target.value));
      root.querySelector('.ve-date-input input').value = state.asOf;
      // Do not detach the active slider: keep pointer capture and keyboard focus.
      renderSummary(); renderGrants(); renderSchedule(true);
    });
    root.querySelector('.ve-page').addEventListener('keydown', event => {
      const grant = event.target.closest('[data-vesting-grant]');
      if (!grant || !['ArrowUp','ArrowDown'].includes(event.key)) return;
      const buttons = [...root.querySelectorAll('[data-vesting-grant]')];
      const next = buttons[buttons.indexOf(grant) + (event.key === 'ArrowDown' ? 1 : -1)];
      if (next) next.focus();
      event.preventDefault();
    });
    root.querySelector('[data-vesting-export]').addEventListener('click', () => {
      E.downloadCSV(`softdv-vesting-${state.asOf}.csv`, [
        ['Holder','Grant','Status','As of','Awarded options','Vested options','Unvested options','Vested percent','Start','Cliff date','Maturity','Exercise price RUB'],
        ...grants.map(grant => { const vest = E.Model.vesting(grant,state.asOf); return [holderFor(grant).Name,grant.id,grant.Status,state.asOf,grant.Units,vest.vested,vest.unvested,(vest.percent*100).toFixed(6),grant.Start,vest.cliffDate,vest.endDate,grant.ExercisePrice]; }),
      ]);
      E.toast(`Vesting snapshot exported for ${page.dateLabel(state.asOf)}.`);
    });
  },
};
