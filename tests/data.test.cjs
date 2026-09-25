'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { provision, fixture, schema } = require('../scripts/provision.cjs');
const plain = value => JSON.parse(JSON.stringify(value));

function setup({ live = false, storage = new Map(), fetchTable, applyUserActions } = {}) {
  const calls = { ready: [], actions: [], fetches: [], onRecords: null };
  const window = { self: {}, localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) } };
  window.top = live ? {} : window.self;
  const context = vm.createContext({ E: {}, window, console, setTimeout, clearTimeout });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'shared/demo-data.js'), 'utf8'), context);
  function columns(table) {
    const rows = fixture[table];
    return Object.fromEntries(['id', ...Object.keys(schema[table])].map(key => [key, rows.map(row => schema[table][key]?.startsWith('Date') ? Date.parse(row[key]) / 1000 : row[key])]));
  }
  if (live) window.grist = {
    ready: options => calls.ready.push(options),
    onRecords: callback => { calls.onRecords = callback; },
    docApi: {
      fetchTable: async table => { calls.fetches.push(table); return fetchTable ? fetchTable(table, columns) : columns(table); },
      applyUserActions: async actions => { calls.actions.push(plain(actions)); return applyUserActions ? applyUserActions(actions) : { retValues: [45] }; }
    }
  };
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'shared/data.js'), 'utf8'), context);
  return { E: context.E, calls, storage, window };
}

test('fixtures preserve baseline shares, single reserve, and fictional references', () => {
  assert.equal(fixture.Holdings.reduce((sum, row) => sum + row.Shares, 0), 1000000);
  assert.equal(fixture.Grants.reduce((sum, row) => sum + row.Units, 0), 80000);
  assert.equal(fixture.Companies[0].PoolReserved, 120000);
  assert.ok(fixture.Stakeholders.every(row => row.Email.endsWith('@example.com')));
  for (const table of ['Holdings', 'Grants']) assert.ok(fixture[table].every(row => fixture.Stakeholders.some(person => person.id === row.Holder)));
});

test('live load waits for all tables, normalizes dates, and requests full access', async () => {
  const { E, calls } = setup({ live: true });
  assert.equal(E.store.mode, 'grist');
  assert.equal(E.data.Companies.length, 0);
  await E.store.load();
  assert.equal(calls.fetches.length, 6);
  assert.equal(calls.ready[0].requiredAccess, 'full');
  assert.equal(E.data.Companies[0].Founded, '2023-04-17');
  assert.equal(E.data.Grants[3].Start, '2026-03-31');
  assert.equal(E.data.Scenarios[0].CreatedAt, '2026-09-20T02:00:00.000Z');
  assert.equal(E.store.status, 'ready');
  assert.equal(E.Data.date({ toString: () => '2026-03-31T00:00:00Z' }, true), '2026-03-31');
});

test('live failure never substitutes synthetic data and preserves the real error', async () => {
  const { E } = setup({ live: true, fetchTable: async (table, columns) => {
    if (table === 'Scenarios') throw new Error('ACL denied Scenarios read');
    return columns(table);
  } });
  await assert.rejects(E.store.load(), /ACL denied Scenarios read/);
  assert.equal(E.store.mode, 'grist');
  assert.equal(E.store.status, 'error');
  assert.equal(E.data.Companies.length, 0);
  assert.equal(E.store.error.message, 'ACL denied Scenarios read');
});

test('missing expected fields are errors instead of empty financial values', async () => {
  const { E } = setup({ live: true, fetchTable: async (table, columns) => {
    const result = columns(table); if (table === 'Companies') delete result.Cash; return result;
  } });
  await assert.rejects(E.store.load(), /Companies.Cash/);
});

test('demo persistence changes scenarios only and survives refresh', async () => {
  const { E, storage } = setup();
  let notifications = 0;
  const unsubscribe = E.store.subscribe(() => notifications++);
  await E.store.load();
  const baseline = plain(E.data.Holdings);
  const row = await E.store.saveScenario({ Name: 'Test case', PreMoney: 180000000, Investment: 30000000, PoolPercent: 10 });
  assert.equal(row.id, 3);
  assert.equal(storage.size, 1);
  await E.store.update('Scenarios', row.id, { Name: 'Renamed' });
  await E.store.load();
  assert.equal(E.data.Scenarios.find(item => item.id === row.id).Name, 'Renamed');
  assert.deepEqual(plain(E.data.Holdings), baseline);
  await assert.rejects(E.store.update('Holdings', 1, { Shares: 0 }), /Baseline records are read-only/);
  await E.store.deleteScenario(row.id);
  await E.store.load();
  assert.equal(E.data.Scenarios.length, 2);
  assert.ok(notifications >= 6);
  unsubscribe();
});

test('identical overlapping saves perform one live write and return its real row ID', async () => {
  const { E, calls } = setup({ live: true });
  await E.store.load();
  const fields = { Name: 'Live scenario', PreMoney: 180000000, Investment: 30000000, PoolPercent: 10 };
  const first = E.store.saveScenario(fields);
  const second = E.store.saveScenario(fields);
  assert.equal(first, second);
  const row = await first;
  assert.equal(row.id, 45);
  assert.equal(calls.actions.length, 1);
  const action = calls.actions[0][0];
  assert.equal(action[0], 'AddRecord');
  assert.equal(action[1], 'Scenarios');
  assert.equal(typeof action[3].CreatedAt, 'number');
  assert.equal(E.data.Scenarios.filter(item => item.id === 45).length, 1);
});

test('live write errors never mutate locally or save a fallback', async () => {
  const { E, storage } = setup({ live: true, applyUserActions: async () => { throw new Error('Document is read-only: owner policy'); } });
  await E.store.load();
  const before = plain(E.data.Scenarios);
  await assert.rejects(E.store.saveScenario({ Name: 'Failure' }), /Document is read-only: owner policy/);
  await assert.rejects(E.store.update('Scenarios', 1, { Name: 'Failure' }), /Document is read-only: owner policy/);
  await assert.rejects(E.store.deleteScenario(1), /Document is read-only: owner policy/);
  assert.deepEqual(plain(E.data.Scenarios), before);
  assert.equal(storage.size, 0);
});

test('invalid scenarios reject impossible pools, missing names, and unknown fields', async () => {
  const { E } = setup(); await E.store.load();
  await assert.rejects(E.store.saveScenario({ Name: ' ' }), /name/i);
  await assert.rejects(E.store.saveScenario({ Name: 'No', PreMoney: 0 }), /greater than zero/);
  await assert.rejects(E.store.saveScenario({ Name: 'No', PreMoney: 100, Investment: 100, PoolPercent: 50 }), /leave no ownership/);
  await assert.rejects(E.store.saveScenario({ Name: 'No', Investment: Infinity }), /finite/);
  await assert.rejects(E.store.saveScenario({ Name: 'No', PoolPercent: 50.1 }), /between 0% and 50%/);
  const boundary = await E.store.saveScenario({ Name: 'Maximum supported pool', Investment: 0, PoolPercent: 50 });
  assert.equal(boundary.PoolPercent, 50);
  await assert.rejects(E.store.saveScenario({ Name: 'No', Shares: 4 }), /Unknown field/);
});

test('demo storage failure does not make unsaved changes appear saved', async () => {
  const { E, window } = setup(); await E.store.load();
  window.localStorage.setItem = () => { throw new Error('Quota exceeded'); };
  await assert.rejects(E.store.saveScenario({ Name: 'Unsaved' }), /Quota exceeded/);
  assert.equal(E.data.Scenarios.length, 2);
});

test('a refresh racing a successful write cannot restore the stale scenario list', async () => {
  let finishWrite, finishRefresh;
  let pauseRefresh = false;
  let saved = false;
  const writeGate = new Promise(resolve => { finishWrite = resolve; });
  const refreshGate = new Promise(resolve => { finishRefresh = resolve; });
  const { E } = setup({ live: true,
    applyUserActions: async () => { await writeGate; saved = true; return { retValues: [45] }; },
    fetchTable: async (table, columns) => {
      const snapshot = columns(table);
      if (table === 'Scenarios' && saved) {
        const row = { ...fixture.Scenarios[0], id: 45, Name: 'Concurrent save' };
        for (const key of Object.keys(snapshot)) snapshot[key].push(key === 'CreatedAt' ? Date.parse(row[key]) / 1000 : row[key]);
      }
      if (pauseRefresh) await refreshGate;
      return snapshot;
    }
  });
  await E.store.load();
  const save = E.store.saveScenario({ Name: 'Concurrent save' });
  await Promise.resolve();
  pauseRefresh = true;
  const refresh = E.store.load();
  await Promise.resolve();
  finishWrite(); await save;
  finishRefresh(); await refresh;
  assert.equal(E.data.Scenarios.some(row => row.id === 45), true);
  assert.equal(E.store.status, 'ready');
});

test('corrupt persisted scenario values fail explicitly without replacing baseline', async () => {
  const storage = new Map([['egersheld.demo.scenarios.v1', JSON.stringify([{ ...fixture.Scenarios[0], Investment: -100 }])]]);
  const { E } = setup({ storage });
  await assert.rejects(E.store.load(), /non-negative/);
  assert.equal(E.data.Companies.length, 0);
  assert.equal(storage.size, 1);
});

function mockServer(initial = { Table1: { fields: {}, rows: [{ id: 1, A: 'leave me alone' }] } }) {
  const tables = plain(initial); const writes = [];
  const fetchImpl = async (url, options) => {
    const route = new URL(url).pathname.split('/api/docs/test')[1];
    const body = options.body ? JSON.parse(options.body) : null;
    let result;
    if (options.method !== 'GET') writes.push({ route, body });
    if (route === '/tables' && options.method === 'GET') result = { tables: Object.keys(tables).map(id => ({ id })) };
    else if (route === '/tables') {
      for (const table of body.tables) tables[table.id] = { fields: Object.fromEntries(table.columns.map(col => [col.id, col.fields.type])), rows: [] };
      result = { tables: body.tables.map(table => ({ id: table.id })) };
    } else if (route === '/apply') {
      for (const action of body) {
        assert.equal(action[0], 'BulkAddRecord');
        tables[action[1]].rows = action[2].map((id, index) => ({ id, ...Object.fromEntries(Object.entries(action[3]).map(([key, values]) => [key, values[index]])) }));
      }
      result = { retValues: [] };
    } else {
      const [, , name, resource] = route.split('/');
      if (resource === 'columns') result = { columns: Object.entries(tables[name].fields).map(([id, type]) => ({ id, fields: { type, isFormula: false } })) };
      if (resource === 'records') result = { records: tables[name].rows.map(row => ({ id: row.id, fields: Object.fromEntries(Object.entries(row).filter(([key]) => key !== 'id')) })) };
    }
    assert.notEqual(result, undefined, route);
    return { ok: true, status: 200, text: async () => JSON.stringify(result) };
  };
  return { tables, writes, fetchImpl };
}

test('provisioning is idempotent, encodes dates, and never touches Table1', async () => {
  const server = mockServer();
  const config = { baseURL: 'https://example.com', docId: 'test', apiKey: 'fake-test-only', fetchImpl: server.fetchImpl, log: () => {} };
  await provision(config);
  assert.equal(server.writes.length, 12);
  assert.equal(Object.keys(server.tables).length, 7);
  assert.equal(server.tables.Table1.rows[0].A, 'leave me alone');
  assert.equal(typeof server.tables.Companies.rows[0].Founded, 'number');
  assert.equal(server.tables.Grants.rows.length, 4);
  await provision(config);
  assert.equal(server.writes.length, 12);
  await provision({ ...config, inspect: true });
  assert.equal(server.writes.length, 12);
});

test('provisioning does not seed children into an unrelated existing company', async () => {
  const server = mockServer({ Table1: { fields: {}, rows: [] }, Companies: { fields: schema.Companies, rows: [{ id: 1, Name: 'A real unrelated company' }] } });
  await assert.rejects(provision({ baseURL: 'https://example.com', docId: 'test', apiKey: 'fake-test-only', fetchImpl: server.fetchImpl, log: () => {} }), /not the expected fictional record/);
  assert.equal(server.tables.Companies.rows[0].Name, 'A real unrelated company');
  assert.equal(server.tables.Stakeholders.rows.length, 0);
});
