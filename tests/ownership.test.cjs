const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { JSDOM } = require('jsdom');

function widgetContext() {
  const context = vm.createContext({ Intl, Date });
  for (const filename of ['shared/model.js','shared/demo-data.js','widgets/ownership.js','widgets/vesting.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname,'..',filename),'utf8'),context);
  }
  context.E.html = value => String(value ?? '').replace(/[&<>"']/g,char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  context.E.num = value => Number(value).toLocaleString('en-US');
  return context.E;
}

test('issued ownership includes only outstanding shares and reconciles exactly', () => {
  const E = widgetContext();
  const rows = E.pages.ownership.rows(E.demoData,'issued');
  assert.equal(rows.length,3);
  assert.equal(rows.reduce((sum,row) => sum+row.units,0),1000000);
  assert.equal(rows.reduce((sum,row) => sum+row.percent,0),1);
  assert.equal(rows[0].name,'Pavel Orlov');
  assert.equal(rows[0].percent,.48);
});

test('fully diluted ownership allocates grants inside reserve without double count', () => {
  const E = widgetContext();
  const rows = E.pages.ownership.rows(E.demoData,'fd');
  assert.equal(rows.length,8);
  assert.equal(rows.reduce((sum,row) => sum+row.units,0),1120000);
  assert.ok(Math.abs(rows.reduce((sum,row) => sum+row.percent,0)-1)<1e-12);
  assert.equal(rows.find(row => row.id === 'reserve').units,40000);
  assert.equal(rows.find(row => row.name === 'Daria Sokolova').shares,0);
  assert.equal(rows.find(row => row.name === 'Daria Sokolova').options,25000);
});

test('cancelled award returns to available reserve rather than diluting twice', () => {
  const E = widgetContext();
  E.demoData.Grants[0].Status = 'Cancelled';
  const rows = E.pages.ownership.rows(E.demoData,'fd');
  assert.equal(rows.find(row => row.id === 'reserve').units,65000);
  assert.equal(rows.some(row => row.name === 'Daria Sokolova'),false);
  assert.equal(rows.reduce((sum,row) => sum+row.units,0),1120000);
});

test('holder with both shares and options remains one stakeholder', () => {
  const E = widgetContext();
  E.demoData.Grants[0].Holder = 1;
  const rows = E.pages.ownership.rows(E.demoData,'fd');
  const founder = rows.find(row => row.id === '1');
  assert.equal(founder.shares,480000);
  assert.equal(founder.options,25000);
  assert.equal(founder.units,505000);
  assert.equal(rows.reduce((sum,row) => sum+row.units,0),1120000);
});

test('other-company grants are excluded consistently with capTable', () => {
  const E = widgetContext();
  E.demoData.Grants.push({...E.demoData.Grants[0],id:99,Company:2,Units:500000});
  const rows = E.pages.ownership.rows(E.demoData,'fd');
  assert.equal(rows.reduce((sum,row) => sum+row.units,0),1120000);
});

test('orphan option holder fails visibly instead of displaying an incomplete 100%', () => {
  const E = widgetContext();
  E.demoData.Grants[0].Holder = 999;
  assert.throws(() => E.pages.ownership.rows(E.demoData,'fd'),/no matching stakeholder/);
});

test('vesting chart represents monthly steps and a cliff, not a misleading smooth curve', () => {
  const E = widgetContext();
  const chart = E.pages.vesting.chart(E.demoData.Grants[0],'2025-10-01');
  assert.match(chart,/Monthly vesting schedule/);
  assert.match(chart,/6,250 vested as of 2025-10-01/);
  assert.match(chart,/>Cliff<\/text>/);
  assert.match(chart,/ H [\d.]+ V [\d.]+/);
  assert.doesNotMatch(chart,/<polyline/);
  assert.match(chart,/Oct 2028/);
});

test('inactive grant chart never claims full vesting at maturity', () => {
  const E = widgetContext();
  const chart = E.pages.vesting.chart({...E.demoData.Grants[0],Status:'Forfeited'},'2030-01-01');
  assert.match(chart,/Inactive award/);
  assert.match(chart,/0 vested as of 2030-01-01/);
  assert.doesNotMatch(chart,/Fully vested by maturity/);
});

test('vesting display dates preserve date-only boundaries', () => {
  const E = widgetContext();
  assert.equal(E.pages.vesting.dateLabel('2024-01-31'),'31 Jan 2024');
  assert.equal(E.pages.vesting.dateLabel('2024-02-29',true),'Feb 2024');
  assert.match(E.pages.vesting.today(),/^\d{4}-\d{2}-\d{2}$/);
});

function renderedWidget(name) {
  const dom = new JSDOM('<!doctype html><div id="root"></div>', {url:'https://example.com/',runScripts:'outside-only'});
  for (const filename of ['shared/model.js','shared/demo-data.js','shared/ui.js','widgets/ownership.js','widgets/vesting.js']) {
    dom.window.eval(fs.readFileSync(path.join(__dirname,'..',filename),'utf8'));
  }
  const E = dom.window.E;
  const messages = [], downloads = [], options = [];
  E.toast = (message,tone) => messages.push({message,tone});
  E.downloadCSV = (name,rows) => downloads.push({name,rows});
  E.saveOptions = async (key,value) => { options.push({key,value}); };
  const root = dom.window.document.getElementById('root');
  E.pages[name].render(root,E.demoData);
  return {dom,E,root,messages,downloads,options};
}

test('ownership basis, live search, details and Escape work without writes', () => {
  const {dom,E,root,options} = renderedWidget('ownership');
  assert.equal(root.querySelectorAll('[data-own-row]').length,3);
  root.querySelector('[data-own-basis="fd"]').click();
  assert.equal(root.querySelectorAll('[data-own-row]').length,8);
  assert.equal(options[0].value,'fd');
  const search = root.querySelector('input[type=search]');
  search.focus(); search.value = 'Daria'; search.dispatchEvent(new dom.window.Event('input',{bubbles:true}));
  assert.equal(root.querySelectorAll('[data-own-row]').length,1);
  assert.equal(dom.window.document.activeElement,search);
  root.querySelector('.ow-person').click();
  assert.match(root.querySelector('.ow-detail').textContent,/25,000 option units/);
  assert.equal(root.querySelector('.ow-detail').getAttribute('aria-modal'),'false');
  root.querySelector('.ow-person').dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
  assert.equal(root.querySelector('.ow-detail'),null);
  assert.equal(dom.window.document.activeElement,root.querySelector('.ow-person'));
  assert.equal(E.demoData.Holdings.length,3);
  dom.window.close();
});

test('ownership export includes the entire basis, not just the filtered viewport', () => {
  const {dom,root,downloads} = renderedWidget('ownership');
  const search = root.querySelector('input[type=search]');
  search.value='Pavel'; search.dispatchEvent(new dom.window.Event('input',{bubbles:true}));
  root.querySelector('[data-own-export]').click();
  assert.equal(downloads[0].rows.length,4);
  assert.equal(downloads[0].rows[1][0],'Pavel Orlov');
  assert.match(downloads[0].name,/ownership-issued/);
  dom.window.close();
});

test('ownership option-persistence errors surface instead of becoming unhandled promises', async () => {
  const {dom,E,root,messages} = renderedWidget('ownership');
  E.saveOptions = async () => { throw new Error('Options denied by document rule'); };
  root.querySelector('[data-own-basis="fd"]').click();
  await Promise.resolve();
  assert.equal(messages[0].message,'Options denied by document rule');
  assert.equal(messages[0].tone,'error');
  dom.window.close();
});

test('saved ownership basis is respected when Grist options arrive after records', () => {
  const {dom,E,root} = renderedWidget('ownership');
  assert.equal(root.querySelectorAll('[data-own-row]').length,3);
  E.options.ownershipBasis='fd';
  E.pages.ownership.render(root,E.demoData);
  assert.equal(root.querySelectorAll('[data-own-row]').length,8);
  assert.equal(root.querySelector('[data-own-basis="fd"]').getAttribute('aria-pressed'),'true');
  dom.window.close();
});

test('ownership escapes stakeholder content in tables and nonmodal details', () => {
  const {dom,E,root} = renderedWidget('ownership');
  E.demoData.Stakeholders[0].Name = '<img src=x onerror=alert(1)>';
  E.pages.ownership.render(root,E.demoData);
  root.querySelector('.ow-person').click();
  assert.equal(root.querySelectorAll('img').length,0);
  assert.match(root.querySelector('.ow-detail h2').textContent,/<img/);
  dom.window.close();
});

test('vesting date input, monthly slider and milestone navigation update one snapshot', () => {
  const {dom,E,root} = renderedWidget('vesting');
  const date = root.querySelector('input[type=date]');
  date.value='2025-10-01'; date.dispatchEvent(new dom.window.Event('change',{bubbles:true}));
  assert.match(root.querySelector('.ve-schedule-stats').textContent,/6,250/);
  const slider = root.querySelector('#vesting-timeline');
  slider.focus(); slider.value='24'; slider.dispatchEvent(new dom.window.Event('input',{bubbles:true}));
  assert.equal(root.querySelector('#vesting-timeline'),slider);
  assert.equal(dom.window.document.activeElement,slider);
  assert.equal(date.value,'2026-10-01');
  assert.match(root.querySelector('.ve-schedule-stats').textContent,/12,500/);
  slider.value='25'; slider.dispatchEvent(new dom.window.Event('input',{bubbles:true}));
  assert.equal(root.querySelector('#vesting-timeline'),slider);
  assert.equal(date.value,'2026-11-01');
  root.querySelector('[data-vesting-jump="2028-10-01"]').click();
  assert.match(root.querySelector('.ve-status').textContent,/Fully vested/);
  assert.equal(E.demoData.Grants[0].Units,25000);
  dom.window.close();
});

test('grant selection keeps exploration date and export names that date', () => {
  const {dom,root,downloads} = renderedWidget('vesting');
  const date = root.querySelector('input[type=date]');
  date.value='2026-09-25'; date.dispatchEvent(new dom.window.Event('change',{bubbles:true}));
  root.querySelector('[data-vesting-grant="2"]').click();
  assert.equal(date.value,'2026-09-25');
  assert.match(root.querySelector('.ve-chart-head h2').textContent,/Mikhail Lee/);
  assert.equal(root.querySelector('[data-vesting-grant="2"]').getAttribute('aria-pressed'),'true');
  root.querySelector('[data-vesting-export]').click();
  assert.match(downloads[0].name,/2026-09-25/);
  assert.equal(downloads[0].rows.length,5);
  assert.equal(downloads[0].rows[1][3],'2026-09-25');
  dom.window.close();
});
