# Prototype contract / v1.00

SoftDV is a fictional Vladivostok software company. All data is synthetic.
English UI, RUB money, date-only YYYY-MM-DD planning dates, no tax/legal claims.

## Grist tables (exact column IDs)

- Companies: Name Text, City Text, Currency Text, Founded Date, PreMoney Numeric,
  Cash Numeric, MonthlyBurn Numeric, PoolReserved Numeric, Description Text.
- Stakeholders: Company Ref:Companies, Name Text, Role Text (Founder/Investor/Employee),
  Title Text, Email Text (example.com only), Color Text.
- Holdings: Company Ref:Companies, Holder Ref:Stakeholders, Shares Numeric,
  ShareClass Text, Issued Date, Note Text.
- Grants: Company Ref:Companies, Holder Ref:Stakeholders, Units Numeric, Start Date,
  CliffMonths Int, DurationMonths Int, ExercisePrice Numeric, Status Text.
- Scenarios: Company Ref:Companies, Name Text, PreMoney Numeric, Investment Numeric,
  PoolPercent Numeric (0..100), Notes Text, CreatedAt DateTime:Asia/Vladivostok.
- Milestones: Company Ref:Companies, Date Date, Title Text, Detail Text, Kind Text.

Every fixture row uses a deterministic id. Only one company is in scope.
Grants are part of PoolReserved, never added twice to fully diluted ownership.
Baseline issued shares = 1,000,000: Pavel Orlov 480k, Alina Kim 320k, Pacific
Angels 200k. Option reserve = 120k; four employee grants total 80k. Pre-money
valuation 180m RUB; cash30m; burn2.5m/month. All simulated units may be fractional.

## Calculations

Round: pre-money price includes pre-financing pool top-up. Target pool means
TOTAL reserved pool (granted + available), as a percent of post-financing fully
diluted units, not unallocated reserve. f=investment/(preMoney+investment),
targetPool=poolPercent/100; requiredPool=targetPool*issued/(1-f-targetPool).
pool=max(existingPool,requiredPool); preFD=issued+pool;
price=preMoney/preFD; investorUnits=investment/price; postFD=preFD+investorUnits.
Reject nonfinite/negative values, zero pre-money, or f+targetPool>=1. No SAFE,
convertible, preference waterfall, tax, fractional issuance, or fee treatment.

Vesting: completed calendar months; anniversary dates clamp to month-end.
Nothing vests before cliff; cliff catches up completed months. Monthly vesting
floors units, with all units vested by end date. Exercise/issuance is not modeled.
Always use date-only arithmetic without user timezone drift.

## Product structure

Editorial financial workspace: white/off-white, deep ink text, electric blue
primary accent, muted teal/coral/lavender chart categories, fine gray borders,
compact sensible controls, generous chart whitespace. No gradients. Shared
left sidebar in standalone mode; compact module bar when embedded. Header
always identifies Demo or Grist connection. Sticky left sidebar; page scroll.

Overview: ownership donut, capital summary, runway, milestones, next actions.
Ownership: issued/fully diluted toggle, searchable stakeholder table, detail
panel, CSV export. Baseline holdings stay read-only for prototype.
Funding: sliders and numbers for valuation/raise/target pool; before/after chart,
stakeholder impact, clear assumptions, save a named scenario to Grist.
Vesting: employee grant selector, as-of date/slider, cliff/maturity curve, summary,
grant list and date-specific CSV export.
Scenarios: select saved scenarios, compare valuation/investment/founder dilution,
load scenario into funding via URL, rename/delete saved assumptions with undo
or confirmation if undo unsupported. Export comparison.
