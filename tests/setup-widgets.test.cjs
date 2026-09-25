'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { setupWidgets, modules, readOptions } = require('../scripts/setup-widgets.cjs');

function mockSetup() {
  const metadata = {
    _grist_Tables: [{ id: 3, tableId: 'Companies', summarySourceTable: 0 }, { id: 1, tableId: 'Table1' }],
    _grist_Views: [{ id: 1, name: 'Existing records', layoutSpec: 'keep layout' }],
    _grist_Views_section: [{ id: 1, parentId: 1, parentKey: 'record', tableRef: 1, options: '{}' }]
  };
  const writes = [];
  const fetchImpl = async (url, options) => {
    const route = new URL(url).pathname.split('/api/docs/test')[1];
    let result;
    if (options.method === 'GET') {
      const table = route.split('/')[2];
      assert.ok(metadata[table], 'Read only documented metadata');
      result = { records: metadata[table].map(row => ({ id: row.id, fields: Object.fromEntries(Object.entries(row).filter(([key]) => key !== 'id')) })) };
    } else {
      assert.equal(route, '/apply');
      const actions = JSON.parse(options.body); writes.push(actions);
      const retValues = [];
      for (const action of actions) {
        if (action[0] === 'CreateViewSection') {
          assert.deepEqual(action, ['CreateViewSection', 3, 0, 'custom', null, null]);
          const viewRef = Math.max(...metadata._grist_Views.map(row => row.id)) + 1;
          const sectionRef = Math.max(...metadata._grist_Views_section.map(row => row.id)) + 1;
          metadata._grist_Views.push({ id: viewRef, name: 'New page' });
          metadata._grist_Views_section.push({ id: sectionRef, parentId: viewRef, parentKey: 'custom', tableRef: 3, options: '' });
          retValues.push({ viewRef, sectionRef, tableRef: 3 });
        } else {
          assert.equal(action[0], 'UpdateRecord');
          assert.ok(['_grist_Views', '_grist_Views_section'].includes(action[1]));
          const row = metadata[action[1]].find(row => row.id === action[2]);
          assert.ok(row); Object.assign(row, action[3]); retValues.push(null);
        }
      }
      result = { retValues };
    }
    return { ok: true, status: 200, text: async () => JSON.stringify(result) };
  };
  return { metadata, writes, fetchImpl, config: { baseURL: 'https://example.com', docId: 'test', apiKey: 'fake-test-only', fetchImpl, log: () => {} } };
}

test('creates five Companies custom pages with nested JSON/full access and is idempotent', async () => {
  const server = mockSetup();
  const original = JSON.stringify(server.metadata._grist_Views[0]);
  const result = await setupWidgets(server.config);
  assert.equal(result.length, 5);
  assert.equal(server.writes.length, 10);
  assert.equal(JSON.stringify(server.metadata._grist_Views[0]), original);
  for (const section of server.metadata._grist_Views_section.slice(1)) {
    const { custom } = readOptions(section);
    assert.equal(custom.access, 'full');
    assert.equal(custom.mode, 'url');
    assert.ok(modules.some(module => module.url === custom.url));
    assert.equal(typeof JSON.parse(section.options).customView, 'string');
  }
  await setupWidgets(server.config);
  await setupWidgets({ ...server.config, inspect: true });
  assert.equal(server.writes.length, 10);
});

test('matching widget access update keeps renamed page and saved options intact', async () => {
  const server = mockSetup(); await setupWidgets(server.config);
  const section = server.metadata._grist_Views_section[1];
  const parsed = readOptions(section);
  parsed.options.rowHeight = 50;
  parsed.custom.access = 'read table';
  parsed.custom.widgetOptions = { chosen: 'keep this' };
  section.options = JSON.stringify({ ...parsed.options, customView: JSON.stringify(parsed.custom) });
  server.metadata._grist_Views[1].name = 'My preferred name';
  await setupWidgets(server.config);
  assert.equal(server.writes.length, 11);
  assert.equal(server.metadata._grist_Views[1].name, 'My preferred name');
  assert.equal(readOptions(section).options.rowHeight, 50);
  assert.deepEqual(readOptions(section).custom.widgetOptions, { chosen: 'keep this' });
  assert.equal(readOptions(section).custom.access, 'full');
});

test('preflight rejects a conflicting target URL without modifying any sections', async () => {
  const server = mockSetup();
  server.metadata._grist_Views_section.push({ id: 2, parentId: 1, parentKey: 'custom', tableRef: 1, options: JSON.stringify({ customView: JSON.stringify({ url: modules[0].url }) }) });
  await assert.rejects(setupWidgets(server.config), /unexpected table/);
  assert.equal(server.writes.length, 0);
});

test('duplicate matching URLs stop setup and interrupted blank pages are not duplicated', async () => {
  const server = mockSetup(); await setupWidgets(server.config);
  server.metadata._grist_Views_section.push({ ...server.metadata._grist_Views_section[1], id: 40 });
  await assert.rejects(setupWidgets(server.config), /Multiple sections/);
  assert.equal(server.writes.length, 10);
  const incomplete = mockSetup();
  incomplete.metadata._grist_Views.push({ id: 2, name: 'New page' });
  incomplete.metadata._grist_Views_section.push({ id: 2, parentId: 2, parentKey: 'custom', tableRef: 3, options: '' });
  await assert.rejects(setupWidgets(incomplete.config), /possible interrupted setup/);
  assert.equal(incomplete.writes.length, 0);
});

test('existing page names are preserved and a distinct new title is chosen', async () => {
  const server = mockSetup(); server.metadata._grist_Views[0].name = 'Overview';
  await setupWidgets(server.config);
  assert.equal(server.metadata._grist_Views[0].name, 'Overview');
  assert.equal(server.metadata._grist_Views[1].name, 'Egersheld · Overview');
});
