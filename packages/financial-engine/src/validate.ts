import type { StudyModel, Issue } from './types'

const num = (v: unknown) => typeof v === 'number' && isFinite(v)

export function validateModel(m: StudyModel): Issue[] {
  const out: Issue[] = []
  const err = (code: string, field: string, ar: string, en: string) => out.push({ code, field, severity: 'error', message_ar: ar, message_en: en })
  const warn = (code: string, field: string, ar: string, en: string) => out.push({ code, field, severity: 'warning', message_ar: ar, message_en: en })

  if (!m || typeof m !== 'object') { err('NO_MODEL', 'model', 'لا توجد بيانات للدراسة.', 'No model.'); return out }
  const A = m.assumptions
  if (!A) { err('NO_ASSUMPTIONS', 'assumptions', 'الافتراضات العامة غير مكتملة.', 'Assumptions missing.'); return out }
  if (!num(A.horizonYears) || A.horizonYears < 1 || A.horizonYears > 30) err('HORIZON', 'assumptions.horizonYears', 'أفق الدراسة يجب أن يكون بين 1 و30 سنة.', 'Horizon must be 1–30 years.')
  if (!num(A.discountRatePct) || A.discountRatePct <= -100) err('DISCOUNT', 'assumptions.discountRatePct', 'معدل الخصم مطلوب ويجب أن يكون أكبر من ‎-100%.', 'Discount rate required.')
  if (!num(A.incomeTaxPct) || A.incomeTaxPct < 0 || A.incomeTaxPct > 100) err('TAX', 'assumptions.incomeTaxPct', 'نسبة ضريبة الدخل يجب أن تكون بين 0 و100%. أدخل النسبة المطبقة على نشاطك.', 'Income tax % must be 0–100.')
  if (A.fxRate != null && (!num(A.fxRate) || A.fxRate <= 0)) err('FX', 'assumptions.fxRate', 'سعر الصرف يجب أن يكون موجبًا.', 'FX rate must be > 0.')

  if (!Array.isArray(m.revenue) || m.revenue.length === 0) err('NO_REVENUE', 'revenue', 'أضف منتجًا أو خدمة واحدة على الأقل مع السعر والكمية.', 'Add at least one revenue item.')
  if (!Array.isArray(m.investment) || m.investment.length === 0) warn('NO_INVESTMENT', 'investment', 'لم تُدخل أي تكاليف استثمارية — تأكد أن المشروع لا يحتاج أصولًا.', 'No investment items entered.')

  ;(m.revenue || []).forEach((r, i) => {
    const f = `revenue[${i}]`
    if (!r.name) err('REV_NAME', f + '.name', `اسم المنتج رقم ${i + 1} مطلوب.`, `Revenue item ${i + 1} name required.`)
    if (!num(r.price) || r.price < 0) err('REV_PRICE', f + '.price', `سعر البيع للمنتج "${r.name || i + 1}" غير صالح.`, `Invalid price for ${r.name}.`)
    if (!num(r.year1Volume) || r.year1Volume < 0) err('REV_VOL', f + '.year1Volume', `كمية المبيعات للمنتج "${r.name || i + 1}" غير صالحة.`, `Invalid volume for ${r.name}.`)
    if (!num(r.unitVariableCost) || r.unitVariableCost < 0) err('REV_COST', f + '.unitVariableCost', `التكلفة المتغيرة للوحدة للمنتج "${r.name || i + 1}" غير صالحة.`, `Invalid unit cost for ${r.name}.`)
    if (num(r.wastePct) && (r.wastePct! < 0 || r.wastePct! >= 100)) err('REV_WASTE', f + '.wastePct', 'نسبة الهالك يجب أن تكون بين 0 و أقل من 100%.', 'Waste % must be in [0,100).')
    if (num(r.price) && num(r.unitVariableCost) && r.unitVariableCost > r.price) warn('REV_NEG_MARGIN', f, `التكلفة المتغيرة للمنتج "${r.name}" أعلى من سعر بيعه.`, `Unit cost exceeds price for ${r.name}.`)
  })
  ;(m.investment || []).forEach((it, i) => {
    const f = `investment[${i}]`
    if (!num(it.amount) || it.amount < 0) err('INV_AMT', f + '.amount', `قيمة البند الاستثماري "${it.name || i + 1}" غير صالحة.`, `Invalid investment amount ${it.name}.`)
    if (!num(it.usefulLife) || it.usefulLife < 0) err('INV_LIFE', f + '.usefulLife', `العمر الإنتاجي للبند "${it.name || i + 1}" غير صالح.`, `Invalid useful life ${it.name}.`)
    if (num(it.salvageValue) && it.salvageValue! > it.amount) err('INV_SALVAGE', f + '.salvageValue', `القيمة التخريدية للبند "${it.name}" أكبر من تكلفته.`, `Salvage > cost for ${it.name}.`)
  })
  ;(m.opex || []).forEach((o, i) => {
    if (o.costType === 'fixed' && (!num(o.amount) || o.amount! < 0)) err('OPEX_AMT', `opex[${i}].amount`, `قيمة المصروف "${o.name || i + 1}" غير صالحة.`, `Invalid opex ${o.name}.`)
    if (o.costType === 'variable_pct' && (!num(o.pctOfRevenue) || o.pctOfRevenue! < 0 || o.pctOfRevenue! > 100)) err('OPEX_PCT', `opex[${i}].pctOfRevenue`, `نسبة المصروف "${o.name}" من الإيراد غير صالحة.`, `Invalid opex % ${o.name}.`)
  })
  ;(m.staff || []).forEach((s, i) => {
    if (!num(s.count) || s.count < 0 || !num(s.monthlySalary) || s.monthlySalary < 0) err('STAFF', `staff[${i}]`, `بيانات الوظيفة "${s.role || i + 1}" غير صالحة.`, `Invalid staff row ${s.role}.`)
  })
  ;(m.loans || []).forEach((l, i) => {
    if (!num(l.principal) || l.principal <= 0) err('LOAN_P', `loans[${i}].principal`, `أصل القرض "${l.name || i + 1}" يجب أن يكون موجبًا.`, `Loan principal must be > 0.`)
    if (!num(l.annualRatePct) || l.annualRatePct < 0) err('LOAN_R', `loans[${i}].annualRatePct`, `سعر فائدة القرض "${l.name}" غير صالح.`, `Invalid loan rate.`)
    if (!num(l.years) || l.years < 1) err('LOAN_Y', `loans[${i}].years`, `مدة القرض "${l.name}" يجب ألا تقل عن سنة.`, `Loan term ≥ 1 year.`)
    if ((l.graceYears ?? 0) >= l.years) err('LOAN_G', `loans[${i}].graceYears`, `فترة السماح للقرض "${l.name}" يجب أن تكون أقل من مدته.`, `Grace must be < term.`)
  })
  return out
}
