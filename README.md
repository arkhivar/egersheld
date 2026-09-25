# Egersheld

A small space for big “what ifs”. **Ownership, funding and vesting planning** for
the fictional Vladivostok software company **SoftDV**, powered by Grist.

[Open the interactive demo](https://arkhivar.github.io/egersheld/) ·
[Open the Grist workspace](https://docs.getgrist.com/miCLuLcigwUw/egersheld/p/8)
(document access required)

## Five connected widgets

| Widget | Try it |
| --- | --- |
| [Overview](https://arkhivar.github.io/egersheld/overview.html) | Ownership donut, projected cash runway, employee pool and company milestones. |
| [Ownership](https://arkhivar.github.io/egersheld/ownership.html) | Switch issued/fully diluted views, search stakeholders, inspect a nonmodal detail panel, export CSV. |
| [Funding lab](https://arkhivar.github.io/egersheld/funding.html) | Move valuation, investment and option-reserve sliders; see dilution, pool top-ups and extra runway; save a named scenario. |
| [Vesting](https://arkhivar.github.io/egersheld/vesting.html) | Select a grant and explore dates with the month slider; jump to cliff or maturity; compare the team and export. |
| [Scenarios](https://arkhivar.github.io/egersheld/scenarios.html) | Compare up to three plans against the baseline, reopen assumptions, rename, delete or export. |

All six entry HTML files (including the gallery/home `index.html`) work without
a build. Direct browser access is a clearly labeled **synthetic demo**. Demo
scenarios persist only in that browser. Inside Grist, widgets read the document
and scenario writes persist in its `Scenarios` table. A failed Grist connection
is shown as an error, never replaced with demo numbers. Use the top-right refresh
button after changing baseline records or scenarios in another widget.

## SoftDV baseline

- 1,000,000 issued units: Pavel Orlov 480,000; Alina Kim 320,000; Pacific Angels 200,000.
- 120,000 reserved option units, including 80,000 allocated across four employee grants.
- ₽180m baseline pre-money valuation, ₽30m cash, ₽2.5m monthly net burn.
- Two initial financing scenarios and four company milestones.

Every company, person, address and financial amount is synthetic. Baseline records
are read-only in these widgets; edit their underlying Grist tables if needed.
The supplied document has six new tables: `Companies`, `Stakeholders`, `Holdings`,
`Grants`, `Scenarios`, `Milestones`. The original `Table1` is preserved.

## Model assumptions

This is a **planning prototype, not an authoritative ownership register**. It does
not implement Russian legal issuance, valuation certification, tax, accounting,
investor eligibility, approvals or regulatory filings.

- A single company and a single priced **primary equity round**, expressed in RUB.
- Fully diluted units = issued units + total reserved option pool. Granted options
  are allocated *inside* that pool, never added twice.
- The slider targets the **entire post-round pool** (granted + unallocated), not
  just hiring capacity. Top-ups happen before pricing, so existing holders bear
  that dilution. An existing reserve is never shrunk. Target range: 0–50%.
- New investor ownership = investment / (pre-money + investment). The model
  solves for the pre-money pool top-up, share price and resulting ownership.
  Fractional units are allowed for simulation; displayed figures are rounded.
- All units have equal economic weight. No SAFEs, convertibles, liquidation
  preferences, secondary sales, fees, taxes, exercise or share-class waterfalls.
- Monthly vesting uses completed calendar-month anniversaries, clamped to the
  final day in shorter months. Before the cliff nothing vests; the cliff catches
  up accrued months. Monthly amounts round down, with the balance at maturity.
  Cancelled/forfeited grants are excluded entirely; partial termination treatment
  is not implemented. Dates are date-only; “today” follows Asia/Vladivostok.
- Runway assumes constant current net burn and excludes future financing except
  where explicitly shown as hypothetical extra runway.
- Saved scenarios store assumptions, **not frozen historical cap tables**. They
  recalculate against the current baseline. They never issue shares or modify it.

See [PROJECT.md](PROJECT.md) for the schema and arithmetic.

## Local development

Node 22 or newer:

```sh
npm ci
npm test
npm start
```

Open `http://127.0.0.1:4173`. Dependencies are development-only (`jsdom`). Runtime
uses Grist’s official widget bridge plus classic scripts in a shared `E` namespace.
The reusable design patterns grow from [arkhivar/grist](https://github.com/arkhivar/grist).

The tests cover pure calculations, data normalization, writes/races/errors,
Grist setup, keyboard interactions, and full-page DOM integration. Browser layout
and slider interaction receive separate visual checks; jsdom cannot measure them.
GitHub Actions runs the suite on pushes and pull requests. GitHub Pages serves
`main` at the repository root. Change `E.VERSION` and all entry asset query keys
together for cache busting.

## Provisioning another authorized Grist document

The administrative scripts read `GRIST_API_KEY`, `GRIST_DOC_ID` and optionally
`GRIST_SERVER_URL` **from the process environment**. Never add a key to HTML,
JavaScript, a URL, this README, `.env` in git, or browser storage. The deployed
widgets need no API key; access is provided by Grist for the signed-in user.

```sh
node scripts/provision.cjs --inspect
node scripts/provision.cjs
node scripts/setup-widgets.cjs --inspect
node scripts/setup-widgets.cjs
```

Set the environment variables securely in your own terminal before these commands,
then unset the key. The default target is the owner's `egersheld` document.
Provisioning creates missing tables and seeds **only empty compatible tables**.
Setup creates five Companies-backed custom pages with full widget access, without
changing document sharing. Successful reruns preserve existing records/pages/options.
Ambiguous or interrupted setup stops for inspection rather than guessing or deleting.
An initial temporary service credential should be rotated after provisioning.

Manual widget setup also works: add a Custom widget on `Companies`, select one of
the five page URLs above, and grant Full access. No column mapping or Select By
filter is needed for this single-company prototype.
