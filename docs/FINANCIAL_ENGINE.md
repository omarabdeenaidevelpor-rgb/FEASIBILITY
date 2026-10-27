# Financial Engine (v1.0.0)
Location: `packages/financial-engine/src`. Pure, deterministic; decimal.js with 34 significant digits, ROUND_HALF_UP to 2 dp on output.

## Timeline
Year 0 = investment (capex, initial cash reserve, loan drawdown). Years 1..H = projections; operations start at `operationStartOffset + 1`.

## Formulas
- Units sold = min(demand_y, capacity × utilisation × (1 − waste)); demand_y = year1Volume × (1+g)^(k−1)
- COGS = produced units × unit variable cost (produced = sold / (1 − waste)), grown by cost growth; FX-linked × fxRate
- Net revenue = gross − discounts − returns; variable opex = % of net revenue
- Staff = count × monthly × months × (1 + insurance%)
- EBITDA = net revenue − COGS − fixed − variable − staff; EBIT = EBITDA − depreciation; EBT = EBIT − interest − fees
- Tax = max(0, EBT − carried losses (≤ N years)) × rate
- NWC = rev×AR days/365 + COGS×inv days/365 − COGS×AP days/365
- Project FCF_t = EBITDA − unlevered tax − capex − ΔNWC (+ terminal: book value + NWC + reserve in final year, optional)
- Equity CF_t = NI + dep − capex − ΔNWC − principal
- NPV = Σ CF_t/(1+r)^t ; IRR by bisection; null when no sign change/root
- Payback: linear interpolation on cumulative FCF; discounted payback on discounted FCF
- Break-even revenue = (fixed + staff + depreciation + interest) / CM ratio; units = same / CM per unit; cash BE excludes depreciation
- ROI = Σ NI (horizon)/total investment; DSCR = (EBITDA − tax)/(interest + principal)
- Annuity payment = P·r / (1 − (1+r)^−n) over (years − grace)
- Balance check = cash + NFA + NWC − debt − equity − retained earnings (≈0 every year; tested)

## Tests
`npm test` → 31 reference cases (hand-computed): NPV/IRR primitives, P&L, FCF, payback, break-even, ROI, margins,
balance sheet, tax & loss carry-forward, annuity & equal-principal with grace, loan ≠ revenue, DDB & salvage,
capacity/waste, discounts, working capital, precision (0.1+0.2), validation errors, negative CM, scenario immutability,
start delay, FX scaling, sensitivity ranking.
