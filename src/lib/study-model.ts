/**
 * Converts the wizard's working inputs (inputs_json) into the engine's StudyModel,
 * computes completion %, and lists missing data. Single source of truth for this logic (server-side only).
 */
import type { StudyModel, ScenarioAdjustments } from '../../packages/financial-engine/src'

export const STEPS = [
  { n: 1, key: 'info', ar: 'معلومات المشروع', en: 'Project info' },
  { n: 2, key: 'idea', ar: 'الفكرة والمنتجات والخدمات', en: 'Idea & products' },
  { n: 3, key: 'market', ar: 'السوق والعملاء المستهدفون', en: 'Market & customers' },
  { n: 4, key: 'location', ar: 'الموقع والطاقة التشغيلية', en: 'Location & capacity' },
  { n: 5, key: 'investment', ar: 'التكاليف الاستثمارية', en: 'Investment costs' },
  { n: 6, key: 'opex', ar: 'تكاليف التشغيل', en: 'Operating costs' },
  { n: 7, key: 'revenue', ar: 'المبيعات والأسعار والإيرادات', en: 'Sales & revenue' },
  { n: 8, key: 'funding', ar: 'التمويل والقروض', en: 'Funding & loans' },
  { n: 9, key: 'tax', ar: 'الضرائب والإهلاك ورأس المال العامل', en: 'Tax, depreciation, WC' },
  { n: 10, key: 'macro', ar: 'النمو والتضخم وسعر الصرف', en: 'Growth, inflation, FX' },
  { n: 11, key: 'scenarios', ar: 'السيناريوهات', en: 'Scenarios' },
  { n: 12, key: 'review', ar: 'مراجعة البيانات', en: 'Review' },
  { n: 13, key: 'generate', ar: 'توليد الدراسة والتقرير', en: 'Generate' }
] as const

const n = (v: any): number | undefined => {
  if (v === '' || v == null) return undefined
  const x = typeof v === 'number' ? v : Number(String(v).replace(/,/g, ''))
  return isFinite(x) ? x : undefined
}

export function buildModel(inputs: any, currency: string): StudyModel {
  const I = inputs || {}
  const tax = I.tax || {}, macro = I.macro || {}, funding = I.funding || {}
  return {
    currency,
    investment: (I.investment || []).filter((x: any) => x && x.name).map((x: any) => ({
      name: String(x.name), category: x.category || 'other', amount: n(x.amount) ?? NaN, usefulLife: n(x.usefulLife) ?? 0,
      salvageValue: n(x.salvageValue), depMethod: x.depMethod === 'declining_balance' ? 'declining_balance' : 'straight_line',
      fxLinked: !!x.fxLinked, year: n(x.year) ?? 0, classification: x.classification
    })),
    revenue: (I.revenue || []).filter((x: any) => x && x.name).map((x: any) => ({
      name: String(x.name), unit: x.unit, price: n(x.price) ?? NaN, unitVariableCost: n(x.unitVariableCost) ?? 0,
      year1Volume: n(x.year1Volume) ?? NaN, growthPct: n(x.growthPct), capacity: n(x.capacity), utilizationPct: n(x.utilizationPct),
      wastePct: n(x.wastePct), returnsPct: n(x.returnsPct), discountPct: n(x.discountPct), fxLinkedCost: !!x.fxLinkedCost, classification: x.classification
    })),
    opex: (I.opex || []).filter((x: any) => x && x.name).map((x: any) => ({
      name: String(x.name), category: x.category, costType: x.costType === 'variable_pct' ? 'variable_pct' : 'fixed',
      amount: n(x.amount), pctOfRevenue: n(x.pctOfRevenue), growthPct: n(x.growthPct), fxLinked: !!x.fxLinked, classification: x.classification
    })),
    staff: (I.staff || []).filter((x: any) => x && x.role).map((x: any) => ({
      role: String(x.role), count: n(x.count) ?? NaN, monthlySalary: n(x.monthlySalary) ?? NaN, insurancePct: n(x.insurancePct),
      monthsPerYear: n(x.monthsPerYear), growthPct: n(x.growthPct), classification: x.classification
    })),
    loans: (funding.loans || []).filter((x: any) => x && (x.name || x.principal)).map((x: any) => ({
      name: String(x.name || 'قرض'), principal: n(x.principal) ?? NaN, annualRatePct: n(x.annualRatePct) ?? NaN, years: n(x.years) ?? NaN,
      graceYears: n(x.graceYears), feesPct: n(x.feesPct), method: x.method === 'equal_principal' ? 'equal_principal' : 'annuity'
    })),
    assumptions: {
      horizonYears: n(I.info?.horizonYears) ?? 5,
      discountRatePct: n(macro.discountRatePct) ?? NaN,
      incomeTaxPct: n(tax.incomeTaxPct) ?? NaN,
      lossCarryForwardYears: n(tax.lossCarryForwardYears) ?? 5,
      priceGrowthPct: n(macro.priceGrowthPct), costGrowthPct: n(macro.costGrowthPct), salaryGrowthPct: n(macro.salaryGrowthPct),
      fxRate: n(macro.fxRate) ?? 1,
      receivableDays: n(tax.receivableDays), inventoryDays: n(tax.inventoryDays), payableDays: n(tax.payableDays),
      cashReserveMonths: n(tax.cashReserveMonths),
      equity: n(funding.equity),
      operationStartOffset: n(I.info?.operationStartOffset) ?? 0,
      includeTerminalValue: macro.includeTerminalValue !== false
    }
  }
}

export function getScenarioAdjustments(inputs: any): Record<string, { name: string; adj: ScenarioAdjustments; approved: boolean }> {
  const s = inputs?.scenarios || {}
  const out: Record<string, { name: string; adj: ScenarioAdjustments; approved: boolean }> = {
    BASE: { name: 'الأساسي', adj: {}, approved: true }
  }
  const clean = (a: any): ScenarioAdjustments => {
    const r: any = {}
    for (const k of ['volumePct', 'pricePct', 'variableCostPct', 'salaryPct', 'fixedCostPct', 'capexPct', 'utilizationPct', 'interestRateDeltaPts', 'discountRateDeltaPts', 'fxPct', 'startDelayYears']) {
      const v = n(a?.[k]); if (v != null) r[k] = v
    }
    return r
  }
  if (s.OPTIMISTIC?.approved) out.OPTIMISTIC = { name: 'المتفائل', adj: clean(s.OPTIMISTIC), approved: true }
  if (s.PESSIMISTIC?.approved) out.PESSIMISTIC = { name: 'المتشائم', adj: clean(s.PESSIMISTIC), approved: true }
  for (const c of (s.custom || [])) if (c?.approved && c.code) out[String(c.code).slice(0, 30)] = { name: String(c.name || c.code), adj: clean(c), approved: true }
  return out
}

/** Returns per-step status & a list of missing items. */
export function completeness(inputs: any, templateDef: any) {
  const I = inputs || {}
  const missing: { step: number; field: string; ar: string; required: boolean }[] = []
  const has = (v: any) => v !== undefined && v !== null && String(v).trim() !== ''
  const req = (step: number, field: string, ar: string, v: any, required = true) => { if (!has(v)) missing.push({ step, field, ar, required }) }

  req(1, 'info.title', 'عنوان الدراسة', I.info?.title)
  req(1, 'info.horizonYears', 'أفق الدراسة بالسنوات', I.info?.horizonYears)
  req(2, 'idea.summary', 'وصف الفكرة', I.idea?.summary)
  req(2, 'idea.products', 'المنتجات أو الخدمات', I.idea?.products)
  req(3, 'market.targetCustomers', 'العملاء المستهدفون', I.market?.targetCustomers)
  req(3, 'market.competitors', 'المنافسون', (I.market?.competitors || []).length ? 1 : '', false)
  for (const f of (templateDef?.fields || [])) if (f.required) req(4, `templateFields.${f.key}`, f.label_ar, I.templateFields?.[f.key])
  req(5, 'investment', 'بند استثماري واحد على الأقل', (I.investment || []).filter((x: any) => x?.name && has(x.amount)).length ? 1 : '')
  req(6, 'opex', 'بنود المصروفات التشغيلية', (I.opex || []).filter((x: any) => x?.name).length || (I.staff || []).length ? 1 : '')
  req(7, 'revenue', 'منتج/خدمة بسعر وكمية', (I.revenue || []).filter((x: any) => x?.name && has(x.price) && has(x.year1Volume)).length ? 1 : '')
  req(8, 'funding.equity', 'مساهمة رأس المال الذاتي', I.funding?.equity, false)
  req(9, 'tax.incomeTaxPct', 'نسبة ضريبة الدخل', I.tax?.incomeTaxPct)
  req(10, 'macro.discountRatePct', 'معدل الخصم', I.macro?.discountRatePct)
  req(11, 'scenarios', 'اعتماد سيناريو متفائل ومتشائم', I.scenarios?.OPTIMISTIC?.approved && I.scenarios?.PESSIMISTIC?.approved ? 1 : '', false)

  const requiredTotal = 11 + (templateDef?.fields || []).filter((f: any) => f.required).length - 3 // optional ones excluded
  const reqMissing = missing.filter(m => m.required).length
  const pct = Math.max(0, Math.min(100, Math.round(100 * (1 - reqMissing / Math.max(1, requiredTotal)))))
  return { pct, missing }
}

/** Template revenue helper: derive a suggested revenue line from template fields (user must confirm). */
export function deriveRevenue(templateDef: any, fields: Record<string, any>) {
  const h = templateDef?.revenueHelper
  if (!h || !Object.keys(h).length) return null
  const v = (k?: string) => (k ? n(fields?.[k]) : undefined)
  const steps: string[] = []
  let volume: number | undefined, capacity: number | undefined
  if (h.volumeFrom) {
    const parts = h.volumeFrom.map((k: string) => v(k))
    if (parts.some((p: any) => p == null)) return { error: 'أكمل حقول الطاقة التشغيلية أولًا' }
    volume = parts.reduce((a: number, b: number) => a * b, 1) * (h.volumeMultiplier || 1)
    if (h.volumePctFrom) { const p = v(h.volumePctFrom); if (p == null) return { error: 'أكمل نسبة الإشغال/التحويل' }; volume = volume! * p / 100 }
    steps.push(`الكمية = ${h.volumeFrom.join(' × ')}${h.volumeMultiplier ? ' × ' + h.volumeMultiplier : ''}${h.volumePctFrom ? ' × ' + h.volumePctFrom + '%' : ''}`)
  }
  if (h.capacityFrom) {
    const parts = h.capacityFrom.map((k: string) => v(k))
    if (parts.some((p: any) => p == null)) return { error: 'أكمل حقول الطاقة الإنتاجية أولًا' }
    capacity = parts.reduce((a: number, b: number) => a * b, 1)
    volume = capacity
    steps.push(`الطاقة القصوى = ${h.capacityFrom.join(' × ')}`)
  }
  const price = v(h.priceFrom)
  if (price == null) return { error: 'أدخل سعر البيع' }
  let cost = v(h.costFrom) ?? 0
  if (h.costPctFrom && v(h.costPctFrom) != null) cost = price * v(h.costPctFrom)! / 100
  if (h.costFromMarkup && v(h.costFromMarkup) != null) cost = price / (1 + v(h.costFromMarkup)! / 100)
  return {
    item: {
      name: templateDef?.suggested?.revenue?.[0]?.name || 'الإيراد الرئيسي', unit: h.unit,
      price, unitVariableCost: Math.round(cost * 10000) / 10000, year1Volume: Math.round((volume ?? 0) * 100) / 100,
      capacity, utilizationPct: v(h.utilizationFrom), wastePct: v(h.wasteFrom), returnsPct: v(h.returnsFrom),
      growthPct: h.growthFromNeg && v(h.growthFromNeg) != null ? -v(h.growthFromNeg)! : undefined,
      classification: 'USER_PROVIDED'
    },
    steps
  }
}
