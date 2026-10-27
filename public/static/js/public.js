/* Public pages + auth pages */
(function () {
  const { $, esc, api, toast, errToast, go, route, loadSettings, formData, fieldErrors, busy, S } = FA

  const NAV = [['/sectors', 'دراسات جاهزة'], ['/features', 'المميزات'], ['/how-it-works', 'كيف تعمل'], ['/study-types', 'القوالب'], ['/sample-report', 'نماذج التقارير'], ['/pricing', 'الباقات'], ['/articles', 'المعرفة'], ['/contact', 'تواصل معنا']]

  FA.publicLayout = function (content) {
    const st = S.settings || {}
    const logged = !!S.me
    return `
    <div class="topbar hidden md:block"><div class="max-w-7xl mx-auto px-4 h-9 flex items-center justify-between text-xs"><span><i class="fas fa-circle-check text-gold-400 ml-1"></i> دراسات جدوى احترافية بمحرك مالي مستقل — بدون أرقام وهمية</span><span class="flex items-center gap-4"><a href="https://wa.me/${esc(st.whatsapp || '201008338490')}" target="_blank" rel="noopener" class="hover:text-gold-300"><i class="fab fa-whatsapp ml-1"></i>واتساب</a>${st.support_email ? `<a href="mailto:${esc(st.support_email)}" class="hover:text-gold-300" dir="ltr"><i class="fas fa-envelope mr-1"></i>${esc(st.support_email)}</a>` : ''}</span></div></div>
    <header class="site-header bg-white/95 backdrop-blur border-b sticky top-0 z-40">
      <nav class="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between gap-4" aria-label="التنقل الرئيسي">
        <a href="/" data-link class="flex items-center gap-2 shrink-0"><img src="${esc(st.logo || '/static/img/logo.png')}" alt="الشعار" class="h-10 w-auto"><span class="leading-tight"><b class="block text-navy-800 text-[15px]">${esc(st.name_ar || 'اصنع مشروعك بنفسك')}</b><small class="text-slate-500 text-[11px]">منصة دراسات جدوى المشروعات</small></span></a>
        <ul class="hidden lg:flex items-center gap-1 text-sm font-semibold text-slate-600">${NAV.map(([h, l]) => `<li><a href="${h}" data-link class="px-3 py-2 rounded-lg hover:bg-navy-50 hover:text-navy-800 ${(location.pathname === h || (h === '/sectors' && /^\/(sectors|catalog)/.test(location.pathname))) ? 'text-navy-800 bg-navy-50' : ''}">${l}</a></li>`).join('')}</ul>
        <div class="flex items-center gap-2">
          ${logged ? `<a href="/app" data-link class="btn-primary btn-sm">لوحة التحكم</a>` : `<a href="/login" data-link class="hidden sm:inline-flex btn-ghost btn-sm">تسجيل الدخول</a><a href="/register" data-link class="btn-gold btn-sm">ابدأ الآن</a>`}
          <button id="mnav-btn" class="lg:hidden w-10 h-10 rounded-lg hover:bg-slate-100" aria-label="القائمة"><i class="fas fa-bars"></i></button>
        </div>
      </nav>
      <div id="mnav" class="hidden lg:hidden border-t bg-white px-4 py-2">${NAV.map(([h, l]) => `<a href="${h}" data-link class="block py-2 font-semibold text-slate-700">${l}</a>`).join('')}${logged ? '' : '<a href="/login" data-link class="block py-2 font-semibold text-navy-800">تسجيل الدخول</a>'}</div>
    </header>
    <main id="main">${content}</main>
    <a href="https://wa.me/${esc(st.whatsapp || '201008338490')}" target="_blank" rel="noopener" class="wa-float" aria-label="تواصل عبر واتساب"><i class="fab fa-whatsapp"></i></a>
    <footer class="bg-navy-900 text-slate-300 mt-16">
      <div class="max-w-7xl mx-auto px-4 py-12 grid gap-8 md:grid-cols-5">
        <div class="md:col-span-2"><div class="flex items-center gap-3"><img src="${esc(st.logo || '/static/img/logo.png')}" class="h-12 bg-white/95 rounded-xl p-1" alt=""><div><b class="text-white text-lg">${esc(st.name_ar || '')}</b><p class="text-sm text-gold-400">${esc(st.tagline_ar || '')}</p></div></div>
          <p class="mt-4 text-sm leading-7 max-w-md">منصة لإعداد دراسات الجدوى الاقتصادية والمالية بمحرك حسابات مستقل ومساعد ذكاء اصطناعي مسؤول. النتائج مبنية على افتراضاتك ولا تضمن نجاح الاستثمار.</p></div>
        <div><h4 class="text-white font-bold mb-3">دراسات جاهزة</h4><ul class="space-y-2 text-sm">${[['agriculture', 'الثروة الزراعية'], ['commercial', 'التجاري'], ['industrial', 'الصناعي'], ['livestock', 'الثروة الحيوانية'], ['services', 'الخدمات'], ['technology', 'التكنولوجيا'], ['home', 'مشروعات منزلية']].map(([h, l]) => `<li><a href="/sectors/${h}" data-link class="hover:text-gold-400">${l}</a></li>`).join('')}</ul></div>
        <div><h4 class="text-white font-bold mb-3">المنصة</h4><ul class="space-y-2 text-sm">${NAV.slice(0, 5).map(([h, l]) => `<li><a href="${h}" data-link class="hover:text-gold-400">${l}</a></li>`).join('')}</ul></div>
        <div><h4 class="text-white font-bold mb-3">قانوني</h4><ul class="space-y-2 text-sm"><li><a href="/faq" data-link class="hover:text-gold-400">الأسئلة الشائعة</a></li><li><a href="/privacy" data-link class="hover:text-gold-400">سياسة الخصوصية</a></li><li><a href="/terms" data-link class="hover:text-gold-400">الشروط والأحكام</a></li><li><a href="/disclaimer" data-link class="hover:text-gold-400">إخلاء المسؤولية</a></li></ul></div>
      </div>
      <div class="border-t border-white/10 text-center text-xs py-4 text-slate-400">© ${new Date().getFullYear()} ${esc(st.name_ar || '')} — جميع الحقوق محفوظة</div>
    </footer>`
  }
  function mount(html) {
    $('#app').innerHTML = FA.publicLayout(html)
    document.body.classList.toggle('has-mbar', /^\/catalog\//.test(location.pathname))
    const b = $('#mnav-btn'); if (b) b.onclick = () => $('#mnav').classList.toggle('hidden')
  }
  async function ensureMe() { if (S.me === null || S.me === undefined) { try { const s = await api('/session'); S.me = s.authenticated ? await api('/me', { silent401: true }) : null } catch { S.me = null } } }
  FA.publicMount = mount; FA.ensureMe = ensureMe

  const sectionTitle = (kicker, title, sub = '') => `<div class="text-center max-w-2xl mx-auto mb-10"><span class="text-gold-600 font-bold text-sm">${kicker}</span><h2 class="text-2xl md:text-4xl font-extrabold text-navy-800 mt-2">${title}</h2>${sub ? `<p class="text-slate-600 mt-3 leading-8">${sub}</p>` : ''}</div>`
  const FEATURES = [
    ['fa-magnifying-glass-chart', 'تحليل السوق', 'تنظيم بيانات الطلب والمنافسين والقنوات، مع ربط كل معلومة بمصدرها وتصنيفها: موثقة، من المستخدم، تقديرية.'],
    ['fa-coins', 'تقدير التكاليف', 'تكاليف استثمارية وتشغيلية مفصلة حسب القطاع: أصول، إهلاك، رواتب وتأمينات، مصروفات ثابتة ومتغيرة، رأس مال عامل.'],
    ['fa-chart-line', 'توقع الإيرادات والأرباح', 'منتجات متعددة، طاقة إنتاجية ونسبة تشغيل وهالك، نمو وتضخم وسعر صرف، وقوائم دخل وتدفقات نقدية وميزانية.'],
    ['fa-triangle-exclamation', 'تحليل المخاطر', 'سيناريوهات متفائلة ومتشائمة يعتمدها المستخدم، تحليل حساسية وWhat-if فوري لأثر كل متغير على NPV وIRR.'],
    ['fa-list-check', 'خطة التنفيذ', 'مراحل تنفيذ وتوصيات مرتبطة بالنتائج الفعلية للمحرك المالي، دون مبالغة أو وعود بالربح.'],
    ['fa-file-export', 'تقارير احترافية', 'تقرير عربي RTL من 24 قسمًا بفهرس ورسوم، قابل للطباعة PDF، وتصدير Excel متعدد الأوراق، مع إصدارات وبصمة بيانات.']
  ]
  const STEPS = [['fa-lightbulb', 'أنشئ مشروعك', 'حدد النشاط والموقع والعملة.'], ['fa-layer-group', 'اختر القالب', '18 قالبًا متخصصًا حسب القطاع.'], ['fa-pen-to-square', 'أدخل البيانات', 'معالج من 13 خطوة بحفظ تلقائي.'], ['fa-calculator', 'احسب النتائج', 'محرك مالي مستقل ودقيق.'], ['fa-file-pdf', 'صدّر الدراسة', 'PDF وExcel بإصدارات موثقة.']]

  function templatesGrid(items, limit) {
    return `<div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">${items.slice(0, limit || items.length).map(t => `
      <a href="/study-types#${t.id}" data-link class="group card overflow-hidden hover:shadow-lg transition">
        <div class="h-28 bg-cover bg-center" style="background-image:url('/static/img/${esc(t.image)}')"></div>
        <div class="p-3 text-center -mt-6"><span class="w-11 h-11 mx-auto rounded-full bg-navy-800 text-gold-400 grid place-items-center ring-4 ring-white"><i class="fas ${esc(t.icon)}"></i></span><b class="block mt-2 text-sm text-navy-800">${esc(t.name_ar)}</b></div></a>`).join('')}</div>`
  }

  route('/', async () => {
    await loadSettings(); await ensureMe()
    let tpls = []; try { tpls = (await api('/public/templates')).items } catch { }
    let plans = []; try { plans = (await api('/billing/plans')).items } catch { }
    let sectors = []; try { sectors = (await api('/public/sectors')).items } catch { }
    const st = S.settings
    mount(`
    <section id="hero-section" class="hero-bg text-white relative overflow-hidden">
      <div class="max-w-7xl mx-auto px-4 py-14 md:py-20 grid lg:grid-cols-2 gap-10 items-center">
        <div class="fade-in">
          <span class="inline-flex items-center gap-2 bg-white/10 rounded-full px-3 py-1 text-xs text-gold-300"><i class="fas fa-sparkles"></i> منصة دراسات جدوى ذكية — من الفكرة إلى خطة عمل متكاملة</span>
          <h1 class="mt-5 text-4xl md:text-6xl font-extrabold leading-tight">اصنع مشروعك <span class="text-gold-400">بنفسك</span></h1>
          <p class="mt-5 text-lg text-slate-200 leading-9 max-w-xl">حوّل فكرتك الاستثمارية إلى دراسة جدوى منظمة: دراسة سوق، تكاليف، إيرادات، قوائم مالية، NPV وIRR وفترة الاسترداد، سيناريوهات وتحليل حساسية — بمحرك مالي مستقل وتقارير احترافية بالعربية.</p>
          <div class="mt-8 flex flex-wrap gap-3"><a href="${S.me ? '/app/projects?new=1' : '/register'}" data-link class="btn-gold text-lg">أنشئ دراستك بنفسك <i class="fas fa-arrow-left"></i></a><a href="/sectors" data-link class="btn-ghost !bg-white/10 !text-white !border-white/20"><i class="fas fa-layer-group"></i> دراسات جاهزة</a></div>
          <ul class="mt-8 grid grid-cols-2 gap-3 text-sm text-slate-200 max-w-md">
            <li><i class="fas fa-shield-halved text-gold-400 ml-1"></i> حسابات دقيقة وموثقة المعادلات</li><li><i class="fas fa-clock text-gold-400 ml-1"></i> توفير الوقت والجهد</li>
            <li><i class="fas fa-bullseye text-gold-400 ml-1"></i> قرارات مبنية على بياناتك</li><li><i class="fas fa-lightbulb text-gold-400 ml-1"></i> قوالب لكل القطاعات</li></ul>
        </div>
        <div class="relative"><img src="/static/img/brand-poster.jpg" alt="منصة اصنع مشروعك بنفسك" class="rounded-3xl shadow-2xl ring-4 ring-white/10 w-full"><div class="absolute -bottom-5 -right-3 md:right-6 bg-white text-navy-800 rounded-2xl shadow-xl px-4 py-3 text-sm font-bold flex items-center gap-2"><i class="fas fa-mug-hot text-gold-500"></i> فكرتك اليوم .. مشروعك غدًا</div></div>
      </div>
    </section>

    ${sectors.length ? `<section id="sectors-section" class="max-w-7xl mx-auto px-4 py-16">
      ${sectionTitle('دراسات جدوى جاهزة', 'اختر قطاعك وابدأ مشروعك', 'دراسات منظمة لكل قطاع — اضغط على القطاع لعرض دراساته، ثم اطلب الدراسة مباشرة عبر واتساب.')}
      ${FA.sectorCards(sectors)}
      <div class="text-center mt-10"><a href="/sectors" data-link class="btn-primary !px-6 !py-3">تصفح كل الدراسات (${sectors.reduce((a, x) => a + (x.studies_count || 0), 0)}) <i class="fas fa-arrow-left"></i></a></div>
    </section>` : ''}

    <section id="value-section" class="max-w-7xl mx-auto px-4 py-16">
      ${sectionTitle('ماذا نقدم لك؟', 'كل ما تحتاجه لدراسة جدوى متكاملة', 'دراسة مالية وفنية وتسويقية مبنية على مدخلات واضحة وافتراضات قابلة للمراجعة — دون أرقام وهمية أو وعود بالربح.')}
      <div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">${FEATURES.map(([i, t, d]) => `<article class="card p-6 hover:shadow-md transition"><span class="w-12 h-12 rounded-full bg-navy-800 text-gold-400 grid place-items-center text-lg ring-4 ring-gold-400/30"><i class="fas ${i}"></i></span><h3 class="mt-4 font-bold text-lg text-navy-800">${t}</h3><p class="mt-2 text-sm text-slate-600 leading-7">${d}</p></article>`).join('')}</div>
    </section>

    <section id="steps-section" class="bg-white border-y py-16"><div class="max-w-7xl mx-auto px-4">
      ${sectionTitle('كيف تعمل المنصة', 'خمس خطوات من الفكرة إلى التقرير')}
      <ol class="grid md:grid-cols-5 gap-4">${STEPS.map(([i, t, d], n) => `<li class="text-center relative"><div class="w-16 h-16 mx-auto rounded-2xl bg-navy-50 text-navy-800 grid place-items-center text-2xl"><i class="fas ${i}"></i></div><span class="absolute top-0 right-1/2 translate-x-10 bg-gold-500 text-navy-900 text-xs font-extrabold w-6 h-6 rounded-full grid place-items-center">${n + 1}</span><h3 class="mt-3 font-bold text-navy-800">${t}</h3><p class="text-sm text-slate-600 mt-1">${d}</p></li>`).join('')}</ol>
    </div></section>

    <section id="types-section" class="max-w-7xl mx-auto px-4 py-16">
      ${sectionTitle('أفكار متنوعة .. فرص حقيقية', 'قوالب متخصصة لكل أنواع المشروعات', 'كل قالب يحدد الحقول ووحدات القياس وعناصر التكلفة والإيراد والمؤشرات والمخاطر المناسبة لقطاعه.')}
      ${templatesGrid(tpls, 12)}
      <div class="text-center mt-8"><a href="/study-types" data-link class="btn-ghost">عرض كل القوالب (${tpls.length}) <i class="fas fa-arrow-left"></i></a></div>
    </section>

    <section id="engine-section" class="bg-navy-900 text-white py-16"><div class="max-w-7xl mx-auto px-4 grid lg:grid-cols-2 gap-10 items-center">
      <div><span class="text-gold-400 font-bold text-sm">المحرك المالي المستقل</span><h2 class="text-3xl md:text-4xl font-extrabold mt-2">أرقام دقيقة لا يكتبها الذكاء الاصطناعي</h2>
        <p class="mt-4 text-slate-300 leading-8">الحسابات المالية يجريها محرك برمجي مستقل باستخدام أرقام عشرية عالية الدقة (لا أخطاء فاصلة عائمة)، ومغطى باختبارات مرجعية محسوبة يدويًا. الذكاء الاصطناعي يشرح ويقترح فقط، ولا يستطيع تغيير النتائج.</p>
        <ul class="mt-6 grid sm:grid-cols-2 gap-3 text-sm">${['NPV وIRR وIRR حقوق الملكية', 'فترة الاسترداد العادية والمخصومة', 'نقطة التعادل بالقيمة والوحدات', 'الإهلاك القسط الثابت والمتناقص', 'جداول القروض وفترات السماح وDSCR', 'ضرائب مع ترحيل الخسائر', 'رأس المال العامل وأيام التحصيل', 'تضخم ونمو وسعر صرف'].map(x => `<li class="flex gap-2"><i class="fas fa-check text-gold-400 mt-1"></i>${x}</li>`).join('')}</ul></div>
      <div class="bg-white/5 rounded-3xl p-6 border border-white/10"><div class="text-sm text-slate-300 mb-3">مثال توضيحي لطريقة العرض (بيانات افتراضية للتوضيح فقط)</div>
        <div class="grid grid-cols-2 gap-3">${[['صافي القيمة الحالية', 'NPV'], ['معدل العائد الداخلي', 'IRR'], ['فترة الاسترداد', 'Payback'], ['نقطة التعادل', 'Break-even']].map(([a, b]) => `<div class="bg-white/10 rounded-xl p-4"><div class="text-xs text-slate-300">${a}</div><div class="text-xl font-extrabold text-gold-400 mt-1">${b}</div></div>`).join('')}</div>
        <img src="/static/img/idea.jpg" class="rounded-2xl mt-4 w-full h-48 object-cover" alt=""></div>
    </div></section>

    <section id="ai-section" class="max-w-7xl mx-auto px-4 py-16 grid lg:grid-cols-2 gap-10 items-center">
      <img src="/static/img/tech.jpg" class="rounded-3xl shadow-xl w-full" alt="الذكاء الاصطناعي">
      <div><span class="text-gold-600 font-bold text-sm">ذكاء اصطناعي مسؤول</span><h2 class="text-3xl font-extrabold text-navy-800 mt-2">مساعد يحلل ويشرح .. ولا يختلق</h2>
        <ul class="mt-6 space-y-4">${[['fa-wand-magic-sparkles', 'تحليل الفكرة واقتراح الأسئلة الناقصة'], ['fa-scale-balanced', 'مراجعة التناقضات في المدخلات'], ['fa-comment-dots', 'شرح النتائج المالية بلغة مبسطة'], ['fa-shield', 'لا يختلق مصادر أو أسعارًا، وكل تقدير يُصنف بوضوح'], ['fa-lock', 'حماية من حقن التعليمات في المستندات المرفوعة']].map(([i, t]) => `<li class="flex gap-3"><span class="w-9 h-9 rounded-lg bg-gold-400/20 text-gold-600 grid place-items-center shrink-0"><i class="fas ${i}"></i></span><span class="pt-1.5 font-semibold text-slate-700">${t}</span></li>`).join('')}</ul></div>
    </section>

    <section id="pricing-section" class="bg-white border-y py-16"><div class="max-w-7xl mx-auto px-4">${sectionTitle('الباقات', 'اختر الباقة المناسبة لك')}${plansGrid(plans)}</div></section>

    <section id="faq-section" class="max-w-3xl mx-auto px-4 py-16">${sectionTitle('الأسئلة الشائعة', 'إجابات سريعة')}${faqList(5)}</section>

    <section id="cta-section" class="max-w-7xl mx-auto px-4"><div class="hero-bg rounded-3xl p-10 text-center text-white"><h2 class="text-3xl font-extrabold">مشروعك يستحق دراسة جدوى احترافية</h2><p class="mt-3 text-slate-200">المعلومة الصحيحة .. لقرار استثماري ناجح</p><a href="${S.me ? '/app/projects?new=1' : '/register'}" data-link class="btn-gold mt-6 text-lg">ابدأ دراستك الآن <i class="fas fa-arrow-left"></i></a></div></section>`)
  })

  function plansGrid(plans) {
    if (!plans.length) return '<p class="text-center text-slate-500">لا توجد باقات متاحة حاليًا.</p>'
    const FEAT = { financial_engine: 'المحرك المالي الكامل', scenarios: 'السيناريوهات', sensitivity: 'تحليل الحساسية', ai_assistant: 'مساعد الذكاء الاصطناعي', html_report: 'تقرير HTML قابل للطباعة', pdf: 'تصدير PDF', excel: 'تصدير Excel', versions: 'إصدارات ومقارنة', team: 'فريق عمل', org_logo: 'شعار المؤسسة في التقارير', priority_support: 'دعم أولوية' }
    return `<div class="grid md:grid-cols-2 lg:grid-cols-4 gap-5">${plans.map((p, i) => `
      <article class="card p-6 flex flex-col ${i === 1 ? 'ring-2 ring-gold-500 relative' : ''}">${i === 1 ? '<span class="absolute -top-3 right-6 bg-gold-500 text-navy-900 text-xs font-extrabold px-3 py-1 rounded-full">الأكثر طلبًا</span>' : ''}
        <h3 class="font-extrabold text-xl text-navy-800">${esc(p.name_ar)}</h3><p class="text-sm text-slate-500 mt-1 min-h-[40px]">${esc(p.description_ar || '')}</p>
        <div class="mt-4 text-3xl font-extrabold text-navy-800">${p.id === 'free' ? 'مجانًا' : p.price_monthly != null ? `${FA.fmt(p.price_monthly)} <small class="text-sm text-slate-500">${esc(p.currency)}/شهر</small>` : '<span class="text-lg text-slate-500">يُحدد قريبًا</span>'}</div>
        ${p.price_yearly ? `<div class="text-xs text-slate-500">أو ${FA.fmt(p.price_yearly)} ${esc(p.currency)} سنويًا</div>` : ''}
        <ul class="mt-5 space-y-2 text-sm flex-1"><li><i class="fas fa-check text-emerald-600 ml-1"></i>${p.max_projects} مشروع / ${p.max_studies} دراسة</li><li><i class="fas fa-check text-emerald-600 ml-1"></i>${p.max_ai_requests_month} طلب ذكاء اصطناعي شهريًا</li><li><i class="fas fa-check text-emerald-600 ml-1"></i>${p.max_exports_month} تصدير تقرير شهريًا</li>${p.max_members > 1 ? `<li><i class="fas fa-check text-emerald-600 ml-1"></i>حتى ${p.max_members} أعضاء</li>` : ''}${(p.features || []).map(f => `<li><i class="fas fa-check text-emerald-600 ml-1"></i>${FEAT[f] || f}</li>`).join('')}</ul>
        <a href="${S.me ? '/app/billing' : '/register'}" data-link class="${i === 1 ? 'btn-gold' : 'btn-ghost'} mt-6 w-full">${p.id === 'free' ? 'ابدأ مجانًا' : 'اختر الباقة'}</a></article>`).join('')}</div>`
  }

  const FAQ = [
    ['هل تضمن الدراسة نجاح مشروعي؟', 'لا. الدراسة أداة لاتخاذ القرار مبنية على افتراضاتك والبيانات المتاحة. نوضح بصدق إذا كانت النتائج لا تدعم التنفيذ، ونوصي بمراجعة النتائج مع مختصين.'],
    ['من أين تأتي الأرقام؟', 'من مدخلاتك أنت، ومن المصادر التي تربطها بالدراسة (مع تاريخ الرصد)، أو من تقديرات مصنفة بوضوح كـ "تقديري". المنصة لا تخترع أسعار سوق أو تكاليف.'],
    ['هل يحسب الذكاء الاصطناعي النتائج المالية؟', 'لا. الحسابات يجريها محرك مالي مستقل ومختبَر. الذكاء الاصطناعي يحلل الفكرة ويشرح النتائج ويقترح افتراضات تحتاج تحققك.'],
    ['هل يمكنني تعديل الافتراضات وإعادة الحساب؟', 'نعم في أي وقت، مع حفظ إصدارات للدراسة ومقارنتها واستعادة أي إصدار سابق دون فقد السجل.'],
    ['ما صيغ التقارير المتاحة؟', 'تقرير HTML عربي قابل للطباعة كـ PDF من المتصفح، وملف Excel متعدد الأوراق بالقوائم المالية والجداول — حسب الباقة.'],
    ['هل بياناتي آمنة؟', 'كل دراسة معزولة على مستوى المؤسسة، مع تحقق من الصلاحيات في الخادم لكل عملية، وكلمات مرور مشفرة وجلسات آمنة ومصادقة ثنائية اختيارية.'],
    ['هل تدعم المنصة عملات غير الجنيه المصري؟', 'نعم. تحدد عملة الدراسة، ويمكن ربط بنود بعملة أجنبية مع سعر صرف موثق المصدر والتاريخ.'],
    ['هل تناسب مكاتب الاستشارات؟', 'نعم، باقة المستشار تدعم فريق عمل بأدوار (مستشار، محلل، مشاهد) وشعار المؤسسة في التقارير.']
  ]
  function faqList(n) { return `<div class="space-y-3">${FAQ.slice(0, n || FAQ.length).map(([q, a]) => `<details class="card p-4 group"><summary class="font-bold text-navy-800 flex justify-between items-center">${q}<i class="fas fa-chevron-down text-xs text-slate-400 group-open:rotate-180 transition"></i></summary><p class="mt-3 text-sm text-slate-600 leading-7">${a}</p></details>`).join('')}</div>` }

  const pageHero = (title, sub, img) => `<section class="hero-bg text-white"><div class="max-w-7xl mx-auto px-4 py-12 grid md:grid-cols-3 gap-6 items-center"><div class="md:col-span-2"><h1 class="text-3xl md:text-5xl font-extrabold">${title}</h1><p class="mt-3 text-slate-200 leading-8 max-w-2xl">${sub}</p></div>${img ? `<img src="/static/img/${img}" class="hidden md:block rounded-2xl shadow-xl h-48 w-full object-cover" alt="">` : ''}</div></section>`

  route('/features', async () => { await loadSettings(); await ensureMe(); mount(pageHero('مميزات المنصة', 'أدوات احترافية لإعداد دراسات جدوى دقيقة وقابلة للمراجعة.', 'hero2.jpg') + `<section class="max-w-7xl mx-auto px-4 py-14"><div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">${FEATURES.concat([['fa-code-branch', 'إصدارات ومقارنة', 'احفظ إصدارًا لكل مرحلة، قارن بين إصدارين في المؤشرات والمدخلات، واستعد أي إصدار بأمان.'], ['fa-users', 'فرق العمل والصلاحيات', 'أدوار متعددة: مالك، مدير، مستشار، محلل، عضو، مشاهد — مع عزل كامل لبيانات كل مؤسسة.'], ['fa-book', 'المصادر والأدلة', 'سجل مصادر بالناشر والرابط وتاريخ الرصد ومستوى الثقة، وتنبيه للمصادر القديمة.']]).map(([i, t, d]) => `<article class="card p-6"><span class="w-12 h-12 rounded-full bg-navy-800 text-gold-400 grid place-items-center text-lg"><i class="fas ${i}"></i></span><h3 class="mt-4 font-bold text-lg text-navy-800">${t}</h3><p class="mt-2 text-sm text-slate-600 leading-7">${d}</p></article>`).join('')}</div></section>`) })

  route('/how-it-works', async () => { await loadSettings(); await ensureMe(); const W = ['معلومات المشروع', 'الفكرة والمنتجات', 'السوق والعملاء', 'الموقع والطاقة التشغيلية', 'التكاليف الاستثمارية', 'تكاليف التشغيل', 'المبيعات والإيرادات', 'التمويل والقروض', 'الضرائب والإهلاك ورأس المال العامل', 'النمو والتضخم وسعر الصرف', 'السيناريوهات', 'مراجعة البيانات', 'توليد الدراسة والتقرير']; mount(pageHero('كيف تعمل المنصة', 'من الفكرة إلى تقرير احترافي عبر معالج من 13 خطوة بحفظ تلقائي.', 'idea.jpg') + `<section class="max-w-4xl mx-auto px-4 py-14"><ol class="relative border-r-2 border-navy-100 pr-6 space-y-6">${W.map((w, i) => `<li class="relative"><span class="absolute -right-[39px] w-8 h-8 rounded-full bg-navy-800 text-gold-400 grid place-items-center text-sm font-bold">${i + 1}</span><div class="card p-4"><b class="text-navy-800">${w}</b></div></li>`).join('')}</ol><div class="text-center mt-10"><a href="/register" data-link class="btn-gold">جرّب الآن مجانًا</a></div></section>`) })

  route('/study-types', async () => {
    await loadSettings(); await ensureMe()
    const tpls = (await api('/public/templates')).items
    mount(pageHero('أنواع دراسات الجدوى', 'قوالب متخصصة لا تعامل كل القطاعات بالطريقة نفسها.', 'sectors.jpg') + `<section class="max-w-7xl mx-auto px-4 py-14 grid md:grid-cols-2 gap-6">${tpls.map(t => `<article id="${esc(t.id)}" class="card overflow-hidden flex flex-col sm:flex-row scroll-mt-24"><img src="/static/img/${esc(t.image)}" class="sm:w-44 h-40 sm:h-auto object-cover" alt=""><div class="p-5 flex-1"><h3 class="font-bold text-lg text-navy-800"><i class="fas ${esc(t.icon)} text-gold-500 ml-1"></i>${esc(t.name_ar)}</h3><p class="text-sm text-slate-600 mt-2 leading-7">${esc(t.description_ar || '')}</p>${(t.risks || []).length ? `<p class="text-xs text-slate-500 mt-3"><b>مخاطر يفحصها القالب:</b> ${t.risks.slice(0, 4).map(esc).join('، ')}</p>` : ''}</div></article>`).join('')}</section>`)
  })

  route('/sample-report', async () => {
    await loadSettings(); await ensureMe()
    const SECS = ['الغلاف', 'بيانات المشروع', 'الملخص التنفيذي', 'وصف المشروع', 'الدراسة السوقية', 'تحليل المنافسين', 'الدراسة الفنية', 'الدراسة التشغيلية', 'الدراسة الإدارية', 'الدراسة التسويقية', 'الجوانب القانونية والتنظيمية', 'التكاليف الاستثمارية', 'المصروفات التشغيلية', 'الإيرادات المتوقعة', 'القوائم المالية', 'المؤشرات المالية', 'تحليل السيناريوهات', 'تحليل الحساسية', 'المخاطر', 'خطة التنفيذ', 'التوصيات', 'المصادر', 'الافتراضات والقيود', 'إخلاء المسؤولية']
    mount(pageHero('نماذج التقارير', 'هيكل التقرير الذي تنتجه المنصة لكل دراسة. يتم توليد الأرقام من نسختك المحفوظة فقط.', 'hero1.jpg') + `<section class="max-w-6xl mx-auto px-4 py-14 grid lg:grid-cols-3 gap-8"><div class="lg:col-span-2 card p-6"><h2 class="font-extrabold text-xl text-navy-800 mb-4">أقسام التقرير (24 قسمًا)</h2><ol class="grid sm:grid-cols-2 gap-2 text-sm">${SECS.map((s, i) => `<li class="flex items-center gap-2 bg-slate-50 rounded-lg px-3 py-2"><span class="w-6 h-6 rounded-full bg-navy-800 text-white text-xs grid place-items-center">${i + 1}</span>${s}</li>`).join('')}</ol></div>
      <aside class="space-y-4"><div class="card p-5"><h3 class="font-bold text-navy-800">ما يميز التقرير</h3><ul class="mt-3 text-sm space-y-2 text-slate-600"><li>✔ عربي RTL مع فهرس وترقيم صفحات</li><li>✔ رسوم بيانية وجداول مالية كاملة</li><li>✔ رقم إصدار وبصمة بيانات SHA-256</li><li>✔ تمييز النصوص المولدة بالذكاء الاصطناعي</li><li>✔ توصية تعكس النتائج بصدق</li><li>✔ تصدير Excel متعدد الأوراق</li></ul></div><a href="/register" data-link class="btn-gold w-full">أنشئ تقريرك الآن</a><p class="text-xs text-slate-500">لا نعرض تقارير بأرقام وهمية؛ أنشئ دراسة ببياناتك لترى التقرير الفعلي.</p></aside></section>`)
  })

  route('/pricing', async () => { await loadSettings(); await ensureMe(); const d = await api('/billing/plans'); mount(pageHero('الباقات والأسعار', 'الأسعار وحدود الاستخدام قابلة للتعديل من الإدارة.', '') + `<section class="max-w-7xl mx-auto px-4 py-14">${plansGrid(d.items)}${d.paymentsEnabled ? '' : '<p class="text-center text-sm text-slate-500 mt-6"><i class="fas fa-info-circle"></i> الدفع الإلكتروني غير مفعّل حاليًا؛ الباقة المجانية متاحة للجميع.</p>'}</section>`) })
  route('/faq', async () => { await loadSettings(); await ensureMe(); mount(pageHero('الأسئلة الشائعة', '', '') + `<section class="max-w-3xl mx-auto px-4 py-14">${faqList()}</section>`) })

  route('/articles', async () => { await loadSettings(); await ensureMe(); const d = await api('/public/articles'); mount(pageHero('المقالات والمعرفة المالية', 'مفاهيم دراسات الجدوى والتحليل المالي.', 'economic.jpg') + `<section class="max-w-5xl mx-auto px-4 py-14">${d.items.length ? `<div class="grid md:grid-cols-2 gap-5">${d.items.map(a => `<a href="/articles/${esc(a.slug)}" data-link class="card p-5 hover:shadow-md"><h3 class="font-bold text-navy-800">${esc(a.title)}</h3><p class="text-sm text-slate-600 mt-2">${esc(a.excerpt || '')}</p><span class="text-xs text-slate-400 mt-3 block">${FA.date(a.updated_at)}</span></a>`).join('')}</div>` : '<div class="card p-10 text-center text-slate-500"><i class="fas fa-newspaper text-3xl mb-3"></i><p>لا توجد مقالات منشورة بعد. يمكن للإدارة إضافتها من لوحة المحتوى.</p></div>'}</section>`) })
  route('/articles/:slug', async ({ slug }) => { await loadSettings(); await ensureMe(); const a = await api('/public/articles/' + encodeURIComponent(slug)); const body = esc(a.body).split(/\n{2,}/).map(p => p.startsWith('## ') ? `<h2>${p.slice(3)}</h2>` : `<p>${p.replace(/\n/g, '<br>')}</p>`).join(''); mount(`<article class="max-w-3xl mx-auto px-4 py-14"><a href="/articles" data-link class="text-sm text-navy-600">← المقالات</a><h1 class="text-3xl font-extrabold text-navy-800 mt-3">${esc(a.title)}</h1><div class="prose-ar mt-6 text-slate-700">${body}</div></article>`) })

  route('/contact', async () => {
    await loadSettings(); await ensureMe()
    mount(pageHero('تواصل معنا', 'يسعدنا استقبال استفساراتك واقتراحاتك.', '') + `<section class="max-w-2xl mx-auto px-4 py-14"><form id="contact-form" class="card p-6 space-y-4" novalidate>
      <div class="grid sm:grid-cols-2 gap-4"><div><label class="label">الاسم <span class="req">*</span></label><input name="name" class="input" required></div><div><label class="label">البريد الإلكتروني <span class="req">*</span></label><input name="email" type="email" class="input" required dir="ltr"></div></div>
      <div><label class="label">الموضوع</label><input name="subject" class="input"></div><div><label class="label">الرسالة <span class="req">*</span></label><textarea name="message" rows="5" class="input" required></textarea></div>
      <input name="website" class="hidden" tabindex="-1" autocomplete="off"><button class="btn-primary w-full">إرسال</button></form></section>`)
    $('#contact-form').onsubmit = async (e) => { e.preventDefault(); const b = e.submitter; busy(b, true); try { const d = formData(e.target); if (!d.website) delete d.website; await api('/public/contact', { method: 'POST', body: d }); toast('تم إرسال رسالتك بنجاح'); e.target.reset() } catch (er) { fieldErrors(e.target, er.details); errToast(er) } finally { busy(b, false) } }
  })

  const legal = (title, html) => async () => { await loadSettings(); await ensureMe(); mount(pageHero(title, '', '') + `<section class="max-w-3xl mx-auto px-4 py-14 prose-ar text-slate-700 card p-8 mt-[-30px] relative">${html}</section>`) }
  route('/privacy', legal('سياسة الخصوصية', `<h3>البيانات التي نجمعها</h3><p>الاسم والبريد الإلكتروني وبيانات المشروعات والدراسات التي تدخلها، وسجلات استخدام تقنية لأغراض الأمان.</p><h3>كيف نستخدمها</h3><p>لتقديم الخدمة وإنتاج الدراسات والتقارير وتحسين المنصة. لا نبيع بياناتك.</p><h3>الذكاء الاصطناعي</h3><p>عند استخدام مساعد الذكاء الاصطناعي تُرسل بيانات الدراسة اللازمة فقط إلى مزود النموذج وفق إعدادات المنصة.</p><h3>العزل والأمان</h3><p>بيانات كل مؤسسة معزولة، وكلمات المرور مشفرة، والجلسات محمية.</p><h3>الاحتفاظ والحذف</h3><p>يمكنك حذف مشروعاتك؛ الدراسات التي صُدرت لها تقارير تُؤرشف بدل الحذف للحفاظ على سجل الإصدارات.</p>`))
  route('/terms', legal('الشروط والأحكام', `<p>باستخدامك المنصة فإنك توافق على استخدامها لأغراض مشروعة، وتتحمل مسؤولية صحة البيانات التي تدخلها. يحق للمنصة تعليق الحسابات المخالفة. الباقات وحدودها وأسعارها قابلة للتعديل مع إشعار المستخدمين. الاسترداد وفق السياسة المعلنة عند تفعيل الدفع.</p>`))
  route('/disclaimer', legal('إخلاء المسؤولية', `<p>الدراسات المنتجة عبر المنصة تعتمد على مدخلات المستخدم وافتراضاته ومصادر يحددها، ومحرك حسابات مستقل، ونصوص مساعدة قد يولدها الذكاء الاصطناعي. لا تمثل أي دراسة ضمانًا لنجاح الاستثمار أو تحقيق العوائد، ولا تعد استشارة مالية أو ضريبية أو قانونية ملزمة. القواعد الضريبية المعروضة تقديرية وتتطلب مراجعة محاسب قانوني.</p>`))

  /* ---------------- Auth pages ---------------- */
  const authShell = (title, sub, form) => `<section class="min-h-[80vh] grid lg:grid-cols-2"><div class="hidden lg:block hero-bg relative"><img src="/static/img/hero2.jpg" class="absolute inset-0 w-full h-full object-cover opacity-30" alt=""><div class="relative p-12 text-white h-full flex flex-col justify-end"><h2 class="text-4xl font-extrabold">من الفكرة .. <span class="text-gold-400">إلى خطة مشروع</span></h2><p class="mt-3 text-slate-200">فكرتك تستحق دراسة.</p></div></div>
    <div class="flex items-center justify-center p-6"><div class="w-full max-w-md"><h1 class="text-2xl font-extrabold text-navy-800">${title}</h1><p class="text-slate-500 mt-1 mb-6">${sub}</p>${form}</div></div></section>`

  route('/login', async (_, q) => {
    await loadSettings(); await ensureMe()
    if (S.me) return go(q.next || '/app', true)
    mount(authShell('تسجيل الدخول', 'مرحبًا بعودتك', `<form id="login-form" class="space-y-4" novalidate>
      <div><label class="label">البريد الإلكتروني</label><input name="email" type="email" class="input" dir="ltr" required autocomplete="email"></div>
      <div><label class="label">كلمة المرور</label><input name="password" type="password" class="input" dir="ltr" required autocomplete="current-password"></div>
      <div id="totp-wrap" class="hidden"><label class="label">رمز المصادقة الثنائية</label><input name="totp" class="input" dir="ltr" inputmode="numeric" maxlength="6"></div>
      <div class="flex justify-between text-sm"><a href="/forgot-password" data-link class="text-navy-600">نسيت كلمة المرور؟</a></div>
      <button class="btn-primary w-full">دخول</button><p class="text-center text-sm text-slate-600">ليس لديك حساب؟ <a href="/register" data-link class="text-navy-800 font-bold">أنشئ حسابًا</a></p></form>`))
    $('#login-form').onsubmit = async (e) => {
      e.preventDefault(); const b = e.submitter; busy(b, true)
      try { const d = formData(e.target); if (!d.totp) delete d.totp; const r = await api('/auth/login', { method: 'POST', body: d }); if (r.mfaRequired) { $('#totp-wrap').classList.remove('hidden'); toast('أدخل رمز المصادقة الثنائية', 'info'); return } S.me = null; go(q.next || '/app') } catch (er) { errToast(er) } finally { busy(b, false) }
    }
  })

  route('/register', async () => {
    await loadSettings(); await ensureMe()
    if (S.me) return go('/app', true)
    mount(authShell('إنشاء حساب', 'ابدأ مجانًا — دون بطاقة بنكية', `<form id="reg-form" class="space-y-4" novalidate>
      <div><label class="label">الاسم <span class="req">*</span></label><input name="name" class="input" required></div>
      <div><label class="label">البريد الإلكتروني <span class="req">*</span></label><input name="email" type="email" class="input" dir="ltr" required></div>
      <div><label class="label">كلمة المرور <span class="req">*</span></label><input name="password" type="password" class="input" dir="ltr" required minlength="8"><p class="text-xs text-slate-500 mt-1">8 أحرف على الأقل وتحتوي حروفًا وأرقامًا</p></div>
      <div><label class="label">نوع الحساب</label><select name="accountType" class="input"><option value="individual">فردي (رائد أعمال / مستثمر)</option><option value="company">شركة</option><option value="consultancy">مكتب استشارات</option></select></div>
      <div id="org-wrap" class="hidden"><label class="label">اسم الشركة / المكتب</label><input name="orgName" class="input"></div>
      <label class="flex items-start gap-2 text-sm"><input type="checkbox" name="acceptTerms" class="mt-1"> <span>أوافق على <a href="/terms" data-link class="text-navy-700 underline">الشروط والأحكام</a> و<a href="/disclaimer" data-link class="text-navy-700 underline">إخلاء المسؤولية</a></span></label>
      <button class="btn-gold w-full">إنشاء الحساب</button><p class="text-center text-sm text-slate-600">لديك حساب؟ <a href="/login" data-link class="text-navy-800 font-bold">سجل الدخول</a></p></form>`))
    const f = $('#reg-form')
    f.accountType.onchange = () => $('#org-wrap').classList.toggle('hidden', f.accountType.value === 'individual')
    f.onsubmit = async (e) => {
      e.preventDefault(); const b = e.submitter; busy(b, true)
      try { const d = formData(f); if (!d.orgName) delete d.orgName; const r = await api('/auth/register', { method: 'POST', body: d }); S.me = null; toast('تم إنشاء الحساب بنجاح'); if (r.devVerifyLink) sessionStorage.setItem('devVerifyLink', r.devVerifyLink); go('/app') } catch (er) { fieldErrors(f, er.details); errToast(er) } finally { busy(b, false) }
    }
  })

  route('/forgot-password', async () => {
    await loadSettings(); await ensureMe()
    mount(authShell('استعادة كلمة المرور', 'أدخل بريدك وسنرسل لك رابط الاستعادة', `<form id="fp-form" class="space-y-4"><div><label class="label">البريد الإلكتروني</label><input name="email" type="email" class="input" dir="ltr" required></div><button class="btn-primary w-full">إرسال الرابط</button><div id="fp-msg"></div></form>`))
    $('#fp-form').onsubmit = async (e) => { e.preventDefault(); const b = e.submitter; busy(b, true); try { const r = await api('/auth/forgot-password', { method: 'POST', body: formData(e.target) }); $('#fp-msg').innerHTML = `<div class="bg-emerald-50 text-emerald-800 rounded-lg p-3 text-sm">${esc(r.message)}${r.devResetLink ? `<br><small class="text-slate-500">وضع التطوير — البريد غير مُعد:</small> <a class="underline break-all" href="${esc(new URL(r.devResetLink).pathname + new URL(r.devResetLink).search)}" data-link>رابط الاستعادة</a>` : ''}</div>` } catch (er) { errToast(er) } finally { busy(b, false) } }
  })
  route('/reset-password', async (_, q) => {
    await loadSettings(); await ensureMe()
    mount(authShell('تعيين كلمة مرور جديدة', '', `<form id="rp-form" class="space-y-4"><div><label class="label">كلمة المرور الجديدة</label><input name="password" type="password" class="input" dir="ltr" required minlength="8"></div><button class="btn-primary w-full">حفظ</button></form>`))
    $('#rp-form').onsubmit = async (e) => { e.preventDefault(); const b = e.submitter; busy(b, true); try { await api('/auth/reset-password', { method: 'POST', body: { token: q.token || '', password: e.target.password.value } }); toast('تم تغيير كلمة المرور. سجل الدخول الآن.'); go('/login') } catch (er) { fieldErrors(e.target, er.details); errToast(er) } finally { busy(b, false) } }
  })
  route('/verify-email', async (_, q) => {
    await loadSettings(); await ensureMe()
    mount(authShell('التحقق من البريد الإلكتروني', '', `<div id="ve" class="card p-6 text-center"><i class="fas fa-spinner fa-spin text-2xl"></i></div>`))
    try { await api('/auth/verify-email', { method: 'POST', body: { token: q.token || '' } }); S.me = null; $('#ve').innerHTML = `<i class="fas fa-circle-check text-4xl text-emerald-600"></i><p class="mt-3 font-bold">تم تأكيد بريدك الإلكتروني بنجاح</p><a href="/app" data-link class="btn-primary mt-4 inline-flex">الذهاب للوحة التحكم</a>` }
    catch (er) { $('#ve').innerHTML = `<i class="fas fa-circle-xmark text-4xl text-red-600"></i><p class="mt-3">${esc(er.message)}</p>` }
  })
})()
