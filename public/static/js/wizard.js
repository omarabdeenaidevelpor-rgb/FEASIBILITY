/* Feasibility study wizard — 13 steps, autosave. All calculations happen on the server engine. */
(function () {
  const { $, $$, esc, fmt, api, toast, errToast, go, route, modal, busy, S, loadSettings } = FA
  const CLS = [['USER_PROVIDED', 'من المستخدم'], ['ESTIMATED', 'تقديري'], ['VERIFIED', 'موثق'], ['NEEDS_REVIEW', 'يحتاج مراجعة']]
  const CATS = [['land', 'أرض'], ['building', 'مبانٍ'], ['equipment', 'معدات'], ['installation', 'تركيبات'], ['furniture', 'أثاث وتجهيزات'], ['vehicles', 'وسائل نقل'], ['technology', 'أجهزة وبرمجيات'], ['license', 'تراخيص'], ['preoperating', 'ما قبل التشغيل'], ['other', 'أخرى']]
  let W = null
  FA.W = () => W

  const get = (p) => p.split('.').reduce((o, k) => (o == null ? undefined : o[k]), W.inputs)
  const set = (p, v) => { const ks = p.split('.'); let o = W.inputs; ks.slice(0, -1).forEach((k, i) => { if (o[k] == null || typeof o[k] !== 'object') o[k] = /^\d+$/.test(ks[i + 1]) ? [] : {}; o = o[k] }); o[ks.at(-1)] = v }
  const cur = () => W.inputs.info?.currency || W.project.currency

  function scheduleSave() { W.dirty = true; saveState('pending'); clearTimeout(W.timer); W.timer = setTimeout(save, 900) }
  async function save(force) {
    if (!W || (!W.dirty && !force) || W.saving || !FA.can('study.write')) return
    W.saving = true; W.dirty = false; saveState('saving')
    try {
      const r = await api(`/studies/${W.study.id}/inputs`, { method: 'PUT', body: { inputs: W.inputs, currentStep: W.step, baseUpdatedAt: W.updatedAt } })
      W.updatedAt = r.updatedAt; W.completeness = r.completeness; saveState('saved'); renderSidebar()
    } catch (e) {
      W.dirty = true; saveState('error')
      if (e.code === 'CONFLICT') modal({ title: 'تعارض في التعديل', body: `<p>${esc(e.message)}</p>`, actions: '<button class="btn-primary" onclick="location.reload()">إعادة التحميل</button>' })
      else errToast(e)
    } finally { W.saving = false }
  }
  function saveState(s) { const el = $('#save-state'); if (el) el.innerHTML = { pending: '<i class="fas fa-circle text-[8px] text-amber-500"></i> تغييرات غير محفوظة', saving: '<i class="fas fa-spinner fa-spin"></i> جارٍ الحفظ…', saved: '<i class="fas fa-check text-emerald-600"></i> تم الحفظ تلقائيًا', error: '<i class="fas fa-triangle-exclamation text-red-600"></i> فشل الحفظ' }[s] }
  window.addEventListener('beforeunload', (e) => { if (W?.dirty) { e.preventDefault(); e.returnValue = '' } })

  const field = (path, label, o = {}) => {
    const { type = 'number', unit = '', required = false, help = '', placeholder = '', options = null, cls = '' } = o
    const v = get(path) ?? ''
    let input
    if (type === 'textarea') input = `<textarea data-path="${path}" rows="4" class="input" placeholder="${esc(placeholder)}">${esc(v)}</textarea>`
    else if (type === 'select') input = `<select data-path="${path}" class="input"><option value="">—</option>${options.map(x => { const [a, b] = Array.isArray(x) ? x : [x, x]; return `<option value="${esc(a)}" ${String(v) === String(a) ? 'selected' : ''}>${esc(b)}</option>` }).join('')}</select>`
    else input = `<div class="relative"><input data-path="${path}" type="${type}" ${type === 'number' ? 'step="any" inputmode="decimal"' : ''} class="input ${unit ? 'pl-16' : ''}" value="${esc(v)}" placeholder="${esc(placeholder)}">${unit ? `<span class="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">${esc(unit)}</span>` : ''}</div>`
    return `<div class="${cls}"><label class="label">${esc(label)} ${required ? '<span class="req">*</span>' : '<span class="text-slate-400 font-normal text-xs">(اختياري)</span>'}</label>${input}${help ? `<p class="text-xs text-slate-500 mt-1">${help}</p>` : ''}</div>`
  }
  function rowEditor(key, cols, { addLabel, empty, newRow }) {
    const rows = get(key) || []
    const cell = (i, c, v) => {
      const p = `${key}.${i}.${c.key}`
      if (c.type === 'select') return `<select data-path="${p}" class="input !py-1.5 text-sm">${c.options.map(([a, b]) => `<option value="${a}" ${String(v ?? '') === String(a) ? 'selected' : ''}>${b}</option>`).join('')}</select>`
      if (c.type === 'check') return `<input type="checkbox" data-path="${p}" ${v ? 'checked' : ''} class="w-4 h-4">`
      return `<input data-path="${p}" type="${c.type || 'number'}" ${c.type === 'text' ? '' : 'step="any" inputmode="decimal"'} class="input !py-1.5 text-sm" value="${esc(v ?? '')}" placeholder="${esc(c.ph || '')}">`
    }
    return `<div class="scroll-x row-editor"><table class="tbl"><thead><tr>${cols.map(c => `<th style="min-width:${c.w || 110}px">${c.label}${c.req ? ' <span class="text-red-500">*</span>' : ''}</th>`).join('')}<th></th></tr></thead><tbody>
      ${rows.length ? rows.map((r, i) => `<tr>${cols.map(c => `<td>${cell(i, c, r?.[c.key])}</td>`).join('')}<td><button class="text-red-500 hover:bg-red-50 w-8 h-8 rounded" data-del="${key}" data-i="${i}" aria-label="حذف"><i class="fas fa-trash-can"></i></button></td></tr>`).join('') : `<tr><td colspan="${cols.length + 1}" class="text-center text-slate-400 py-6">${empty}</td></tr>`}
    </tbody></table></div><button class="btn-ghost btn-sm mt-2" data-add="${key}" data-new='${esc(JSON.stringify(newRow))}'><i class="fas fa-plus"></i> ${addLabel}</button>`
  }
  FA.wiz = { get, set, field, rowEditor, cur, CLS, CATS, save, scheduleSave }

  function renderSidebar() {
    const miss = new Set((W.completeness?.missing || []).filter(m => m.required).map(m => m.step))
    const nav = $('#steps-nav'); if (!nav) return
    nav.innerHTML = W.steps.map(s => { const done = s.n <= 11 && !miss.has(s.n) && W.step !== s.n; return `<button class="step-pill ${W.step === s.n ? 'active' : ''} ${done ? 'done' : ''}" data-step="${s.n}"><span class="dot">${done ? '<i class="fas fa-check"></i>' : s.n}</span>${esc(s.ar)}${miss.has(s.n) ? '<i class="fas fa-circle text-[6px] text-red-500 mr-auto"></i>' : ''}</button>` }).join('')
    $$('[data-step]', nav).forEach(b => b.onclick = () => gotoStep(+b.dataset.step))
    const pc = W.completeness?.pct || 0
    $('#progress-bar').style.width = pc + '%'; $('#progress-txt').textContent = pc + '%'
    $('#step-select').value = W.step
  }
  function gotoStep(n) { save(); W.step = Math.max(1, Math.min(13, n)); history.replaceState({}, '', `/app/studies/${W.study.id}/wizard?step=${W.step}`); renderStep() }
  FA.wizGoto = gotoStep

  const DESC = { 1: 'البيانات الأساسية وأفق الدراسة.', 2: 'صف الفكرة والمنتجات بوضوح — تُستخدم في التقرير.', 3: 'العملاء والمنافسون، مع ربط المعلومات بمصادرها.', 4: 'بيانات تشغيلية خاصة بقطاعك.', 5: 'الأصول والتجهيزات وتكاليف التأسيس.', 6: 'المصروفات الدورية والرواتب.', 7: 'المنتجات وأسعارها وكمياتها.', 8: 'مصادر التمويل.', 9: 'الضرائب ورأس المال العامل.', 10: 'افتراضات الاقتصاد الكلي ومعدل الخصم.', 11: 'سيناريوهات بديلة تعتمدها بنفسك.', 12: 'راجع ما ينقص قبل التوليد.', 13: 'احسب النتائج واحفظ إصدارًا.' }
  function renderStep() {
    const s = W.steps[W.step - 1]
    $('#step-body').innerHTML = `<header class="mb-5"><div class="text-xs text-gold-600 font-bold">الخطوة ${W.step} من 13</div><h2 class="text-xl font-extrabold text-navy-800">${esc(s.ar)}</h2><p class="text-sm text-slate-500">${DESC[W.step]}</p></header><div class="fade-in">${FA.STEP_UI[W.step](W)}</div>
      <footer class="flex justify-between mt-8 pt-4 border-t"><button id="prev-step" class="btn-ghost" ${W.step === 1 ? 'disabled' : ''}><i class="fas fa-arrow-right"></i> السابق</button>${W.step < 13 ? '<button id="next-step" class="btn-primary">التالي <i class="fas fa-arrow-left"></i></button>' : `<a href="/app/studies/${W.study.id}" data-link class="btn-primary">صفحة النتائج <i class="fas fa-arrow-left"></i></a>`}</footer>`
    renderSidebar(); bindStep(); FA.loadEvidence && FA.loadEvidence(W)
  }
  FA.wizRender = renderStep

  function bindStep() {
    const body = $('#step-body')
    if (!FA.can('study.write')) $$('input,select,textarea', body).forEach(el => el.disabled = true)
    const onChange = (e) => { const p = e.target.dataset.path; if (!p) return; set(p, e.target.type === 'checkbox' ? e.target.checked : e.target.value); scheduleSave() }
    body.oninput = onChange; body.onchange = onChange
    body.onclick = (e) => {
      const add = e.target.closest('[data-add]'), del = e.target.closest('[data-del]'), ai = e.target.closest('[data-ai]'), gt = e.target.closest('[data-goto]')
      if (add) { const k = add.dataset.add; const arr = get(k) || []; arr.push(JSON.parse(add.dataset.new)); set(k, arr); scheduleSave(); renderStep() }
      if (del) { const k = del.dataset.del; const arr = get(k) || []; arr.splice(+del.dataset.i, 1); set(k, arr); scheduleSave(); renderStep() }
      if (ai) FA.runAiTask(W, ai.dataset.ai, ai)
      if (gt) gotoStep(+gt.dataset.goto)
    }
    $('#prev-step').onclick = () => gotoStep(W.step - 1)
    const nx = $('#next-step'); if (nx) nx.onclick = () => gotoStep(W.step + 1)
    FA.bindStepExtras && FA.bindStepExtras(W)
  }

  route('/app/studies/:id/wizard', async ({ id }, q) => {
    await loadSettings(); S.me = await api('/me')
    const d = await api('/studies/' + id)
    W = { study: d.study, inputs: d.inputs || {}, template: d.template, project: d.project, steps: d.steps, step: Math.min(13, Math.max(1, +(q.step || d.study.current_step || 1))), updatedAt: d.study.updated_at, completeness: d.completeness, ai: d.ai || {}, aiConfigured: d.aiConfigured, dirty: false }
    FA.mountApp('studies', `
      <nav class="text-sm text-slate-500 mb-3"><a href="/app/projects/${d.project.id}" data-link>${esc(d.project.name)}</a> / <a href="/app/studies/${id}" data-link>${esc(d.study.title)}</a> / المعالج</nav>
      <div class="grid lg:grid-cols-[260px_1fr] gap-5">
        <aside class="card p-3 h-fit lg:sticky lg:top-20"><div class="px-2 pb-3 border-b mb-2"><div class="flex justify-between text-xs mb-1"><span>اكتمال البيانات المطلوبة</span><b id="progress-txt">0%</b></div><div class="h-2 bg-slate-100 rounded-full"><div id="progress-bar" class="h-full bg-gold-500 rounded-full transition-all" style="width:0"></div></div><div id="save-state" class="text-xs text-slate-500 mt-2"><i class="fas fa-check text-emerald-600"></i> محفوظ</div></div>
          <select id="step-select" class="input lg:hidden mb-2">${d.steps.map(s => `<option value="${s.n}">${s.n}. ${esc(s.ar)}</option>`).join('')}</select>
          <nav id="steps-nav" class="hidden lg:block space-y-0.5"></nav>
          <a href="/app/studies/${id}" data-link class="btn-ghost btn-sm w-full mt-3"><i class="fas fa-chart-pie"></i> النتائج</a></aside>
        <section id="step-body" class="card p-5 md:p-6 min-w-0"></section></div>`, { title: 'معالج دراسة الجدوى' })
    $('#step-select').onchange = (e) => gotoStep(+e.target.value)
    if (!FA.can('study.write')) toast('لديك صلاحية عرض فقط', 'info')
    renderStep()
  })
})()
