/* Study results: KPIs, statements, charts, scenarios, sensitivity, what-if, versions, reports, evidence */
(function () {
  const { $, $$, esc, fmt, pct, date, api, toast, errToast, go, route, modal, confirmDlg, busy, S, loadSettings, chart, statusBadge } = FA
  let R = null

  const kpi = (label, val, cls = '', sub = '') => `<div class="kpi"><div class="k">${label}</div><div class="v ${cls}">${val}</div>${sub ? `<div class="text-[11px] text-slate-400 mt-1">${sub}</div>` : ''}</div>`
  const TABS = [['overview', 'الملخص', 'fa-chart-pie'], ['statements', 'القوائم المالية', 'fa-table'], ['scenarios', 'السيناريوهات', 'fa-code-compare'], ['sensitivity', 'الحساسية وWhat-if', 'fa-sliders'], ['versions', 'الإصدارات', 'fa-code-branch'], ['reports', 'التقارير', 'fa-file-export'], ['evidence', 'المصادر والافتراضات', 'fa-book']]

  route('/app/studies/:id', async ({ id }, q) => {
    await loadSettings(); S.me = await api('/me')
    const d = await api('/studies/' + id)
    R = { d, id, tab: q.tab || 'overview', res: null }
    FA.mountApp('studies', `
      <nav class="text-sm text-slate-500 mb-3"><a href="/app/projects/${d.project.id}" data-link>${esc(d.project.name)}</a> / <span class="text-navy-800">${esc(d.study.title)}</span></nav>
      <section class="card p-5 flex flex-wrap justify-between gap-3 items-center"><div><h2 class="text-xl font-extrabold text-navy-800">${esc(d.study.title)}</h2><p class="text-sm text-slate-500 mt-1">${statusBadge(d.study.status)} <span class="mx-2">•</span><i class="fas ${esc(d.template.icon || 'fa-file')} text-gold-500"></i> ${esc(d.template.name_ar || d.template.id)} <span class="mx-2">•</span> اكتمال ${d.completeness.pct}% <span class="mx-2">•</span> ${d.study.latest_version ? 'آخر إصدار v' + d.study.latest_version : 'لا توجد إصدارات محفوظة'}</p></div>
        <div class="flex flex-wrap gap-2"><a href="/app/studies/${id}/wizard" data-link class="btn-ghost btn-sm"><i class="fas fa-pen-to-square"></i> تعديل البيانات</a><button id="recompute" class="btn-ghost btn-sm"><i class="fas fa-rotate"></i> إعادة الحساب</button>${d.canWrite ? '<button id="save-version" class="btn-primary btn-sm"><i class="fas fa-code-branch"></i> حفظ إصدار</button><button id="dup-study" class="btn-ghost btn-sm" title="نسخ"><i class="fas fa-copy"></i></button>' : ''}${FA.can('study.delete') ? '<button id="del-study" class="btn-ghost btn-sm !text-red-600" title="حذف"><i class="fas fa-trash"></i></button>' : ''}</div></section>
      <nav class="flex gap-1 mt-4 overflow-x-auto border-b" role="tablist">${TABS.map(([k, l, i]) => `<button data-tab="${k}" class="px-4 py-2.5 text-sm font-semibold whitespace-nowrap border-b-2 ${R.tab === k ? 'border-gold-500 text-navy-800' : 'border-transparent text-slate-500 hover:text-navy-800'}"><i class="fas ${i} ml-1"></i>${l}</button>`).join('')}</nav>
      <div id="tab-body" class="mt-5"></div>`, { title: 'نتائج الدراسة' })
    $$('[data-tab]').forEach(b => b.onclick = () => { R.tab = b.dataset.tab; history.replaceState({}, '', `/app/studies/${id}?tab=${R.tab}`); $$('[data-tab]').forEach(x => { const on = x.dataset.tab === R.tab; x.classList.toggle('border-gold-500', on); x.classList.toggle('text-navy-800', on); x.classList.toggle('border-transparent', !on); x.classList.toggle('text-slate-500', !on) }); renderTab() })
    $('#recompute').onclick = async (e) => { busy(e.currentTarget, true); try { R.res = await api(`/studies/${id}/compute`, { method: 'POST' }); toast('تمت إعادة الحساب'); renderTab() } catch (er) { errToast(er) } finally { busy(e.currentTarget, false) } }
    const sv = $('#save-version'); if (sv) sv.onclick = () => saveVersionDlg()
    const dp = $('#dup-study'); if (dp) dp.onclick = async () => { try { const r = await api(`/studies/${id}/duplicate`, { method: 'POST' }); toast('تم إنشاء نسخة'); go('/app/studies/' + r.id) } catch (e) { errToast(e) } }
    const ds = $('#del-study'); if (ds) ds.onclick = async () => { if (!await confirmDlg('حذف الدراسة؟ الدراسات التي لها تقارير مصدرة تُؤرشف بدل الحذف.', { danger: true, okText: 'حذف' })) return; const r = await api('/studies/' + id, { method: 'DELETE' }); toast(r.message || 'تم الحذف'); go('/app/projects/' + d.project.id) }
    try { R.res = await api(`/studies/${id}/compute`, { method: 'POST' }) } catch (e) { errToast(e) }
    renderTab()
  })

  function saveVersionDlg() {
    const m = modal({ title: 'حفظ إصدار جديد', body: '<p class="text-sm text-slate-600 mb-3">الإصدار لقطة ثابتة من المدخلات والنتائج والمصادر ومخرجات الذكاء الاصطناعي، لا تتغير لاحقًا.</p><label class="label">سجل التغييرات</label><input id="v-note" class="input" placeholder="ما الذي تغير في هذا الإصدار؟">', actions: '<button data-close class="btn-ghost">إلغاء</button><button id="v-ok" class="btn-primary">حفظ</button>' })
    $('#v-ok', m.el).onclick = async (e) => { busy(e.currentTarget, true); try { const r = await api(`/studies/${R.id}/versions`, { method: 'POST', body: { changelog: $('#v-note', m.el).value || undefined } }); m.close(); toast(`تم حفظ الإصدار v${r.version}`); FA.render() } catch (er) { busy(e.currentTarget, false); if (er.details) $('.modal-body', m.el).insertAdjacentHTML('beforeend', `<ul class="mt-3 text-sm text-red-700 list-disc pr-5">${er.details.map(x => `<li>${esc(x.message_ar || x.message)}</li>`).join('')}</ul>`); else errToast(er) } }
  }

  function notComputable() {
    const b = R.res?.base
    return `<div class="card p-8 text-center"><i class="fas fa-calculator text-4xl text-slate-300"></i><h3 class="font-bold text-navy-800 mt-3">لا يمكن عرض النتائج بعد</h3><p class="text-sm text-slate-500 mt-1">أكمل البيانات المطلوبة ليتمكن المحرك المالي من الحساب. لن نعرض أرقامًا مبنية على بيانات ناقصة.</p><div class="max-w-lg mx-auto text-right mt-4">${b ? FA.issuesHtml(b) : ''}</div><a href="/app/studies/${R.id}/wizard" data-link class="btn-primary mt-5 inline-flex">استكمال البيانات</a></div>`
  }

  function renderTab() {
    const el = $('#tab-body'); if (!el) return
    const t = R.tab
    if (['overview', 'statements', 'scenarios', 'sensitivity'].includes(t) && !R.res?.base?.computable) { el.innerHTML = notComputable(); return }
    ;({ overview, statements, scenarios, sensitivity: sens, versions, reports, evidence })[t]?.(el)
  }

  /* ---------- Overview ---------- */
  function overview(el) {
    const b = R.res.base, m = b.metrics, c = b.currency
    const yrs = b.years.filter(y => y.year >= 1)
    const disc = Number(R.d.inputs?.macro?.discountRatePct)
    const good = m.npv > 0
    el.innerHTML = `
      <div class="rounded-2xl p-4 mb-5 ${good ? 'bg-emerald-50 border border-emerald-200 text-emerald-900' : 'bg-red-50 border border-red-200 text-red-900'}"><i class="fas ${good ? 'fa-circle-check' : 'fa-circle-exclamation'} ml-1"></i>
        ${good ? `وفق افتراضاتك، صافي القيمة الحالية موجب عند معدل خصم ${fmt(disc, 2)}% — المشروع يحقق عائدًا أعلى من الحد الأدنى المطلوب.` : `وفق افتراضاتك، صافي القيمة الحالية ${m.npv < 0 ? 'سالب' : 'صفر'} — النتائج لا تدعم التنفيذ بصيغته الحالية. راجع التسعير أو التكاليف أو الكميات.`}
        <span class="block text-xs mt-1 opacity-75">النتائج تقديرية مبنية على مدخلاتك ولا تضمن نجاح الاستثمار.</span></div>
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
        ${kpi('إجمالي الاستثمار', fmt(m.totalInvestment) + ' <small class="text-xs">' + c + '</small>', '', `أصول ${fmt(m.capex)} + احتياطي ${fmt(m.initialCashReserve)}`)}
        ${kpi('صافي القيمة الحالية NPV', fmt(m.npv), m.npv >= 0 ? 'pos' : 'neg', `معدل خصم ${fmt(disc, 2)}%`)}
        ${kpi('معدل العائد الداخلي IRR', m.irrPct == null ? 'غير قابل للحساب' : pct(m.irrPct), '', m.equityIrrPct != null ? 'IRR الملكية ' + pct(m.equityIrrPct) : '')}
        ${kpi('فترة الاسترداد', m.paybackYears == null ? 'خارج الأفق' : fmt(m.paybackYears, 2) + ' سنة', '', m.discountedPaybackYears != null ? 'المخصومة ' + fmt(m.discountedPaybackYears, 2) + ' سنة' : 'المخصومة: خارج الأفق')}
        ${kpi('إيراد التعادل (السنة 1)', m.breakEvenRevenue == null ? 'لا توجد' : fmt(m.breakEvenRevenue), '', m.breakEvenUnits != null ? fmt(m.breakEvenUnits) + ' وحدة' + (m.breakEvenUtilizationPct != null ? ` • ${fmt(m.breakEvenUtilizationPct, 1)}% من الطاقة` : '') : '')}
        ${kpi('العائد على الاستثمار (الأفق)', pct(m.roiPct), '', 'متوسط سنوي ' + pct(m.avgAnnualRoiPct))}
        ${kpi('هامش صافي الربح (س1)', pct(m.netMarginPct), m.netMarginPct < 0 ? 'neg' : '', 'هامش إجمالي ' + pct(m.grossMarginPct))}
        ${kpi('أدنى DSCR', m.minDscr == null ? 'لا يوجد دين' : fmt(m.minDscr, 2), m.minDscr != null && m.minDscr < 1.2 ? 'neg' : '', m.totalLoans ? 'قروض ' + fmt(m.totalLoans) : '')}
      </div>
      ${(b.issues || []).length ? `<div class="card p-4 mt-5">${FA.issuesHtml(b)}</div>` : ''}
      <div class="grid lg:grid-cols-2 gap-5 mt-5">
        <section class="card p-4"><h3 class="font-bold text-navy-800 mb-3">الإيرادات والأرباح</h3><div class="h-64"><canvas id="ch-rev"></canvas></div></section>
        <section class="card p-4"><h3 class="font-bold text-navy-800 mb-3">التدفقات النقدية والتراكمي</h3><div class="h-64"><canvas id="ch-cf"></canvas></div></section>
        <section class="card p-4"><h3 class="font-bold text-navy-800 mb-3">هيكل تكاليف السنة التشغيلية الأولى</h3><div class="h-64"><canvas id="ch-cost"></canvas></div></section>
        <section class="card p-4"><h3 class="font-bold text-navy-800 mb-3">هيكل التمويل</h3><div class="h-64"><canvas id="ch-fund"></canvas></div>${m.fundingGap > 0 ? `<p class="text-sm text-red-700 mt-2">عجز تمويلي: ${fmt(m.fundingGap)} ${c}</p>` : ''}</section>
      </div>
      ${aiBlock('explain_results', 'شرح النتائج')}`
    const labels = yrs.map(y => 'س' + y.year)
    chart('ch-rev', { type: 'bar', data: { labels, datasets: [{ label: 'صافي الإيرادات', data: yrs.map(y => y.netRevenue), backgroundColor: '#123d7e' }, { label: 'EBITDA', data: yrs.map(y => y.ebitda), backgroundColor: '#94a3b8' }, { label: 'صافي الربح', data: yrs.map(y => y.netIncome), backgroundColor: '#f2b705' }] }, options: { maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } } })
    chart('ch-cf', { data: { labels: b.years.map(y => 'س' + y.year), datasets: [{ type: 'bar', label: 'التدفق السنوي', data: b.years.map(y => y.projectCashFlow), backgroundColor: b.years.map(y => y.projectCashFlow < 0 ? '#ef4444' : '#0b2a5b') }, { type: 'line', label: 'التراكمي', data: b.years.map(y => y.cumulativeProjectCashFlow), borderColor: '#10b981', tension: .3 }] }, options: { maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } } })
    const y1 = b.years.find(y => y.operatingYear === 1) || yrs[0]
    chart('ch-cost', { type: 'doughnut', data: { labels: ['تكلفة المبيعات', 'مصروفات ثابتة', 'مصروفات متغيرة', 'رواتب', 'إهلاك', 'فوائد'], datasets: [{ data: [y1.cogs, y1.fixedOpex, y1.variableOpex, y1.staffCost, y1.depreciation, y1.interest], backgroundColor: ['#0b2a5b', '#123d7e', '#3b82f6', '#f2b705', '#94a3b8', '#ef4444'] }] }, options: { maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } } })
    chart('ch-fund', { type: 'pie', data: { labels: ['رأس المال الذاتي', 'القروض'].concat(m.fundingGap > 0 ? ['عجز'] : []), datasets: [{ data: [m.equity, m.totalLoans].concat(m.fundingGap > 0 ? [m.fundingGap] : []), backgroundColor: ['#0b2a5b', '#f2b705', '#ef4444'] }] }, options: { maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } } })
  }
  function aiBlock(task, title) {
    const a = R.d.ai?.[task]; if (!a || a.status !== 'succeeded') return ''
    const o = a.output
    return `<section class="card p-4 mt-5 border-dashed border-2 border-gold-400/50 bg-gold-400/5"><div class="text-[10px] text-amber-700 font-bold">${title} — مخرجات ذكاء اصطناعي للمراجعة</div><b class="block mt-1">${esc(o.headline || '')}</b><p class="text-sm mt-1">${esc(o.explanation || '')}</p></section>`
  }

  /* ---------- Statements ---------- */
  function statements(el) {
    const b = R.res.base, Y = b.years
    const tbl = (title, rows, years = Y) => `<section class="card mb-5"><h3 class="font-bold text-navy-800 p-4 border-b">${title}</h3><div class="scroll-x max-h-[70vh]"><table class="tbl"><thead><tr><th>البند</th>${years.map(y => `<th class="num">س${y.year}</th>`).join('')}</tr></thead><tbody>${rows.map(([l, k, bold]) => `<tr class="${bold ? 'font-bold bg-slate-50' : ''}"><td class="whitespace-nowrap">${l}</td>${years.map(y => `<td class="num ${y[k] < 0 ? 'neg' : ''}">${k === 'dscr' ? (y[k] == null ? '—' : fmt(y[k], 2)) : fmt(y[k])}</td>`).join('')}</tr>`).join('')}</tbody></table></div></section>`
    const op = Y.filter(y => y.year >= 1)
    el.innerHTML = `<p class="text-xs text-slate-500 mb-3">جميع المبالغ بـ ${esc(b.currency)}. السنة 0 = سنة الاستثمار. المحرك ${esc(R.res.engineVersion)}.</p>` +
      tbl('قائمة الدخل المتوقعة', [['الكمية المباعة', 'units'], ['إجمالي المبيعات', 'grossSales'], ['خصومات ومرتجعات', 'discountsReturns'], ['صافي الإيرادات', 'netRevenue', 1], ['تكلفة المبيعات', 'cogs'], ['مجمل الربح', 'grossProfit', 1], ['مصروفات ثابتة', 'fixedOpex'], ['مصروفات متغيرة', 'variableOpex'], ['الرواتب', 'staffCost'], ['EBITDA', 'ebitda', 1], ['الإهلاك', 'depreciation'], ['EBIT', 'ebit', 1], ['الفوائد', 'interest'], ['رسوم التمويل', 'financeFees'], ['الربح قبل الضريبة', 'ebt'], ['الضريبة', 'tax'], ['صافي الربح', 'netIncome', 1]], op) +
      tbl('قائمة التدفقات النقدية', [['صافي رأس المال العامل', 'netWorkingCapital'], ['التغير في رأس المال العامل', 'changeInNWC'], ['الاستثمارات', 'capex'], ['سحب القروض', 'loanDrawdown'], ['سداد أصل القروض', 'principalRepayment'], ['خدمة الدين', 'debtService'], ['تدفق المشروع الحر', 'projectCashFlow', 1], ['التراكمي', 'cumulativeProjectCashFlow'], ['التدفق المخصوم', 'discountedProjectCashFlow'], ['التراكمي المخصوم', 'cumulativeDiscountedCashFlow'], ['تدفق حقوق الملكية', 'equityCashFlow', 1], ['DSCR', 'dscr']]) +
      tbl('الميزانية المتوقعة (نهاية السنة)', [['النقدية', 'cash'], ['صافي الأصول الثابتة', 'netFixedAssets'], ['رأس المال العامل', 'netWorkingCapital'], ['إجمالي الأصول', 'totalAssets', 1], ['القروض القائمة', 'debtOutstanding'], ['الأرباح المحتجزة', 'retainedEarnings'], ['حقوق الملكية', 'equityBook', 1], ['فحص التوازن (يجب أن يكون 0)', 'balanceCheck']]) +
      (b.loanSchedule.length ? `<section class="card mb-5"><h3 class="font-bold text-navy-800 p-4 border-b">جدول القروض</h3><div class="scroll-x"><table class="tbl"><thead><tr><th>القرض</th><th>السنة</th><th class="num">أول المدة</th><th class="num">الفائدة</th><th class="num">الأصل</th><th class="num">القسط</th><th class="num">آخر المدة</th></tr></thead><tbody>${b.loanSchedule.filter(l => l.openingBalance > 0).map(l => `<tr><td>${esc(l.loan)}</td><td>${l.year}</td><td class="num">${fmt(l.openingBalance)}</td><td class="num">${fmt(l.interest)}</td><td class="num">${fmt(l.principal)}</td><td class="num">${fmt(l.payment)}</td><td class="num">${fmt(l.closingBalance)}</td></tr>`).join('')}</tbody></table></div></section>` : '') +
      (b.depreciation.length ? `<section class="card mb-5"><h3 class="font-bold text-navy-800 p-4 border-b">جدول الإهلاك</h3><div class="scroll-x max-h-96"><table class="tbl"><thead><tr><th>الأصل</th><th>السنة</th><th class="num">أول المدة</th><th class="num">الإهلاك</th><th class="num">آخر المدة</th></tr></thead><tbody>${b.depreciation.map(x => `<tr><td>${esc(x.asset)}</td><td>${x.year}</td><td class="num">${fmt(x.opening)}</td><td class="num">${fmt(x.depreciation)}</td><td class="num">${fmt(x.closing)}</td></tr>`).join('')}</tbody></table></div></section>` : '') +
      `<section class="card"><h3 class="font-bold text-navy-800 p-4 border-b">تعريفات المؤشرات ومعادلاتها</h3><div class="scroll-x"><table class="tbl"><tbody>${Object.entries(b.definitions).map(([k, v]) => `<tr><td class="font-semibold whitespace-nowrap">${esc(v.ar)}</td><td class="num">${esc(String(b.metrics[k] ?? '—'))}</td><td class="text-xs text-slate-500" dir="ltr">${esc(v.formula)}</td></tr>`).join('')}</tbody></table></div></section>`
  }

  /* ---------- Scenarios ---------- */
  function scenarios(el) {
    const b = R.res.base, sc = R.res.scenarios || {}, keys = Object.keys(sc)
    if (!keys.length) { el.innerHTML = `<div class="card p-8 text-center"><p class="text-slate-600">لم تعتمد أي سيناريوهات بديلة بعد.</p><a href="/app/studies/${R.id}/wizard?step=11" data-link class="btn-primary mt-4 inline-flex">إعداد السيناريوهات</a></div>`; return }
    const rows = [['npv', 'صافي القيمة الحالية', 0], ['irrPct', 'IRR %', 2], ['paybackYears', 'الاسترداد (سنة)', 2], ['totalNetIncome', 'إجمالي صافي الربح', 0], ['year1Revenue', 'إيراد السنة 1', 0], ['breakEvenRevenue', 'إيراد التعادل', 0], ['roiPct', 'ROI %', 2], ['minDscr', 'أدنى DSCR', 2]]
    el.innerHTML = `<section class="card"><div class="scroll-x"><table class="tbl"><thead><tr><th>المؤشر</th><th class="num">الأساسي</th>${keys.map(k => `<th class="num">${esc(sc[k].name)}</th>`).join('')}</tr></thead><tbody>${rows.map(([k, l, dp]) => `<tr><td>${l}</td><td class="num font-bold">${fmt(b.metrics[k], dp)}</td>${keys.map(s => `<td class="num ${sc[s].metrics?.[k] < 0 ? 'neg' : ''}">${fmt(sc[s].metrics?.[k], dp)}</td>`).join('')}</tr>`).join('')}</tbody></table></div></section>
      <section class="card p-4 mt-5"><h3 class="font-bold text-navy-800 mb-3">صافي الربح السنوي حسب السيناريو</h3><div class="h-72"><canvas id="ch-sc"></canvas></div></section>
      <section class="card p-4 mt-5"><h3 class="font-bold text-navy-800 mb-2">افتراضات كل سيناريو</h3>${keys.map(k => `<p class="text-sm"><b>${esc(sc[k].name)}:</b> ${Object.entries(sc[k].adjustments).map(([a, v]) => `${esc(a)} = ${v}`).join('، ') || 'بدون تغيير'}</p>`).join('')}<a href="/app/studies/${R.id}/wizard?step=11" data-link class="btn-ghost btn-sm mt-3">تعديل السيناريوهات</a></section>`
    const yrs = b.years.filter(y => y.year >= 1), colors = ['#10b981', '#ef4444', '#8b5cf6', '#f59e0b']
    chart('ch-sc', { type: 'line', data: { labels: yrs.map(y => 'س' + y.year), datasets: [{ label: 'الأساسي', data: yrs.map(y => y.netIncome), borderColor: '#0b2a5b', borderWidth: 3 }].concat(keys.map((k, i) => ({ label: sc[k].name, data: sc[k].years.filter(y => y.year >= 1).map(y => y.netIncome), borderColor: colors[i % 4] }))) }, options: { maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } } })
  }

  /* ---------- Sensitivity & what-if ---------- */
  async function sens(el) {
    el.innerHTML = '<div class="skeleton h-64"></div>'
    const s = await api(`/studies/${R.id}/sensitivity`, { method: 'POST' })
    if (!s.computable) { el.innerHTML = notComputable(); return }
    const steps = s.rows[0].points.map(p => p.change)
    const SL = [['volumePct', 'حجم المبيعات %', -50, 50], ['pricePct', 'سعر البيع %', -50, 50], ['variableCostPct', 'التكلفة المتغيرة %', -50, 50], ['fixedCostPct', 'النفقات الثابتة %', -50, 50], ['salaryPct', 'الرواتب %', -50, 50], ['capexPct', 'الاستثمارات %', -50, 50], ['interestRateDeltaPts', 'الفائدة (نقاط)', -10, 10], ['discountRateDeltaPts', 'معدل الخصم (نقاط)', -10, 10], ['fxPct', 'سعر الصرف %', -50, 100], ['startDelayYears', 'تأخير التشغيل (سنة)', 0, 3]]
    el.innerHTML = `<div class="grid xl:grid-cols-2 gap-5">
      <section class="card p-4"><h3 class="font-bold text-navy-800 mb-1">تحليل الحساسية — أثر كل متغير على NPV</h3><p class="text-xs text-slate-500 mb-3">مرتبة حسب قوة التأثير. القيمة الأساسية: ${fmt(s.base.npv)}</p><div class="scroll-x"><table class="tbl"><thead><tr><th>المتغير</th>${steps.map(x => `<th class="num">${x > 0 ? '+' : ''}${x}%</th>`).join('')}</tr></thead><tbody>${s.rows.map(r => `<tr><td>${esc(r.ar)}</td>${r.points.map(p => `<td class="num ${p.npv < 0 ? 'neg' : ''}">${fmt(p.npv)}</td>`).join('')}</tr>`).join('')}</tbody></table></div><div class="h-64 mt-4"><canvas id="ch-tornado"></canvas></div></section>
      <section class="card p-4"><h3 class="font-bold text-navy-800 mb-1">What-if — تجربة فورية</h3><p class="text-xs text-slate-500 mb-3">التجربة لا تُحفظ ولا تغير السيناريو الأساسي.</p>
        <div class="grid sm:grid-cols-2 gap-3">${SL.map(([k, l, mn, mx]) => `<div><label class="text-xs flex justify-between"><span>${l}</span><b id="wv-${k}">0</b></label><input type="range" min="${mn}" max="${mx}" step="${k === 'startDelayYears' ? 1 : 1}" value="0" data-wi="${k}" class="w-full accent-[#0b2a5b]"></div>`).join('')}</div>
        <button id="wi-reset" class="btn-ghost btn-sm mt-3">إعادة الضبط</button><div id="wi-out" class="mt-4"></div></section></div>`
    chart('ch-tornado', { type: 'bar', data: { labels: s.rows.map(r => r.ar), datasets: [{ label: `NPV عند ${steps[0]}%`, data: s.rows.map(r => r.points[0].npv - s.base.npv), backgroundColor: '#ef4444' }, { label: `NPV عند +${steps.at(-1)}%`, data: s.rows.map(r => r.points.at(-1).npv - s.base.npv), backgroundColor: '#10b981' }] }, options: { indexAxis: 'y', maintainAspectRatio: false, plugins: { legend: { position: 'bottom' }, title: { display: true, text: 'التغير في NPV عن الأساسي' } } } })
    let t
    const run = async () => {
      const body = {}; $$('[data-wi]').forEach(i => { const v = Number(i.value); $('#wv-' + i.dataset.wi).textContent = v; if (v) body[i.dataset.wi] = v })
      clearTimeout(t); t = setTimeout(async () => {
        try {
          const r = await api(`/studies/${R.id}/what-if`, { method: 'POST', body })
          if (!r.computable) { $('#wi-out').innerHTML = FA.issuesHtml({ issues: r.issues, computable: false }); return }
          const row = (l, k, dp = 0) => `<tr><td>${l}</td><td class="num">${fmt(r.base[k], dp)}</td><td class="num font-bold ${r.alt[k] < 0 ? 'neg' : ''}">${fmt(r.alt[k], dp)}</td><td class="num ${r.alt[k] - r.base[k] < 0 ? 'neg' : 'pos'}">${r.alt[k] != null && r.base[k] != null ? fmt(r.alt[k] - r.base[k], dp) : '—'}</td></tr>`
          $('#wi-out').innerHTML = `<table class="tbl"><thead><tr><th>المؤشر</th><th class="num">الأساسي</th><th class="num">التجربة</th><th class="num">الفرق</th></tr></thead><tbody>${row('NPV', 'npv')}${row('IRR %', 'irrPct', 2)}${row('الاسترداد (سنة)', 'paybackYears', 2)}${row('إيراد السنة 1', 'year1Revenue')}${row('صافي ربح السنة 1', 'year1NetIncome')}${row('إجمالي صافي الربح', 'totalNetIncome')}${row('إيراد التعادل', 'breakEvenRevenue')}</tbody></table>`
        } catch (e) { errToast(e) }
      }, 250)
    }
    $$('[data-wi]').forEach(i => i.oninput = run)
    $('#wi-reset').onclick = () => { $$('[data-wi]').forEach(i => i.value = 0); run() }
    run()
  }

  /* ---------- Versions ---------- */
  function versions(el) {
    const v = R.d.versions
    el.innerHTML = v.length ? `<section class="card"><div class="scroll-x"><table class="tbl"><thead><tr><th>الإصدار</th><th>التاريخ</th><th>بواسطة</th><th>المحرك</th><th>سجل التغييرات</th><th></th></tr></thead><tbody>${v.map(x => `<tr><td class="font-bold">v${x.version}</td><td class="text-xs">${date(x.created_at)}</td><td>${esc(x.author || '')}</td><td class="text-xs">${esc(x.engine_version)}</td><td class="text-sm">${esc(x.changelog || '—')}</td><td class="whitespace-nowrap"><a class="btn-ghost btn-sm" target="_blank" href="/api/studies/${R.id}/report/preview?version=${x.version}">معاينة</a> <button class="btn-ghost btn-sm" data-verify="${x.version}">تحقق</button> ${R.d.canWrite ? `<button class="btn-ghost btn-sm" data-restore="${x.version}">استعادة</button>` : ''}</td></tr>`).join('')}</tbody></table></div></section>
      ${v.length > 1 ? `<section class="card p-4 mt-5"><h3 class="font-bold text-navy-800 mb-3">مقارنة إصدارين</h3><div class="flex gap-2 items-center"><select id="cmp-a" class="input w-32">${v.map(x => `<option value="${x.version}" ${x.version === v[1].version ? 'selected' : ''}>v${x.version}</option>`).join('')}</select><span>مقابل</span><select id="cmp-b" class="input w-32">${v.map(x => `<option value="${x.version}">v${x.version}</option>`).join('')}</select><button id="cmp-go" class="btn-primary btn-sm">قارن</button></div><div id="cmp-out" class="mt-4"></div></section>` : ''}`
      : `<div class="card p-8 text-center"><i class="fas fa-code-branch text-4xl text-slate-300"></i><p class="text-slate-600 mt-3">لا توجد إصدارات محفوظة. الإصدار يثبّت المدخلات والنتائج للتقارير.</p>${R.d.canWrite ? '<button class="btn-primary mt-4" id="first-ver">حفظ أول إصدار</button>' : ''}</div>`
    const fv = $('#first-ver'); if (fv) fv.onclick = saveVersionDlg
    $$('[data-verify]').forEach(b => b.onclick = async () => { const r = await api(`/studies/${R.id}/versions/${b.dataset.verify}/verify`); toast(r.reproducible ? 'النتائج قابلة لإعادة الإنتاج بدقة ✔' : `اختلاف عن المحرك الحالي (${r.storedEngine} → ${r.currentEngine})`, r.reproducible ? 'success' : 'warning') })
    $$('[data-restore]').forEach(b => b.onclick = async () => { if (!await confirmDlg(`استعادة مدخلات الإصدار v${b.dataset.restore} إلى المسودة الحالية؟ لن يُحذف أي إصدار.`)) return; await api(`/studies/${R.id}/versions/${b.dataset.restore}/restore`, { method: 'POST' }); toast('تمت الاستعادة إلى المسودة'); FA.render() })
    const cg = $('#cmp-go'); if (cg) cg.onclick = async () => {
      const r = await api(`/studies/${R.id}/compare?a=${$('#cmp-a').value}&b=${$('#cmp-b').value}`)
      const defs = R.res?.base?.definitions || {}
      $('#cmp-out').innerHTML = `<div class="grid lg:grid-cols-2 gap-4"><div class="scroll-x"><h4 class="font-bold text-sm mb-2">المؤشرات</h4><table class="tbl"><thead><tr><th>المؤشر</th><th class="num">v${r.a}</th><th class="num">v${r.b}</th><th class="num">الفرق</th></tr></thead><tbody>${r.metrics.filter(m => m.diff !== 0).map(m => `<tr><td>${esc(defs[m.key]?.ar || m.key)}</td><td class="num">${fmt(m.a, 2)}</td><td class="num">${fmt(m.b, 2)}</td><td class="num ${m.diff < 0 ? 'neg' : 'pos'}">${m.diff == null ? '—' : fmt(m.diff, 2)}</td></tr>`).join('')}</tbody></table></div>
        <div class="scroll-x"><h4 class="font-bold text-sm mb-2">المدخلات المتغيرة (${r.inputChanges.length})</h4><table class="tbl"><thead><tr><th>الحقل</th><th>v${r.a}</th><th>v${r.b}</th></tr></thead><tbody>${r.inputChanges.map(c => `<tr><td class="text-xs" dir="ltr">${esc(c.field)}</td><td class="text-xs">${esc(c.a)}</td><td class="text-xs">${esc(c.b)}</td></tr>`).join('') || '<tr><td colspan="3">لا توجد تغييرات</td></tr>'}</tbody></table></div></div>`
    }
  }

  /* ---------- Reports ---------- */
  async function reports(el) {
    const v = R.d.versions
    const list = await api(`/studies/${R.id}/reports`)
    el.innerHTML = !v.length ? `<div class="card p-8 text-center"><p class="text-slate-600">احفظ إصدارًا من الدراسة أولًا — التقارير تُبنى من إصدار ثابت لضمان تطابق الأرقام.</p>${R.d.canWrite ? '<button class="btn-primary mt-4" id="first-ver2">حفظ إصدار</button>' : ''}</div>` : `
      <section class="card p-5"><h3 class="font-bold text-navy-800 mb-3">إنشاء تقرير</h3><div class="flex flex-wrap gap-3 items-end"><div><label class="label">من إصدار</label><select id="rep-v" class="input w-32">${v.map(x => `<option value="${x.version}">v${x.version}</option>`).join('')}</select></div>
        <a id="rep-preview" target="_blank" class="btn-ghost"><i class="fas fa-eye"></i> معاينة</a>${R.d.canExport ? '<button data-exp="html" class="btn-primary"><i class="fas fa-file-code"></i> تقرير HTML</button><button data-exp="pdf" class="btn-primary"><i class="fas fa-file-pdf"></i> PDF</button><button data-exp="xlsx" class="btn-gold"><i class="fas fa-file-excel"></i> Excel</button>' : ''}</div>
        <p class="text-xs text-slate-500 mt-3">PDF يُنشأ عبر الطباعة من المتصفح (حفظ كـ PDF) بخطوط عربية كاملة. كل تصدير مرتبط بإصدار الدراسة وبصمة SHA-256 للنتائج، ويُحتسب من حد التصدير الشهري (إعادة تصدير نفس الإصدار لا تُحتسب).</p></section>
      <section class="card mt-5"><h3 class="font-bold text-navy-800 p-4 border-b">التقارير المصدرة</h3>${list.items.length ? `<div class="scroll-x"><table class="tbl"><thead><tr><th>التقرير</th><th>الصيغة</th><th>من إصدار</th><th>التاريخ</th><th>بواسطة</th><th>البصمة</th><th></th></tr></thead><tbody>${list.items.map(r => `<tr><td>r${r.report_version}</td><td>${r.format.toUpperCase()}</td><td>v${r.study_version}</td><td class="text-xs">${date(r.created_at)}</td><td>${esc(r.author)}</td><td class="text-xs font-mono">${r.checksum.slice(0, 10)}</td><td><a class="btn-ghost btn-sm" target="_blank" href="/api/reports/${r.id}/download">تنزيل</a></td></tr>`).join('')}</tbody></table></div>` : '<p class="p-4 text-sm text-slate-500">لا توجد تقارير مصدرة.</p>'}</section>`
    const fv = $('#first-ver2'); if (fv) fv.onclick = saveVersionDlg
    const pv = $('#rep-preview'); if (pv) { const upd = () => pv.href = `/api/studies/${R.id}/report/preview?version=${$('#rep-v').value}`; upd(); $('#rep-v').onchange = upd }
    $$('[data-exp]').forEach(b => b.onclick = async () => { busy(b, true); try { const r = await api(`/studies/${R.id}/reports`, { method: 'POST', body: { version: +$('#rep-v').value, format: b.dataset.exp } }); window.open(`/api/reports/${r.id}/download`, '_blank'); toast(r.reused ? 'تم فتح التقرير المصدر سابقًا' : 'تم إنشاء التقرير'); reports(el) } catch (e) { errToast(e) } finally { busy(b, false) } })
  }

  /* ---------- Evidence & assumptions ---------- */
  async function evidence(el) {
    const ev = await api(`/studies/${R.id}/evidence`)
    const I = R.d.inputs, CL = { VERIFIED: 'موثق', USER_PROVIDED: 'من المستخدم', ESTIMATED: 'تقديري', UNAVAILABLE: 'غير متاح', NEEDS_REVIEW: 'يحتاج مراجعة' }
    const counts = {}
    ;['investment', 'opex', 'staff', 'revenue'].forEach(k => (I[k] || []).forEach(x => { const c = x.classification || 'USER_PROVIDED'; counts[c] = (counts[c] || 0) + 1 }))
    el.innerHTML = `<div class="grid lg:grid-cols-3 gap-5"><section class="card p-4"><h3 class="font-bold text-navy-800 mb-3">تصنيف بنود المدخلات</h3>${Object.entries(counts).map(([k, n]) => `<div class="flex justify-between py-1.5 border-b text-sm"><span class="chip cls-${k}">${CL[k]}</span><b>${n}</b></div>`).join('') || '<p class="text-sm text-slate-500">—</p>'}<p class="text-xs text-slate-500 mt-3">البنود "التقديرية" افتراضات يجب التحقق منها قبل اتخاذ القرار.</p></section>
      <section class="card p-4 lg:col-span-2"><h3 class="font-bold text-navy-800 mb-3">الافتراضات الرئيسية</h3><dl class="grid sm:grid-cols-3 gap-3 text-sm">${[['معدل الخصم', I.macro?.discountRatePct, '%'], ['ضريبة الدخل', I.tax?.incomeTaxPct, '%'], ['نمو الأسعار', I.macro?.priceGrowthPct || 0, '%'], ['نمو التكاليف', I.macro?.costGrowthPct || 0, '%'], ['نمو الرواتب', I.macro?.salaryGrowthPct || 0, '%'], ['سعر الصرف', I.macro?.fxRate || 1, ''], ['أيام التحصيل', I.tax?.receivableDays || 0, ''], ['احتياطي نقدي', I.tax?.cashReserveMonths || 0, ' شهر'], ['أفق الدراسة', I.info?.horizonYears, ' سنة']].map(([k, v, u]) => `<div class="bg-slate-50 rounded-lg p-3"><dt class="text-xs text-slate-500">${k}</dt><dd class="font-bold">${esc(v ?? '—')}${u}</dd></div>`).join('')}</dl>${I.macro?.fxSource ? `<p class="text-xs text-slate-500 mt-2">مصدر سعر الصرف: ${esc(I.macro.fxSource)}</p>` : ''}</section></div>
      <section class="card mt-5"><h3 class="font-bold text-navy-800 p-4 border-b">المصادر والأدلة المرتبطة (${ev.items.length})</h3>${ev.items.length ? `<div class="scroll-x"><table class="tbl"><thead><tr><th>القسم</th><th>المعلومة</th><th>القيمة</th><th>التصنيف</th><th>المصدر</th><th>تاريخ الرصد</th></tr></thead><tbody>${ev.items.map(x => `<tr><td>${esc(x.section)}</td><td>${esc(x.claim)}</td><td>${esc(x.value || '')}</td><td><span class="chip cls-${x.classification}">${CL[x.classification]}</span></td><td>${x.url ? `<a class="underline" target="_blank" rel="noopener" href="${esc(x.url)}">${esc(x.source_name || '')}</a>` : esc(x.source_name || '—')}</td><td class="text-xs">${esc(x.observed_at || '')} ${x.stale ? '<span class="chip cls-NEEDS_REVIEW">قديم</span>' : ''}</td></tr>`).join('')}</tbody></table></div>` : `<p class="p-4 text-sm text-slate-500">لا توجد مصادر مرتبطة. أضفها من خطوات السوق والتكاليف والإيرادات في <a class="underline" data-link href="/app/studies/${R.id}/wizard?step=3">المعالج</a>.</p>`}</section>`
  }
})()
