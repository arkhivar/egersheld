#!/usr/bin/env node
'use strict';
/* Only creates Egersheld views; never edits sharing, business records, or existing layouts.
 * Upstream action signature/return value and automatic page registration:
 * https://github.com/gristlabs/grist-core/blob/main/sandbox/grist/useractions.py
 *   CreateViewSection(table_ref, view_ref, section_type, groupby_colrefs, table_id)
 *   returns {tableRef, viewRef, sectionRef}; view_ref=0 calls AddView.
 * Storage: ViewSectionRec.ts customView?:string; customDef reads nested JSON:
 * https://github.com/gristlabs/grist-core/blob/main/app/client/models/entities/ViewSectionRec.ts
 * https://github.com/gristlabs/grist-core/blob/main/app/client/models/modelUtil.js
 * AccessLevel.full is the string 'full' (widget permission, not document sharing):
 * https://github.com/gristlabs/grist-core/blob/main/app/common/CustomWidget.ts
 */
const modules = ['overview', 'ownership', 'funding', 'vesting', 'scenarios'].map(key => ({
  key, title: key[0].toUpperCase() + key.slice(1),
  url: `https://arkhivar.github.io/egersheld/${key}.html`
}));

function readOptions(section) {
  try {
    const options = section.options ? JSON.parse(section.options) : {};
    const custom = options.customView ? JSON.parse(options.customView) : {};
    if (!options || Array.isArray(options) || !custom || Array.isArray(custom)) throw new Error();
    return { options, custom };
  } catch { return null; }
}

async function setupWidgets({ baseURL, docId, apiKey, inspect = false, fetchImpl = fetch, log = console.log }) {
  if (!apiKey) throw new Error('Set GRIST_API_KEY in the process environment.');
  const server = new URL(baseURL);
  if (server.username || server.password) throw new Error('Do not put credentials in GRIST_SERVER_URL.');
  if (server.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(server.hostname)) throw new Error('Use HTTPS for remote Grist servers.');
  const root = `${server.href.replace(/\/$/, '')}/api/docs/${encodeURIComponent(docId)}`;
  async function request(route, body) {
    const method = body === undefined ? 'GET' : 'POST';
    const response = await fetchImpl(root + route, {
      method, headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(30000)
    });
    const text = await response.text();
    let result;
    try { result = text ? JSON.parse(text) : null; } catch { result = text; }
    if (!response.ok) {
      const message = typeof result === 'object' ? result?.error || result?.message || text : text;
      throw new Error(`Grist ${response.status} on ${method} ${route}: ${String(message).split(apiKey).join('[redacted]')}`);
    }
    return result;
  }
  async function records(table) {
    const result = await request(`/tables/${table}/records`);
    if (!Array.isArray(result?.records)) throw new Error(`Invalid metadata response: ${table}.`);
    return result.records.map(row => ({ id: row.id, ...row.fields }));
  }
  const [tables, views, sections] = await Promise.all([
    records('_grist_Tables'), records('_grist_Views'), records('_grist_Views_section')
  ]);
  const companies = tables.filter(table => table.tableId === 'Companies');
  if (companies.length !== 1 || !Number.isInteger(companies[0].id) || companies[0].summarySourceTable) {
    throw new Error('Expected one ordinary Companies table. Provision the data tables first.');
  }
  const tableRef = companies[0].id;
  const resolved = [];
  for (const module of modules) {
    const matches = sections.filter(section => readOptions(section)?.custom.url === module.url);
    if (matches.length > 1) throw new Error(`Multiple sections use ${module.url}; inspect them before continuing.`);
    const section = matches[0];
    if (section && (section.parentKey !== 'custom' || section.tableRef !== tableRef || !views.some(view => view.id === section.parentId))) {
      throw new Error(`${module.title} URL belongs to an unexpected table/widget. Existing sections are not repurposed.`);
    }
    if (section) {
      const { custom } = readOptions(section);
      if ((custom.mode && custom.mode !== 'url') || custom.widgetId || custom.widgetDef || custom.pluginId || custom.sectionId) {
        throw new Error(`${module.title} has a plugin/widget-gallery configuration. Inspect it before changing access.`);
      }
    }
    resolved.push({ ...module, section });
  }
  // Do not guess ownership after an interrupted create/configure sequence.
  const incomplete = sections.find(section => section.tableRef === tableRef && section.parentKey === 'custom' &&
    !readOptions(section)?.custom.url && views.some(view => view.id === section.parentId && view.name === 'New page'));
  if (incomplete && !inspect) throw new Error(`Unconfigured Companies custom section ${incomplete.id} on page ${incomplete.parentId}. Inspect this possible interrupted setup before rerunning; no duplicate was created.`);
  if (inspect) {
    for (const item of resolved) log(`${item.title}: ${item.section ? `page ${item.section.parentId}, section ${item.section.id}, access ${readOptions(item.section).custom.access || 'none'}` : 'not installed'}`);
    if (incomplete) log(`Unconfigured section ${incomplete.id} on page ${incomplete.parentId}; inspect manually.`);
    return resolved.map(item => ({ key: item.key, sectionRef: item.section?.id ?? null, viewRef: item.section?.parentId ?? null }));
  }
  const results = [];
  for (const item of resolved) {
    if (item.section) {
      // Re-read before merging so ordinary saved widget options remain intact.
      const current = (await records('_grist_Views_section')).find(section => section.id === item.section.id);
      const parsed = current && readOptions(current);
      if (!parsed || parsed.custom.url !== item.url || current.tableRef !== tableRef || current.parentKey !== 'custom') {
        throw new Error(`${item.title} changed during setup. Retry after inspecting the page.`);
      }
      if (parsed.custom.access !== 'full') {
        await request('/apply', [['UpdateRecord', '_grist_Views_section', current.id, {
          options: JSON.stringify({ ...parsed.options, customView: JSON.stringify({ ...parsed.custom, access: 'full' }) })
        }]]);
        log(`Enabled full widget access for ${item.title}; kept its page, layout, and saved options.`);
      } else log(`Kept ${item.title}: page ${current.parentId}, section ${current.id}.`);
      results.push({ key: item.key, sectionRef: current.id, viewRef: current.parentId });
      continue;
    }
    const response = await request('/apply', [['CreateViewSection', tableRef, 0, 'custom', null, null]]);
    const created = response?.retValues?.[0];
    if (!Number.isInteger(created?.viewRef) || created.viewRef <= 0 || !Number.isInteger(created?.sectionRef) || created.sectionRef <= 0 || created.tableRef !== tableRef) {
      throw new Error(`Creating ${item.title} returned an uncertain result. Inspect document pages before retrying.`);
    }
    let name = item.title;
    if (views.some(view => view.name === name)) name = `Egersheld · ${item.title}`;
    let suffix = 2;
    while (views.some(view => view.name === name)) name = `Egersheld · ${item.title} (${suffix++})`;
    try {
      await request('/apply', [
        ['UpdateRecord', '_grist_Views', created.viewRef, { name }],
        ['UpdateRecord', '_grist_Views_section', created.sectionRef, {
          title: item.title,
          description: `Egersheld ${item.title}: synthetic SoftDV planning and simulation.`,
          options: JSON.stringify({ customView: JSON.stringify({ mode: 'url', url: item.url, access: 'full', renderAfterReady: false }) })
        }]
      ]);
    } catch (error) {
      throw new Error(`${error.message} Created page ${created.viewRef}, section ${created.sectionRef} may remain unconfigured. Inspect before retrying; no automatic deletion was attempted.`);
    }
    views.push({ id: created.viewRef, name });
    log(`Created ${name}: page ${created.viewRef}, section ${created.sectionRef}.`);
    results.push({ key: item.key, sectionRef: created.sectionRef, viewRef: created.viewRef });
  }
  log('Five Egersheld widgets are configured. Document sharing and all data rows were left unchanged.');
  return results;
}

module.exports = { setupWidgets, modules, readOptions };
if (require.main === module) {
  if (process.argv.slice(2).some(arg => arg !== '--inspect')) {
    console.error('Usage: node scripts/setup-widgets.cjs [--inspect]'); process.exitCode = 1;
  } else {
    setupWidgets({ baseURL: process.env.GRIST_SERVER_URL || 'https://docs.getgrist.com', docId: process.env.GRIST_DOC_ID || 'miCLuLcigwUw', apiKey: process.env.GRIST_API_KEY, inspect: process.argv.includes('--inspect') })
      .catch(error => { console.error(error.message); process.exitCode = 1; });
  }
}
