'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM, VirtualConsole } = require('jsdom');
const { fixture, schema } = require('../scripts/provision.cjs');
const project = path.join(__dirname, '..');
const copy = value => JSON.parse(JSON.stringify(value));

function shell(page, { live = false, query = '', storage = {}, failure = null, writeFailure = null, remoteData = fixture, delayedLoad = null, nowISO = null } = {}) {
  const source = fs.readFileSync(path.join(project, `${page}.html`), 'utf8');
  const browserErrors = [];
  const loggedErrors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', error => browserErrors.push(error));
  const dom = new JSDOM(source, { url: `https://arkhivar.github.io/egersheld/${page}.html${query}`, runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole });
  if (live) dom.reconfigure({ windowTop: {} });
  const win = dom.window;
  if (nowISO) {
    const NativeDate = win.Date;
    win.Date = class extends NativeDate {
      constructor(...args) { super(...(args.length ? args : [nowISO])); }
      static now() { return NativeDate.parse(nowISO); }
    };
  }
  win.console.error = (...args) => loggedErrors.push(args.map(String).join(' '));
  for (const [key, value] of Object.entries(storage)) win.localStorage.setItem(key, value);
  const calls = { ready: [], fetches: [], actions: [], options: [], recordsCallback: null, optionsCallback: null };
  const remote = copy(remoteData);
  let nextId = 71;
  const state = { failure, writeFailure };
  if (live) win.grist = {
    ready: options => calls.ready.push(copy(options)),
    onRecords: callback => { calls.recordsCallback = callback; },
    onOptions: callback => { calls.optionsCallback = callback; },
    setOption: async (key, value) => { calls.options.push([key, value]); },
    docApi: {
      fetchTable: async table => {
        calls.fetches.push(table);
        if (delayedLoad) await delayedLoad;
        if (state.failure) throw new Error(state.failure);
        return Object.fromEntries(['id', ...Object.keys(schema[table])].map(key => [key, remote[table].map(row => schema[table][key]?.startsWith('Date') && row[key] ? Date.parse(row[key]) / 1000 : row[key])]));
      },
      applyUserActions: async actions => {
        calls.actions.push(copy(actions));
        if (state.writeFailure) throw new Error(state.writeFailure);
        const retValues = [];
        for (const [action, table, requestedId, fields] of actions) {
          assert.equal(table, 'Scenarios', 'The complete UI must never write a baseline table');
          const normalized = Object.fromEntries(Object.entries(fields || {}).map(([key, value]) => [key, schema[table][key]?.startsWith('Date') ? new Date(value * 1000).toISOString() : value]));
          if (action === 'AddRecord') {
            const id = requestedId ?? nextId++;
            remote.Scenarios.push({ id, ...normalized }); retValues.push(id);
          } else if (action === 'UpdateRecord') {
            Object.assign(remote.Scenarios.find(row => row.id === requestedId), normalized); retValues.push(null);
          } else if (action === 'RemoveRecord') {
            remote.Scenarios = remote.Scenarios.filter(row => row.id !== requestedId); retValues.push(null);
          } else throw new Error(`Unexpected UI action ${action}`);
        }
        return { actionNum: 123, retValues };
      }
    }
  };
  const scripts = [...win.document.querySelectorAll('script[src]')];
  const localScripts = scripts.filter(script => new URL(script.src).origin === win.location.origin).map(script => new URL(script.src).pathname.replace('/egersheld/', ''));
  assert.deepEqual(localScripts.slice(0, 4), ['shared/model.js', 'shared/demo-data.js', 'shared/data.js', 'shared/ui.js']);
  assert.equal(localScripts.at(-1), 'shared/app.js');
  for (const script of localScripts) win.eval(fs.readFileSync(path.join(project, script), 'utf8') + `\n//# sourceURL=${script}`);
  return { dom, win, E: win.E, calls, remote, state, browserErrors, loggedErrors, source };
}

async function settled(view) {
  await view.E.store.load().catch(() => {});
  await Promise.resolve();
}

async function eventually(predicate, message) {
  for (let attempt = 0; attempt < 40; attempt++) {
    if (predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  assert.fail(message);
}

function input(view, selector, value) {
  const element = view.win.document.querySelector(selector);
  assert.ok(element, selector);
  element.value = value;
  element.dispatchEvent(new view.win.Event('input', { bubbles: true }));
  return element;
}

for (const page of ['index', 'overview', 'ownership', 'funding', 'vesting', 'scenarios']) {
  test(`${page}.html complete classic script order renders a labeled synthetic workspace`, async t => {
    const view = shell(page); t.after(() => view.dom.window.close());
    await settled(view);
    assert.equal(view.E.store.status, 'ready');
    assert.equal(view.E.store.mode, 'demo');
    assert.ok(view.win.document.querySelector('#page-content h1'));
    assert.equal(view.win.document.querySelector('#page-content [role="alert"]'), null);
    assert.equal(view.win.document.querySelector('#connection').textContent, 'Synthetic demo');
    assert.equal(view.win.document.querySelector('#toast').closest('#page-content'), null);
    assert.equal(view.win.document.querySelectorAll('#toast').length, 1);
    assert.deepEqual(view.browserErrors, []);
    assert.deepEqual(view.loggedErrors, []);
    for (const asset of view.win.document.querySelectorAll('script[src],link[href]')) {
      const url = new URL(asset.src || asset.href);
      if (url.origin !== view.win.location.origin) continue;
      assert.equal(url.searchParams.get('v'), view.E.VERSION);
      assert.ok(fs.existsSync(path.join(project, url.pathname.replace('/egersheld/', ''))));
    }
    for (const nav of view.win.document.querySelectorAll('nav[aria-label="Workspace"]')) {
      assert.equal(nav.querySelectorAll('a').length, 5);
      const active = nav.querySelector('[aria-current="page"]');
      assert.ok(active.href.endsWith(`/${page === 'index' ? 'overview' : page}.html`));
      for (const link of nav.querySelectorAll('a')) assert.ok(fs.existsSync(path.join(project, new URL(link.href).pathname.replace('/egersheld/', ''))));
    }
  });
}

test('help popover and toast do not replace the page or move focus', async t => {
  const view = shell('ownership'); t.after(() => view.dom.window.close()); await settled(view);
  const search = view.win.document.querySelector('.ow-search input'); search.focus();
  const original = view.win.document.querySelector('.ow-page');
  view.E.toast('Copied');
  assert.equal(view.win.document.activeElement, search);
  assert.equal(view.win.document.querySelector('.ow-page'), original);
  const button = view.win.document.querySelector('#help-button'); button.click();
  assert.equal(view.win.document.querySelector('#help-popover').hidden, false);
  assert.equal(button.getAttribute('aria-expanded'), 'true');
  view.win.document.dispatchEvent(new view.win.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  assert.equal(view.win.document.querySelector('#help-popover').hidden, true);
  assert.equal(button.getAttribute('aria-expanded'), 'false');
});

test('standalone ownership options survive a reload without changing baseline', async t => {
  const first = shell('ownership'); t.after(() => first.dom.window.close()); await settled(first);
  first.win.document.querySelector('[data-own-basis="fd"]').click();
  await Promise.resolve();
  const saved = first.win.localStorage.getItem('egersheld-options-v1');
  assert.equal(JSON.parse(saved).ownershipBasis, 'fd');
  const second = shell('ownership', { storage: { 'egersheld-options-v1': saved } });
  t.after(() => second.dom.window.close()); await settled(second);
  assert.equal(second.win.document.querySelector('[data-own-basis="fd"]').getAttribute('aria-pressed'), 'true');
  assert.deepEqual(copy(second.E.data.Holdings), fixture.Holdings);
});

test('embedded late options render correctly and option changes use Grist setOption', async t => {
  const view = shell('ownership', { live: true }); t.after(() => view.dom.window.close()); await settled(view);
  assert.equal(view.calls.ready[0].requiredAccess, 'full');
  assert.equal(view.win.document.body.classList.contains('embedded'), true);
  assert.equal(view.win.document.querySelector('#connection').textContent, 'Connected to Grist');
  view.calls.optionsCallback({ ownershipBasis: 'fd' });
  assert.equal(view.win.document.querySelector('[data-own-basis="fd"]').getAttribute('aria-pressed'), 'true');
  view.win.document.querySelector('[data-own-basis="issued"]').click();
  await Promise.resolve();
  assert.deepEqual(view.calls.options, [['ownershipBasis', 'issued']]);
  assert.equal(view.win.localStorage.getItem('egersheld-options-v1'), null);
});

test('embedded options received before records survive initial loading', async t => {
  let release; const gate = new Promise(resolve => { release = resolve; });
  const view = shell('ownership', { live: true, delayedLoad: gate }); t.after(() => view.dom.window.close());
  view.calls.optionsCallback({ ownershipBasis: 'fd' });
  release(); await settled(view);
  assert.equal(view.win.document.querySelector('[data-own-basis="fd"]').getAttribute('aria-pressed'), 'true');
});

test('embedded load errors are visible and escaped; refresh recovers without a demo fallback', async t => {
  const message = 'ACL denied <img src=x onerror=alert(1)> secret table';
  const view = shell('overview', { live: true, failure: message }); t.after(() => view.dom.window.close()); await settled(view);
  const alert = view.win.document.querySelector('#page-content [role="alert"]');
  assert.ok(alert.textContent.includes(message));
  assert.equal(alert.querySelector('img'), null);
  assert.equal(view.E.data.Companies.length, 0);
  assert.equal(view.E.store.mode, 'grist');
  view.state.failure = null;
  view.win.document.querySelector('#refresh-data').click();
  await eventually(() => view.E.store.status === 'ready' && !view.win.document.querySelector('#refresh-data').disabled, 'Refresh should recover the live shell');
  assert.equal(view.win.document.querySelector('#connection').textContent, 'Connected to Grist');
  assert.equal(view.win.document.querySelector('#page-content [role="alert"]'), null);
  assert.equal(view.win.localStorage.length, 0);
});

test('complete embedded Funding form saves actual API ID and remote refresh keeps the scenario', async t => {
  const view = shell('funding', { live: true }); t.after(() => view.dom.window.close()); await settled(view);
  input(view, '#scenario-name', 'Integration scenario');
  input(view, '#scenario-notes', 'Saved through full page integration');
  view.win.document.querySelector('[data-scenario-form]').dispatchEvent(new view.win.Event('submit', { bubbles: true, cancelable: true }));
  await eventually(() => !view.E.pages.funding.state.saving && view.E.data.Scenarios.some(row => row.id === 71), 'Funding form should save the returned real row ID');
  assert.equal(view.calls.actions.length, 1);
  assert.equal(view.calls.actions[0][0][0], 'AddRecord');
  assert.equal(typeof view.calls.actions[0][0][3].CreatedAt, 'number');
  assert.equal(view.E.data.Scenarios.find(row => row.id === 71).Name, 'Integration scenario');
  assert.equal(view.win.document.querySelector('#scenario-name').value, '');
  assert.match(view.win.document.querySelector('#toast').textContent, /saved/);
  const priorFetches = view.calls.fetches.length;
  view.calls.recordsCallback();
  await eventually(() => view.calls.fetches.length >= priorFetches + 6 && view.E.store.status === 'ready', 'Grist record notification should refresh the data');
  assert.equal(view.E.data.Scenarios.filter(row => row.id === 71).length, 1);
  assert.deepEqual(view.remote.Holdings, fixture.Holdings);
  assert.equal(view.win.localStorage.length, 0);
  assert.deepEqual(view.browserErrors, []);
});

test('embedded save failure retains draft and displays real error without creating a scenario', async t => {
  const view = shell('funding', { live: true, writeFailure: 'Grist owner denied writes' }); t.after(() => view.dom.window.close()); await settled(view);
  input(view, '#scenario-name', 'Keep this draft');
  view.win.document.querySelector('[data-scenario-form]').dispatchEvent(new view.win.Event('submit', { bubbles: true, cancelable: true }));
  await eventually(() => view.calls.actions.length > 0 && !view.E.pages.funding.state.saving, 'Failed save should unlock the editor');
  assert.equal(view.win.document.querySelector('#scenario-name').value, 'Keep this draft');
  assert.equal(view.win.document.querySelector('#toast').textContent, 'Grist owner denied writes');
  assert.equal(view.E.data.Scenarios.length, fixture.Scenarios.length);
  assert.equal(view.win.localStorage.length, 0);
});

test('scenario Explore links open their exact saved assumptions in the Funding page', async t => {
  const room = shell('scenarios', { live: true }); t.after(() => room.dom.window.close()); await settled(room);
  const link = room.win.document.querySelector('[data-scenario-card="2"] a[href*="scenario="]');
  const destination = new URL(link.href);
  assert.equal(destination.pathname, '/egersheld/funding.html');
  assert.equal(destination.searchParams.get('scenario'), '2');
  const lab = shell('funding', { live: true, query: destination.search }); t.after(() => lab.dom.window.close()); await settled(lab);
  assert.equal(lab.E.pages.funding.state.preMoney, fixture.Scenarios[1].PreMoney);
  assert.equal(lab.E.pages.funding.state.investment, fixture.Scenarios[1].Investment);
  assert.equal(lab.E.pages.funding.state.poolPercent, fixture.Scenarios[1].PoolPercent);
  assert.equal(lab.E.pages.funding.state.source, fixture.Scenarios[1].Name);
  assert.match(lab.win.document.querySelector('#scenario-name').value, /copy/);
});

test('complete embedded Scenarios page renames and confirms deletion against Grist', async t => {
  const view = shell('scenarios', { live: true }); t.after(() => view.dom.window.close()); await settled(view);
  view.win.document.querySelector('[data-rename-scenario="1"]').click();
  input(view, '[data-rename-input]', 'Reviewed seed');
  view.win.document.querySelector('[data-rename-form]').dispatchEvent(new view.win.Event('submit', { bubbles: true, cancelable: true }));
  await eventually(() => !view.E.pages.scenarios.busy && view.E.data.Scenarios[0].Name === 'Reviewed seed', 'Rename should persist');
  assert.match(view.win.document.querySelector('[data-scenario-card="1"] h2').textContent, /Reviewed seed/);
  view.win.document.querySelector('[data-delete-scenario="1"]').click();
  assert.equal(view.calls.actions.length, 1, 'Opening confirmation does not delete');
  view.win.document.querySelector('[data-confirm-delete="1"]').click();
  await eventually(() => !view.E.pages.scenarios.busy && !view.E.data.Scenarios.some(row => row.id === 1), 'Confirmation should delete the selected scenario');
  assert.equal(view.win.document.querySelector('[data-scenario-card="1"]'), null);
  assert.deepEqual(view.calls.actions.map(actions => actions[0][0]), ['UpdateRecord', 'RemoveRecord']);
  assert.deepEqual(view.remote.Holdings, fixture.Holdings);
});

test('invalid source baseline renders a visible error instead of plausible totals', async t => {
  const invalid = copy(fixture); invalid.Companies[0].PoolReserved = 1;
  const view = shell('overview', { live: true, remoteData: invalid }); t.after(() => view.dom.window.close()); await settled(view);
  assert.match(view.win.document.querySelector('#page-content [role="alert"]').textContent, /exceed the reserved pool/);
  assert.equal(view.win.document.querySelector('.metrics'), null);
  assert.deepEqual(view.calls.actions, []);
});

test('embedded sections ignore standalone options and failed option saves do not become saved values', async t => {
  const view = shell('ownership', { live: true, storage: { 'egersheld-options-v1': JSON.stringify({ ownershipBasis: 'fd' }) } });
  t.after(() => view.dom.window.close()); await settled(view);
  assert.equal(view.win.document.querySelector('[data-own-basis="issued"]').getAttribute('aria-pressed'), 'true');
  view.calls.optionsCallback({ ownershipBasis: 'issued' });
  view.win.grist.setOption = async () => { throw new Error('Saving widget options denied'); };
  await assert.rejects(view.E.saveOptions('ownershipBasis', 'fd'), /Saving widget options denied/);
  assert.equal(view.E.getOption('ownershipBasis', 'fallback'), 'issued');
  assert.equal(JSON.parse(view.win.localStorage.getItem('egersheld-options-v1')).ownershipBasis, 'fd');
});

test('Overview and Vesting agree on VLAT today across a UTC midnight boundary', async t => {
  const nowISO = '2025-09-30T15:30:00.000Z';
  const overview = shell('overview', { nowISO }); t.after(() => overview.dom.window.close()); await settled(overview);
  const vesting = shell('vesting', { nowISO }); t.after(() => vesting.dom.window.close()); await settled(vesting);
  assert.equal(overview.E.today(), '2025-10-01');
  assert.equal(vesting.E.pages.vesting.state.asOf, '2025-10-01');
  assert.match(overview.win.document.querySelector('.grant-summary b').textContent, /6,250/);
  assert.equal(vesting.win.document.querySelectorAll('.ve-summary-host .ow-stat strong')[1].textContent, '6,250');
});

test('complete model integration rejects overflow, boolean assumptions, and impossible calendar dates', async t => {
  const view = shell('funding'); t.after(() => view.dom.window.close()); await settled(view);
  const model = view.E.Model;
  assert.throws(() => model.simulateRound(view.E.data, { preMoney: 1e308, investment: 1e308, poolPercent: 0 }));
  assert.throws(() => model.simulateRound(view.E.data, { preMoney: true, investment: 1, poolPercent: 0 }));
  assert.throws(() => model.finite('   ', 'Value'));
  assert.equal(model.dateISO('2026-02-30'), '');
  assert.equal(model.dateISO('2024-02-29'), '2024-02-29');
  assert.throws(() => model.addMonths('2026-02-30', 1));
});

test('ownership details escape invalid-type numeric text returned from Grist', async t => {
  const data = copy(fixture);
  const payload = '<img src=x onerror="window.injected=true">';
  data.Grants[0].DurationMonths = payload;
  data.Grants[0].CliffMonths = payload;
  const view = shell('ownership', { live: true, remoteData: data }); t.after(() => view.dom.window.close()); await settled(view);
  view.calls.optionsCallback({ ownershipBasis: 'fd' });
  view.win.document.querySelector('.ow-table [data-own-detail="4"]').click();
  const detail = view.win.document.querySelector('.ow-detail');
  assert.ok(detail);
  assert.equal(detail.querySelector('img'), null);
  assert.ok(detail.textContent.includes(payload));
});
