#!/usr/bin/env node
/* Provision only Egersheld's six synthetic-data tables; never overwrite rows. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const fixtureContext = vm.createContext({ E: {} });
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'shared', 'demo-data.js'), 'utf8'), fixtureContext);
const fixture = JSON.parse(JSON.stringify(fixtureContext.E.demoData));
const schema = JSON.parse(JSON.stringify(fixtureContext.E.TABLE_SCHEMA));

function encodedValue(type, value) {
  return type.startsWith('Date') ? Date.parse(value) / 1000 : value;
}

async function provision({ baseURL, docId, apiKey, inspect = false, fetchImpl = fetch, log = console.log }) {
  if (!apiKey) throw new Error('Set GRIST_API_KEY in the process environment; never place credentials in files.');
  const server = new URL(baseURL);
  if (server.username || server.password) throw new Error('Credentials must not appear in GRIST_SERVER_URL.');
  if (server.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(server.hostname)) throw new Error('Use HTTPS for remote Grist servers.');
  const root = `${server.href.replace(/\/$/, '')}/api/docs/${encodeURIComponent(docId)}`;
  async function request(route, method = 'GET', body) {
    const response = await fetchImpl(root + route, {
      method,
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(30000)
    });
    const content = await response.text();
    let result;
    try { result = content ? JSON.parse(content) : null; } catch { result = content; }
    if (!response.ok) {
      const message = typeof result === 'object' ? result?.error || result?.message || content : content;
      // Defensive redaction even if a remote proxy echoes a credential in its error.
      throw new Error(`Grist ${response.status} on ${method} ${route}: ${String(message).split(apiKey).join('[redacted]')}`);
    }
    return result;
  }
  const tables = await request('/tables');
  if (!Array.isArray(tables?.tables)) throw new Error('Grist returned an invalid table list.');
  const existing = new Set(tables.tables.map(table => table.id));
  if (inspect) {
    for (const table of tables.tables) {
      const records = await request(`/tables/${encodeURIComponent(table.id)}/records`);
      log(`${table.id}: ${records.records.length} rows${schema[table.id] ? ' (Egersheld schema)' : ' (untouched)'}`);
    }
    return;
  }
  const parentRows = {};
  for (const [table, fields] of Object.entries(schema)) {
    if (!existing.has(table)) {
      await request('/tables', 'POST', { tables: [{ id: table, columns: Object.entries(fields).map(([id, type]) => ({ id, fields: { type, isFormula: false } })) }] });
      log(`Created ${table}.`);
    }
    const columns = await request(`/tables/${table}/columns`);
    for (const [field, type] of Object.entries(fields)) {
      const column = columns.columns.find(item => item.id === field);
      if (!column || column.fields.type !== type || column.fields.isFormula) {
        throw new Error(`${table}.${field} is missing, has the wrong type, or is a formula. Existing schemas are never overwritten.`);
      }
    }
    const data = await request(`/tables/${table}/records`);
    parentRows[table] = data.records.map(row => ({ id: row.id, ...row.fields }));
    if (data.records.length > 0) {
      log(`Kept ${table}: ${data.records.length} existing rows.`);
      continue;
    }
    for (const [field, type] of Object.entries(fields)) {
      if (!type.startsWith('Ref:')) continue;
      const target = type.slice(4);
      for (const row of fixture[table]) {
        const expected = fixture[target].find(item => item.id === row[field]);
        const actual = parentRows[target]?.find(item => item.id === row[field]);
        if (!actual || actual.Name !== expected?.Name) throw new Error(`Cannot seed ${table}: ${target} reference ${row[field]} is not the expected fictional record.`);
      }
    }
    const bulkColumns = Object.fromEntries(Object.entries(fields).map(([field, type]) => [field, fixture[table].map(row => encodedValue(type, row[field]))]));
    await request('/apply', 'POST', [['BulkAddRecord', table, fixture[table].map(row => row.id), bulkColumns]]);
    parentRows[table] = fixture[table];
    log(`Seeded ${table}: ${fixture[table].length} synthetic rows.`);
  }
  log('Provisioning complete. Existing nonempty tables and Table1 were not changed.');
}

module.exports = { provision, fixture, schema };
if (require.main === module) {
  const unknown = process.argv.slice(2).filter(arg => arg !== '--inspect');
  if (unknown.length) {
    console.error('Usage: node scripts/provision.cjs [--inspect]');
    process.exitCode = 1;
  } else {
    provision({ baseURL: process.env.GRIST_SERVER_URL || 'https://docs.getgrist.com', docId: process.env.GRIST_DOC_ID || 'miCLuLcigwUw', apiKey: process.env.GRIST_API_KEY, inspect: process.argv.includes('--inspect') })
      .catch(error => { console.error(error.message); process.exitCode = 1; });
  }
}
