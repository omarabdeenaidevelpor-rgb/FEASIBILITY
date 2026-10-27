/**
 * Reference tests for the financial engine.
 * Expected values were computed by hand (shown in comments) and cross-checked with
 * standard spreadsheet formulas (NPV/IRR/PMT).
 */
import { describe, it, expect } from 'vitest'
import { compute, npv, irr, applyScenario, sensitivity } from '../../packages/financial-engine/src'
import type { StudyModel } from '../../packages/financial-engine/src'

const baseModel = (): StudyModel => ({
  currency: 'EGP',
  investment: [{ name: 'Machine', category: 'equipment', amount: 100000, usefulLife: 5 }],
  revenue: [{ name: 'Product', price: 100, unitVariableCost: 40, year1Volume: 2000 }],
  opex: [{ name: 'Rent', costType: 'fixed', amount: 30000 }],
  staff: [],
  loans: [],
  assumptions: { horizonYears: 5, discountRatePct: 10, incomeTaxPct: 0 }
})

describe('NPV / IRR primitives', () => {
  it('NPV matches hand calculation', () => {
    // -1000 + 500/1.1 + 500/1.21 + 500/1.331 = 243.4260...
    expect(npv(10, [-1000, 500, 500, 500])).toBeCloseTo(243.43, 2)
  })
  it('IRR of simple flows', () => {
    expect(irr([-1000, 1100])).toBeCloseTo(10, 4)
    expect(irr([-100, 0, 121])).toBeCloseTo(10, 4)
  })
  it('IRR undefined without sign change', () => {
    expect(irr([100, 100])).toBeNull()
    expect(irr([-100, -5])).toBeNull()
  })
})

describe('Core P&L and cash flow (no tax, no debt)', () => {
  const r = compute(baseModel())
  it('is computable', () => { expect(r.computable).toBe(true) })
  it('year-1 income statement', () => {
    const y1 = r.years[1]
    expect(y1.netRevenue).toBe(200000)
    expect(y1.cogs).toBe(80000)
    expect(y1.grossProfit).toBe(120000)
    expect(y1.ebitda).toBe(90000)
    expect(y1.depreciation).toBe(20000)
    expect(y1.ebit).toBe(70000)
    expect(y1.netIncome).toBe(70000)
  })
  it('project cash flows', () => {
    expect(r.years[0].projectCashFlow).toBe(-100000)
    for (let y = 1; y <= 5; y++) expect(r.years[y].projectCashFlow).toBe(90000)
  })
  it('NPV = -100000 + 90000 × 3.790786769 = 241170.81', () => {
    expect(r.metrics!.npv).toBeCloseTo(241170.81, 1)
  })
  it('IRR satisfies NPV(IRR) ≈ 0', () => {
    const i = r.metrics!.irrPct!
    expect(Math.abs(npv(i, [-100000, 90000, 90000, 90000, 90000, 90000]))).toBeLessThan(1)
  })
  it('payback = 1 + 10000/90000 = 1.1111', () => { expect(r.metrics!.paybackYears).toBeCloseTo(1.1111, 4) })
  it('break-even: fixed 50000 / CM ratio 0.6 = 83333.33 ; units = 50000/60 = 833.33', () => {
    expect(r.metrics!.breakEvenRevenue).toBeCloseTo(83333.33, 2)
    expect(r.metrics!.breakEvenUnits).toBeCloseTo(833.33, 2)
    expect(r.metrics!.cashBreakEvenRevenue).toBeCloseTo(50000, 2)
  })
  it('ROI over horizon = 350000/100000 = 350%', () => { expect(r.metrics!.roiPct).toBe(350) })
  it('margins', () => {
    expect(r.metrics!.grossMarginPct).toBe(60)
    expect(r.metrics!.operatingMarginPct).toBe(35)
  })
  it('balance sheet balances every year', () => {
    for (const y of r.years) expect(Math.abs(y.balanceCheck)).toBeLessThan(0.02)
  })
})

describe('Taxes and loss carry-forward', () => {
  it('22.5% income tax', () => {
    const m = baseModel(); m.assumptions.incomeTaxPct = 22.5
    const r = compute(m)
    expect(r.years[1].tax).toBe(15750)
    expect(r.years[1].netIncome).toBe(54250)
    expect(r.years[1].projectCashFlow).toBe(74250)
  })
  it('losses carried forward reduce later taxable income', () => {
    const m = baseModel()
    m.assumptions.incomeTaxPct = 20
    m.revenue[0].year1Volume = 1000           // yr1: rev 100000, cogs 40000, fixed 30000, dep 20000 → EBT 10000
    m.revenue[0].growthPct = 0
    m.opex[0].amount = 50000                  // EBT = 100000-40000-50000-20000 = -10000
    m.opex.push({ name: 'promo', costType: 'fixed', amount: 0 })
    const r1 = compute(m)
    expect(r1.years[1].ebt).toBe(-10000)
    expect(r1.years[1].tax).toBe(0)
    // year 2 with growth: set volume growth so yr2 EBT = +30000 → need +40000 extra CM → 40000/60 = 666.67 units
    m.revenue[0].growthPct = 66.6666666666667
    const r2 = compute(m)
    expect(r2.years[2].ebt).toBeCloseTo(30000, 0)
    expect(r2.years[2].tax).toBeCloseTo(4000, 0) // (30000 − 10000) × 20%
  })
})

describe('Loans', () => {
  it('annuity schedule: 100000 @10% 5y → PMT 26379.75', () => {
    const m = baseModel(); m.loans = [{ name: 'Bank', principal: 100000, annualRatePct: 10, years: 5 }]
    const r = compute(m)
    const y1 = r.loanSchedule.find(l => l.year === 1)!
    expect(y1.payment).toBeCloseTo(26379.75, 2)
    expect(y1.interest).toBe(10000)
    expect(y1.principal).toBeCloseTo(16379.75, 2)
    expect(r.loanSchedule.find(l => l.year === 5)!.closingBalance).toBe(0)
    expect(r.metrics!.minDscr).not.toBeNull()
    for (const y of r.years) expect(Math.abs(y.balanceCheck)).toBeLessThan(0.02)
  })
  it('equal principal with 1 grace year', () => {
    const m = baseModel(); m.loans = [{ name: 'L', principal: 100000, annualRatePct: 10, years: 3, graceYears: 1, method: 'equal_principal' }]
    const r = compute(m)
    const s = r.loanSchedule
    expect(s[0]).toMatchObject({ year: 1, interest: 10000, principal: 0 })
    expect(s[1]).toMatchObject({ year: 2, interest: 10000, principal: 50000 })
    expect(s[2]).toMatchObject({ year: 3, interest: 5000, principal: 50000, closingBalance: 0 })
  })
  it('a loan is NOT revenue', () => {
    const m = baseModel(); m.loans = [{ name: 'L', principal: 50000, annualRatePct: 0, years: 2 }]
    const r = compute(m)
    expect(r.years[1].netRevenue).toBe(200000)
    expect(r.years[0].netRevenue).toBe(0)
  })
})

describe('Depreciation', () => {
  it('double-declining balance 10000 over 4 years', () => {
    const m = baseModel(); m.investment = [{ name: 'PC', category: 'technology', amount: 10000, usefulLife: 4, depMethod: 'declining_balance' }]
    const r = compute(m)
    expect(r.depreciation.map(d => d.depreciation)).toEqual([5000, 2500, 1250, 1250])
  })
  it('land not depreciated, salvage respected', () => {
    const m = baseModel(); m.investment = [
      { name: 'Land', category: 'land', amount: 50000, usefulLife: 0 },
      { name: 'Truck', category: 'vehicles', amount: 60000, usefulLife: 5, salvageValue: 10000 }]
    const r = compute(m)
    expect(r.years[1].depreciation).toBe(10000)
  })
})

describe('Capacity, waste, discounts, working capital', () => {
  it('sales capped by capacity × utilisation × (1 − waste)', () => {
    const m = baseModel(); m.revenue[0] = { name: 'P', price: 100, unitVariableCost: 40, year1Volume: 5000, capacity: 4000, utilizationPct: 75, wastePct: 10 }
    const r = compute(m)
    // max sell = 4000 × 0.75 × 0.9 = 2700 ; produced = 3000 ; cogs = 120000
    expect(r.years[1].units).toBe(2700)
    expect(r.years[1].cogs).toBe(120000)
  })
  it('discounts reduce net revenue', () => {
    const m = baseModel(); m.revenue[0].discountPct = 5
    expect(compute(m).years[1].netRevenue).toBe(190000)
  })
  it('working capital: 30 receivable days', () => {
    const m = baseModel(); m.assumptions.receivableDays = 36.5
    const r = compute(m)
    expect(r.years[1].netWorkingCapital).toBe(20000) // 200000 × 36.5/365
    expect(r.years[1].projectCashFlow).toBe(70000)
  })
})

describe('Precision', () => {
  it('no floating point drift: 0.1 + 0.2 pricing', () => {
    const m = baseModel(); m.revenue[0] = { name: 'x', price: 0.1, unitVariableCost: 0, year1Volume: 3 }
    m.revenue.push({ name: 'y', price: 0.2, unitVariableCost: 0, year1Volume: 3 })
    expect(compute(m).years[1].netRevenue).toBe(0.9)
  })
})

describe('Validation', () => {
  it('rejects missing revenue', () => {
    const m = baseModel(); m.revenue = []
    const r = compute(m)
    expect(r.computable).toBe(false)
    expect(r.issues.some(i => i.code === 'NO_REVENUE')).toBe(true)
  })
  it('rejects negative price and invalid tax', () => {
    const m = baseModel(); m.revenue[0].price = -1; m.assumptions.incomeTaxPct = 150
    const r = compute(m)
    expect(r.computable).toBe(false)
    expect(r.issues.filter(i => i.severity === 'error').length).toBeGreaterThanOrEqual(2)
  })
  it('flags negative contribution margin', () => {
    const m = baseModel(); m.revenue[0].unitVariableCost = 120
    const r = compute(m)
    expect(r.metrics!.breakEvenRevenue).toBeNull()
    expect(r.issues.some(i => i.code === 'NEGATIVE_CM')).toBe(true)
  })
})

describe('Scenarios & sensitivity', () => {
  it('pessimistic scenario does not mutate base model', () => {
    const m = baseModel()
    const p = applyScenario(m, { volumePct: -20, pricePct: -10 })
    expect(m.revenue[0].year1Volume).toBe(2000)
    expect(p.revenue[0].year1Volume).toBe(1600)
    expect(compute(p).metrics!.npv).toBeLessThan(compute(m).metrics!.npv)
  })
  it('start delay shifts operations', () => {
    const r = compute(applyScenario(baseModel(), { startDelayYears: 1 }))
    expect(r.years[1].netRevenue).toBe(0)
    expect(r.years[2].netRevenue).toBe(200000)
  })
  it('FX-linked costs scale with exchange rate', () => {
    const m = baseModel(); m.revenue[0].fxLinkedCost = true; m.revenue[0].unitVariableCost = 1; m.assumptions.fxRate = 50
    expect(compute(m).years[1].cogs).toBe(100000)
    expect(compute(applyScenario(m, { fxPct: 10 })).years[1].cogs).toBe(110000)
  })
  it('sensitivity ranks variables', () => {
    const s = sensitivity(baseModel())
    expect(s.computable).toBe(true)
    expect(s.rows[0].key).toBe('pricePct') // price has the largest NPV swing here
  })
})
