const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ctx = vm.createContext({});
vm.runInContext(fs.readFileSync(require('node:path').join(__dirname, '../shared/model.js'), 'utf8'), ctx);
const M = ctx.E.Model;
const fixture = { Companies: [{ id: 1, PoolReserved: 120000 }], Stakeholders: [{ id: 1, Name: 'A', Role: 'Founder' }, { id: 2, Name: 'B', Role: 'Investor' }],
  Holdings: [{ Company: 1, Holder: 1, Shares: 800000 }, { Company: 1, Holder: 2, Shares: 200000 }], Grants: [{ Company: 1, Units: 80000, Status: 'Active' }] };
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);
test('aggregate overflow fails rather than producing plausible ownership zeros', () => {
  const data = JSON.parse(JSON.stringify(fixture));
  data.Holdings.forEach(row => row.Shares = 1e308);
  assert.throws(() => M.capTable(data), /finite/);
});
test('mistyped huge vesting durations cannot allocate an unbounded chart', () => {
  assert.throws(() => M.vesting({ Start: '2026-01-01', Units: 100, CliffMonths: 12, DurationMonths: 1000000000, Status: 'Active' }, '2026-09-25'), /1,200 months/);
});
test('pool is counted once; granted and unallocated reconcile', () => {
  const c = M.capTable(fixture); assert.equal(c.fullyDiluted, 1120000); assert.equal(c.available, 40000); assert.equal(c.granted, 80000);
});
test('round ownership conserves 100%; new investment and pool hit declared targets', () => {
  const r = M.simulateRound(fixture, { preMoney: 180000000, investment: 45000000, poolPercent: 12 });
  near(r.rows.reduce((s, a) => s + a.afterPct, 0), 1); near(r.investorPct, .2); near(r.poolShares / r.totalShares, .12);
  near(r.topUp, 56470.58823529411); near(r.pricePerShare * r.newInvestorShares, 45000000);
  assert.equal(fixture.Companies[0].PoolReserved, 120000);
});
test('target below existing pool never cancels grants or shrinks baseline pool', () => {
  const r = M.simulateRound(fixture, { preMoney: 180000000, investment: 30000000, poolPercent: 1 });
  assert.equal(r.topUp, 0); assert.equal(r.poolShares, 120000);
});
test('no-raise no-topup scenario preserves ownership', () => {
  const r = M.simulateRound(fixture, { preMoney: 180000000, investment: 0, poolPercent: 0 });
  near(r.dilution, 0); assert.equal(r.newInvestorShares, 0);
});
test('invalid assumptions and overallocated pool fail visibly', () => {
  for (const a of [{preMoney:0,investment:1,poolPercent:1}, {preMoney:100,investment:-1,poolPercent:0}, {preMoney:100,investment:1000,poolPercent:50}, {preMoney:NaN,investment:1,poolPercent:1}]) assert.throws(() => M.simulateRound(fixture,a));
  assert.throws(() => M.capTable({...fixture,Grants:[{Company:1,Units:120001}]}));
});
test('many valid rounds reconcile ownership and prices', () => {
  for (const investment of [0,1,30000000,45000000,120000000]) for (const p of [0,5,10,12,20]) {
    const r = M.simulateRound(fixture,{preMoney:180000000,investment,poolPercent:p});
    near(r.rows.reduce((s,a)=>s+a.afterPct,0),1); near(r.pricePerShare*(r.issuedShares+r.poolShares),180000000);
  }
});
const grant = { Units: 25000, Start: '2024-01-31', CliffMonths: 12, DurationMonths: 48, Status: 'Active' };
test('month-end anniversary clamps, including leap February', () => {
  assert.equal(M.addMonths('2024-01-31',1),'2024-02-29'); assert.equal(M.addMonths('2024-01-31',13),'2025-02-28');
});
test('no vesting before cliff, cliff catches up, maturity fully vests', () => {
  assert.equal(M.vesting(grant,'2025-01-30').vested,0); assert.equal(M.vesting(grant,'2025-01-31').vested,6250);
  assert.equal(M.vesting(grant,'2028-01-31').vested,25000); assert.equal(M.vesting(grant,'2028-02-01').nextDate,null);
});
test('monthly rounding and boundary dates are deterministic', () => {
  assert.equal(M.vesting(grant,'2025-02-27').vested,6250); assert.equal(M.vesting(grant,'2025-02-28').vested,6770);
  assert.equal(M.vesting(grant,'2023-01-01').vested,0);
});
test('inactive grants are excluded and dates normalize from Grist', () => {
  assert.equal(M.vesting({...grant,Status:'Cancelled'},'2027-01-01').vested,0);
  assert.equal(M.dateISO(Date.parse('2024-01-31T00:00:00Z')/1000),'2024-01-31');
  assert.throws(() => M.vesting({...grant,CliffMonths:49},'2027-01-01'));
});
