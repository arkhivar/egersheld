E.html = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
E.num = (value, digits = 0) => Number.isFinite(Number(value)) ? new Intl.NumberFormat('en-US', {maximumFractionDigits:digits,minimumFractionDigits:digits}).format(Number(value)) : '—';
E.money = (value, compact = false) => {
  if (!Number.isFinite(Number(value))) return '—';
  const n = Number(value), a = Math.abs(n);
  return '₽' + (compact && a >= 1e6 ? E.num(n/1e6,a >= 1e8 ? 0 : 1).replace(/\.0$/, '') + 'm' : compact && a >= 1e3 ? E.num(n/1e3,0) + 'k' : E.num(n));
};
E.pct = (fraction, digits = 1) => E.num(Number(fraction)*100,digits) + '%';
E.today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Vladivostok', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
E.color = value => /^#[0-9a-f]{3,8}$/i.test(String(value)) ? String(value) : '#8291ad';
E.date = value => {
  const iso = E.Model.dateISO(value);
  return iso ? new Date(iso+'T00:00:00Z').toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}) : '—';
};
E.colors = ['#4669df','#53a594','#8f82d9','#efa675','#93acd2','#c38caa','#a2af72'];
E.icon = name => {
  const paths = {
    plus:'M12 5v14M5 12h14',close:'m6 6 12 12M18 6 6 18',check:'m5 12 4 4L19 6',
    'arrow-right':'M4 12h16m-6-6 6 6-6 6','arrow-left':'M20 12H4m6-6-6 6 6 6','arrow-up-right':'M6 18 18 6M6 6h12v12',
    'chevron-down':'m6 9 6 6 6-6',refresh:'M20 7v5h-5M4 17v-5h5M6 7a7 7 0 0 1 12-1l2 3M4 15l2 3a7 7 0 0 0 12-1',
    download:'M12 3v12m-5-5 5 5 5-5M5 17v4h14v-4',info:'M12 11v6M12 7h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0',
    search:'m16 16 5 5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',sliders:'M4 7h7m4 0h5M4 17h3m4 0h9M11 4v6M7 14v6',
    calendar:'M4 5h16v16H4zM4 10h16M8 3v4M16 3v4',layers:'m12 3 10 5-10 5L2 8Zm-10 9 10 5 10-5M2 16l10 5 10-5',
    chart:'M4 3v17h17M8 15V9m5 6V5m5 10v-4',grid:'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',
    users:'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 3a4 4 0 1 1 0 8 4 4 0 0 1 0-8M17 4a4 4 0 0 1 0 8M18 15a4 4 0 0 1 4 4v2',
    save:'M5 3h12l4 4v14H3V3Zm2 0v6h10V3M7 21v-8h10v8',clock:'M12 6v6l4 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0',
    shield:'m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6Zm-4 9 3 3 5-6',external:'M14 3h7v7M10 14 21 3M10 3H3v18h18v-7'
  };
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" class="icon"><path d="${paths[name] || paths.info}"/></svg>`;
};
E.toast = (message, tone = 'success') => {
  const toast = document.getElementById('toast'); if (!toast) return;
  clearTimeout(E.toastTimer); toast.textContent = message; toast.dataset.tone = tone;
  toast.setAttribute('role', tone === 'error' ? 'alert' : 'status'); toast.classList.add('visible');
  E.toastTimer = setTimeout(() => toast.classList.remove('visible'), tone === 'error' ? 6500 : 3500);
};
E.donut = (segments, {size = 200, label = '', sublabel = ''} = {}) => {
  const clean = segments.filter(s => Number(s.value) > 0), total = clean.reduce((sum,s)=>sum+Number(s.value),0);
  let offset = 0;
  const rings = clean.map((s,i) => {
    const ratio = s.value/total, dash = ratio*100;
    const ring = `<circle cx="100" cy="100" r="77" pathLength="100" fill="none" stroke="${E.color(s.color || E.colors[i%E.colors.length])}" stroke-width="25" stroke-dasharray="${Math.max(0,dash-.65)} ${100-dash+.65}" stroke-dashoffset="${-offset}" transform="rotate(-90 100 100)"><title>${E.html(s.label)} · ${E.pct(ratio)}</title></circle>`;
    offset+=dash; return ring;
  }).join('');
  return `<svg class="donut" width="${size}" height="${size}" viewBox="0 0 200 200" role="img" aria-label="${E.html(clean.map(s=>s.label+': '+E.pct(s.value/total)).join(', '))}"><circle cx="100" cy="100" r="77" fill="none" stroke="#edf0f5" stroke-width="25"/>${rings}<text x="100" y="98" text-anchor="middle" class="donut-label">${E.html(label)}</text><text x="100" y="119" text-anchor="middle" class="donut-sublabel">${E.html(sublabel)}</text></svg>`;
};
E.bars = rows => {
  const max = Math.max(1,...rows.map(r=>Number(r.value)||0));
  return `<div class="chart-bars">${rows.map((r,i)=>`<div class="bar-row"><div class="bar-label"><span>${E.html(r.label)}</span><b>${E.num(r.value)}</b></div><div class="bar-track"><i style="width:${Math.max(0,Number(r.value)/max*100)}%;background:${E.color(r.color||E.colors[i%E.colors.length])}"></i></div></div>`).join('')}</div>`;
};
E.lineChart = (points, {color='#4b6fff',format='number'} = {}) => {
  if (!points.length) return '<div class="empty-state">No data to chart</div>';
  const max = Math.max(1,...points.map(p=>p.value)), w=640,h=200,left=45,top=20,bottom=166;
  const coords = points.map((p,i)=>`${left+i*(w-left-20)/Math.max(1,points.length-1)},${bottom-p.value/max*(bottom-top)}`);
  return `<svg class="line-chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="${E.html(points.map(p=>p.label+': '+E.num(p.value)).join(', '))}">${[0,.5,1].map(t=>`<line x1="${left}" y1="${bottom-t*(bottom-top)}" x2="620" y2="${bottom-t*(bottom-top)}" stroke="#e7ebf2"/><text x="36" y="${bottom-t*(bottom-top)+4}" text-anchor="end" class="axis-label">${format==='money'?E.money(t*max,true):E.num(t*max)}</text>`).join('')}<polyline points="${coords.join(' ')}" fill="none" stroke="${E.color(color)}" stroke-width="3" stroke-linejoin="round"/>${[0,points.length-1].map(i=>`<text x="${i?620:45}" y="192" text-anchor="${i?'end':'start'}" class="axis-label">${E.html(points[i].label)}</text>`).join('')}</svg>`;
};
E.downloadCSV = (name, rows) => {
  if (!rows.length) return E.toast('Nothing to export.', 'error');
  const matrix = Array.isArray(rows[0]) ? rows : [Object.keys(rows[0]),...rows.map(row=>Object.keys(rows[0]).map(key=>row[key]))];
  const safe = value => { let text=String(value ?? ''); if (/^[=+@\-\t\r]/.test(text) && !/^-?\d+(\.\d+)?$/.test(text)) text="'"+text; return '"'+text.replace(/"/g,'""')+'"'; };
  const blob = new Blob(['\ufeff'+matrix.map(row=>row.map(safe).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'});
  const url=URL.createObjectURL(blob),a=document.createElement('a'); a.href=url;a.download=name.endsWith('.csv')?name:name+'.csv';a.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000); E.toast('CSV exported.');
};
E.options = {};
try { if (E.store.mode === 'demo') E.options = JSON.parse(localStorage.getItem('egersheld-options-v1') || '{}'); } catch (_) {}
E.getOption = (key,fallback) => E.options[key] ?? fallback;
E.saveOptions = async (key,value) => {
  if (E.store.mode==='grist') { await grist.setOption(key,value); }
  else { localStorage.setItem('egersheld-options-v1',JSON.stringify({ ...E.options, [key]: value })); }
  E.options[key]=value;
};
E.navigate = page => { location.href=page.includes('.html')?page:page+'.html'; };
