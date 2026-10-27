/**
 * Report builder — produces the study report from an IMMUTABLE study version snapshot.
 * Every number comes from results_json of that version (no recomputation, no AI-generated numbers).
 */
import type { Sheet } from './xlsx'

const esc = (s: any) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
export const fmt = (v: any, dp = 0) => (v == null || v === '' || !isFinite(Number(v))) ? '—' : Number(v).toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp })
const pctf = (v: any) => v == null ? '—' : `${fmt(v, 2)}%`

const CLASS_AR: Record<string, string> = { VERIFIED: 'موثق', USER_PROVIDED: 'من المستخدم', ESTIMATED: 'تقديري', UNAVAILABLE: 'غير متاح', NEEDS_REVIEW: 'يحتاج مراجعة' }
const CAT_AR: Record<string, string> = { land: 'أرض', building: 'مبانٍ', equipment: 'معدات', installation: 'تركيبات', furniture: 'أثاث وتجهيزات', vehicles: 'وسائل نقل', license: 'تراخيص', preoperating: 'ما قبل التشغيل', technology: 'تقنية', other: 'أخرى' }

function barChartSvg(labels: string[], series: { name: string; color: string; values: number[] }[], w = 640, h = 240) {
  const all = series.flatMap(s => s.values)
  const max = Math.max(0, ...all), min = Math.min(0, ...all)
  const range = max - min || 1, padL = 70, padB = 28, padT = 10
  const plotH = h - padB - padT, plotW = w - padL - 10
  const zeroY = padT + plotH * (max / range)
  const gw = plotW / Math.max(1, labels.length), bw = Math.max(4, (gw * 0.7) / series.length)
  let out = `<svg viewBox="0 0 ${w} ${h}" width="100%" xmlns="http://www.w3.org/2000/svg" style="direction:ltr;font-family:Tahoma,Arial;font-size:10px">`
  for (let i = 0; i <= 4; i++) { const v = min + range * i / 4; const y = padT + plotH - plotH * i / 4; out += `<line x1="${padL}" x2="${w - 10}" y1="${y}" y2="${y}" stroke="#e5e7eb"/><text x="${padL - 6}" y="${y + 3}" text-anchor="end" fill="#6b7280">${fmt(v)}</text>` }
  out += `<line x1="${padL}" x2="${w - 10}" y1="${zeroY}" y2="${zeroY}" stroke="#9ca3af"/>`
  labels.forEach((l, i) => {
    series.forEach((s, si) => {
      const v = s.values[i] ?? 0, x = padL + gw * i + gw * 0.15 + si * bw
      const y = v >= 0 ? zeroY - plotH * (v / range) : zeroY, hh = Math.abs(plotH * (v / range))
      out += `<rect x="${x}" y="${y}" width="${bw - 1}" height="${Math.max(0.5, hh)}" fill="${s.color}"/>`
    })
    out += `<text x="${padL + gw * i + gw / 2}" y="${h - 10}" text-anchor="middle" fill="#374151">${esc(l)}</text>`
  })
  out += `</svg><div class="legend">${series.map(s => `<span><i style="background:${s.color}"></i>${esc(s.name)}</span>`).join('')}</div>`
  return out
}

export interface ReportCtx {
  platform: any; org: any; project: any; study: any; version: any; inputs: any; results: any; sources: any[]; ai: any;
  reportVersion: number; generatedAt: string; checksum: string; templateName: string; templateDef: any
}

export function renderReportHtml(x: ReportCtx): string {
  const base = x.results.base, m = base.metrics, cur = base.currency
  const years = base.years as any[]
  const I = x.inputs || {}
  const narrative = x.ai?.report_narrative?.output || null
  const marketAi = x.ai?.market_analysis?.output || null
  const risksAi = x.ai?.risks?.output?.risks || null
  const explain = x.ai?.explain_results?.output || null
  const money = (v: any) => `${fmt(v)} <small>${esc(cur)}</small>`
  const opYears = years.filter(y => y.year >= 1)

  const sections: { id: string; title: string; html: string }[] = []
  const add = (id: string, title: string, html: string) => sections.push({ id, title, html })
  const aiNote = (txt: string | undefined, fallback: string) => txt ? `<div class="ai-block"><div class="ai-tag">نص مُولد بالذكاء الاصطناعي — راجعه قبل الاعتماد</div>${esc(txt).replace(/\n/g, '<br>')}</div>` : `<p class="muted">${fallback}</p>`
  const userText = (t: any) => t ? `<p>${esc(t).replace(/\n/g, '<br>')}</p>` : ''

  // Verdict derived strictly from engine results
  const verdict = m.npv > 0 && (m.irrPct == null || m.irrPct > (I.macro?.discountRatePct ?? 0))
    ? { cls: 'good', text: `وفق الافتراضات المُدخلة، صافي القيمة الحالية موجب (${fmt(m.npv)} ${cur})، ما يشير إلى أن المشروع يحقق عائدًا أعلى من معدل الخصم المستخدم.` }
    : { cls: 'bad', text: `وفق الافتراضات المُدخلة، صافي القيمة الحالية ${m.npv < 0 ? 'سالب' : 'غير موجب'} (${fmt(m.npv)} ${cur})، ولا تدعم النتائج تنفيذ المشروع بصيغته الحالية دون مراجعة الافتراضات أو هيكل التكاليف والتسعير.` }

  add('project', 'بيانات المشروع', `<table class="kv">
    <tr><th>اسم المشروع</th><td>${esc(x.project.name)}</td><th>القالب</th><td>${esc(x.templateName)}</td></tr>
    <tr><th>النشاط</th><td>${esc(x.project.activity || '—')}</td><th>الموقع</th><td>${esc([x.project.city, x.project.governorate, x.project.country].filter(Boolean).join('، '))}</td></tr>
    <tr><th>العملة</th><td>${esc(cur)}</td><th>أفق الدراسة</th><td>${esc(I.info?.horizonYears)} سنوات</td></tr>
    <tr><th>إصدار الدراسة</th><td>${x.version.version}</td><th>إصدار المحرك المالي</th><td>${esc(x.version.engine_version)}</td></tr></table>`)

  add('executive', 'الملخص التنفيذي', `<div class="kpis">
      <div><span>إجمالي الاستثمار</span><b>${money(m.totalInvestment)}</b></div>
      <div><span>صافي القيمة الحالية NPV</span><b class="${m.npv >= 0 ? 'pos' : 'neg'}">${money(m.npv)}</b></div>
      <div><span>معدل العائد الداخلي IRR</span><b>${m.irrPct == null ? 'غير قابل للحساب' : pctf(m.irrPct)}</b></div>
      <div><span>فترة الاسترداد</span><b>${m.paybackYears == null ? 'خارج الأفق' : fmt(m.paybackYears, 2) + ' سنة'}</b></div>
      <div><span>إيراد السنة التشغيلية الأولى</span><b>${money(m.year1Revenue)}</b></div>
      <div><span>صافي ربح السنة الأولى</span><b class="${m.year1NetIncome >= 0 ? 'pos' : 'neg'}">${money(m.year1NetIncome)}</b></div>
    </div>
    <div class="verdict ${verdict.cls}">${verdict.text}</div>
    ${aiNote(narrative?.executive_summary, '')}`)

  add('description', 'وصف المشروع', userText(I.idea?.summary) + (I.idea?.products ? `<h4>المنتجات والخدمات</h4>${userText(I.idea.products)}` : '') + (I.idea?.valueProposition ? `<h4>القيمة المقدمة</h4>${userText(I.idea.valueProposition)}` : '') + aiNote(narrative?.project_description, ''))

  const comp = (I.market?.competitors || []) as any[]
  add('market', 'الدراسة السوقية', `
    ${I.market?.targetCustomers ? `<h4>العملاء المستهدفون</h4>${userText(I.market.targetCustomers)}` : ''}
    ${I.market?.marketSize ? `<h4>حجم السوق (كما أدخله المستخدم)</h4>${userText(I.market.marketSize)}` : ''}
    ${I.market?.channels ? `<h4>قنوات التوزيع</h4>${userText(I.market.channels)}` : ''}
    ${marketAi ? `<div class="ai-block"><div class="ai-tag">تحليل منظم بالذكاء الاصطناعي — يعتمد على المدخلات والمصادر المسجلة فقط</div>
      <div class="swot"><div><b>نقاط القوة</b><ul>${marketAi.strengths.map((s: string) => `<li>${esc(s)}</li>`).join('')}</ul></div><div><b>نقاط الضعف</b><ul>${marketAi.weaknesses.map((s: string) => `<li>${esc(s)}</li>`).join('')}</ul></div>
      <div><b>الفرص</b><ul>${marketAi.opportunities.map((s: string) => `<li>${esc(s)}</li>`).join('')}</ul></div><div><b>التهديدات</b><ul>${marketAi.threats.map((s: string) => `<li>${esc(s)}</li>`).join('')}</ul></div></div>
      <b>فجوات المعلومات</b><ul>${marketAi.information_gaps.map((s: string) => `<li>${esc(s)}</li>`).join('')}</ul></div>` : ''}
    ${aiNote(narrative?.market_study, !I.market?.targetCustomers ? 'لم تُدخل بيانات سوقية كافية. يُنصح بجمع بيانات الطلب والأسعار من مصادر موثوقة قبل اتخاذ القرار.' : '')}`)

  add('competitors', 'تحليل المنافسين', comp.length ? `<table class="grid"><thead><tr><th>المنافس</th><th>السعر/الموقع</th><th>نقاط القوة</th><th>نقاط الضعف</th></tr></thead><tbody>${comp.map(c => `<tr><td>${esc(c.name)}</td><td>${esc(c.price || '')}</td><td>${esc(c.strengths || '')}</td><td>${esc(c.weaknesses || '')}</td></tr>`).join('')}</tbody></table>` : '<p class="muted">لم تُسجل بيانات منافسين.</p>')

  const tf = x.templateDef?.fields || []
  add('technical', 'الدراسة الفنية', `${tf.length ? `<table class="kv">${tf.map((f: any) => `<tr><th>${esc(f.label_ar)}</th><td>${esc(I.templateFields?.[f.key] ?? '—')} ${esc(f.unit || '')}</td></tr>`).join('')}</table>` : ''}
    ${I.location?.site ? `<h4>الموقع</h4>${userText(I.location.site)}` : ''}${I.location?.capacityNotes ? userText(I.location.capacityNotes) : ''}
    ${aiNote(narrative?.technical_study, '')}`)
  add('operational', 'الدراسة التشغيلية', `${(I.staff || []).length ? `<h4>الهيكل الوظيفي</h4><table class="grid"><thead><tr><th>الوظيفة</th><th>العدد</th><th>الراتب الشهري</th><th>التأمينات %</th></tr></thead><tbody>${(I.staff || []).filter((s: any) => s.role).map((s: any) => `<tr><td>${esc(s.role)}</td><td>${fmt(s.count)}</td><td>${fmt(s.monthlySalary)}</td><td>${fmt(s.insurancePct, 2)}</td></tr>`).join('')}</tbody></table>` : ''}${aiNote(narrative?.operational_study, '')}`)
  add('management', 'الدراسة الإدارية', aiNote(narrative?.management_study, 'لم يُولَّد نص لهذا القسم. يمكن توليده من مساعد الذكاء الاصطناعي أو كتابته يدويًا.'))
  add('marketing', 'الدراسة التسويقية', userText(I.market?.marketingPlan) + aiNote(narrative?.marketing_plan, ''))
  add('legal', 'الجوانب القانونية والتنظيمية', userText(I.info?.legalNotes) + aiNote(narrative?.legal_regulatory, 'يجب مراجعة الاشتراطات والتراخيص الخاصة بالنشاط مع الجهات المختصة ومستشار قانوني.'))

  const inv = x.results?.model?.investment || x.version.model?.investment || []
  add('investment', 'التكاليف الاستثمارية', `<table class="grid"><thead><tr><th>البند</th><th>الفئة</th><th>القيمة</th><th>العمر الإنتاجي</th><th>التصنيف</th></tr></thead><tbody>
    ${inv.map((i: any) => `<tr><td>${esc(i.name)}</td><td>${CAT_AR[i.category] || esc(i.category)}</td><td class="n">${fmt(i.amount)}${i.fxLinked ? ' (مرتبط بسعر الصرف)' : ''}</td><td class="n">${i.usefulLife || '—'}</td><td>${CLASS_AR[i.classification] || '—'}</td></tr>`).join('')}
    <tr class="tot"><td colspan="2">إجمالي الأصول (Capex)</td><td class="n">${fmt(m.capex)}</td><td colspan="2"></td></tr>
    <tr><td colspan="2">احتياطي نقدي مبدئي (رأس مال عامل)</td><td class="n">${fmt(m.initialCashReserve)}</td><td colspan="2"></td></tr>
    <tr class="tot"><td colspan="2">إجمالي الاستثمار</td><td class="n">${fmt(m.totalInvestment)}</td><td colspan="2"></td></tr></tbody></table>
    <h4>هيكل التمويل</h4><table class="kv"><tr><th>رأس المال الذاتي</th><td>${money(m.equity)}</td><th>القروض</th><td>${money(m.totalLoans)}</td></tr>${m.fundingGap > 0 ? `<tr><th>عجز تمويلي</th><td colspan="3" class="neg">${money(m.fundingGap)}</td></tr>` : ''}</table>`)

  const yearHead = `<tr><th>البند</th>${opYears.map(y => `<th>س${y.year}</th>`).join('')}</tr>`
  const row = (label: string, key: string, cls = '') => `<tr class="${cls}"><td>${label}</td>${opYears.map(y => `<td class="n ${y[key] < 0 ? 'neg' : ''}">${fmt(y[key])}</td>`).join('')}</tr>`
  add('opex', 'المصروفات التشغيلية', `<table class="grid sm"><thead>${yearHead}</thead><tbody>${row('تكلفة البضاعة/الخامات', 'cogs')}${row('مصروفات ثابتة', 'fixedOpex')}${row('مصروفات متغيرة', 'variableOpex')}${row('الرواتب والأجور', 'staffCost')}${row('الإهلاك', 'depreciation')}${row('الفوائد', 'interest')}</tbody></table>`)
  add('revenue', 'الإيرادات المتوقعة', `<table class="grid sm"><thead>${yearHead}</thead><tbody>${row('الكمية المباعة', 'units')}${row('إجمالي المبيعات', 'grossSales')}${row('خصومات ومرتجعات', 'discountsReturns')}${row('صافي الإيرادات', 'netRevenue', 'tot')}</tbody></table>
    ${barChartSvg(opYears.map(y => 'س' + y.year), [{ name: 'صافي الإيرادات', color: '#1d4ed8', values: opYears.map(y => y.netRevenue) }, { name: 'صافي الربح', color: '#f2b705', values: opYears.map(y => y.netIncome) }])}`)

  add('statements', 'القوائم المالية', `<h4>قائمة الدخل المتوقعة</h4><table class="grid sm"><thead>${yearHead}</thead><tbody>${row('صافي الإيرادات', 'netRevenue')}${row('تكلفة المبيعات', 'cogs')}${row('مجمل الربح', 'grossProfit', 'tot')}${row('مصروفات تشغيلية ورواتب', 'fixedOpex')}${row('EBITDA', 'ebitda', 'tot')}${row('الإهلاك', 'depreciation')}${row('EBIT', 'ebit')}${row('الفوائد ورسوم التمويل', 'interest')}${row('الربح قبل الضريبة', 'ebt')}${row('الضريبة', 'tax')}${row('صافي الربح', 'netIncome', 'tot')}</tbody></table>
    <h4>قائمة التدفقات النقدية (تدفق المشروع الحر)</h4><table class="grid sm"><thead><tr><th>البند</th>${years.map(y => `<th>س${y.year}</th>`).join('')}</tr></thead><tbody>
    ${['capex:الاستثمارات', 'changeInNWC:التغير في رأس المال العامل', 'projectCashFlow:صافي التدفق النقدي', 'cumulativeProjectCashFlow:التدفق التراكمي', 'discountedProjectCashFlow:التدفق المخصوم'].map(p => { const [k, l] = p.split(':'); return `<tr><td>${l}</td>${years.map(y => `<td class="n ${y[k] < 0 ? 'neg' : ''}">${fmt(y[k])}</td>`).join('')}</tr>` }).join('')}</tbody></table>
    ${barChartSvg(years.map(y => 'س' + y.year), [{ name: 'التدفق النقدي السنوي', color: '#0b2a5b', values: years.map(y => y.projectCashFlow) }, { name: 'التدفق التراكمي', color: '#10b981', values: years.map(y => y.cumulativeProjectCashFlow) }])}
    <h4>الميزانية المتوقعة (نهاية السنة)</h4><table class="grid sm"><thead><tr><th>البند</th>${years.map(y => `<th>س${y.year}</th>`).join('')}</tr></thead><tbody>
    ${['cash:النقدية', 'netFixedAssets:صافي الأصول الثابتة', 'netWorkingCapital:صافي رأس المال العامل', 'totalAssets:إجمالي الأصول', 'debtOutstanding:القروض القائمة', 'equityBook:حقوق الملكية'].map(p => { const [k, l] = p.split(':'); return `<tr><td>${l}</td>${years.map(y => `<td class="n ${y[k] < 0 ? 'neg' : ''}">${fmt(y[k])}</td>`).join('')}</tr>` }).join('')}</tbody></table>
    ${(base.loanSchedule || []).length ? `<h4>جدول القروض</h4><table class="grid sm"><thead><tr><th>القرض</th><th>السنة</th><th>رصيد أول المدة</th><th>الفائدة</th><th>الأصل</th><th>القسط</th><th>رصيد آخر المدة</th></tr></thead><tbody>${base.loanSchedule.filter((l: any) => l.openingBalance > 0).map((l: any) => `<tr><td>${esc(l.loan)}</td><td>${l.year}</td><td class="n">${fmt(l.openingBalance)}</td><td class="n">${fmt(l.interest)}</td><td class="n">${fmt(l.principal)}</td><td class="n">${fmt(l.payment)}</td><td class="n">${fmt(l.closingBalance)}</td></tr>`).join('')}</tbody></table>` : ''}`)

  const defs = base.definitions || {}
  const metricRows: [string, string][] = [
    ['npv', money(m.npv)], ['irrPct', m.irrPct == null ? 'غير قابل للحساب' : pctf(m.irrPct)], ['equityIrrPct', m.equityIrrPct == null ? '—' : pctf(m.equityIrrPct)],
    ['paybackYears', m.paybackYears == null ? 'خارج الأفق' : fmt(m.paybackYears, 2) + ' سنة'], ['discountedPaybackYears', m.discountedPaybackYears == null ? 'خارج الأفق' : fmt(m.discountedPaybackYears, 2) + ' سنة'],
    ['roiPct', pctf(m.roiPct)], ['avgAnnualRoiPct', pctf(m.avgAnnualRoiPct)], ['breakEvenRevenue', m.breakEvenRevenue == null ? 'لا توجد' : money(m.breakEvenRevenue)],
    ['breakEvenUnits', m.breakEvenUnits == null ? '—' : fmt(m.breakEvenUnits)], ['cashBreakEvenRevenue', m.cashBreakEvenRevenue == null ? '—' : money(m.cashBreakEvenRevenue)],
    ['grossMarginPct', pctf(m.grossMarginPct)], ['ebitdaMarginPct', pctf(m.ebitdaMarginPct)], ['operatingMarginPct', pctf(m.operatingMarginPct)], ['netMarginPct', pctf(m.netMarginPct)],
    ['contributionMarginRatioPct', pctf(m.contributionMarginRatioPct)], ['minDscr', m.minDscr == null ? 'لا يوجد دين' : fmt(m.minDscr, 2)], ['profitabilityIndex', m.profitabilityIndex == null ? '—' : fmt(m.profitabilityIndex, 2)]
  ]
  add('metrics', 'المؤشرات المالية', `<table class="grid"><thead><tr><th>المؤشر</th><th>القيمة</th><th>المعادلة</th></tr></thead><tbody>${metricRows.map(([k, v]) => `<tr><td>${esc(defs[k]?.ar || k)}</td><td class="n">${v}</td><td class="formula">${esc(defs[k]?.formula || '')}</td></tr>`).join('')}</tbody></table>
    ${(base.issues || []).filter((i: any) => i.severity !== 'error').length ? `<h4>ملاحظات المحرك المالي</h4><ul>${base.issues.map((i: any) => `<li>${esc(i.message_ar)}</li>`).join('')}</ul>` : ''}
    ${explain ? `<div class="ai-block"><div class="ai-tag">شرح مُولد بالذكاء الاصطناعي للنتائج (الأرقام من المحرك المالي)</div><b>${esc(explain.headline)}</b><p>${esc(explain.explanation)}</p></div>` : ''}`)

  const sc = x.results.scenarios || {}
  const scKeys = Object.keys(sc)
  add('scenarios', 'تحليل السيناريوهات', scKeys.length ? `<table class="grid"><thead><tr><th>المؤشر</th><th>الأساسي</th>${scKeys.map(k => `<th>${esc(sc[k].name)}</th>`).join('')}</tr></thead><tbody>
    ${[['npv', 'NPV'], ['irrPct', 'IRR %'], ['paybackYears', 'الاسترداد (سنة)'], ['totalNetIncome', 'إجمالي صافي الربح'], ['breakEvenRevenue', 'إيراد التعادل']].map(([k, l]) => `<tr><td>${l}</td><td class="n">${fmt(m[k], k === 'irrPct' || k === 'paybackYears' ? 2 : 0)}</td>${scKeys.map(s => `<td class="n">${fmt(sc[s].metrics?.[k], k === 'irrPct' || k === 'paybackYears' ? 2 : 0)}</td>`).join('')}</tr>`).join('')}</tbody></table>
    <h4>افتراضات كل سيناريو (نسبة التغير عن الأساسي)</h4><table class="grid sm"><thead><tr><th>السيناريو</th><th>الافتراضات</th></tr></thead><tbody>${scKeys.map(k => `<tr><td>${esc(sc[k].name)}</td><td>${Object.entries(sc[k].adjustments || {}).map(([a, v]) => `${esc(a)}: ${v}`).join(' ، ') || '—'}</td></tr>`).join('')}</tbody></table>` : '<p class="muted">لم يعتمد المستخدم سيناريوهات بديلة في هذا الإصدار.</p>')

  const sens = x.version.sensitivity
  add('sensitivity', 'تحليل الحساسية', sens?.rows?.length ? `<p>أثر تغير كل متغير على صافي القيمة الحالية (NPV) مع ثبات باقي الافتراضات:</p><table class="grid sm"><thead><tr><th>المتغير</th>${sens.rows[0].points.map((p: any) => `<th>${p.change > 0 ? '+' : ''}${p.change}%</th>`).join('')}</tr></thead><tbody>${sens.rows.map((r: any) => `<tr><td>${esc(r.ar)}</td>${r.points.map((p: any) => `<td class="n ${p.npv < 0 ? 'neg' : ''}">${fmt(p.npv)}</td>`).join('')}</tr>`).join('')}</tbody></table>` : '<p class="muted">—</p>')

  const tRisks = x.templateDef?.risks || []
  add('risks', 'المخاطر', risksAi ? `<table class="grid"><thead><tr><th>الخطر</th><th>الفئة</th><th>الاحتمال</th><th>الأثر</th><th>إجراءات التخفيف</th></tr></thead><tbody>${risksAi.map((r: any) => `<tr><td>${esc(r.title)}</td><td>${esc(r.category)}</td><td>${({ low: 'منخفض', medium: 'متوسط', high: 'مرتفع' } as any)[r.likelihood]}</td><td>${({ low: 'منخفض', medium: 'متوسط', high: 'مرتفع' } as any)[r.impact]}</td><td>${esc(r.mitigation)}</td></tr>`).join('')}</tbody></table><p class="muted">تم اقتراح المخاطر بالذكاء الاصطناعي بناءً على القالب ونتائج الحساسية.</p>`
    : `<p>المخاطر المتوقعة لهذا النوع من المشروعات (من القالب) والتي يجب فحصها:</p><ul>${tRisks.map((r: string) => `<li>${esc(r)}</li>`).join('')}</ul>`)

  const plan = narrative?.implementation_plan || []
  add('implementation', 'خطة التنفيذ', plan.length ? `<table class="grid"><thead><tr><th>المرحلة</th><th>المدة</th><th>الأنشطة</th></tr></thead><tbody>${plan.map((p: any) => `<tr><td>${esc(p.phase)}</td><td>${esc(p.duration)}</td><td>${esc(p.activities)}</td></tr>`).join('')}</tbody></table><p class="muted">خطة مقترحة بالذكاء الاصطناعي.</p>` : (I.info?.operationStartOffset ? `<p>بدء التشغيل بعد ${I.info.operationStartOffset} سنة من الاستثمار.</p>` : '<p class="muted">لم تُحدد خطة تنفيذ تفصيلية.</p>'))

  add('recommendations', 'التوصيات', `<div class="verdict ${verdict.cls}">${verdict.text}</div>${narrative?.recommendations?.length ? `<div class="ai-block"><div class="ai-tag">توصيات مقترحة بالذكاء الاصطناعي</div><ul>${narrative.recommendations.map((r: string) => `<li>${esc(r)}</li>`).join('')}</ul></div>` : ''}`)

  add('sources', 'المصادر', x.sources.length ? `<table class="grid sm"><thead><tr><th>القسم</th><th>المعلومة</th><th>القيمة</th><th>التصنيف</th><th>المصدر</th><th>تاريخ الرصد</th></tr></thead><tbody>${x.sources.map((s: any) => `<tr><td>${esc(s.section)}</td><td>${esc(s.claim)}</td><td>${esc(s.value || '')}</td><td>${CLASS_AR[s.classification] || s.classification}</td><td>${s.url ? `<a href="${esc(s.url)}">${esc(s.source_name || s.publisher || '')}</a>` : esc(s.source_name || '—')}</td><td>${esc(s.observed_at || '')}</td></tr>`).join('')}</tbody></table>` : '<p class="muted">لم تُربط أي مصادر خارجية بهذه الدراسة؛ جميع الأرقام مصدرها مدخلات المستخدم.</p>')

  const A = I.macro || {}, T = I.tax || {}
  add('assumptions', 'الافتراضات والقيود', `<table class="kv">
    <tr><th>معدل الخصم</th><td>${pctf(A.discountRatePct)}</td><th>ضريبة الدخل</th><td>${pctf(T.incomeTaxPct)}</td></tr>
    <tr><th>نمو الأسعار السنوي</th><td>${pctf(A.priceGrowthPct || 0)}</td><th>نمو التكاليف السنوي</th><td>${pctf(A.costGrowthPct || 0)}</td></tr>
    <tr><th>نمو الرواتب السنوي</th><td>${pctf(A.salaryGrowthPct || 0)}</td><th>سعر الصرف المستخدم</th><td>${fmt(A.fxRate || 1, 4)} ${A.fxSource ? '— ' + esc(A.fxSource) : ''}</td></tr>
    <tr><th>أيام التحصيل / المخزون / الموردين</th><td>${fmt(T.receivableDays || 0)} / ${fmt(T.inventoryDays || 0)} / ${fmt(T.payableDays || 0)}</td><th>ترحيل الخسائر</th><td>${fmt(T.lossCarryForwardYears ?? 5)} سنوات</td></tr></table>
    <ul><li>الأرقام المصنفة "تقديرية" هي افتراضات وليست بيانات فعلية.</li><li>القيمة المتبقية في السنة الأخيرة = صافي القيمة الدفترية للأصول + استرداد رأس المال العامل ${A.includeTerminalValue === false ? '(مستبعدة في هذه الدراسة)' : ''}.</li><li>الحسابات سنوية؛ لا تعكس الموسمية داخل السنة.</li><li>القواعد الضريبية المستخدمة تقديرية وتحتاج مراجعة محاسب قانوني.</li></ul>`)

  add('disclaimer', 'إخلاء المسؤولية', `<p>هذه الدراسة أُعدت آليًا اعتمادًا على البيانات والافتراضات التي أدخلها المستخدم، ومحرك حسابات مالي مستقل، ونصوص مساعدة قد تكون مُولدة بالذكاء الاصطناعي. لا تمثل الدراسة ضمانًا لنجاح الاستثمار أو تحقيق العوائد المتوقعة، ولا تُعد استشارة مالية أو ضريبية أو قانونية ملزمة. يتحمل المستخدم مسؤولية التحقق من صحة المدخلات ومراجعة النتائج مع مختصين قبل اتخاذ أي قرار استثماري.</p>`)

  const P = x.platform
  const toc = sections.map((s, i) => `<li><a href="#${s.id}">${i + 1}. ${esc(s.title)}</a></li>`).join('')
  const body = sections.map((s, i) => `<section id="${s.id}" class="sec"><h2>${i + 1}. ${esc(s.title)}</h2>${s.html}</section>`).join('')
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>دراسة جدوى — ${esc(x.project.name)} — إصدار ${x.version.version}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&display=swap" rel="stylesheet">
<style>
@page{size:A4;margin:16mm 12mm 18mm;@bottom-center{content:"صفحة " counter(page) " من " counter(pages);font-size:9pt;color:#666}@top-center{content:"${esc(P.name_ar)} — دراسة جدوى ${esc(x.project.name)}";font-size:8pt;color:#888}}
*{box-sizing:border-box}body{font-family:Cairo,Tahoma,Arial,sans-serif;color:#1f2937;margin:0;background:#eef2f7;font-size:13px;line-height:1.7}
.page{max-width:900px;margin:0 auto;background:#fff;padding:28px 36px;box-shadow:0 2px 20px rgba(0,0,0,.08)}
.toolbar{position:sticky;top:0;z-index:5;background:#0b2a5b;color:#fff;padding:10px 16px;display:flex;gap:10px;align-items:center;justify-content:space-between}
.toolbar button,.toolbar a{background:#f2b705;color:#0b2a5b;border:0;border-radius:8px;padding:7px 14px;font-weight:700;cursor:pointer;text-decoration:none;font-family:inherit}
.cover{min-height:900px;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;background:linear-gradient(160deg,#0b2a5b,#123d7e);color:#fff;margin:-28px -36px 30px;padding:40px;page-break-after:always}
.cover img{height:120px;margin-bottom:18px}.cover h1{font-size:34px;margin:10px 0}.cover .gold{color:#f2b705}.cover table{margin-top:40px;color:#dbe4f3;font-size:13px}.cover td{padding:3px 12px}
h2{color:#0b2a5b;border-bottom:3px solid #f2b705;padding-bottom:6px;margin-top:0;font-size:20px}h4{color:#123d7e;margin:16px 0 6px}
.sec{page-break-before:always;padding-top:6px}.sec#project{page-break-before:avoid}
table{width:100%;border-collapse:collapse;margin:8px 0 14px}.grid th{background:#0b2a5b;color:#fff;font-weight:600;padding:6px;font-size:12px}.grid td{border-bottom:1px solid #e5e7eb;padding:5px 6px}
.grid.sm td,.grid.sm th{font-size:11px;padding:4px}.n{text-align:left;direction:ltr;white-space:nowrap}.tot td{font-weight:700;background:#f3f6fb}.neg{color:#b91c1c}.pos{color:#047857}
.kv th{background:#f3f6fb;text-align:right;width:22%;padding:6px;font-weight:600;border:1px solid #e5e7eb}.kv td{padding:6px;border:1px solid #e5e7eb}
.kpis{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:10px 0}.kpis div{border:1px solid #dbe4f3;border-radius:10px;padding:10px;background:#f8fafd}.kpis span{display:block;color:#6b7280;font-size:11px}.kpis b{font-size:17px;color:#0b2a5b}
.verdict{padding:12px 14px;border-radius:10px;margin:12px 0;font-weight:600}.verdict.good{background:#ecfdf5;border-right:5px solid #10b981}.verdict.bad{background:#fef2f2;border-right:5px solid #ef4444}
.ai-block{background:#fffbea;border:1px dashed #e5c55a;border-radius:10px;padding:10px 12px;margin:10px 0}.ai-tag{font-size:10px;color:#92400e;font-weight:700;margin-bottom:4px}
.muted{color:#6b7280}.formula{font-size:10px;color:#6b7280;direction:ltr;text-align:left}.legend{display:flex;gap:14px;font-size:11px;margin:-4px 0 10px}.legend i{display:inline-block;width:10px;height:10px;margin-left:5px;border-radius:2px}
.swot{display:grid;grid-template-columns:1fr 1fr;gap:8px}.swot>div{background:#fff;border:1px solid #eee;border-radius:8px;padding:6px 10px}
.toc{columns:2;font-size:13px}.toc a{color:#0b2a5b;text-decoration:none}.foot{margin-top:30px;font-size:10px;color:#6b7280;border-top:1px solid #e5e7eb;padding-top:8px}
@media print{body{background:#fff}.toolbar{display:none}.page{box-shadow:none;padding:0;max-width:none}.cover{margin:0 0 0;min-height:250mm}a{color:inherit}}
</style></head><body>
<div class="toolbar"><span>معاينة التقرير — إصدار التقرير ${x.reportVersion} (من إصدار الدراسة ${x.version.version})</span><span><button onclick="window.print()">طباعة / حفظ PDF</button></span></div>
<div class="page">
<div class="cover"><img src="${esc(P.logo)}" alt="logo"><div class="gold" style="font-weight:800;font-size:20px">${esc(P.name_ar)}</div>
<h1>دراسة جدوى اقتصادية ومالية</h1><div style="font-size:24px;font-weight:700">${esc(x.project.name)}</div>
${x.org?.logo_url ? `<img src="${esc(x.org.logo_url)}" style="height:60px;margin-top:20px">` : ''}
<table><tr><td>الجهة</td><td>${esc(x.org?.name || '')}</td></tr><tr><td>تاريخ الإنشاء</td><td>${esc(x.generatedAt)}</td></tr><tr><td>إصدار الدراسة / التقرير</td><td>${x.version.version} / ${x.reportVersion}</td></tr><tr><td>العملة</td><td>${esc(cur)}</td></tr><tr><td>بصمة البيانات</td><td style="font-family:monospace;font-size:10px">${esc(x.checksum.slice(0, 16))}</td></tr></table>
<p style="margin-top:30px;font-size:11px;color:#c7d2e6">جميع الأرقام مبنية على افتراضات المستخدم — راجع قسم الافتراضات والقيود</p></div>
<h2>فهرس المحتويات</h2><ol class="toc" style="list-style:none;padding:0">${toc}</ol>
${body}
<div class="foot">أُنشئ بواسطة ${esc(P.name_ar)} • المحرك المالي ${esc(x.version.engine_version)} • بصمة النتائج SHA-256: ${esc(x.checksum)}</div>
</div></body></html>`
}

export function buildReportSheets(x: ReportCtx): Sheet[] {
  const base = x.results.base, m = base.metrics, years = base.years as any[], defs = base.definitions || {}
  const I = x.inputs || {}
  const ys = years.map(y => `السنة ${y.year}`)
  const line = (label: string, key: string) => [label, ...years.map(y => y[key])]
  const summary: Sheet = { name: 'الملخص', rtl: true, boldRows: [0, 6], colWidths: [36, 22, 60], rows: [
    ['دراسة جدوى', x.project.name], ['الجهة', x.org?.name || ''], ['العملة', base.currency], ['إصدار الدراسة', x.version.version], ['إصدار التقرير', x.reportVersion], ['تاريخ الإنشاء', x.generatedAt],
    ['المؤشر', 'القيمة', 'المعادلة'],
    ...Object.entries(m).map(([k, v]) => [defs[k]?.ar || k, v as any, defs[k]?.formula || '']),
    [], ['بصمة النتائج', x.checksum], ['ملاحظة', 'الأرقام مبنية على افتراضات المستخدم ولا تضمن نجاح الاستثمار.']
  ] }
  const income: Sheet = { name: 'قائمة الدخل', rtl: true, boldRows: [0], colWidths: [30, ...years.map(() => 16)], rows: [
    ['البند', ...ys], line('الكمية', 'units'), line('إجمالي المبيعات', 'grossSales'), line('خصومات ومرتجعات', 'discountsReturns'), line('صافي الإيرادات', 'netRevenue'), line('تكلفة المبيعات', 'cogs'), line('مجمل الربح', 'grossProfit'),
    line('مصروفات ثابتة', 'fixedOpex'), line('مصروفات متغيرة', 'variableOpex'), line('الرواتب', 'staffCost'), line('EBITDA', 'ebitda'), line('الإهلاك', 'depreciation'), line('EBIT', 'ebit'),
    line('الفوائد', 'interest'), line('رسوم التمويل', 'financeFees'), line('الربح قبل الضريبة', 'ebt'), line('الضريبة', 'tax'), line('صافي الربح', 'netIncome')] }
  const cash: Sheet = { name: 'التدفقات النقدية', rtl: true, boldRows: [0], colWidths: [34, ...years.map(() => 16)], rows: [
    ['البند', ...ys], line('صافي رأس المال العامل', 'netWorkingCapital'), line('التغير في رأس المال العامل', 'changeInNWC'), line('الاستثمارات', 'capex'), line('سحب القروض', 'loanDrawdown'), line('سداد أصل القروض', 'principalRepayment'),
    line('تدفق المشروع الحر', 'projectCashFlow'), line('تدفق حقوق الملكية', 'equityCashFlow'), line('التدفق التراكمي', 'cumulativeProjectCashFlow'), line('التدفق المخصوم', 'discountedProjectCashFlow'), line('التراكمي المخصوم', 'cumulativeDiscountedCashFlow'), line('DSCR', 'dscr')] }
  const bs: Sheet = { name: 'الميزانية', rtl: true, boldRows: [0], colWidths: [30, ...years.map(() => 16)], rows: [
    ['البند', ...ys], line('النقدية', 'cash'), line('صافي الأصول الثابتة', 'netFixedAssets'), line('رأس المال العامل', 'netWorkingCapital'), line('إجمالي الأصول', 'totalAssets'), line('القروض', 'debtOutstanding'), line('حقوق الملكية', 'equityBook'), line('فحص التوازن', 'balanceCheck')] }
  const inv: Sheet = { name: 'الاستثمارات', rtl: true, boldRows: [0], colWidths: [36, 16, 16, 12, 14, 16], rows: [
    ['البند', 'الفئة', 'القيمة', 'العمر', 'التخريدية', 'التصنيف'], ...(I.investment || []).filter((i: any) => i.name).map((i: any) => [i.name, i.category, Number(i.amount) || 0, Number(i.usefulLife) || 0, Number(i.salvageValue) || 0, i.classification || '']),
    [], ['الوظيفة', 'العدد', 'الراتب الشهري', 'التأمينات %'], ...(I.staff || []).filter((s: any) => s.role).map((s: any) => [s.role, Number(s.count) || 0, Number(s.monthlySalary) || 0, Number(s.insurancePct) || 0]),
    [], ['المنتج', 'السعر', 'التكلفة المتغيرة', 'كمية السنة 1', 'النمو %'], ...(I.revenue || []).filter((r: any) => r.name).map((r: any) => [r.name, Number(r.price) || 0, Number(r.unitVariableCost) || 0, Number(r.year1Volume) || 0, Number(r.growthPct) || 0])] }
  const loans: Sheet = { name: 'القروض والإهلاك', rtl: true, boldRows: [0], rows: [
    ['القرض', 'السنة', 'رصيد أول المدة', 'الفائدة', 'الأصل', 'القسط', 'رصيد آخر المدة'], ...(base.loanSchedule || []).map((l: any) => [l.loan, l.year, l.openingBalance, l.interest, l.principal, l.payment, l.closingBalance]),
    [], ['الأصل', 'السنة', 'أول المدة', 'الإهلاك', 'آخر المدة'], ...(base.depreciation || []).map((d: any) => [d.asset, d.year, d.opening, d.depreciation, d.closing])] }
  const sc = x.results.scenarios || {}
  const scen: Sheet = { name: 'السيناريوهات', rtl: true, boldRows: [0], rows: [
    ['المؤشر', 'الأساسي', ...Object.values(sc).map((s: any) => s.name)],
    ...['npv', 'irrPct', 'paybackYears', 'totalNetIncome', 'breakEvenRevenue', 'roiPct'].map(k => [defs[k]?.ar || k, m[k], ...Object.values(sc).map((s: any) => s.metrics?.[k] ?? null)])] }
  const src: Sheet = { name: 'المصادر', rtl: true, boldRows: [0], rows: [['القسم', 'المعلومة', 'القيمة', 'التصنيف', 'المصدر', 'الرابط', 'تاريخ الرصد'], ...x.sources.map((s: any) => [s.section, s.claim, s.value, s.classification, s.source_name, s.url, s.observed_at])] }
  return [summary, income, cash, bs, inv, loans, scen, src]
}
