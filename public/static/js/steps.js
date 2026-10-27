/* Wizard step UIs, AI cards, evidence boxes */
(function () {
  const { $, $$, esc, fmt, api, toast, errToast, go, modal, busy } = FA
  const w = () => FA.wiz

  /* ---------- AI ---------- */
  function aiCard(W, task, title, desc) {
    const a = W.ai?.[task], enabled = W.aiConfigured && FA.can('ai.use')
    return `<div class="card p-4 mt-4 border-dashed border-2 border-gold-400/50 bg-gold-400/5" data-ai-card="${task}"><div class="flex flex-wrap justify-between items-center gap-2"><div><b class="text-navy-800"><i class="fas fa-robot text-gold-600 ml-1"></i>${title}</b>${desc ? `<p class="text-xs text-slate-500">${desc}</p>` : ''}</div>
      <button class="btn-ghost btn-sm" data-ai="${task}" ${enabled ? '' : 'disabled'}>${a?.status === 'succeeded' ? 'إعادة التوليد' : 'تشغيل'}</button></div>
      ${!W.aiConfigured ? '<p class="text-xs text-amber-700 mt-2"><i class="fas fa-plug-circle-xmark"></i> مزود الذكاء الاصطناعي غير مُعد في هذه البيئة. باقي الوظائف والحسابات تعمل بالكامل.</p>' : ''}
      <div class="ai-out mt-3">${renderAi(task, a)}</div></div>`
  }
  FA.aiCard = aiCard
  function renderAi(task, a) {
    if (!a) return ''
    if (a.status === 'running' || a.status === 'queued') return '<p class="text-sm text-slate-500"><i class="fas fa-spinner fa-spin"></i> جارٍ التنفيذ…</p>'
    if (a.status === 'failed') return `<p class="text-sm text-red-600"><i class="fas fa-circle-exclamation"></i> ${esc(a.error || 'فشل التنفيذ')}</p>`
    if (a.status === 'canceled') return '<p class="text-sm text-slate-500">ملغاة</p>'
    const o = a.output; if (!o) return ''
    const L = (arr) => `<ul class="list-disc pr-5 text-sm space-y-1">${(arr || []).map(x => `<li>${esc(x)}</li>`).join('')}</ul>`
    const tag = `<div class="text-[10px] text-amber-700 font-bold mb-1">مخرجات ذكاء اصطناعي — للمراجعة (${esc(a.model || '')})</div>`
    const lv = { low: 'منخفض', medium: 'متوسط', high: 'مرتفع' }
    switch (task) {
      case 'analyze_idea': return tag + `<p class="text-sm">${esc(o.summary)}</p><div class="grid md:grid-cols-2 gap-3 mt-2"><div><b class="text-xs">المنتجات</b>${L(o.products)}</div><div><b class="text-xs">العملاء</b>${L(o.target_customers)}</div><div><b class="text-xs">أسئلة ناقصة</b>${L(o.missing_questions)}</div><div><b class="text-xs">عوامل النجاح</b>${L(o.key_success_factors)}</div></div>`
      case 'market_analysis': return tag + `<div class="grid md:grid-cols-2 gap-3"><div><b class="text-xs">نقاط القوة</b>${L(o.strengths)}</div><div><b class="text-xs">نقاط الضعف</b>${L(o.weaknesses)}</div><div><b class="text-xs">الفرص</b>${L(o.opportunities)}</div><div><b class="text-xs">التهديدات</b>${L(o.threats)}</div><div class="md:col-span-2"><b class="text-xs">فجوات المعلومات</b>${L(o.information_gaps)}</div></div>`
      case 'suggest_assumptions': return tag + `<div class="scroll-x"><table class="tbl"><thead><tr><th>الحقل</th><th>الاقتراح</th><th>المنهجية</th><th>كيف تتحقق</th></tr></thead><tbody>${o.assumptions.map(x => `<tr><td>${esc(x.field)}</td><td>${esc(x.suggestion)} <span class="chip cls-${x.classification}">${x.classification === 'ESTIMATED' ? 'تقديري' : 'يحتاج مراجعة'}</span></td><td class="text-xs">${esc(x.methodology)}</td><td class="text-xs">${esc(x.how_to_verify)}</td></tr>`).join('')}</tbody></table></div>`
      case 'review_consistency': return tag + (o.issues.length ? `<ul class="text-sm space-y-2">${o.issues.map(x => `<li><span class="chip ${x.severity === 'critical' ? 'cls-NEEDS_REVIEW' : x.severity === 'warning' ? 'cls-ESTIMATED' : 'cls-UNAVAILABLE'}">${x.severity}</span> <b>${esc(x.field)}:</b> ${esc(x.problem)} — <i>${esc(x.suggestion)}</i></li>`).join('')}</ul>` : '<p class="text-sm text-emerald-700">لم يتم رصد تناقضات.</p>')
      case 'risks': return tag + `<div class="scroll-x"><table class="tbl"><thead><tr><th>الخطر</th><th>الاحتمال</th><th>الأثر</th><th>التخفيف</th></tr></thead><tbody>${o.risks.map(r => `<tr><td>${esc(r.title)}</td><td>${lv[r.likelihood]}</td><td>${lv[r.impact]}</td><td class="text-xs">${esc(r.mitigation)}</td></tr>`).join('')}</tbody></table></div>`
      case 'explain_results': return tag + `<b>${esc(o.headline)}</b><p class="text-sm mt-1">${esc(o.explanation)}</p><div class="grid md:grid-cols-3 gap-3 mt-2"><div><b class="text-xs">نقاط قوة</b>${L(o.strengths)}</div><div><b class="text-xs">مخاوف</b>${L(o.concerns)}</div><div><b class="text-xs">المحركات الرئيسية</b>${L(o.key_drivers)}</div></div>`
      case 'report_narrative': return tag + `<p class="text-sm"><b>الملخص التنفيذي:</b> ${esc(String(o.executive_summary).slice(0, 500))}…</p><p class="text-xs text-slate-500 mt-1">احفظ إصدارًا جديدًا لتضمين هذه النصوص في التقرير.</p>`
    }
    return ''
  }
  FA.runAiTask = async function (W, task, btn) {
    await w().save(true); busy(btn, true)
    const upd = () => { const c = document.querySelector(`[data-ai-card="${task}"] .ai-out`); if (c) c.innerHTML = renderAi(task, W.ai[task]) }
    try {
      const r = await api(`/studies/${W.study.id}/ai/${task}`, { method: 'POST' })
      W.ai[task] = { status: 'running' }; upd()
      for (let i = 0; i < 90; i++) { await new Promise(res => setTimeout(res, 2000)); const j = await api('/ai-jobs/' + r.jobId); if (!['queued', 'running'].includes(j.status)) { W.ai[task] = j; break } }
      upd()
      if (W.ai[task]?.status === 'succeeded') toast('اكتملت مهمة الذكاء الاصطناعي'); else if (W.ai[task]?.status === 'failed') toast(W.ai[task].error || 'فشلت المهمة', 'error')
    } catch (e) { errToast(e) } finally { busy(btn, false) }
  }

  /* ---------- Evidence ---------- */
  const EVC = [['USER_PROVIDED', 'من المستخدم'], ['ESTIMATED', 'تقديري'], ['VERIFIED', 'موثق'], ['NEEDS_REVIEW', 'يحتاج مراجعة'], ['UNAVAILABLE', 'غير متاح']]
  const evidenceBox = (section) => `<details class="card p-4 mt-4" data-evidence="${section}"><summary class="font-bold text-navy-800 text-sm flex justify-between"><span><i class="fas fa-link text-gold-600 ml-1"></i> المصادر والأدلة لهذا القسم</span><i class="fas fa-chevron-down text-xs"></i></summary><div class="ev-list mt-3 text-sm text-slate-500">…</div>
    ${FA.can('study.write') ? `<div class="grid md:grid-cols-5 gap-2 mt-3"><input class="input md:col-span-2 ev-claim" placeholder="المعلومة/الادعاء"><input class="input ev-value" placeholder="القيمة"><select class="input ev-class">${EVC.map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select><select class="input ev-src"><option value="">بدون مصدر</option></select></div><div class="flex gap-2 mt-2"><button class="btn-primary btn-sm ev-add">إضافة</button><button class="btn-ghost btn-sm ev-newsrc">مصدر جديد</button></div>` : ''}</details>`
  FA.loadEvidence = async function (W) {
    const boxes = $$('[data-evidence]'); if (!boxes.length) return
    const [ev, src] = await Promise.all([api(`/studies/${W.study.id}/evidence`), W.sources ? { items: W.sources } : api('/sources')])
    W.sources = src.items
    const CL = Object.fromEntries(EVC)
    for (const b of boxes) {
      const sec = b.dataset.evidence, items = ev.items.filter(x => x.section === sec)
      $('.ev-list', b).innerHTML = items.length ? `<ul class="space-y-1">${items.map(x => `<li class="flex justify-between gap-2 border-b py-1"><span><span class="chip cls-${x.classification}">${CL[x.classification]}</span> ${esc(x.claim)} ${x.value ? `<b>(${esc(x.value)})</b>` : ''} ${x.source_name ? `— ${x.url ? `<a class="underline" target="_blank" rel="noopener" href="${esc(x.url)}">${esc(x.source_name)}</a>` : esc(x.source_name)}` : ''} ${x.stale ? '<span class="chip cls-NEEDS_REVIEW">مصدر قديم (+سنة)</span>' : ''}</span>${FA.can('study.write') ? `<button class="text-red-500 text-xs" data-ev-del="${x.id}">حذف</button>` : ''}</li>`).join('')}</ul>` : 'لا توجد مصادر مرتبطة بعد.'
      const sel = $('.ev-src', b); if (sel) sel.innerHTML = '<option value="">بدون مصدر</option>' + W.sources.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('')
      const add = $('.ev-add', b); if (add) add.onclick = async (e) => { e.preventDefault(); try { await api(`/studies/${W.study.id}/evidence`, { method: 'POST', body: { section: sec, claim: $('.ev-claim', b).value, value: $('.ev-value', b).value || null, classification: $('.ev-class', b).value, sourceId: $('.ev-src', b).value || null } }); toast('تمت الإضافة'); FA.loadEvidence(W) } catch (er) { errToast(er) } }
      const ns = $('.ev-newsrc', b); if (ns) ns.onclick = (e) => { e.preventDefault(); FA.openSourceModal(() => { W.sources = null; FA.loadEvidence(W) }) }
      $$('[data-ev-del]', b).forEach(x => x.onclick = async (e) => { e.preventDefault(); await api(`/studies/${W.study.id}/evidence/${x.dataset.evDel}`, { method: 'DELETE' }); FA.loadEvidence(W) })
    }
  }

  FA.issuesHtml = function (base) {
    const iss = base.issues || []
    if (!iss.length) return '<p class="text-sm text-emerald-700"><i class="fas fa-circle-check"></i> البيانات صالحة للحساب ولا توجد ملاحظات.</p>'
    const c = { error: 'text-red-700', warning: 'text-amber-700', info: 'text-slate-600' }, ic = { error: 'fa-circle-xmark', warning: 'fa-triangle-exclamation', info: 'fa-circle-info' }
    return `${base.computable ? '<p class="text-sm text-emerald-700 mb-2"><i class="fas fa-circle-check"></i> قابلة للحساب مع الملاحظات التالية:</p>' : '<p class="text-sm text-red-700 mb-2 font-bold">يجب تصحيح ما يلي قبل الحساب:</p>'}<ul class="text-sm space-y-1">${iss.map(i => `<li class="${c[i.severity]}"><i class="fas ${ic[i.severity]} ml-1"></i>${esc(i.message_ar)}</li>`).join('')}</ul>`
  }

  /* ---------- Steps ---------- */
  const V_SC = [['volumePct', 'حجم المبيعات %'], ['pricePct', 'سعر البيع %'], ['variableCostPct', 'التكلفة المتغيرة %'], ['fixedCostPct', 'النفقات الثابتة %'], ['salaryPct', 'الرواتب %'], ['capexPct', 'الاستثمارات %'], ['interestRateDeltaPts', 'الفائدة (± نقاط)'], ['fxPct', 'سعر الصرف %'], ['startDelayYears', 'تأخير التشغيل (سنة)']]
  FA.STEP_UI = {
    1: (W) => { const { field } = w(); return `<div class="grid md:grid-cols-2 gap-4">
      ${field('info.title', 'عنوان الدراسة', { type: 'text', required: true, cls: 'md:col-span-2' })}
      ${field('info.horizonYears', 'أفق الدراسة', { unit: 'سنة', required: true, help: 'عدد سنوات التوقعات (1–30). الشائع 5 أو 10 سنوات.' })}
      ${field('info.operationStartOffset', 'سنوات الإنشاء قبل بدء التشغيل', { unit: 'سنة', help: '0 = يبدأ التشغيل في السنة الأولى.' })}
      ${field('info.currency', 'عملة الدراسة', { type: 'select', options: ['EGP', 'USD', 'EUR', 'SAR', 'AED'], required: true })}
      ${field('info.legalNotes', 'ملاحظات قانونية وتنظيمية (تراخيص، اشتراطات)', { type: 'textarea', cls: 'md:col-span-2' })}
      <div class="md:col-span-2 bg-navy-50 rounded-xl p-4 text-sm"><b>المشروع:</b> ${esc(W.project.name)} — ${esc([W.project.city, W.project.governorate].filter(Boolean).join('، ') || W.project.country)} • <b>القالب:</b> ${esc(W.template.name_ar)} (إصدار ${W.template.version})</div></div>` },
    2: (W) => { const { field } = w(); return `<div class="grid gap-4">
      ${field('idea.summary', 'وصف فكرة المشروع', { type: 'textarea', required: true, placeholder: 'ما المشكلة التي يحلها؟ ماذا ستقدم؟ لمن؟' })}
      ${field('idea.products', 'المنتجات أو الخدمات', { type: 'textarea', required: true })}
      ${field('idea.valueProposition', 'القيمة المضافة والميزة التنافسية', { type: 'textarea' })}
      ${aiCard(W, 'analyze_idea', 'تحليل الفكرة بالذكاء الاصطناعي', 'يلخص الفكرة ويقترح الأسئلة الناقصة.')}</div>` },
    3: (W) => { const { field, rowEditor } = w(); return `<div class="grid md:grid-cols-2 gap-4">
      ${field('market.targetCustomers', 'العملاء المستهدفون وشرائح الطلب', { type: 'textarea', required: true, cls: 'md:col-span-2' })}
      ${field('market.marketSize', 'حجم السوق ومنهجية تقديره', { type: 'textarea', help: 'اذكر المصدر أو طريقة التقدير. لا تُدخل أرقامًا بلا أساس.' })}
      ${field('market.channels', 'قنوات البيع والتوزيع', { type: 'textarea' })}
      ${field('market.marketingPlan', 'خطة التسويق المبدئية', { type: 'textarea', cls: 'md:col-span-2' })}
      <div class="md:col-span-2"><h4 class="font-bold text-navy-800 mb-2">المنافسون</h4>${rowEditor('market.competitors', [{ key: 'name', label: 'المنافس', type: 'text', w: 160 }, { key: 'price', label: 'السعر/الموقع', type: 'text', w: 140 }, { key: 'strengths', label: 'نقاط القوة', type: 'text', w: 180 }, { key: 'weaknesses', label: 'نقاط الضعف', type: 'text', w: 180 }], { addLabel: 'إضافة منافس', empty: 'لم تُضف منافسين', newRow: { name: '' } })}</div>
      <div class="md:col-span-2">${evidenceBox('market')}${aiCard(W, 'market_analysis', 'تنظيم التحليل السوقي (SWOT وفجوات المعلومات)', 'يعتمد فقط على مدخلاتك والمصادر المسجلة.')}</div></div>` },
    4: (W) => {
      const { field, cur } = w(); const f = W.template.definition.fields || []
      const helper = W.template.definition.revenueHelper && Object.keys(W.template.definition.revenueHelper).length
      return `<div class="grid md:grid-cols-2 gap-4">${field('location.site', 'الموقع المقترح ومبررات اختياره', { type: 'textarea', cls: 'md:col-span-2' })}
      ${f.length ? `<div class="md:col-span-2"><h4 class="font-bold text-navy-800">بيانات الطاقة التشغيلية — قالب "${esc(W.template.name_ar)}"</h4><p class="text-xs text-slate-500">حقول خاصة بالقطاع تُستخدم لاشتقاق الإيراد المقترح.</p></div>` + f.map(x => field('templateFields.' + x.key, x.label_ar, { type: x.type === 'select' ? 'select' : 'number', options: x.options, unit: x.unit === 'عملة' ? cur() : x.unit, required: x.required })).join('') : '<p class="md:col-span-2 text-sm text-slate-500">القالب المخصص بلا حقول محددة.</p>'}
      ${field('location.capacityNotes', 'ملاحظات حول الطاقة التشغيلية', { type: 'textarea', cls: 'md:col-span-2' })}
      ${helper ? `<div class="md:col-span-2 bg-gold-400/10 border border-gold-400/40 rounded-xl p-4"><b class="text-navy-800"><i class="fas fa-wand-magic-sparkles text-gold-600"></i> اشتقاق خط الإيراد من الطاقة التشغيلية</b><p class="text-sm text-slate-600 mt-1">يحسب الكمية والسعر والتكلفة بمعادلة القالب، وتراجع النتيجة قبل إضافتها.</p><button id="derive-btn" class="btn-primary btn-sm mt-3">اشتقاق الإيراد</button><div id="derive-out"></div></div>` : ''}</div>`
    },
    5: (W) => { const { rowEditor, cur, get, CLS, CATS } = w(); return `<p class="text-sm text-slate-600 mb-3">بنود القالب مُدرجة كهيكل فقط — أدخل القيم وصنّفها. العمر 0 للبنود غير القابلة للإهلاك (أرض، تراخيص). البنود بلا قيمة تمنع الحساب — احذفها إن لم تلزم.</p>
      ${rowEditor('investment', [{ key: 'name', label: 'البند', type: 'text', w: 200, req: true }, { key: 'category', label: 'الفئة', type: 'select', options: CATS, w: 130 }, { key: 'amount', label: `القيمة (${cur()})`, req: true, w: 130 }, { key: 'usefulLife', label: 'العمر (سنة)', w: 85 }, { key: 'salvageValue', label: 'التخريدية', w: 100 }, { key: 'depMethod', label: 'الإهلاك', type: 'select', options: [['straight_line', 'قسط ثابت'], ['declining_balance', 'متناقص']], w: 110 }, { key: 'year', label: 'سنة الصرف', w: 80, ph: '0' }, { key: 'fxLinked', label: 'عملة أجنبية', type: 'check', w: 70 }, { key: 'classification', label: 'التصنيف', type: 'select', options: CLS, w: 120 }], { addLabel: 'إضافة بند', empty: 'لا توجد بنود', newRow: { name: '', category: 'equipment', amount: '', usefulLife: 5, classification: 'USER_PROVIDED' } })}
      <div class="mt-3 text-sm bg-slate-50 rounded-lg p-3">مجموع البنود المدخلة: <b class="num">${fmt((get('investment') || []).reduce((a, r) => a + (Number(r.amount) || 0), 0))}</b> ${cur()} <span class="text-xs text-slate-500">(للعرض — الإجمالي المعتمد يحسبه المحرك)</span></div>${evidenceBox('investment')}` },
    6: () => { const { rowEditor, cur, CLS } = w(); return `<h4 class="font-bold text-navy-800 mb-2">المصروفات التشغيلية</h4><p class="text-xs text-slate-500 mb-2">الثابتة: مبلغ سنوي. المتغيرة: نسبة من صافي الإيراد. تكلفة الخامات للوحدة تُدخل في خطوة الإيرادات.</p>
      ${rowEditor('opex', [{ key: 'name', label: 'المصروف', type: 'text', w: 190, req: true }, { key: 'costType', label: 'النوع', type: 'select', options: [['fixed', 'ثابت سنوي'], ['variable_pct', 'نسبة من الإيراد']], w: 140 }, { key: 'amount', label: `المبلغ السنوي (${cur()})`, w: 140 }, { key: 'pctOfRevenue', label: '% من الإيراد', w: 100 }, { key: 'growthPct', label: 'نمو سنوي %', w: 90, ph: 'افتراضي' }, { key: 'fxLinked', label: 'عملة أجنبية', type: 'check', w: 70 }, { key: 'classification', label: 'التصنيف', type: 'select', options: CLS, w: 120 }], { addLabel: 'إضافة مصروف', empty: 'لا توجد مصروفات', newRow: { name: '', costType: 'fixed', amount: '', classification: 'USER_PROVIDED' } })}
      <h4 class="font-bold text-navy-800 mt-6 mb-2">الرواتب والأجور</h4>
      ${rowEditor('staff', [{ key: 'role', label: 'الوظيفة', type: 'text', w: 180, req: true }, { key: 'count', label: 'العدد', w: 80, req: true }, { key: 'monthlySalary', label: `الراتب الشهري (${cur()})`, w: 140, req: true }, { key: 'insurancePct', label: 'تأمينات ومزايا %', w: 110 }, { key: 'monthsPerYear', label: 'أشهر الصرف', w: 90, ph: '12' }, { key: 'classification', label: 'التصنيف', type: 'select', options: CLS, w: 120 }], { addLabel: 'إضافة وظيفة', empty: 'لا توجد وظائف', newRow: { role: '', count: 1, monthlySalary: '', insurancePct: '' } })}
      <p class="text-xs text-slate-500 mt-2">احذف الوظائف التي لا تحتاجها؛ الصفوف بلا راتب تمنع الحساب. حصة صاحب العمل في التأمينات تختلف حسب القانون — أدخل النسبة المطبقة عليك.</p>` },
    7: () => { const { rowEditor, cur, CLS } = w(); return `<p class="text-sm text-slate-600 mb-3">لكل منتج/خدمة: سعر البيع، التكلفة المتغيرة للوحدة، كمية السنة الأولى. الطاقة والتشغيل والهالك اختيارية لكنها مهمة للمصانع.</p>
      ${rowEditor('revenue', [{ key: 'name', label: 'المنتج/الخدمة', type: 'text', w: 170, req: true }, { key: 'unit', label: 'الوحدة', type: 'text', w: 80 }, { key: 'price', label: `سعر البيع (${cur()})`, w: 110, req: true }, { key: 'unitVariableCost', label: 'تكلفة متغيرة/وحدة', w: 120, req: true }, { key: 'year1Volume', label: 'كمية السنة 1', w: 110, req: true }, { key: 'growthPct', label: 'نمو الكمية %', w: 90 }, { key: 'capacity', label: 'الطاقة/سنة', w: 100 }, { key: 'utilizationPct', label: 'تشغيل %', w: 80 }, { key: 'wastePct', label: 'هالك %', w: 70 }, { key: 'discountPct', label: 'خصومات %', w: 80 }, { key: 'returnsPct', label: 'مرتجعات %', w: 80 }, { key: 'fxLinkedCost', label: 'تكلفة بعملة أجنبية', type: 'check', w: 80 }, { key: 'classification', label: 'التصنيف', type: 'select', options: CLS, w: 120 }], { addLabel: 'إضافة منتج/خدمة', empty: 'أضف منتجًا واحدًا على الأقل، أو استخدم اشتقاق الإيراد في الخطوة 4', newRow: { name: '', price: '', unitVariableCost: '', year1Volume: '', classification: 'USER_PROVIDED' } })}${evidenceBox('revenue')}` },
    8: () => { const { field, rowEditor, cur } = w(); return `<div class="grid md:grid-cols-2 gap-4">${field('funding.equity', 'رأس المال الذاتي', { unit: cur(), help: 'إن تُرك فارغًا: رأس المال الذاتي = إجمالي الاستثمار − القروض.' })}</div>
      <h4 class="font-bold text-navy-800 mt-5 mb-2">القروض والتمويل</h4>
      ${rowEditor('funding.loans', [{ key: 'name', label: 'الجهة/القرض', type: 'text', w: 160 }, { key: 'principal', label: `أصل القرض (${cur()})`, w: 130, req: true }, { key: 'annualRatePct', label: 'الفائدة السنوية %', w: 110, req: true }, { key: 'years', label: 'المدة (سنة)', w: 90, req: true }, { key: 'graceYears', label: 'سماح (سنة)', w: 90 }, { key: 'feesPct', label: 'رسوم %', w: 80 }, { key: 'method', label: 'طريقة السداد', type: 'select', options: [['annuity', 'أقساط متساوية'], ['equal_principal', 'أصل متساوٍ']], w: 130 }], { addLabel: 'إضافة قرض', empty: 'لا توجد قروض — تمويل ذاتي', newRow: { name: '', principal: '', annualRatePct: '', years: 5, method: 'annuity' } })}
      <p class="text-xs text-slate-500 mt-2">أدخل سعر الفائدة الوارد في عرض التمويل الفعلي (يختلف حسب البنك والمبادرات).</p>` },
    9: (W) => { const { field } = w(); const h = W.inputs.tax?.taxProfileHint; return `<div class="grid md:grid-cols-2 gap-4">
      ${field('tax.incomeTaxPct', 'نسبة ضريبة الدخل على الأرباح', { unit: '%', required: true, help: h ? `مرجع: الضريبة العامة على أرباح الأشخاص الاعتبارية ${h.pct}% (${h.status === 'VERIFIED' ? 'موثقة' : 'تحتاج مراجعة'}). قد يختلف المعدل لنشاطك أو للنظام المبسط أو المناطق الحرة. <button type="button" class="underline text-navy-700" id="apply-tax">استخدام ${h.pct}%</button>` : 'أدخل النسبة المطبقة على نشاطك.' })}
      ${field('tax.lossCarryForwardYears', 'سنوات ترحيل الخسائر', { unit: 'سنة' })}
      ${field('tax.receivableDays', 'متوسط أيام التحصيل', { unit: 'يوم', help: 'البيع الآجل يزيد احتياج رأس المال العامل.' })}
      ${field('tax.inventoryDays', 'متوسط أيام المخزون', { unit: 'يوم' })}
      ${field('tax.payableDays', 'متوسط أيام السداد للموردين', { unit: 'يوم' })}
      ${field('tax.cashReserveMonths', 'احتياطي نقدي مبدئي', { unit: 'شهر', help: 'أشهر من تكاليف التشغيل النقدية للسنة الأولى تضاف للاستثمار كرأس مال عامل.' })}</div>` },
    10: (W) => { const { field } = w(); return `<div class="grid md:grid-cols-2 gap-4">
      ${field('macro.discountRatePct', 'معدل الخصم (تكلفة الفرصة البديلة)', { unit: '%', required: true, help: 'العائد الأدنى المقبول لك؛ غالبًا عائد بديل آمن + علاوة مخاطرة.' })}
      ${field('macro.priceGrowthPct', 'نمو أسعار البيع سنويًا', { unit: '%' })}
      ${field('macro.costGrowthPct', 'نمو التكاليف سنويًا (تضخم)', { unit: '%' })}
      ${field('macro.salaryGrowthPct', 'نمو الرواتب سنويًا', { unit: '%' })}
      ${field('macro.fxRate', 'سعر الصرف (عملة الدراسة لكل 1 وحدة أجنبية)', { help: 'يُطبق فقط على البنود المعلمة "عملة أجنبية".' })}
      ${field('macro.fxSource', 'مصدر سعر الصرف وتاريخه', { type: 'text', placeholder: 'مثال: البنك المركزي المصري — 2026-10-20' })}
      <label class="md:col-span-2 flex items-center gap-2 text-sm"><input type="checkbox" data-path="macro.includeTerminalValue" ${W.inputs.macro?.includeTerminalValue !== false ? 'checked' : ''}> احتساب القيمة المتبقية في نهاية الأفق (القيمة الدفترية + استرداد رأس المال العامل)</label></div>` },
    11: (W) => { const sc = W.inputs.scenarios || {}; const card = (code, title, color) => `<div class="card p-4 border-t-4 ${color}"><div class="flex justify-between items-center"><h4 class="font-bold text-navy-800">${title}</h4><label class="text-sm flex items-center gap-1"><input type="checkbox" data-path="scenarios.${code}.approved" ${sc[code]?.approved ? 'checked' : ''}> اعتماد</label></div><p class="text-xs text-slate-500 mb-3">نسبة التغير عن الأساسي. لا توجد قيم افتراضية — أدخل توقعاتك.</p><div class="grid grid-cols-2 gap-2">${V_SC.map(([k, l]) => `<div><label class="text-xs text-slate-600">${l}</label><input data-path="scenarios.${code}.${k}" type="number" step="any" class="input !py-1.5 text-sm" value="${esc(sc[code]?.[k] ?? '')}"></div>`).join('')}</div></div>`
      return `<p class="text-sm text-slate-600 mb-4">السيناريو الأساسي = بياناتك كما هي ولا يتغير بتعديل غيره. تُحسب السيناريوهات بعد اعتمادها فقط.</p><div class="grid md:grid-cols-2 gap-4">${card('OPTIMISTIC', 'السيناريو المتفائل', 'border-emerald-500')}${card('PESSIMISTIC', 'السيناريو المتشائم', 'border-red-500')}</div>` },
    12: (W) => { const c = W.completeness || { pct: 0, missing: [] }; const req = c.missing.filter(m => m.required), opt = c.missing.filter(m => !m.required)
      const li = (m) => `<li><button class="text-navy-700 underline" data-goto="${m.step}">الخطوة ${m.step}</button> — ${esc(m.ar)}</li>`
      return `<div class="grid md:grid-cols-3 gap-4 mb-4"><div class="kpi"><div class="k">اكتمال البيانات المطلوبة</div><div class="v">${c.pct}%</div></div><div class="kpi"><div class="k">مطلوبة ناقصة</div><div class="v ${req.length ? 'neg' : 'pos'}">${req.length}</div></div><div class="kpi"><div class="k">اختيارية ناقصة</div><div class="v">${opt.length}</div></div></div>
        ${req.length ? `<div class="card p-4 mb-4"><h4 class="font-bold text-red-700 mb-2">بيانات مطلوبة</h4><ul class="text-sm space-y-1">${req.map(li).join('')}</ul></div>` : '<div class="bg-emerald-50 text-emerald-800 rounded-xl p-4 mb-4"><i class="fas fa-circle-check"></i> جميع البيانات المطلوبة مكتملة.</div>'}
        ${opt.length ? `<div class="card p-4 mb-4"><h4 class="font-bold text-amber-700 mb-2">بيانات اختيارية مستحسنة</h4><ul class="text-sm space-y-1">${opt.map(li).join('')}</ul></div>` : ''}
        <div class="card p-4"><h4 class="font-bold text-navy-800 mb-2">فحص المحرك المالي</h4><button id="precheck" class="btn-ghost btn-sm">تشغيل الفحص</button><div id="precheck-out" class="mt-3"></div></div>
        ${aiCard(W, 'review_consistency', 'مراجعة التناقضات بالذكاء الاصطناعي', 'يرصد القيم غير المنطقية والبنود الناقصة.')}${aiCard(W, 'suggest_assumptions', 'اقتراح افتراضات للتحقق منها', 'مصنفة "تقديرية" ولا تُطبق تلقائيًا.')}` },
    13: (W) => `<div class="text-center max-w-xl mx-auto py-4"><span class="w-16 h-16 mx-auto rounded-2xl bg-gold-400/20 text-gold-600 grid place-items-center text-2xl"><i class="fas fa-rocket"></i></span><h3 class="text-xl font-extrabold text-navy-800 mt-4">توليد الدراسة</h3><p class="text-slate-600 mt-2">يحسب المحرك المالي القوائم والمؤشرات والسيناريوهات المعتمدة، ثم احفظ إصدارًا لتصدير التقرير.</p>
      <div class="mt-4 text-right"><label class="label">ملاحظة الإصدار (اختياري)</label><input id="gen-note" class="input" placeholder="مثال: بعد تحديث أسعار الخامات"></div>
      <div class="flex flex-wrap gap-3 justify-center mt-4"><button id="gen-compute" class="btn-primary"><i class="fas fa-calculator"></i> احسب النتائج</button><button id="gen-version" class="btn-gold"><i class="fas fa-code-branch"></i> احسب واحفظ إصدارًا</button></div></div>
      ${aiCard(W, 'report_narrative', 'كتابة الأقسام النصية للتقرير', 'يكتب الملخص التنفيذي والدراسات النصية وخطة التنفيذ من مدخلاتك ونتائج المحرك.')}${aiCard(W, 'explain_results', 'شرح النتائج المالية', '')}${aiCard(W, 'risks', 'تحليل المخاطر', 'يستفيد من تحليل الحساسية.')}`
  }

  FA.bindStepExtras = function (W) {
    const { save, set, scheduleSave } = w()
    const at = $('#apply-tax'); if (at) at.onclick = () => { set('tax.incomeTaxPct', W.inputs.tax.taxProfileHint.pct); scheduleSave(); FA.wizRender() }
    const dv = $('#derive-btn'); if (dv) dv.onclick = async () => {
      await save(true); busy(dv, true)
      try {
        const r = await api(`/studies/${W.study.id}/derive-revenue`, { method: 'POST' })
        if (r.error) { $('#derive-out').innerHTML = `<p class="text-sm text-red-600 mt-2">${esc(r.error)}</p>`; return }
        const it = r.item
        $('#derive-out').innerHTML = `<div class="mt-3 bg-white rounded-lg p-3 text-sm"><p class="text-xs text-slate-500">${r.steps.map(esc).join('<br>')}</p><div class="scroll-x"><table class="tbl mt-2"><tr><th>المنتج</th><th>الكمية/سنة</th><th>السعر</th><th>التكلفة المتغيرة</th><th>الطاقة</th><th>تشغيل</th><th>هالك</th></tr><tr><td>${esc(it.name)}</td><td class="num">${fmt(it.year1Volume)}</td><td class="num">${fmt(it.price, 2)}</td><td class="num">${fmt(it.unitVariableCost, 2)}</td><td class="num">${it.capacity ? fmt(it.capacity) : '—'}</td><td>${it.utilizationPct ?? '—'}</td><td>${it.wastePct ?? '—'}</td></tr></table></div><button id="derive-apply" class="btn-gold btn-sm mt-2">إضافة إلى الإيرادات</button></div>`
        $('#derive-apply').onclick = () => { W.inputs.revenue = (W.inputs.revenue || []).concat([it]); scheduleSave(); toast('أضيف خط الإيراد — راجعه في الخطوة 7') }
      } catch (e) { errToast(e) } finally { busy(dv, false) }
    }
    const pc = $('#precheck'); if (pc) pc.onclick = async () => { await save(true); busy(pc, true); try { const r = await api(`/studies/${W.study.id}/compute`, { method: 'POST' }); $('#precheck-out').innerHTML = FA.issuesHtml(r.base) } catch (e) { errToast(e) } finally { busy(pc, false) } }
    const gc = $('#gen-compute'); if (gc) gc.onclick = async () => { await save(true); busy(gc, true); try { const r = await api(`/studies/${W.study.id}/compute`, { method: 'POST' }); if (!r.base.computable) return modal({ title: 'لا يمكن الحساب بعد', body: FA.issuesHtml(r.base) }); toast('تم الحساب'); go(`/app/studies/${W.study.id}`) } catch (e) { errToast(e) } finally { busy(gc, false) } }
    const gv = $('#gen-version'); if (gv) gv.onclick = async () => { await save(true); busy(gv, true); try { const r = await api(`/studies/${W.study.id}/versions`, { method: 'POST', body: { changelog: $('#gen-note').value || undefined } }); toast(`تم حفظ الإصدار v${r.version}`); go(`/app/studies/${W.study.id}`) } catch (e) { if (e.details) modal({ title: 'بيانات ناقصة', body: `<ul class="text-sm list-disc pr-5">${e.details.map(d => `<li>${esc(d.message_ar || d.message)}</li>`).join('')}</ul>` }); else errToast(e) } finally { busy(gv, false) } }
  }
})()
