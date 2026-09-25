const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

function setup(t, pageName, query = '') {
  const dom = new JSDOM('<main id="root"></main>', { url: `https://prototype.example/${pageName}.html${query}`, runScripts: 'outside-only' });
  t.after(() => dom.window.close());
  for (const file of ['shared/model.js', 'shared/demo-data.js']) dom.window.eval(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'));
  const w = dom.window;
  const E = w.E;
  E.data = JSON.parse(JSON.stringify(E.demoData));
  const root = w.document.getElementById('root');
  const calls = { saves: [], updates: [], deletes: [], toasts: [], exports: [] };
  E.html = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  E.num = (value, digits = 0) => Number(value).toFixed(digits);
  E.pct = (fraction, digits = 1) => `${(fraction * 100).toFixed(digits)}%`;
  E.money = (value, compact = false) => compact ? `₽${(value / 1000000).toFixed(1)}m` : `₽${value.toFixed(0)}`;
  E.toast = (...args) => calls.toasts.push(args);
  E.downloadCSV = (...args) => calls.exports.push(args);
  const rerender = () => E.pages[pageName].render(root, E.data);
  E.store = {
    mode: 'demo',
    async saveScenario(fields) {
      calls.saves.push(fields);
      const row = { ...fields, id: 3 };
      E.data.Scenarios.push(row); rerender(); return row;
    },
    async update(table, id, fields) {
      calls.updates.push({ table, id, fields });
      Object.assign(E.data.Scenarios.find(row => row.id === id), fields); rerender();
    },
    async deleteScenario(id) {
      calls.deletes.push(id);
      E.data.Scenarios = E.data.Scenarios.filter(row => row.id !== id); rerender();
    }
  };
  w.eval(fs.readFileSync(path.join(__dirname, '..', `widgets/${pageName}.js`), 'utf8'));
  rerender();
  const input = (selector, value) => {
    const node = root.querySelector(selector); node.value = value;
    node.dispatchEvent(new w.Event('input', { bubbles: true })); return node;
  };
  const submit = selector => root.querySelector(selector).dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
  return { w, E, root, calls, input, submit, rerender };
}

test('funding sliders update hypothetical ownership without touching baseline or input focus', t => {
  const h = setup(t, 'funding');
  const before = JSON.stringify(h.E.data);
  const field = h.root.querySelector('[data-assumption="investment"]'); field.focus();
  h.input('[data-assumption="investment"]', '90');
  assert.equal(h.E.pages.funding.state.investment, 90000000);
  assert.equal(h.E.pages.funding.result.investorPct, 1 / 3);
  assert.equal(h.w.document.activeElement, field);
  assert.equal(h.root.querySelector('[data-slider="investment"]').value, '90');
  assert.equal(JSON.stringify(h.E.data), before);
  assert.equal(h.calls.saves.length + h.calls.updates.length, 0);
});

test('invalid financing assumptions show model error and disable save; correction restores it', t => {
  const h = setup(t, 'funding');
  h.input('[data-assumption="preMoney"]', '0');
  assert.equal(h.E.pages.funding.result, null);
  assert.equal(h.root.querySelector('[data-save-scenario]').disabled, true);
  assert.match(h.root.querySelector('[data-round-results]').textContent, /Pre-money valuation must/);
  h.input('[data-assumption="preMoney"]', '180');
  assert.ok(h.E.pages.funding.result);
  assert.equal(h.root.querySelector('[data-save-scenario]').disabled, false);
});

test('funding saves exactly one named snapshot while busy and keeps baseline untouched', async t => {
  const h = setup(t, 'funding');
  const baseline = JSON.stringify(h.E.data.Holdings);
  let resolve;
  h.E.store.saveScenario = fields => { h.calls.saves.push(fields); return new Promise(done => { resolve = done; }); };
  h.input('#scenario-name', '  A thoughtful seed  ');
  h.input('#scenario-notes', 'Keep our hiring runway.');
  h.input('[data-assumption="investment"]', '60');
  h.submit('[data-scenario-form]'); h.submit('[data-scenario-form]');
  assert.equal(h.calls.saves.length, 1);
  assert.equal(h.calls.saves[0].Name, 'A thoughtful seed');
  assert.equal(h.calls.saves[0].Investment, 60000000);
  assert.equal(h.root.querySelector('[data-slider="investment"]').disabled, true);
  resolve({ id: 3 }); await new Promise(done => setImmediate(done));
  assert.equal(h.E.pages.funding.state.saving, false);
  assert.equal(JSON.stringify(h.E.data.Holdings), baseline);
  assert.match(h.calls.toasts.at(-1)[0], /saved/);
});

test('failed funding save retains draft and exposes the real Grist error', async t => {
  const h = setup(t, 'funding');
  h.E.store.saveScenario = async () => { throw new Error('Access denied by Scenarios ACL'); };
  h.input('#scenario-name', 'Retain my draft'); h.submit('[data-scenario-form]');
  await new Promise(done => setImmediate(done));
  assert.equal(h.root.querySelector('#scenario-name').value, 'Retain my draft');
  assert.equal(h.root.querySelector('[data-save-scenario]').disabled, false);
  assert.equal(h.calls.toasts.at(-1)[0], 'Access denied by Scenarios ACL');
});

test('funding URL loads saved assumptions as a separate copy, never overwriting them', t => {
  const h = setup(t, 'funding', '?scenario=2');
  assert.equal(h.E.pages.funding.state.preMoney, 240000000);
  assert.equal(h.E.pages.funding.state.investment, 80000000);
  assert.equal(h.E.pages.funding.state.name, 'Growth round · copy');
  h.input('[data-assumption="investment"]', '1'); h.rerender();
  assert.equal(h.E.pages.funding.state.investment, 1000000);
  assert.equal(h.E.data.Scenarios[1].Investment, 80000000);
});

test('funding impact export includes raw ownership and assumptions', t => {
  const h = setup(t, 'funding');
  h.root.querySelector('[data-export-round]').click();
  assert.equal(h.calls.exports[0][0], 'softdv-financing-impact.csv');
  assert.ok(h.calls.exports[0][1].some(row => row[0] === 'Investment RUB' && row[1] === 45000000));
  assert.ok(h.calls.exports[0][1].some(row => row[0] === 'Pavel Orlov'));
});

test('scenario selection compares at most three scenarios and keeps a baseline column', t => {
  const h = setup(t, 'scenarios');
  h.E.data.Scenarios.push({ ...h.E.data.Scenarios[0], id: 3, Name: 'Third path' }, { ...h.E.data.Scenarios[0], id: 4, Name: 'Fourth path' });
  h.rerender();
  const third = h.root.querySelector('[data-select-scenario="3"]'); third.click();
  assert.equal(h.E.pages.scenarios.selected.size, 3);
  h.root.querySelector('[data-select-scenario="4"]').click();
  assert.equal(h.E.pages.scenarios.selected.size, 3);
  assert.equal(h.root.querySelector('[data-select-scenario="4"]').checked, false);
  assert.match(h.calls.toasts.at(-1)[0], /up to three/);
  assert.equal(h.root.querySelectorAll('.egf-comparison-table thead th').length, 5);
  assert.match(h.root.querySelector('.egf-comparison-table').textContent, /Current baseline/);
});

test('scenario rename is escaped, explicit, and saved through Scenarios only', async t => {
  const h = setup(t, 'scenarios');
  h.root.querySelector('[data-rename-scenario="1"]').click();
  h.input('[data-rename-input]', '<b>Not markup</b>');
  h.submit('[data-rename-form]'); await new Promise(done => setImmediate(done));
  assert.equal(h.calls.updates.length, 1);
  assert.equal(h.calls.updates[0].table, 'Scenarios');
  assert.equal(h.calls.updates[0].fields.Name, '<b>Not markup</b>');
  assert.equal(h.root.querySelector('[data-scenario-card="1"] h2').textContent, '<b>Not markup</b>');
  assert.equal(h.root.querySelector('[data-scenario-card="1"] h2 b'), null);
});

test('scenario deletion requires explicit confirmation and is double-click safe', async t => {
  const h = setup(t, 'scenarios');
  const baseline = JSON.stringify(h.E.data.Holdings);
  let resolve;
  h.E.store.deleteScenario = id => { h.calls.deletes.push(id); return new Promise(done => { resolve = done; }); };
  h.root.querySelector('[data-delete-scenario="1"]').click();
  assert.equal(h.calls.deletes.length, 0);
  assert.match(h.root.querySelector('.egf-delete-prompt').textContent, /cannot be undone/);
  h.root.querySelector('[data-confirm-delete="1"]').click();
  h.root.querySelector('[data-confirm-delete="1"]').click();
  assert.deepEqual(h.calls.deletes, [1]);
  resolve(); await new Promise(done => setImmediate(done));
  assert.equal(h.E.pages.scenarios.busy, '');
  assert.equal(JSON.stringify(h.E.data.Holdings), baseline);
});

test('scenario deletion failure keeps the scenario and surfaces the real error', async t => {
  const h = setup(t, 'scenarios');
  h.E.store.deleteScenario = async () => { throw new Error('Grist document is read-only'); };
  h.root.querySelector('[data-delete-scenario="1"]').click();
  h.root.querySelector('[data-confirm-delete="1"]').click();
  await new Promise(done => setImmediate(done));
  assert.ok(h.root.querySelector('[data-scenario-card="1"]'));
  assert.equal(h.calls.toasts.at(-1)[0], 'Grist document is read-only');
  assert.equal(h.root.querySelector('[data-confirm-delete="1"]').disabled, false);
});

test('invalid saved scenario is visible but cannot be compared', t => {
  const h = setup(t, 'scenarios');
  h.E.data.Scenarios[0].PreMoney = 0; h.rerender();
  assert.equal(h.root.querySelector('[data-select-scenario="1"]').disabled, true);
  assert.equal(h.E.pages.scenarios.selected.has('1'), false);
  assert.match(h.root.querySelector('[data-scenario-card="1"]').textContent, /Pre-money valuation must/);
});

test('scenario CSV comparison includes selected assumptions and founder outcomes', t => {
  const h = setup(t, 'scenarios');
  h.root.querySelector('[data-export-comparison]').click();
  assert.equal(h.calls.exports[0][0], 'softdv-scenario-comparison.csv');
  assert.ok(h.calls.exports[0][1].some(row => row[0] === 'Founders ownership percent'));
  assert.ok(h.calls.exports[0][1].some(row => row[0] === 'Investment RUB' && row[2] === 45000000));
});
