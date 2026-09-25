/* Keys never enter the browser. Embedded access uses the signed-in Grist user. */
E.Data = {
  clone(value) { return JSON.parse(JSON.stringify(value)); },
  date(value, dateOnly) {
    if (value === null || value === undefined || value === '') return '';
    let parsed;
    if (typeof value === 'number') parsed = new Date(value * 1000);
    else if (value instanceof Date) parsed = value;
    else parsed = new Date(String(value));
    if (!Number.isFinite(parsed.getTime())) throw new Error(`Invalid stored date: ${String(value)}`);
    return dateOnly ? parsed.toISOString().slice(0, 10) : parsed.toISOString();
  },
  rows(table, columns) {
    if (!E.TABLE_SCHEMA[table]) throw new Error(`Unknown table: ${table}`);
    if (!columns || !Array.isArray(columns.id)) throw new Error(`Grist returned invalid data for ${table}.`);
    for (const field of Object.keys(E.TABLE_SCHEMA[table])) {
      if (!Array.isArray(columns[field]) || columns[field].length !== columns.id.length) {
        throw new Error(`Missing or incomplete ${table}.${field} column.`);
      }
    }
    return columns.id.map((id, index) => {
      const row = { id };
      for (const [field, type] of Object.entries(E.TABLE_SCHEMA[table])) {
        const value = columns[field][index];
        row[field] = type.startsWith('Date') ? E.Data.date(value, type === 'Date') : value;
      }
      return row;
    });
  },
  encoded(table, fields) {
    const result = {};
    for (const [field, value] of Object.entries(fields)) {
      const type = E.TABLE_SCHEMA[table]?.[field];
      if (!type) throw new Error(`Unknown field: ${table}.${field}`);
      result[field] = type.startsWith('Date')
        ? (value === '' || value === null ? null : Date.parse(E.Data.date(value, type === 'Date')) / 1000)
        : value;
    }
    return result;
  },
  scenario(fields, existing, company = E.data.Companies[0]) {
    if (!company) throw new Error('Load a company before saving a scenario.');
    const row = { Company: company.id, Name: '', PreMoney: company.PreMoney, Investment: 0, PoolPercent: 0, Notes: '', CreatedAt: new Date().toISOString(), ...existing, ...fields };
    delete row.id;
    row.Name = String(row.Name).trim();
    row.Notes = String(row.Notes || '').trim();
    if (!row.Name) throw new Error('Give the scenario a name.');
    if (row.Name.length > 160 || row.Notes.length > 5000) throw new Error('Scenario name or notes are too long.');
    if (row.Company !== company.id) throw new Error('Scenarios must belong to the current company.');
    for (const key of ['PreMoney', 'Investment', 'PoolPercent']) {
      if (row[key] === '' || row[key] === null || typeof row[key] === 'boolean') throw new Error(`${key} must be a number.`);
      row[key] = Number(row[key]);
      if (!Number.isFinite(row[key]) || row[key] < 0) throw new Error(`${key} must be a finite non-negative number.`);
    }
    if (row.PreMoney <= 0) throw new Error('Pre-money valuation must be greater than zero.');
    if (row.PoolPercent > 50) throw new Error('Target pool must be between 0% and 50% for this model.');
    if (row.PoolPercent >= 100 || row.Investment / (row.PreMoney + row.Investment) + row.PoolPercent / 100 >= 1) {
      throw new Error('The investment and target pool leave no ownership for existing shares.');
    }
    row.CreatedAt = E.Data.date(row.CreatedAt, false);
    E.Data.encoded('Scenarios', row);
    return row;
  }
};

E.data = Object.fromEntries(Object.keys(E.TABLE_SCHEMA).map(table => [table, []]));
E.store = {
  mode: window.self !== window.top ? 'grist' : 'demo',
  status: 'idle', error: null,
  _listeners: new Set(), _pending: new Map(), _loading: null, _revision: 0,
  _storageKey: 'egersheld.demo.scenarios.v1', _refreshTimer: null,
  subscribe(callback) {
    this._listeners.add(callback);
    return () => this._listeners.delete(callback);
  },
  _notify() {
    for (const callback of this._listeners) {
      try { callback(E.data, this); } catch (error) { console.error('View update failed:', error); }
    }
  },
  load() {
    if (this._loading) return this._loading;
    this.status = 'loading'; this.error = null;
    this._loading = Promise.resolve().then(async () => {
      let next;
      if (this.mode === 'demo') {
        next = E.Data.clone(E.demoData);
        const saved = window.localStorage.getItem(this._storageKey);
        if (saved !== null) {
          const scenarios = JSON.parse(saved);
          if (!Array.isArray(scenarios) || scenarios.some(row => !Number.isInteger(row.id) || row.id <= 0) || new Set(scenarios.map(row => row.id)).size !== scenarios.length) {
            throw new Error('Saved demo scenarios are invalid. Clear this site’s demo storage to reset.');
          }
          next.Scenarios = scenarios.map(row => ({ id: row.id, ...E.Data.scenario(row, undefined, next.Companies[0]) }));
        }
      } else {
        if (this._startupError) throw this._startupError;
        if (!window.grist?.docApi) throw new Error('Grist widget API is unavailable. Open the widget inside its Grist document.');
        const tables = Object.keys(E.TABLE_SCHEMA);
        let revision;
        do {
          revision = this._revision;
          const fetched = await Promise.all(tables.map(table => window.grist.docApi.fetchTable(table)));
          next = Object.fromEntries(tables.map((table, index) => [table, E.Data.rows(table, fetched[index])]));
          // A refresh that began before a completed write must not restore old rows.
        } while (revision !== this._revision);
      }
      if (next.Companies.length !== 1) throw new Error('This prototype requires exactly one company in Companies.');
      E.data = next; this.status = 'ready'; this._notify();
      return E.data;
    }).catch(error => {
      this.error = error; this.status = 'error'; this._notify(); throw error;
    }).finally(() => { this._loading = null; });
    return this._loading;
  },
  refresh() { return this.load(); },
  _write(key, action) {
    if (this._pending.has(key)) return this._pending.get(key);
    const pending = Promise.resolve().then(() => {
      if (this.status !== 'ready') throw new Error('Wait until company data has loaded before editing.');
      return action();
    }).finally(() => this._pending.delete(key));
    this._pending.set(key, pending);
    return pending;
  },
  _publishScenarios(rows) {
    if (this.mode === 'demo') window.localStorage.setItem(this._storageKey, JSON.stringify(rows));
    this._revision++;
    E.data = { ...E.data, Scenarios: rows }; this._notify();
  },
  saveScenario(fields) {
    // Date creation happens after deduplication: two identical clicks share one write.
    const key = 'save:' + JSON.stringify(Object.keys(fields).sort().map(name => [name, fields[name]]));
    return this._write(key, async () => {
      const values = E.Data.scenario(fields);
      let id;
      if (this.mode === 'grist') {
        const encoded = E.Data.encoded('Scenarios', values);
        const results = await window.grist.docApi.applyUserActions([['AddRecord', 'Scenarios', null, encoded]]);
        id = results?.retValues?.[0];
        if (!Number.isInteger(id)) throw new Error('Grist saved the scenario but did not return its row ID. Refresh before trying again.');
      } else id = Math.max(0, ...E.data.Scenarios.map(row => row.id)) + 1;
      const row = { id, ...values };
      this._publishScenarios([...E.data.Scenarios.filter(item => item.id !== id), row]);
      return row;
    });
  },
  update(table, id, fields) {
    return this._write(`update:${table}:${id}`, async () => {
      // Baseline equity records are intentionally read-only in the prototype.
      if (table !== 'Scenarios') throw new Error('Baseline records are read-only. Save hypothetical changes as a scenario.');
      const existing = E.data.Scenarios.find(row => row.id === Number(id));
      if (!existing) throw new Error('The scenario no longer exists. Refresh to see current scenarios.');
      const values = E.Data.scenario(fields, existing);
      if (this.mode === 'grist') await window.grist.docApi.applyUserActions([['UpdateRecord', 'Scenarios', existing.id, E.Data.encoded('Scenarios', values)]]);
      const row = { id: existing.id, ...values };
      this._publishScenarios(E.data.Scenarios.map(item => item.id === row.id ? row : item));
      return row;
    });
  },
  deleteScenario(id) {
    return this._write(`delete:${id}`, async () => {
      const existing = E.data.Scenarios.find(row => row.id === Number(id));
      if (!existing) throw new Error('The scenario no longer exists. Refresh to see current scenarios.');
      if (this.mode === 'grist') await window.grist.docApi.applyUserActions([['RemoveRecord', 'Scenarios', existing.id]]);
      this._publishScenarios(E.data.Scenarios.filter(row => row.id !== existing.id));
      return existing;
    });
  }
};

if (E.store.mode === 'grist') {
  try {
    if (!window.grist) throw new Error('Grist widget API is unavailable.');
    window.grist.ready({ requiredAccess: 'full' });
    window.grist.onRecords(() => {
      clearTimeout(E.store._refreshTimer);
      E.store._refreshTimer = setTimeout(() => {
        E.store.load().catch(error => console.error('Grist refresh failed:', error));
      }, 80);
    });
  } catch (error) { E.store._startupError = error; }
}
