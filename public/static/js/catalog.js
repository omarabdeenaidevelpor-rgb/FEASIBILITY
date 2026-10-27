/* Feasibility-study catalog: sector cards → sector studies → study detail → purchase form → WhatsApp */
(function () {
  const { $, $$, esc, fmt, api, toast, errToast, route, modal, busy, loadSettings, fieldErrors, GOVS, S } = FA
  const mount = (h) => FA.publicMount(h)
  const boot = async () => { await loadSettings(); await FA.ensureMe() }
  const DEFAULT_WA = '201008338490'

  const priceLabel = (s, big) => s.price != null
    ? `<span class="${big ? 'text-3xl' : 'text-lg'} font-extrabold text-navy-800 num">${fmt(s.price)}</span> <small class="text-slate-500">${esc(s.currency === 'EGP' ? 'ج.م' : s.currency)}</small>`
    : `<span class="${big ? 'text-xl' : 'text-sm'} font-bold text-gold-600"><i class="fas fa-tag ml-1"></i>السعر عند التواصل</span>`

  /* ---------- Reusable sector cards (also used on the home page) ---------- */
  FA.sectorCards = function (items) {
    return `<div class="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">${items.map((s, i) => `
      <a href="/sectors/${esc(s.id)}" data-link class="sector-card group fade-up" style="--d:${i * 60}ms;--c:${esc(s.color || '#0B2A5B')}" aria-label="${esc(s.name_ar)}">
        <div class="sector-media"><img src="${esc(s.image)}" alt="${esc(s.name_ar)}" loading="lazy"><span class="sector-count"><i class="fas fa-file-lines"></i> ${s.studies_count ?? (s.items || []).length} دراسة</span></div>
        <div class="p-5 flex flex-col flex-1">
          <div class="flex items-center gap-3"><span class="sector-icon"><i class="fas ${esc(s.icon || 'fa-briefcase')}"></i></span><h3 class="font-extrabold text-navy-800 text-lg leading-snug">${esc(s.name_ar)}</h3></div>
          <p class="text-sm text-slate-500 mt-2 leading-7 line-clamp-2">${esc(s.tagline || '')}</p>
          <div class="flex flex-wrap gap-1.5 mt-3">${(s.items || []).slice(0, 4).map(t => `<span class="mini-chip">${esc(t)}</span>`).join('')}${(s.items || []).length > 4 ? `<span class="mini-chip">+${s.items.length - 4}</span>` : ''}</div>
          <span class="mt-auto pt-4 flex items-center justify-between text-navy-800 font-bold text-sm">عرض دراسات القطاع <i class="fas fa-arrow-left transition-transform group-hover:-translate-x-1"></i></span>
        </div></a>`).join('')}</div>`
  }

  const crumbs = (list) => `<nav aria-label="مسار التنقل" class="text-sm text-slate-300 flex flex-wrap items-center gap-2">${list.map(([h, l], i) => (i ? '<i class="fas fa-chevron-left text-[10px] opacity-60"></i>' : '') + (h ? `<a href="${h}" data-link class="hover:text-gold-300">${esc(l)}</a>` : `<span class="text-white font-semibold">${esc(l)}</span>`)).join('')}</nav>`

  /* ---------- /sectors ---------- */
  route('/sectors', async () => {
    await boot()
    const [d, cfg] = await Promise.all([api('/public/sectors'), api('/public/catalog/settings').catch(() => ({}))])
    const total = d.items.reduce((a, s) => a + (s.studies_count || 0), 0)
    mount(`
    <section class="hero-bg text-white relative overflow-hidden">
      <div class="hero-grid"></div>
      <div class="max-w-7xl mx-auto px-4 py-14 md:py-20 relative">
        ${crumbs([['/', 'الرئيسية'], [null, 'دراسات الجدوى الجاهزة']])}
        <h1 class="mt-4 text-3xl md:text-5xl font-extrabold leading-tight">دراسات جدوى <span class="text-gold-400">جاهزة</span> لكل قطاع</h1>
        <p class="mt-4 text-slate-200 leading-8 max-w-2xl">${esc(cfg.intro || 'اختر القطاع ثم الدراسة المناسبة لمشروعك واطلبها مباشرة.')}</p>
        <div class="mt-6 flex flex-wrap gap-3 text-sm"><span class="stat-pill"><i class="fas fa-layer-group"></i> ${d.items.length} قطاعات</span><span class="stat-pill"><i class="fas fa-file-lines"></i> ${total} دراسة</span><span class="stat-pill"><i class="fab fa-whatsapp"></i> طلب مباشر عبر واتساب</span></div>
        <form id="cat-search" class="mt-8 max-w-xl relative" role="search"><i class="fas fa-magnifying-glass absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 z-10"></i><input name="q" class="w-full rounded-2xl py-4 pr-11 pl-4 text-slate-800 shadow-xl focus:outline-none focus:ring-4 focus:ring-gold-400/40" placeholder="ابحث عن دراسة… مثال: دواجن، سوبر ماركت، تطبيق" autocomplete="off"><div id="cat-results" class="absolute inset-x-0 top-full mt-2 bg-white rounded-2xl shadow-2xl overflow-hidden hidden z-20"></div></form>
      </div>
    </section>
    <section id="sectors-grid" class="max-w-7xl mx-auto px-4 py-14">${FA.sectorCards(d.items)}</section>
    ${FA.howToBuy()}`)
    bindSearch()
  })

  function bindSearch() {
    const f = $('#cat-search'); if (!f) return
    let t; const box = $('#cat-results')
    f.onsubmit = (e) => e.preventDefault()
    f.q.oninput = () => {
      clearTimeout(t); const v = f.q.value.trim()
      if (v.length < 2) { box.classList.add('hidden'); return }
      t = setTimeout(async () => {
        const r = await api('/public/catalog/search?q=' + encodeURIComponent(v)).catch(() => ({ items: [] }))
        box.innerHTML = r.items.length ? r.items.map(s => `<a href="/catalog/${esc(s.slug)}" data-link class="flex items-center gap-3 px-4 py-3 hover:bg-navy-50 text-slate-700 border-b last:border-0"><i class="fas ${esc(s.icon)} text-gold-500 w-5"></i><span class="font-semibold">${esc(s.title)}</span></a>`).join('') : '<p class="px-4 py-3 text-slate-500 text-sm">لا توجد نتائج مطابقة</p>'
        box.classList.remove('hidden')
      }, 220)
    }
  }

  FA.howToBuy = () => `<section class="bg-white border-y py-14"><div class="max-w-6xl mx-auto px-4">
    <div class="text-center mb-10"><span class="text-gold-600 font-bold text-sm">خطوات بسيطة</span><h2 class="text-2xl md:text-3xl font-extrabold text-navy-800 mt-2">كيف تطلب دراستك؟</h2></div>
    <ol class="grid sm:grid-cols-2 md:grid-cols-4 gap-5">${[['fas fa-layer-group', 'اختر القطاع', 'تصفح القطاعات السبعة'], ['fas fa-file-lines', 'اختر الدراسة', 'اطّلع على محتوياتها ومتطلباتها'], ['fas fa-pen-to-square', 'املأ بياناتك', 'نموذج سريع في أقل من دقيقة'], ['fab fa-whatsapp', 'أرسل عبر واتساب', 'يصلنا طلبك ونرد عليك مباشرة']].map(([i, t, d], n) => `<li class="step-card"><span class="step-num">${n + 1}</span><span class="w-14 h-14 mx-auto rounded-2xl bg-navy-800 text-gold-400 grid place-items-center text-2xl"><i class="${i}"></i></span><h3 class="mt-4 font-bold text-navy-800">${t}</h3><p class="text-sm text-slate-500 mt-1">${d}</p></li>`).join('')}</ol></div></section>`

  /* ---------- /sectors/:id ---------- */
  route('/sectors/:id', async ({ id }) => {
    await boot()
    const d = await api('/public/sectors/' + encodeURIComponent(id))
    const s = d.sector
    mount(`
    <section class="relative text-white overflow-hidden">
      <div class="absolute inset-0 bg-cover bg-center scale-110 blur-sm" style="background-image:url('${esc(s.image)}')"></div><div class="absolute inset-0 sector-hero-overlay"></div>
      <div class="max-w-7xl mx-auto px-4 py-12 md:py-16 relative grid lg:grid-cols-[1fr_240px] gap-10 items-center">
        <div>${crumbs([['/', 'الرئيسية'], ['/sectors', 'القطاعات'], [null, s.name_ar]])}
          <h1 class="mt-4 text-3xl md:text-5xl font-extrabold">${esc(s.name_ar)}</h1>
          <p class="mt-3 text-gold-300 font-semibold">${esc(s.tagline || '')}</p>
          <p class="mt-4 text-slate-200 leading-8 max-w-2xl">${esc(s.description || '')}</p>
          <div class="mt-6 flex flex-wrap gap-2">${s.items.map(t => `<span class="stat-pill">${esc(t)}</span>`).join('')}</div></div>
        <img src="${esc(s.image)}" alt="${esc(s.name_ar)}" class="hidden lg:block rounded-2xl shadow-2xl ring-4 ring-white/20 w-full">
      </div>
    </section>
    <section class="max-w-7xl mx-auto px-4 py-12">
      <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div><h2 class="text-2xl font-extrabold text-navy-800">دراسات الجدوى المتاحة <span class="text-slate-400 text-lg">(${d.studies.length})</span></h2><p class="text-slate-500 text-sm mt-1">اضغط على الدراسة لعرض تفاصيلها وطلبها</p></div>
        <div class="relative md:w-80"><i class="fas fa-filter absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"></i><input id="st-filter" class="input !pr-9" placeholder="تصفية الدراسات…"></div>
      </div>
      <div id="st-grid" class="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">${d.studies.map((t, i) => studyCard(t, s, i)).join('') || '<p class="text-slate-500">لا توجد دراسات في هذا القطاع حاليًا.</p>'}</div>
      <p id="st-empty" class="hidden text-center text-slate-500 py-10">لا توجد دراسات مطابقة</p>
    </section>
    <section id="other-sectors" class="bg-white border-t py-12 hidden"><div class="max-w-7xl mx-auto px-4"><h2 class="text-xl font-extrabold text-navy-800 mb-6">قطاعات أخرى</h2><div id="other-sectors-list" class="flex gap-4 overflow-x-auto pb-2 snap-x"></div></div></section>`)
    $('#st-filter').oninput = (e) => { const v = e.target.value.trim(); let n = 0; $$('#st-grid [data-title]').forEach(el => { const ok = !v || el.dataset.title.includes(v); el.classList.toggle('hidden', !ok); if (ok) n++ }); $('#st-empty').classList.toggle('hidden', n > 0) }
    $$('[data-buy]').forEach(b => b.onclick = (e) => { e.preventDefault(); e.stopPropagation(); const t = d.studies.find(x => x.id === b.dataset.buy); openBuy({ ...t, sector_name: s.name_ar }) })
    loadOtherSectors(s.id)
  })

  const studyCard = (t, s, i) => `
    <article data-title="${esc(t.title)}" class="study-card group fade-up" style="--d:${i * 40}ms;--c:${esc(s.color)}">
      <a href="/catalog/${esc(t.slug)}" data-link class="flex-1 flex flex-col p-6">
        <div class="flex items-start justify-between gap-3"><span class="study-icon"><i class="fas ${esc(t.icon || 'fa-file-lines')}"></i></span><span class="badge-soft">${esc(s.name_ar)}</span></div>
        <h3 class="mt-4 font-extrabold text-navy-800 text-lg leading-snug group-hover:text-navy-600">${esc(t.title)}</h3>
        <p class="text-sm text-slate-500 mt-2 leading-7 line-clamp-3">${esc(t.summary || '')}</p>
        <ul class="mt-4 grid grid-cols-2 gap-2 text-xs text-slate-600"><li><i class="fas fa-check-circle text-emerald-500 ml-1"></i>دراسة سوقية</li><li><i class="fas fa-check-circle text-emerald-500 ml-1"></i>دراسة فنية</li><li><i class="fas fa-check-circle text-emerald-500 ml-1"></i>قوائم مالية</li><li><i class="fas fa-check-circle text-emerald-500 ml-1"></i>تحليل مخاطر</li></ul>
      </a>
      <div class="px-6 py-4 border-t flex items-center justify-between gap-3 bg-slate-50/60 rounded-b-2xl"><div>${priceLabel(t)}</div><div class="flex gap-2"><a href="/catalog/${esc(t.slug)}" data-link class="btn-ghost btn-sm">التفاصيل</a><button data-buy="${esc(t.id)}" class="btn-gold btn-sm"><i class="fas fa-cart-shopping"></i> شراء</button></div></div>
    </article>`

  async function loadOtherSectors(cur) {
    try {
      const d = await api('/public/sectors'); const list = d.items.filter(x => x.id !== cur)
      if (!list.length || !$('#other-sectors-list')) return
      $('#other-sectors-list').innerHTML = list.map(s => `<a href="/sectors/${esc(s.id)}" data-link class="snap-start shrink-0 w-56 card overflow-hidden hover:shadow-lg transition group"><div class="h-32 overflow-hidden"><img src="${esc(s.image)}" class="w-full h-full object-cover object-top group-hover:scale-105 transition duration-500" alt="" loading="lazy"></div><div class="p-3"><b class="text-sm text-navy-800">${esc(s.name_ar)}</b><p class="text-xs text-slate-500 mt-1">${s.studies_count} دراسة</p></div></a>`).join('')
      $('#other-sectors').classList.remove('hidden')
    } catch { }
  }

  /* ---------- /catalog/:slug ---------- */
  const waLink = (num, text) => `https://wa.me/${String(num || DEFAULT_WA).replace(/\D/g, '') || DEFAULT_WA}?text=${encodeURIComponent(text)}`

  route('/catalog/:slug', async ({ slug }) => {
    await boot()
    const d = await api('/public/catalog/' + encodeURIComponent(slug))
    const t = d.study
    S.catalogWa = d.whatsapp
    const listBlock = (id, icon, title, arr, cls = 'fa-check text-emerald-600') => arr && arr.length ? `<section id="${id}" class="card p-6 scroll-mt-28"><h2 class="sec-h"><i class="fas ${icon}"></i>${title}</h2><ul class="grid sm:grid-cols-2 gap-x-6 gap-y-3 mt-4">${arr.map(x => `<li class="flex gap-2 text-slate-700 text-[15px] leading-7"><i class="fas ${cls} mt-1.5 text-xs"></i><span>${esc(x)}</span></li>`).join('')}</ul></section>` : ''
    mount(`
    <section class="relative text-white overflow-hidden">
      <div class="absolute inset-0 bg-cover bg-center scale-110 blur-md" style="background-image:url('${esc(t.image)}')"></div><div class="absolute inset-0 sector-hero-overlay"></div>
      <div class="max-w-7xl mx-auto px-4 py-10 md:py-14 relative">
        ${crumbs([['/', 'الرئيسية'], ['/sectors', 'القطاعات'], ['/sectors/' + t.sector_id, t.sector_name], [null, t.title]])}
        <div class="mt-5 flex items-start gap-4"><span class="hidden sm:grid w-16 h-16 rounded-2xl bg-gold-500 text-navy-900 place-items-center text-2xl shrink-0 shadow-lg"><i class="fas ${esc(t.icon)}"></i></span>
          <div><h1 class="text-2xl md:text-4xl font-extrabold leading-tight">${esc(t.title)}</h1><p class="mt-3 text-slate-200 leading-8 max-w-3xl">${esc(t.summary || '')}</p>
          <div class="mt-5 flex flex-wrap gap-2 text-sm"><span class="stat-pill"><i class="fas fa-layer-group"></i> ${esc(t.sector_name)}</span><span class="stat-pill"><i class="fas fa-list-ol"></i> ${t.contents.length} قسمًا</span><span class="stat-pill"><i class="fas fa-file-pdf"></i> PDF + Excel</span><span class="stat-pill"><i class="fas fa-language"></i> باللغة العربية</span></div></div></div>
      </div>
    </section>
    <div class="max-w-7xl mx-auto px-4 py-10 grid lg:grid-cols-[1fr_360px] gap-8 items-start">
      <div class="space-y-6 min-w-0">
        <nav class="card p-2 flex gap-1 overflow-x-auto text-sm font-semibold sticky top-[68px] z-20" aria-label="أقسام الصفحة">${[['about', 'نبذة'], ['contents', 'محتويات الدراسة'], ['requirements', 'المتطلبات'], ['costs', 'بنود التكاليف'], ['revenue', 'مصادر الإيراد'], ['risks', 'المخاطر']].map(([h, l]) => `<a href="#${h}" class="px-3 py-2 rounded-lg hover:bg-navy-50 text-slate-600 whitespace-nowrap">${l}</a>`).join('')}</nav>
        <section id="about" class="card p-6 scroll-mt-28"><h2 class="sec-h"><i class="fas fa-circle-info"></i>نبذة عن الدراسة</h2><p class="mt-4 text-slate-700 leading-8 text-[15px]">${esc(t.description || t.summary || '')}</p>
          <div class="grid sm:grid-cols-3 gap-3 mt-6">${[['fa-bullseye', 'تحليل السوق والمنافسين'], ['fa-calculator', 'حسابات مالية دقيقة'], ['fa-chart-line', 'مؤشرات NPV وIRR']].map(([i, l]) => `<div class="rounded-xl bg-navy-50 p-4 flex items-center gap-3"><i class="fas ${i} text-navy-800 text-lg"></i><b class="text-sm text-navy-800">${l}</b></div>`).join('')}</div></section>
        <section id="contents" class="card p-6 scroll-mt-28"><h2 class="sec-h"><i class="fas fa-list-ol"></i>محتويات الدراسة</h2><ol class="mt-4 grid sm:grid-cols-2 gap-3">${t.contents.map((x, i) => `<li class="flex items-start gap-3 bg-slate-50 rounded-xl px-4 py-3"><span class="w-7 h-7 rounded-full bg-navy-800 text-gold-400 text-xs font-bold grid place-items-center shrink-0">${i + 1}</span><span class="text-sm text-slate-700 leading-6 pt-0.5">${esc(x)}</span></li>`).join('')}</ol></section>
        ${listBlock('requirements', 'fa-clipboard-check', 'المتطلبات والاشتراطات الأساسية', t.requirements)}
        ${listBlock('costs', 'fa-coins', 'أهم بنود التكاليف التي تغطيها الدراسة', t.cost_items, 'fa-circle-dot text-gold-500')}
        ${listBlock('revenue', 'fa-sack-dollar', 'مصادر الإيراد المتوقعة', t.revenue, 'fa-arrow-trend-up text-emerald-600')}
        ${listBlock('risks', 'fa-triangle-exclamation', 'المخاطر التي تحللها الدراسة', t.risks, 'fa-shield-halved text-amber-600')}
        <div class="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900 leading-7"><i class="fas fa-circle-info ml-1"></i> <b>تنبيه مهم:</b> دراسة الجدوى أداة لدعم القرار وتعتمد على افتراضات وبيانات وقت إعدادها، ولا تمثل ضمانًا لتحقيق أرباح. يتم تحديث الأرقام وفق موقعك وحجم مشروعك، ويُنصح بمراجعتها مع مختص قبل الاستثمار.</div>
      </div>
      <aside class="lg:sticky lg:top-[84px] space-y-4">
        <div class="buy-card">
          <img src="${esc(t.image)}" alt="" class="w-full h-44 object-cover object-top rounded-t-2xl">
          <div class="p-6">
            <div class="text-xs text-slate-500 mb-1">سعر الدراسة</div><div>${priceLabel(t, true)}</div>
            <button id="buy-btn" class="btn-gold w-full mt-5 !py-3.5 text-lg"><i class="fas fa-cart-shopping"></i> شراء الدراسة</button>
            <a href="${esc(waLink(d.whatsapp, 'مرحبًا، لدي استفسار عن: ' + t.title + '\n' + location.href))}" target="_blank" rel="noopener" class="btn-wa w-full mt-3"><i class="fab fa-whatsapp text-lg"></i> استفسار سريع عبر واتساب</a>
            <ul class="mt-6 space-y-3 text-sm text-slate-600">${[['fa-file-pdf', t.deliverables || 'ملف PDF + Excel'], ['fa-sliders', 'تخصيص الأرقام حسب موقعك وحجم مشروعك'], ['fa-headset', 'متابعة والرد على استفساراتك'], ['fa-lock', 'بياناتك تُستخدم فقط للتواصل بشأن طلبك']].map(([i, l]) => `<li class="flex gap-3"><i class="fas ${i} text-navy-700 mt-1 w-4"></i><span class="leading-6">${esc(l)}</span></li>`).join('')}</ul>
          </div>
        </div>
      </aside>
    </div>
    ${d.related.length ? `<section class="bg-white border-t py-12 pb-24 lg:pb-12"><div class="max-w-7xl mx-auto px-4"><div class="flex items-center justify-between mb-6"><h2 class="text-xl font-extrabold text-navy-800">دراسات أخرى في ${esc(t.sector_name)}</h2><a href="/sectors/${esc(t.sector_id)}" data-link class="text-sm font-bold text-navy-700">عرض الكل <i class="fas fa-arrow-left"></i></a></div><div class="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">${d.related.map(r => `<a href="/catalog/${esc(r.slug)}" data-link class="card p-5 hover:shadow-lg hover:-translate-y-0.5 transition"><span class="study-icon !w-10 !h-10 !text-base"><i class="fas ${esc(r.icon)}"></i></span><b class="block mt-3 text-navy-800 leading-snug">${esc(r.title)}</b><div class="mt-3 text-sm">${priceLabel(r)}</div></a>`).join('')}</div></div></section>` : ''}
    <div class="lg:hidden fixed bottom-0 inset-x-0 z-30 bg-white/95 backdrop-blur border-t p-3 flex items-center gap-3 shadow-2xl"><div class="flex-1 min-w-0"><div class="text-xs text-slate-500 truncate">${esc(t.title)}</div>${priceLabel(t)}</div><button id="buy-btn-m" class="btn-gold"><i class="fas fa-cart-shopping"></i> شراء</button></div>`)
    $('#buy-btn').onclick = () => openBuy(t)
    $('#buy-btn-m').onclick = () => openBuy(t)
    if (new URLSearchParams(location.search).get('buy') === '1') openBuy(t)
  })

  /* ---------- Purchase modal → save → WhatsApp ---------- */
  function buildMessage(t, b, ref) {
    const L = ['🛒 *طلب شراء دراسة جدوى*', '', `📄 *الدراسة:* ${t.title}`]
    if (t.sector_name) L.push(`🏷️ *القطاع:* ${t.sector_name}`)
    if (t.price != null) L.push(`💰 *السعر المعروض:* ${fmt(t.price)} ${t.currency}`)
    L.push('', '👤 *بيانات العميل*', `• الاسم: ${b.name}`, `• الهاتف: ${b.phone}`)
    if (b.email) L.push(`• البريد: ${b.email}`)
    if (b.governorate) L.push(`• المحافظة: ${b.governorate}`)
    if (b.budget) L.push(`• الميزانية المتوقعة: ${b.budget}`)
    if (b.notes) L.push(`• ملاحظات: ${b.notes}`)
    L.push('')
    if (ref) L.push(`🔖 رقم الطلب: ${ref}`)
    L.push(`🔗 ${location.origin}/catalog/${t.slug}`)
    return L.join('\n')
  }
  FA.buildPurchaseMessage = buildMessage

  function openBuy(t) {
    const md = modal({
      title: '<i class="fas fa-cart-shopping text-gold-500 ml-2"></i>طلب شراء الدراسة', size: 'max-w-xl',
      body: `
      <div class="flex items-center gap-3 rounded-xl bg-navy-50 p-3 mb-5"><span class="study-icon !w-11 !h-11 !text-base shrink-0"><i class="fas ${esc(t.icon || 'fa-file-lines')}"></i></span><div class="min-w-0"><b class="block text-navy-800 truncate">${esc(t.title)}</b><div class="text-sm">${priceLabel(t)}</div></div></div>
      <form id="buy-form" class="grid sm:grid-cols-2 gap-4" novalidate>
        <div class="sm:col-span-2"><label class="label">الاسم بالكامل <span class="req">*</span></label><input name="name" class="input" required autocomplete="name" placeholder="مثال: أحمد محمد"></div>
        <div><label class="label">رقم الهاتف / واتساب <span class="req">*</span></label><input name="phone" class="input" dir="ltr" inputmode="tel" required autocomplete="tel" placeholder="01xxxxxxxxx"></div>
        <div><label class="label">البريد الإلكتروني</label><input name="email" type="email" class="input" dir="ltr" autocomplete="email" placeholder="name@example.com"></div>
        <div><label class="label">المحافظة</label><select name="governorate" class="input"><option value="">— اختر —</option>${GOVS.map(g => `<option>${esc(g)}</option>`).join('')}<option>خارج مصر</option></select></div>
        <div><label class="label">الميزانية المتوقعة للمشروع</label><select name="budget" class="input"><option value="">— اختياري —</option>${['أقل من 100 ألف', '100 – 500 ألف', '500 ألف – 1 مليون', '1 – 5 مليون', 'أكثر من 5 مليون', 'غير محدد بعد'].map(x => `<option>${x}</option>`).join('')}</select></div>
        <div class="sm:col-span-2"><label class="label">ملاحظات أو تفاصيل إضافية</label><textarea name="notes" rows="3" class="input" maxlength="1000" placeholder="مثال: موقع المشروع، الطاقة الإنتاجية المطلوبة…"></textarea></div>
        <input name="website" class="hidden" tabindex="-1" autocomplete="off" aria-hidden="true">
        <p class="sm:col-span-2 text-xs text-slate-500 leading-6"><i class="fas fa-lock ml-1"></i>عند الضغط على «إرسال» يتم حفظ طلبك وفتح محادثة واتساب برسالة جاهزة تحتوي بياناتك؛ اضغط «إرسال» داخل واتساب لإتمام الطلب.</p>
      </form>`,
      actions: `<button data-close class="btn-ghost">إلغاء</button><button id="buy-send" class="btn-wa !px-6"><i class="fab fa-whatsapp text-lg"></i> إرسال</button>`
    })
    const f = $('#buy-form', md.el)
    setTimeout(() => f.elements.name.focus(), 50)
    f.addEventListener('input', (e) => { const x = e.target; if (x.classList.contains('input-err')) { x.classList.remove('input-err'); const n = x.nextElementSibling; if (n && n.classList.contains('field-err')) n.remove() } })
    f.onsubmit = (e) => { e.preventDefault(); $('#buy-send', md.el).click() }
    $('#buy-send', md.el).onclick = async () => {
      const btn = $('#buy-send', md.el), el = f.elements
      const b = { studyId: t.id, name: el.name.value.trim(), phone: el.phone.value.trim(), email: el.email.value.trim(), governorate: el.governorate.value, budget: el.budget.value, notes: el.notes.value.trim() }
      const errs = []
      if (b.name.length < 3) errs.push({ path: 'name', message: 'من فضلك اكتب الاسم بالكامل' })
      if (!/^\+?[0-9\s-]{8,20}$/.test(b.phone)) errs.push({ path: 'phone', message: 'رقم هاتف غير صالح' })
      if (b.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(b.email)) errs.push({ path: 'email', message: 'بريد إلكتروني غير صالح' })
      fieldErrors(f, errs)
      if (errs.length) { f.querySelector('.input-err')?.focus(); return }
      if (el.website.value) return
      // open the tab synchronously inside the click gesture to avoid popup blockers
      const win = window.open('', '_blank')
      busy(btn, true)
      let ref = '', num = S.catalogWa
      try { const r = await api('/public/purchase-requests', { method: 'POST', body: b }); ref = r.ref; num = r.whatsapp || num }
      catch (er) {
        if ((er.details && er.details.length) || er.code === 'RATE_LIMITED') { if (win) win.close(); fieldErrors(f, er.details); errToast(er); busy(btn, false); return }
        // network/server issue: still hand the request to WhatsApp so the customer isn't blocked
      }
      const url = waLink(num, buildMessage(t, b, ref))
      if (win) { try { win.opener = null } catch { } win.location.href = url } else { location.href = url }
      busy(btn, false)
      $('.modal-body', md.el).innerHTML = `<div class="text-center py-6"><span class="w-20 h-20 mx-auto rounded-full bg-emerald-100 text-emerald-600 grid place-items-center text-4xl"><i class="fas fa-check"></i></span>
        <h3 class="mt-5 text-xl font-extrabold text-navy-800">تم تسجيل طلبك بنجاح</h3>${ref ? `<p class="mt-2 text-slate-600">رقم الطلب: <b dir="ltr" class="text-navy-800">${esc(ref)}</b></p>` : ''}
        <p class="mt-3 text-slate-600 leading-7">تم فتح واتساب برسالة جاهزة. إن لم تُفتح المحادثة تلقائيًا اضغط الزر التالي ثم اضغط «إرسال» داخل واتساب.</p>
        <a href="${esc(url)}" target="_blank" rel="noopener" class="btn-wa mt-5 !px-8 !py-3"><i class="fab fa-whatsapp text-xl"></i> فتح محادثة واتساب</a></div>`
      const foot = md.el.querySelector('footer'); if (foot) foot.innerHTML = '<button data-close class="btn-ghost">إغلاق</button>'
      toast('تم تسجيل طلبك')
    }
  }
  FA.openBuy = openBuy
})()
