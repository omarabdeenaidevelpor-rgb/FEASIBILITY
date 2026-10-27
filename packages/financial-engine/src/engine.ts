/**
 * FEASIBILITY AI — Independent Financial Engine
 * ------------------------------------------------
 * - Pure, deterministic, side-effect free.
 * - Uses decimal.js for all monetary arithmetic (no float drift).
 * - Internal precision: 34 significant digits. Output rounded to 2 dp (ROUND_HALF_UP).
 * - AI never computes or alters these numbers; it can only read them.
 *
 * Timeline convention:
 *   year 0      → initial investment (capex, initial cash reserve, loan drawdown)
 *   years 1..H  → projection years. Operations begin in year (offset + 1).
 */
import DecimalBase from 'decimal.js'
import type {
  StudyModel, EngineResult, YearRow, LoanScheduleRow, DepreciationRow, Metrics, Issue,
  ScenarioAdjustments, InvestmentItem
} from './types'
import { validateModel } from './validate'
import { DEFINITIONS } from './definitions'

export const ENGINE_VERSION = '1.0.0'

const Decimal = DecimalBase.clone({ precision: 34, rounding: DecimalBase.ROUND_HALF_UP })
type D = InstanceType<typeof Decimal>
const d = (v: number | string | D | undefined | null): D => new Decimal(v == null || (typeof v === 'number' && !isFinite(v)) ? 0 : v)
const ZERO = d(0)
const r2 = (v: D): number => v.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber()
const r4 = (v: D): number => v.toDecimalPlaces(4, Decimal.ROUND_HALF_UP).toNumber()
const pct = (v: number | undefined): D => d(v ?? 0).div(100)
const grow = (base: D, ratePct: number | undefined, periods: number): D =>
  periods <= 0 ? base : base.mul(d(1).plus(pct(ratePct)).pow(periods))

/* ------------------------------------------------------------------ */
/* Depreciation                                                         */
/* ------------------------------------------------------------------ */
function depreciationSchedule(item: InvestmentItem, cost: D, horizon: number, startYear: number) {
  const rows: { year: number; opening: D; dep: D; closing: D }[] = []
  const salvage = d(item.salvageValue ?? 0)
  const life = item.usefulLife || 0
  let book = cost
  for (let y = 1; y <= horizon; y++) {
    let dep = ZERO
    const age = y - startYear // 0-based year of depreciation
    if (life > 0 && age >= 0 && age < life && book.gt(salvage)) {
      if ((item.depMethod ?? 'straight_line') === 'straight_line') {
        dep = cost.minus(salvage).div(life)
      } else {
        // double declining balance, switch-to-salvage in final life year
        const rate = d(2).div(life)
        dep = age === life - 1 ? book.minus(salvage) : book.mul(rate)
        if (book.minus(dep).lt(salvage)) dep = book.minus(salvage)
      }
      if (dep.gt(book.minus(salvage))) dep = book.minus(salvage)
    }
    const opening = book
    book = book.minus(dep)
    rows.push({ year: y, opening, dep, closing: book })
  }
  return rows
}

/* ------------------------------------------------------------------ */
/* Loans                                                                */
/* ------------------------------------------------------------------ */
function loanSchedule(principal: D, ratePct: number, years: number, grace: number, method: 'annuity' | 'equal_principal', horizon: number) {
  const rows: { year: number; opening: D; interest: D; principal: D; closing: D }[] = []
  const r = pct(ratePct)
  const amortYears = Math.max(1, years - grace)
  let bal = principal
  let annuity = ZERO
  if (method === 'annuity') {
    annuity = r.isZero() ? principal.div(amortYears)
      : principal.mul(r).div(d(1).minus(d(1).plus(r).pow(-amortYears)))
  }
  for (let y = 1; y <= horizon; y++) {
    const opening = bal
    const interest = bal.mul(r)
    let prin = ZERO
    if (y > grace && y <= years && bal.gt(0)) {
      prin = method === 'annuity' ? annuity.minus(interest) : principal.div(amortYears)
      if (y === years || prin.gt(bal)) prin = bal
    }
    bal = bal.minus(prin)
    rows.push({ year: y, opening, interest: opening.gt(0) ? interest : ZERO, principal: prin, closing: bal })
  }
  return rows
}

/* ------------------------------------------------------------------ */
/* NPV / IRR helpers (exported for tests)                               */
/* ------------------------------------------------------------------ */
export function npv(ratePct: number, cashflows: number[]): number {
  const r = d(1).plus(pct(ratePct))
  return r2(cashflows.reduce((acc, cf, t) => acc.plus(d(cf).div(r.pow(t))), ZERO))
}

function npvFloat(rate: number, cfs: number[]): number {
  let s = 0
  for (let t = 0; t < cfs.length; t++) s += cfs[t] / Math.pow(1 + rate, t)
  return s
}

/** IRR in % or null when undefined (no sign change / no root in [-99%, 1000%]). */
export function irr(cashflows: number[]): number | null {
  const hasPos = cashflows.some(c => c > 0), hasNeg = cashflows.some(c => c < 0)
  if (!hasPos || !hasNeg) return null
  let lo = -0.99, hi = 10
  let flo = npvFloat(lo, cashflows), fhi = npvFloat(hi, cashflows)
  if (flo * fhi > 0) {
    // try to find a bracket by scanning
    let found = false
    for (let x = -0.95; x < 10; x += 0.05) {
      const fx = npvFloat(x, cashflows)
      if (flo * fx <= 0) { hi = x; fhi = fx; found = true; break }
    }
    if (!found) return null
  }
  for (let i = 0; i < 300; i++) {
    const mid = (lo + hi) / 2
    const fm = npvFloat(mid, cashflows)
    if (Math.abs(fm) < 1e-9 || (hi - lo) / 2 < 1e-12) return Math.round(mid * 1e8) / 1e6
    if (flo * fm < 0) { hi = mid; fhi = fm } else { lo = mid; flo = fm }
  }
  return Math.round(((lo + hi) / 2) * 1e8) / 1e6
}

function paybackFrom(cfs: D[]): number | null {
  let cum = ZERO
  for (let t = 0; t < cfs.length; t++) {
    const prev = cum
    cum = cum.plus(cfs[t])
    if (t > 0 && prev.lt(0) && cum.gte(0)) {
      const frac = prev.abs().div(cfs[t])
      return r4(d(t - 1).plus(frac))
    }
  }
  return cum.gte(0) && cfs.length && cfs[0].gte(0) ? 0 : null
}

/* ------------------------------------------------------------------ */
/* Scenario application                                                 */
/* ------------------------------------------------------------------ */
export function applyScenario(model: StudyModel, adj: ScenarioAdjustments = {}): StudyModel {
  const m: StudyModel = JSON.parse(JSON.stringify(model))
  const f = (p?: number) => 1 + (p ?? 0) / 100
  m.revenue = m.revenue.map(r => ({
    ...r,
    year1Volume: r.year1Volume * f(adj.volumePct),
    price: r.price * f(adj.pricePct),
    unitVariableCost: r.unitVariableCost * f(adj.variableCostPct),
    utilizationPct: adj.utilizationPct != null ? Math.min(100, (r.utilizationPct ?? 100) * f(adj.utilizationPct)) : r.utilizationPct
  }))
  m.opex = m.opex.map(o => o.costType === 'fixed' ? { ...o, amount: (o.amount ?? 0) * f(adj.fixedCostPct) }
    : { ...o, pctOfRevenue: (o.pctOfRevenue ?? 0) * f(adj.variableCostPct) })
  m.staff = m.staff.map(s => ({ ...s, monthlySalary: s.monthlySalary * f(adj.salaryPct) }))
  m.investment = m.investment.map(i => ({ ...i, amount: i.amount * f(adj.capexPct) }))
  m.loans = m.loans.map(l => ({ ...l, annualRatePct: Math.max(0, l.annualRatePct + (adj.interestRateDeltaPts ?? 0)) }))
  m.assumptions.discountRatePct = m.assumptions.discountRatePct + (adj.discountRateDeltaPts ?? 0)
  m.assumptions.fxRate = (m.assumptions.fxRate ?? 1) * f(adj.fxPct)
  m.assumptions.operationStartOffset = (m.assumptions.operationStartOffset ?? 0) + (adj.startDelayYears ?? 0)
  if (adj.horizonYears) m.assumptions.horizonYears = adj.horizonYears
  return m
}

/* ------------------------------------------------------------------ */
/* Main compute                                                         */
/* ------------------------------------------------------------------ */
export function compute(model: StudyModel): EngineResult {
  const issues: Issue[] = validateModel(model)
  const base: EngineResult = {
    engineVersion: ENGINE_VERSION, currency: model?.currency ?? 'EGP', computable: false,
    issues, metrics: null, years: [], loanSchedule: [], depreciation: [], definitions: DEFINITIONS
  }
  if (issues.some(i => i.severity === 'error')) return base

  const A = model.assumptions
  const H = Math.round(A.horizonYears)
  const offset = Math.max(0, Math.round(A.operationStartOffset ?? 0))
  const fx = d(A.fxRate ?? 1)
  const taxRate = pct(A.incomeTaxPct)
  const lcfYears = A.lossCarryForwardYears ?? 5
  const includeTV = A.includeTerminalValue !== false
  const amt = (v: number, fxLinked?: boolean) => fxLinked ? d(v).mul(fx) : d(v)

  /* ---- Capex by year + depreciation ---- */
  const capexByYear: D[] = Array.from({ length: H + 1 }, () => ZERO)
  const depByYear: D[] = Array.from({ length: H + 1 }, () => ZERO)
  const nfaByYear: D[] = Array.from({ length: H + 1 }, () => ZERO)
  const depRows: DepreciationRow[] = []
  for (const it of model.investment) {
    const spendYear = Math.min(H, Math.max(0, Math.round(it.year ?? 0)))
    const cost = amt(it.amount, it.fxLinked)
    capexByYear[spendYear] = capexByYear[spendYear].plus(cost)
    const depStart = Math.max(spendYear + 1, offset + 1)
    const sched = depreciationSchedule(it, cost, H, depStart)
    nfaByYear[0] = nfaByYear[0].plus(spendYear === 0 ? cost : ZERO)
    for (const row of sched) {
      depByYear[row.year] = depByYear[row.year].plus(row.dep)
      // book value only counts once the asset has been bought
      nfaByYear[row.year] = nfaByYear[row.year].plus(row.year >= spendYear ? row.closing : ZERO)
      if (row.dep.gt(0)) depRows.push({ asset: it.name, year: row.year, opening: r2(row.opening), depreciation: r2(row.dep), closing: r2(row.closing) })
    }
  }

  /* ---- Loans ---- */
  const interestByYear: D[] = Array.from({ length: H + 1 }, () => ZERO)
  const principalByYear: D[] = Array.from({ length: H + 1 }, () => ZERO)
  const debtByYear: D[] = Array.from({ length: H + 1 }, () => ZERO)
  const feesByYear: D[] = Array.from({ length: H + 1 }, () => ZERO)
  const loanRows: LoanScheduleRow[] = []
  let totalLoans = ZERO
  for (const ln of model.loans) {
    const P = d(ln.principal)
    totalLoans = totalLoans.plus(P)
    debtByYear[0] = debtByYear[0].plus(P)
    if (H >= 1) feesByYear[1] = feesByYear[1].plus(P.mul(pct(ln.feesPct)))
    const sched = loanSchedule(P, ln.annualRatePct, Math.round(ln.years), Math.round(ln.graceYears ?? 0), ln.method ?? 'annuity', H)
    for (const row of sched) {
      interestByYear[row.year] = interestByYear[row.year].plus(row.interest)
      principalByYear[row.year] = principalByYear[row.year].plus(row.principal)
      debtByYear[row.year] = debtByYear[row.year].plus(row.closing)
      loanRows.push({ loan: ln.name, year: row.year, openingBalance: r2(row.opening), interest: r2(row.interest), principal: r2(row.principal), payment: r2(row.interest.plus(row.principal)), closingBalance: r2(row.closing) })
    }
  }

  /* ---- Operating projections ---- */
  type Op = { units: D; gross: D; disc: D; net: D; cogs: D; fixed: D; variable: D; staff: D; capUnits: D }
  const ops: Op[] = []
  for (let y = 0; y <= H; y++) {
    const k = y - offset // operating year (1-based)
    const o: Op = { units: ZERO, gross: ZERO, disc: ZERO, net: ZERO, cogs: ZERO, fixed: ZERO, variable: ZERO, staff: ZERO, capUnits: ZERO }
    if (y >= 1 && k >= 1) {
      for (const r of model.revenue) {
        const demand = grow(d(r.year1Volume), r.growthPct, k - 1)
        const waste = pct(r.wastePct)
        let sold = demand
        if (r.capacity && r.capacity > 0) {
          const maxSell = d(r.capacity).mul(pct(r.utilizationPct ?? 100)).mul(d(1).minus(waste))
          o.capUnits = o.capUnits.plus(maxSell)
          if (sold.gt(maxSell)) sold = maxSell
        }
        const produced = waste.lt(1) ? sold.div(d(1).minus(waste)) : sold
        const price = grow(d(r.price), A.priceGrowthPct, k - 1)
        const unitCost = grow(amt(r.unitVariableCost, r.fxLinkedCost), A.costGrowthPct, k - 1)
        const gross = sold.mul(price)
        const disc = gross.mul(pct(r.discountPct).plus(pct(r.returnsPct)))
        o.units = o.units.plus(sold)
        o.gross = o.gross.plus(gross)
        o.disc = o.disc.plus(disc)
        o.cogs = o.cogs.plus(produced.mul(unitCost))
      }
      o.net = o.gross.minus(o.disc)
      for (const x of model.opex) {
        if (x.costType === 'fixed') o.fixed = o.fixed.plus(grow(amt(x.amount ?? 0, x.fxLinked), x.growthPct ?? A.costGrowthPct, k - 1))
        else o.variable = o.variable.plus(o.net.mul(pct(x.pctOfRevenue)))
      }
      for (const s of model.staff) {
        const annual = d(s.count).mul(s.monthlySalary).mul(s.monthsPerYear ?? 12).mul(d(1).plus(pct(s.insurancePct)))
        o.staff = o.staff.plus(grow(annual, s.growthPct ?? A.salaryGrowthPct, k - 1))
      }
    }
    ops.push(o)
  }

  /* ---- Initial cash reserve & investment totals ---- */
  const firstOp = ops[Math.min(H, offset + 1)]
  const yr1CashCosts = firstOp.cogs.plus(firstOp.fixed).plus(firstOp.variable).plus(firstOp.staff)
  const reserve = yr1CashCosts.div(12).mul(A.cashReserveMonths ?? 0)
  const totalCapex = capexByYear.reduce((a, b) => a.plus(b), ZERO)
  const totalInvestment = totalCapex.plus(reserve)
  const initialNeed = capexByYear[0].plus(reserve)
  const equity = A.equity != null ? d(A.equity) : Decimal.max(ZERO, totalInvestment.minus(totalLoans))
  const fundingGap = totalInvestment.minus(equity).minus(totalLoans)
  if (fundingGap.gt(0.005)) issues.push({ code: 'FUNDING_GAP', severity: 'warning', message_ar: `يوجد عجز تمويلي قدره ${r2(fundingGap)} — مصادر التمويل أقل من إجمالي الاستثمار.`, message_en: `Funding gap of ${r2(fundingGap)}: sources are below total investment.` })

  /* ---- Year loop ---- */
  const years: YearRow[] = []
  const recvDays = d(A.receivableDays ?? 0), invDays = d(A.inventoryDays ?? 0), payDays = d(A.payableDays ?? 0)
  let prevNWC = ZERO
  let lossPool: { year: number; amt: D }[] = []
  let lossPoolU: { year: number; amt: D }[] = []
  let cash = equity.plus(totalLoans).minus(capexByYear[0])
  let retained = ZERO
  let cum = ZERO, cumDisc = ZERO
  const disc = d(1).plus(pct(A.discountRatePct))
  const projectCFs: D[] = [], equityCFs: D[] = []

  const applyLosses = (pool: { year: number; amt: D }[], y: number, ebt: D): { taxable: D; pool: { year: number; amt: D }[] } => {
    pool = pool.filter(p => y - p.year <= lcfYears && p.amt.gt(0))
    if (ebt.lte(0)) { if (ebt.lt(0)) pool.push({ year: y, amt: ebt.abs() }); return { taxable: ZERO, pool } }
    let taxable = ebt
    for (const p of pool) { if (taxable.lte(0)) break; const use = Decimal.min(p.amt, taxable); p.amt = p.amt.minus(use); taxable = taxable.minus(use) }
    return { taxable, pool }
  }

  for (let y = 0; y <= H; y++) {
    const o = ops[y]
    const grossProfit = o.net.minus(o.cogs)
    const ebitda = grossProfit.minus(o.fixed).minus(o.variable).minus(o.staff)
    const dep = depByYear[y]
    const ebit = ebitda.minus(dep)
    const interest = interestByYear[y]
    const fees = feesByYear[y]
    const ebt = ebit.minus(interest).minus(fees)
    let tax = ZERO, taxU = ZERO
    if (y >= 1) {
      const lv = applyLosses(lossPool, y, ebt); lossPool = lv.pool; tax = lv.taxable.mul(taxRate)
      const un = applyLosses(lossPoolU, y, ebit); lossPoolU = un.pool; taxU = un.taxable.mul(taxRate)
    }
    const netIncome = ebt.minus(tax)
    const nwc = y === 0 ? ZERO : o.net.mul(recvDays).div(365).plus(o.cogs.mul(invDays).div(365)).minus(o.cogs.mul(payDays).div(365))
    const dNWC = nwc.minus(prevNWC)
    prevNWC = nwc
    const capex = capexByYear[y]
    const principal = principalByYear[y]
    const drawdown = y === 0 ? totalLoans : ZERO
    const isLast = y === H
    const terminal = isLast && includeTV ? nfaByYear[H].plus(nwc).plus(reserve) : ZERO

    // Unlevered project FCF
    let pcf = y === 0 ? capex.neg().minus(reserve) : ebitda.minus(taxU).minus(capex).minus(dNWC)
    pcf = pcf.plus(terminal)
    // Equity FCF
    let ecf = y === 0 ? capex.neg().minus(reserve).plus(drawdown) : netIncome.plus(dep).minus(capex).minus(dNWC).minus(principal)
    if (isLast && includeTV) ecf = ecf.plus(nfaByYear[H]).plus(nwc).plus(reserve).minus(debtByYear[H])

    projectCFs.push(pcf); equityCFs.push(ecf)
    cum = cum.plus(pcf)
    const dcf = pcf.div(disc.pow(y))
    cumDisc = cumDisc.plus(dcf)

    // Balance sheet
    if (y >= 1) { cash = cash.plus(netIncome).plus(dep).minus(dNWC).minus(capex).minus(principal); retained = retained.plus(netIncome) }
    const nfa = nfaByYear[y]
    const totalAssets = cash.plus(nfa).plus(nwc)
    const balanceCheck = totalAssets.minus(debtByYear[y]).minus(equity).minus(retained)
    const debtService = interest.plus(principal)
    const dscr = debtService.gt(0) && y >= 1 ? r4(ebitda.minus(tax).div(debtService)) : null

    years.push({
      year: y, operatingYear: Math.max(0, y - offset), units: r2(o.units), grossSales: r2(o.gross), discountsReturns: r2(o.disc),
      netRevenue: r2(o.net), cogs: r2(o.cogs), grossProfit: r2(grossProfit), fixedOpex: r2(o.fixed), variableOpex: r2(o.variable),
      staffCost: r2(o.staff), ebitda: r2(ebitda), depreciation: r2(dep), ebit: r2(ebit), interest: r2(interest), financeFees: r2(fees),
      ebt: r2(ebt), tax: r2(tax), netIncome: r2(netIncome), netWorkingCapital: r2(nwc), changeInNWC: r2(dNWC), capex: r2(capex),
      loanDrawdown: r2(drawdown), principalRepayment: r2(principal), debtService: r2(debtService), projectCashFlow: r2(pcf),
      equityCashFlow: r2(ecf), cumulativeProjectCashFlow: r2(cum), discountedProjectCashFlow: r2(dcf),
      cumulativeDiscountedCashFlow: r2(cumDisc), dscr, cash: r2(cash), netFixedAssets: r2(nfa), totalAssets: r2(totalAssets),
      debtOutstanding: r2(debtByYear[y]), equityBook: r2(equity.plus(retained)), retainedEarnings: r2(retained), balanceCheck: r2(balanceCheck)
    })
    if (y >= 1 && cash.lt(-0.005)) {
      if (!issues.some(i => i.code === 'NEGATIVE_CASH')) issues.push({ code: 'NEGATIVE_CASH', severity: 'warning', message_ar: `الرصيد النقدي يصبح سالبًا في السنة ${y} — يلزم تمويل إضافي أو مراجعة الافتراضات.`, message_en: `Cash balance turns negative in year ${y}; additional funding needed.` })
    }
  }

  /* ---- Metrics ---- */
  const opYears = years.filter(y => y.year >= 1 && y.operatingYear >= 1)
  const fy = ops[Math.min(H, offset + 1)]
  const fyRow = years[Math.min(H, offset + 1)]
  const sumNI = years.reduce((a, y) => a.plus(y.netIncome), ZERO)
  const net1 = fy.net
  const ratio = (num: D, den: D) => den.gt(0) ? r4(num.div(den).mul(100)) : null
  const cm = fy.net.minus(fy.cogs).minus(fy.variable)
  const cmRatio = net1.gt(0) ? cm.div(net1) : ZERO
  const fixedAcc = fy.fixed.plus(fy.staff).plus(depByYear[Math.min(H, offset + 1)]).plus(interestByYear[Math.min(H, offset + 1)])
  const fixedCash = fy.fixed.plus(fy.staff).plus(interestByYear[Math.min(H, offset + 1)])
  const cmPerUnit = fy.units.gt(0) ? cm.div(fy.units) : ZERO
  const beUnits = cmPerUnit.gt(0) ? fixedAcc.div(cmPerUnit) : null
  const npvVal = projectCFs.reduce((a, cf, t) => a.plus(cf.div(disc.pow(t))), ZERO)
  const discCFs = projectCFs.map((cf, t) => cf.div(disc.pow(t)))
  const dsc = years.map(y => y.dscr).filter((v): v is number => v != null)
  const pvFuture = discCFs.slice(1).reduce((a, b) => a.plus(b), ZERO)
  const inv0 = projectCFs[0].abs()

  const metrics: Metrics = {
    totalInvestment: r2(totalInvestment), capex: r2(totalCapex), initialCashReserve: r2(reserve), totalLoans: r2(totalLoans),
    equity: r2(equity), fundingGap: r2(Decimal.max(ZERO, fundingGap)),
    year1Revenue: fyRow ? fyRow.netRevenue : 0, year1NetIncome: fyRow ? fyRow.netIncome : 0, totalNetIncome: r2(sumNI),
    grossMarginPct: ratio(fy.net.minus(fy.cogs), net1),
    operatingMarginPct: ratio(d(fyRow?.ebit ?? 0), net1),
    netMarginPct: ratio(d(fyRow?.netIncome ?? 0), net1),
    ebitdaMarginPct: ratio(d(fyRow?.ebitda ?? 0), net1),
    npv: r2(npvVal),
    irrPct: irr(projectCFs.map(c => c.toNumber())),
    equityIrrPct: irr(equityCFs.map(c => c.toNumber())),
    roiPct: totalInvestment.gt(0) ? r4(sumNI.div(totalInvestment).mul(100)) : null,
    avgAnnualRoiPct: totalInvestment.gt(0) && opYears.length ? r4(sumNI.div(totalInvestment).mul(100).div(opYears.length)) : null,
    paybackYears: paybackFrom(projectCFs),
    discountedPaybackYears: paybackFrom(discCFs),
    breakEvenRevenue: cmRatio.gt(0) ? r2(fixedAcc.div(cmRatio)) : null,
    breakEvenUnits: beUnits ? r2(beUnits) : null,
    cashBreakEvenRevenue: cmRatio.gt(0) ? r2(fixedCash.div(cmRatio)) : null,
    breakEvenUtilizationPct: beUnits && fy.capUnits.gt(0) ? r4(beUnits.div(fy.capUnits).mul(100)) : null,
    contributionMarginRatioPct: net1.gt(0) ? r4(cmRatio.mul(100)) : null,
    minDscr: dsc.length ? Math.min(...dsc) : null,
    avgDscr: dsc.length ? r4(dsc.reduce((a, b) => a.plus(b), ZERO).div(dsc.length)) : null,
    profitabilityIndex: inv0.gt(0) ? r4(pvFuture.div(inv0)) : null
  }
  if (cmRatio.lte(0) && net1.gt(0)) issues.push({ code: 'NEGATIVE_CM', severity: 'warning', message_ar: 'هامش المساهمة سالب أو صفر — سعر البيع لا يغطي التكلفة المتغيرة، ولا توجد نقطة تعادل.', message_en: 'Contribution margin ≤ 0: no break-even point exists.' })
  if (metrics.irrPct == null) issues.push({ code: 'IRR_UNDEFINED', severity: 'info', message_ar: 'تعذر حساب IRR لعدم وجود تغير في إشارة التدفقات النقدية أو عدم وجود جذر.', message_en: 'IRR undefined (no sign change / no root).' })
  if (metrics.paybackYears == null) issues.push({ code: 'NO_PAYBACK', severity: 'info', message_ar: 'لا يسترد المشروع استثماراته خلال أفق الدراسة.', message_en: 'Investment is not recovered within the horizon.' })
  void initialNeed

  return { ...base, issues, computable: true, metrics, years, loanSchedule: loanRows, depreciation: depRows }
}

/* ------------------------------------------------------------------ */
/* Sensitivity analysis                                                 */
/* ------------------------------------------------------------------ */
export const SENSITIVITY_VARS: { key: keyof ScenarioAdjustments; ar: string; en: string }[] = [
  { key: 'volumePct', ar: 'حجم المبيعات', en: 'Sales volume' },
  { key: 'pricePct', ar: 'سعر البيع', en: 'Selling price' },
  { key: 'variableCostPct', ar: 'تكلفة الخامات/المتغيرة', en: 'Variable cost' },
  { key: 'fixedCostPct', ar: 'النفقات الثابتة', en: 'Fixed costs' },
  { key: 'salaryPct', ar: 'الرواتب', en: 'Salaries' },
  { key: 'capexPct', ar: 'التكاليف الاستثمارية', en: 'Capex' }
]

export function sensitivity(model: StudyModel, steps: number[] = [-20, -10, 10, 20]) {
  const baseRes = compute(model)
  if (!baseRes.computable || !baseRes.metrics) return { computable: false, base: null, rows: [] as any[] }
  const rows = SENSITIVITY_VARS.map(v => {
    const points = steps.map(s => {
      const r = compute(applyScenario(model, { [v.key]: s } as ScenarioAdjustments))
      return { change: s, npv: r.metrics?.npv ?? null, irrPct: r.metrics?.irrPct ?? null, paybackYears: r.metrics?.paybackYears ?? null, netIncomeTotal: r.metrics?.totalNetIncome ?? null }
    })
    const npvs = points.map(p => p.npv ?? 0)
    return { key: v.key, ar: v.ar, en: v.en, points, swing: Math.max(...npvs) - Math.min(...npvs) }
  }).sort((a, b) => b.swing - a.swing)
  return { computable: true, base: { npv: baseRes.metrics.npv, irrPct: baseRes.metrics.irrPct, paybackYears: baseRes.metrics.paybackYears }, rows }
}
