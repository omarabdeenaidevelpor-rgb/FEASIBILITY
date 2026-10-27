/* Authenticated app: layout, dashboard, projects, studies list, billing, settings, sources */
(function () {
  const { $, $$, esc, fmt, date, api, toast, errToast, go, route, modal, confirmDlg, busy, formData, fieldErrors, S, statusBadge, SECTORS, GOVS, loadSettings } = FA

  FA.appLayout = function (active, content, opts = {}) {
    const me = S.me, st = S.settings || {}
    const isAdmin = ['ADMIN', 'SUPER_ADMIN'].includes(me.user.platform_role)
    const NAV = [['/app', 'fa-gauge', 'لوحة التحكم', 'dashboard'], ['/app/projects', 'fa-folder-open', 'المشروعات', 'projects'], ['/app/studies', 'fa-file-lines', 'الدراسات', 'studies'], ['/app/sources', 'fa-book', 'المصادر', 'sources'], ['/app/billing', 'fa-credit-card', 'الاشتراك', 'billing'], ['/app/settings', 'fa-gear', 'الإعدادات', 'settings']]
    if (isAdmin) NAV.push(['/admin', 'fa-shield-halved', 'لوحة الإدارة', 'admin'])
    return `<div class="min-h-screen flex">
      <aside id="sidebar" class="fixed lg:sticky top-0 right-0 z-50 h-screen w-64 bg-navy-900 text-white flex flex-col translate-x-full lg:translate-x-0 transition-transform">
        <a href="/" data-link class="flex items-center gap-2 px-4 h-16 border-b border-white/10"><img src="${esc(st.logo || '/static/img/logo.png')}" class="h-10 bg-white rounded-lg p-0.5" alt=""><b class="text-sm leading-tight">${esc(st.name_ar || '')}</b></a>
        <div class="px-4 py-3 text-xs text-slate-400 border-b border-white/10"><i class="fas fa-building ml-1"></i>${esc(me.org?.name || '')} <span class="block text-[10px] text-gold-400 mt-0.5">${esc(roleAr(me.org?.role))}</span></div>
        <nav class="flex-1 p-3 space-y-1 overflow-y-auto">${NAV.map(([h, i, l, k]) => `<a href="${h}" data-link class="sidebar-link ${active === k ? 'active' : ''}"><i class="fas ${i} w-5 text-center"></i>${l}</a>`).join('')}</nav>
        <div class="p-3 border-t border-white/10"><a href="/app/projects?new=1" data-link class="btn-gold w-full btn-sm"><i class="fas fa-plus"></i> دراسة جديدة</a></div>
      </aside>
      <div id="sb-overlay" class="hidden fixed inset-0 bg-black/40 z-40 lg:hidden"></div>
      <div class="flex-1 min-w-0 flex flex-col">
        <header class="h-16 bg-white border-b flex items-center justify-between px-4 sticky top-0 z-30">
          <div class="flex items-center gap-3"><button id="sb-btn" class="lg:hidden w-10 h-10 rounded-lg hover:bg-slate-100" aria-label="القائمة"><i class="fas fa-bars"></i></button><h1 class="font-bold text-navy-800 truncate">${opts.title || ''}</h1></div>
          <div class="flex items-center gap-2">
            <a href="/app/notifications" data-link class="relative w-10 h-10 rounded-lg hover:bg-slate-100 grid place-items-center" aria-label="الإشعارات"><i class="fas fa-bell text-slate-600"></i>${me.unreadNotifications ? `<span class="absolute top-1.5 left-1.5 bg-red-500 text-white text-[10px] rounded-full min-w-4 h-4 px-1 grid place-items-center">${me.unreadNotifications}</span>` : ''}</a>
            <details class="relative"><summary class="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-100"><span class="w-8 h-8 rounded-full bg-navy-800 text-white grid place-items-center text-sm font-bold">${esc((me.user.name || '?')[0])}</span><span class="hidden sm:block text-sm font-semibold">${esc(me.user.name)}</span></summary>
              <div class="absolute left-0 mt-2 w-48 bg-white border rounded-xl shadow-lg py-1 text-sm z-50"><a href="/app/settings" data-link class="block px-4 py-2 hover:bg-slate-50">الإعدادات</a><button id="logout-btn" class="w-full text-right px-4 py-2 hover:bg-slate-50 text-red-600">تسجيل الخروج</button></div></details>
          </div>
        </header>
        ${!me.user.email_verified_at ? `<div class="bg-amber-50 border-b border-amber-200 text-amber-800 text-sm px-4 py-2 flex flex-wrap items-center gap-2"><i class="fas fa-envelope"></i> لم يتم تأكيد بريدك الإلكتروني. <button id="resend-verify" class="underline font-bold">إعادة إرسال رابط التأكيد</button><span id="dev-verify"></span></div>` : ''}
        <main id="main" class="p-4 md:p-6 flex-1 fade-in">${content}</main>
      </div></div>`
  }
  const roleAr = (r) => ({ ORGANIZATION_OWNER: 'مالك المؤسسة', ORGANIZATION_ADMIN: 'مدير', CONSULTANT: 'مستشار', ANALYST: 'محلل', MEMBER: 'عضو', VIEWER: 'مشاهد', INDIVIDUAL_USER: 'حساب فردي' }[r] || r || '')
  FA.roleAr = roleAr
  FA.can = (p) => (S.me?.org?.permissions || []).includes(p)

  FA.mountApp = function (active, content, opts) {
    $('#app').innerHTML = FA.appLayout(active, content, opts)
    const sb = $('#sidebar'), ov = $('#sb-overlay')
    $('#sb-btn').onclick = () => { sb.classList.remove('translate-x-full'); ov.classList.remove('hidden') }
    ov.onclick = () => { sb.classList.add('translate-x-full'); ov.classList.add('hidden') }
    $('#logout-btn').onclick = async () => { await api('/auth/logout', { method: 'POST' }).catch(() => { }); S.me = null; go('/') }
    const rv = $('#resend-verify')
    const dl = sessionStorage.getItem('devVerifyLink')
    const showDev = (link) => { const u = new URL(link); $('#dev-verify').innerHTML = `<span class="text-xs text-slate-500">(وضع التطوير — البريد غير مُعد): <a class="underline" data-link href="${esc(u.pathname + u.search)}">تأكيد الآن</a></span>` }
    if (rv) { if (dl) showDev(dl); rv.onclick = async () => { try { const r = await api('/auth/resend-verification', { method: 'POST' }); if (r.devVerifyLink) showDev(r.devVerifyLink); else toast(r.emailSent ? 'تم إرسال الرابط' : 'خدمة البريد غير مُعدة بعد', r.emailSent ? 'success' : 'warning') } catch (e) { errToast(e) } } }
  }
  async function refreshMe() { S.me = await api('/me') }

  /* ---------------- Dashboard ---------------- */
  route('/app', async () => {
    await loadSettings(); await refreshMe()
    FA.mountApp('dashboard', '<div class="grid md:grid-cols-4 gap-4">' + '<div class="skeleton h-24"></div>'.repeat(4) + '</div>', { title: 'لوحة التحكم' })
    const d = await api('/dashboard')
    const s = d.stats, u = d.usage, p = d.plan
    const bar = (used, max) => { const pc = Math.min(100, Math.round(100 * used / Math.max(1, max))); return `<div class="h-2 bg-slate-100 rounded-full overflow-hidden"><div class="h-full ${pc > 85 ? 'bg-red-500' : 'bg-navy-700'}" style="width:${pc}%"></div></div><div class="text-xs text-slate-500 mt-1">${used} / ${max}</div>` }
    $('#main').innerHTML = `
      <section class="hero-bg rounded-2xl text-white p-6 flex flex-wrap items-center justify-between gap-4"><div><h2 class="text-2xl font-extrabold">مرحبًا ${esc(S.me.user.name)} 👋</h2><p class="text-slate-200 mt-1">فكرتك اليوم .. مشروعك غدًا</p></div><div class="flex gap-2"><a href="/app/projects?new=1" data-link class="btn-gold"><i class="fas fa-plus"></i> مشروع جديد</a></div></section>
      <section class="grid grid-cols-2 lg:grid-cols-5 gap-4 mt-5">${[['fa-folder-open', 'المشروعات', s.projects], ['fa-file-lines', 'الدراسات', s.studies], ['fa-pen', 'قيد التنفيذ', s.in_progress], ['fa-circle-check', 'مكتملة/محسوبة', s.completed], ['fa-file-export', 'التقارير المصدرة', s.reports]].map(([i, l, v]) => `<div class="kpi flex items-center gap-3"><span class="w-11 h-11 rounded-xl bg-navy-50 text-navy-800 grid place-items-center"><i class="fas ${i}"></i></span><div><div class="k">${l}</div><div class="v">${v}</div></div></div>`).join('')}</section>
      <div class="grid lg:grid-cols-3 gap-5 mt-5">
        <section class="card lg:col-span-2"><header class="flex justify-between items-center p-4 border-b"><h3 class="font-bold text-navy-800">آخر الدراسات</h3><a href="/app/studies" data-link class="text-sm text-navy-600">عرض الكل</a></header>
          ${d.recentStudies.length ? `<div class="scroll-x"><table class="tbl"><thead><tr><th>الدراسة</th><th>المشروع</th><th>الحالة</th><th>الاكتمال</th><th>NPV</th><th>IRR</th><th>آخر تعديل</th></tr></thead><tbody>${d.recentStudies.map(x => `<tr class="cursor-pointer" onclick="FA.go('/app/studies/${x.id}')"><td class="font-semibold text-navy-800">${esc(x.title)}</td><td>${esc(x.project_name)}</td><td>${statusBadge(x.status)}</td><td><div class="w-20 h-1.5 bg-slate-100 rounded-full"><div class="h-full bg-gold-500 rounded-full" style="width:${x.completion_pct}%"></div></div><small>${x.completion_pct}%</small></td><td class="num ${x.metrics && x.metrics.npv < 0 ? 'neg' : ''}">${x.metrics ? fmt(x.metrics.npv) : '<span class="text-slate-400 text-xs">بيانات غير مكتملة</span>'}</td><td class="num">${x.metrics?.irrPct != null ? fmt(x.metrics.irrPct, 1) + '%' : '—'}</td><td class="text-xs text-slate-500">${date(x.updated_at)}</td></tr>`).join('')}</tbody></table></div>` : emptyState('fa-file-circle-plus', 'لا توجد دراسات بعد', 'ابدأ بإنشاء مشروع ثم أنشئ دراسة الجدوى الخاصة به.', '<a href="/app/projects?new=1" data-link class="btn-primary">إنشاء مشروع</a>')}
        </section>
        <aside class="space-y-5">
          <section class="card p-4"><div class="flex justify-between items-center"><h3 class="font-bold text-navy-800">باقتك: ${esc(p.name_ar)}</h3><a href="/app/billing" data-link class="text-xs text-navy-600">ترقية</a></div>${p.current_period_end ? `<p class="text-xs text-slate-500 mt-1">تنتهي في ${date(p.current_period_end)}</p>` : ''}
            <div class="mt-4 space-y-3 text-sm"><div>المشروعات ${bar(u.projects, p.max_projects)}</div><div>الدراسات ${bar(u.studies, p.max_studies)}</div><div>طلبات الذكاء الاصطناعي (الشهر) ${bar(u.ai_requests, p.max_ai_requests_month)}</div><div>تصدير التقارير (الشهر) ${bar(u.exports, p.max_exports_month)}</div></div></section>
          <section class="card p-4"><h3 class="font-bold text-navy-800 mb-3">الإشعارات</h3>${d.notifications.length ? d.notifications.map(n => `<a ${n.link ? `href="${esc(n.link)}" data-link` : ''} class="block py-2 border-b last:border-0 text-sm ${n.read_at ? 'text-slate-500' : ''}"><b class="block">${esc(n.title)}</b><span class="text-xs">${esc(n.body || '')}</span></a>`).join('') : '<p class="text-sm text-slate-500">لا توجد إشعارات</p>'}</section>
          <section class="card p-4"><h3 class="font-bold text-navy-800 mb-3">آخر المشروعات</h3>${d.recentProjects.length ? d.recentProjects.map(x => `<a href="/app/projects/${x.id}" data-link class="flex justify-between py-2 border-b last:border-0 text-sm"><span>${esc(x.name)}</span><span class="text-xs text-slate-500">${x.studies} دراسة</span></a>`).join('') : '<p class="text-sm text-slate-500">—</p>'}</section>
        </aside></div>`
  })

  function emptyState(icon, title, sub, action = '') { return `<div class="p-10 text-center"><span class="w-16 h-16 mx-auto rounded-2xl bg-navy-50 text-navy-700 grid place-items-center text-2xl"><i class="fas ${icon}"></i></span><h4 class="mt-4 font-bold text-navy-800">${title}</h4><p class="text-sm text-slate-500 mt-1">${sub}</p><div class="mt-4">${action}</div></div>` }
  FA.emptyState = emptyState

  /* ---------------- Projects ---------------- */
  function projectForm(p = {}) {
    return `<form id="project-form" class="grid sm:grid-cols-2 gap-4" novalidate>
      <div class="sm:col-span-2"><label class="label">اسم المشروع <span class="req">*</span></label><input name="name" class="input" value="${esc(p.name || '')}" required></div>
      <div class="sm:col-span-2"><label class="label">وصف المشروع</label><textarea name="description" rows="3" class="input">${esc(p.description || '')}</textarea></div>
      <div><label class="label">القطاع</label><select name="sector" class="input"><option value="">—</option>${Object.entries(SECTORS).map(([k, v]) => `<option value="${k}" ${p.sector === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
      <div><label class="label">النشاط الاقتصادي</label><input name="activity" class="input" value="${esc(p.activity || '')}" placeholder="مثال: مطعم مأكولات شعبية"></div>
      <div><label class="label">الدولة</label><select name="country" class="input"><option value="EG">مصر</option><option value="SA" ${p.country === 'SA' ? 'selected' : ''}>السعودية</option><option value="AE" ${p.country === 'AE' ? 'selected' : ''}>الإمارات</option><option value="JO" ${p.country === 'JO' ? 'selected' : ''}>الأردن</option><option value="MA" ${p.country === 'MA' ? 'selected' : ''}>المغرب</option></select></div>
      <div><label class="label">المحافظة</label><input name="governorate" class="input" list="govs" value="${esc(p.governorate || '')}"><datalist id="govs">${GOVS.map(g => `<option value="${g}">`).join('')}</datalist></div>
      <div><label class="label">المدينة</label><input name="city" class="input" value="${esc(p.city || '')}"></div>
      <div><label class="label">العملة الأساسية</label><select name="currency" class="input">${['EGP', 'USD', 'EUR', 'SAR', 'AED', 'JOD', 'MAD'].map(c => `<option ${(p.currency || 'EGP') === c ? 'selected' : ''}>${c}</option>`).join('')}</select></div>
      <div><label class="label">الكيان القانوني</label><select name="legal_entity" class="input"><option value="">—</option>${['منشأة فردية', 'شركة تضامن', 'شركة توصية بسيطة', 'شركة ذات مسؤولية محدودة', 'شركة مساهمة', 'شركة الشخص الواحد'].map(c => `<option ${p.legal_entity === c ? 'selected' : ''}>${c}</option>`).join('')}</select></div>
      <div><label class="label">حجم المشروع</label><select name="size" class="input"><option value="">—</option>${[['micro', 'متناهي الصغر'], ['small', 'صغير'], ['medium', 'متوسط'], ['large', 'كبير']].map(([k, v]) => `<option value="${k}" ${p.size === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
      <div><label class="label">رأس المال المبدئي المتاح</label><input name="initial_capital" type="number" min="0" step="any" class="input" value="${p.initial_capital ?? ''}"></div>
      <div class="sm:col-span-2"><label class="label">ملاحظات</label><textarea name="notes" rows="2" class="input">${esc(p.notes || '')}</textarea></div></form>`
  }
  const cleanProject = (d) => { for (const k of Object.keys(d)) if (d[k] === '') d[k] = null; d.country = d.country || 'EG'; d.currency = d.currency || 'EGP'; return d }

  function openProjectModal(p, onDone) {
    const m = modal({ title: p ? 'تعديل المشروع' : 'مشروع جديد', size: 'max-w-2xl', body: projectForm(p || {}), actions: `<button data-close class="btn-ghost">إلغاء</button><button id="pf-save" class="btn-primary">حفظ</button>` })
    $('#pf-save', m.el).onclick = async (e) => {
      const f = $('#project-form', m.el); busy(e.currentTarget, true)
      try { const d = cleanProject(formData(f)); const r = p ? await api('/projects/' + p.id, { method: 'PUT', body: d }) : await api('/projects', { method: 'POST', body: d }); m.close(); toast('تم الحفظ'); onDone && onDone(p ? p.id : r.id) }
      catch (er) { fieldErrors(f, er.details); errToast(er) } finally { busy(e.currentTarget, false) }
    }
  }

  route('/app/projects', async (_, q) => {
    await loadSettings(); await refreshMe()
    const state = { q: q.q || '', status: q.status || 'active', sort: 'updated', page: 1 }
    FA.mountApp('projects', `<div class="flex flex-wrap gap-3 items-center justify-between mb-4"><div class="flex flex-wrap gap-2"><input id="pq" class="input w-56" placeholder="بحث بالاسم أو النشاط" value="${esc(state.q)}"><select id="pstatus" class="input w-36"><option value="active">نشطة</option><option value="archived">مؤرشفة</option></select><select id="psort" class="input w-40"><option value="updated">آخر تعديل</option><option value="created">الأحدث إنشاءً</option><option value="name">الاسم</option></select></div>${FA.can('project.write') ? '<button id="new-project" class="btn-primary"><i class="fas fa-plus"></i> مشروع جديد</button>' : ''}</div><div id="plist"></div>`, { title: 'المشروعات' })
    const load = async () => {
      $('#plist').innerHTML = '<div class="skeleton h-40"></div>'
      const d = await api(`/projects?q=${encodeURIComponent(state.q)}&status=${state.status}&sort=${state.sort}&page=${state.page}&pageSize=12`)
      const pages = Math.ceil(d.total / d.pageSize)
      $('#plist').innerHTML = d.items.length ? `<div class="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">${d.items.map(p => `<article class="card p-5 hover:shadow-md transition cursor-pointer" onclick="FA.go('/app/projects/${p.id}')"><div class="flex justify-between items-start"><h3 class="font-bold text-navy-800">${esc(p.name)}</h3><span class="text-xs bg-navy-50 text-navy-700 px-2 py-0.5 rounded-full">${esc(SECTORS[p.sector] || 'غير محدد')}</span></div><p class="text-sm text-slate-500 mt-2 line-clamp-2">${esc(p.description || p.activity || '')}</p><div class="flex justify-between text-xs text-slate-500 mt-4"><span><i class="fas fa-location-dot ml-1"></i>${esc(p.governorate || p.country)}</span><span><i class="fas fa-file-lines ml-1"></i>${p.studies_count} دراسة</span><span>${date(p.updated_at)}</span></div></article>`).join('')}</div>
        ${pages > 1 ? `<div class="flex justify-center gap-2 mt-6">${Array.from({ length: pages }, (_, i) => `<button data-page="${i + 1}" class="btn-ghost btn-sm ${state.page === i + 1 ? '!bg-navy-800 !text-white' : ''}">${i + 1}</button>`).join('')}</div>` : ''}`
        : `<div class="card">${emptyState('fa-folder-plus', state.q ? 'لا توجد نتائج' : 'لا توجد مشروعات', 'كل مشروع يمكن أن يحتوي على أكثر من دراسة جدوى.', FA.can('project.write') ? '<button class="btn-primary" onclick="document.getElementById(\'new-project\').click()">إنشاء مشروع</button>' : '')}</div>`
      $$('[data-page]').forEach(b => b.onclick = () => { state.page = +b.dataset.page; load() })
    }
    $('#pstatus').value = state.status
    let t; $('#pq').oninput = (e) => { clearTimeout(t); t = setTimeout(() => { state.q = e.target.value; state.page = 1; load() }, 300) }
    $('#pstatus').onchange = (e) => { state.status = e.target.value; state.page = 1; load() }
    $('#psort').onchange = (e) => { state.sort = e.target.value; load() }
    const nb = $('#new-project'); if (nb) nb.onclick = () => openProjectModal(null, (id) => go('/app/projects/' + id + '?newStudy=1'))
    await load()
    if (q.new && nb) nb.click()
  })

  async function openNewStudy(project, onDone) {
    if (!S.templates) S.templates = (await api('/templates')).items
    const m = modal({ title: 'دراسة جدوى جديدة', size: 'max-w-4xl', body: `<div class="space-y-4"><div><label class="label">عنوان الدراسة <span class="req">*</span></label><input id="ns-title" class="input" value="دراسة جدوى ${esc(project.name)}"></div>
      <div><label class="label">اختر قالب النشاط <span class="req">*</span></label><div class="grid grid-cols-2 md:grid-cols-3 gap-3 max-h-[50vh] overflow-y-auto p-1">${S.templates.map(t => `<label class="cursor-pointer"><input type="radio" name="tpl" value="${t.id}" class="peer hidden"><div class="card overflow-hidden peer-checked:ring-2 peer-checked:ring-gold-500 hover:shadow"><div class="h-20 bg-cover bg-center" style="background-image:url('/static/img/${t.image}')"></div><div class="p-2"><b class="text-sm text-navy-800"><i class="fas ${t.icon} text-gold-500 ml-1"></i>${esc(t.name_ar)}</b><p class="text-[11px] text-slate-500 line-clamp-2 mt-1">${esc(t.definition.description_ar || '')}</p></div></div></label>`).join('')}</div></div></div>`,
      actions: `<button data-close class="btn-ghost">إلغاء</button><button id="ns-go" class="btn-primary">إنشاء وبدء المعالج</button>` })
    const sugg = { food_service: 'restaurant', commercial: 'commercial', digital: 'ecommerce', industrial: 'factory', agriculture: 'agriculture', real_estate: 'realestate', services: 'services', tourism: 'tourism', medical: 'medical' }[project.sector]
    if (sugg) { const r = m.el.querySelector(`input[value="${sugg}"]`); if (r) r.checked = true }
    $('#ns-go', m.el).onclick = async (e) => {
      const tpl = m.el.querySelector('input[name=tpl]:checked')?.value
      if (!tpl) return toast('اختر قالبًا', 'warning')
      busy(e.currentTarget, true)
      try { const r = await api('/studies', { method: 'POST', body: { projectId: project.id, title: $('#ns-title', m.el).value, templateId: tpl } }); m.close(); go('/app/studies/' + r.id + '/wizard') } catch (er) { errToast(er) } finally { busy(e.currentTarget, false) }
    }
  }

  route('/app/projects/:id', async ({ id }, q) => {
    await loadSettings(); await refreshMe()
    const d = await api('/projects/' + id)
    const p = d.project
    FA.mountApp('projects', `
      <nav class="text-sm text-slate-500 mb-3"><a href="/app/projects" data-link>المشروعات</a> / <span class="text-navy-800">${esc(p.name)}</span></nav>
      <section class="card p-5"><div class="flex flex-wrap justify-between gap-3"><div><h2 class="text-xl font-extrabold text-navy-800">${esc(p.name)} ${p.status === 'archived' ? '<span class="text-xs bg-slate-200 px-2 py-0.5 rounded-full">مؤرشف</span>' : ''}</h2><p class="text-slate-600 mt-1 text-sm max-w-2xl">${esc(p.description || '')}</p></div>
        <div class="flex flex-wrap gap-2">${FA.can('project.write') ? `<button id="edit-p" class="btn-ghost btn-sm"><i class="fas fa-pen"></i> تعديل</button><button id="arch-p" class="btn-ghost btn-sm"><i class="fas fa-box-archive"></i> ${p.status === 'archived' ? 'إلغاء الأرشفة' : 'أرشفة'}</button>` : ''}${FA.can('project.delete') ? '<button id="del-p" class="btn-ghost btn-sm !text-red-600"><i class="fas fa-trash"></i></button>' : ''}</div></div>
        <dl class="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4 text-sm">${[['القطاع', SECTORS[p.sector] || '—'], ['النشاط', p.activity || '—'], ['الموقع', [p.city, p.governorate, p.country].filter(Boolean).join('، ')], ['العملة', p.currency], ['الكيان القانوني', p.legal_entity || '—'], ['الحجم', { micro: 'متناهي الصغر', small: 'صغير', medium: 'متوسط', large: 'كبير' }[p.size] || '—'], ['رأس المال المبدئي', p.initial_capital != null ? fmt(p.initial_capital) + ' ' + p.currency : '—'], ['تاريخ الإنشاء', date(p.created_at)]].map(([k, v]) => `<div class="bg-slate-50 rounded-lg p-3"><dt class="text-xs text-slate-500">${k}</dt><dd class="font-semibold">${esc(v)}</dd></div>`).join('')}</dl></section>
      <section class="card mt-5"><header class="flex justify-between items-center p-4 border-b"><h3 class="font-bold text-navy-800">دراسات الجدوى (${d.studies.length})</h3>${FA.can('study.write') ? '<button id="new-study" class="btn-primary btn-sm"><i class="fas fa-plus"></i> دراسة جديدة</button>' : ''}</header>
        ${d.studies.length ? `<div class="scroll-x"><table class="tbl"><thead><tr><th>العنوان</th><th>القالب</th><th>الحالة</th><th>الاكتمال</th><th>آخر إصدار</th><th>آخر تعديل</th><th></th></tr></thead><tbody>${d.studies.map(s => `<tr><td><a href="/app/studies/${s.id}" data-link class="font-semibold text-navy-800">${esc(s.title)}</a></td><td class="text-xs">${esc(s.template_id)}</td><td>${statusBadge(s.status)}</td><td>${s.completion_pct}%</td><td>${s.latest_version ? 'v' + s.latest_version : '—'}</td><td class="text-xs">${date(s.updated_at)}</td><td class="whitespace-nowrap"><a href="/app/studies/${s.id}/wizard" data-link class="btn-ghost btn-sm">المعالج</a> <a href="/app/studies/${s.id}" data-link class="btn-ghost btn-sm">النتائج</a></td></tr>`).join('')}</tbody></table></div>` : emptyState('fa-file-circle-plus', 'لا توجد دراسات لهذا المشروع', 'أنشئ دراسة واختر القالب المناسب لنشاطك.')}
      </section>
      <section class="card mt-5 p-4"><h3 class="font-bold text-navy-800 mb-3">المستندات المرفقة</h3>${d.files.length ? d.files.map(f => `<a href="/api/files/${f.id}" class="flex justify-between py-2 border-b text-sm"><span><i class="fas fa-paperclip ml-1"></i>${esc(f.name)}</span><span class="text-xs text-slate-500">${Math.round(f.size / 1024)} KB</span></a>`).join('') : '<p class="text-sm text-slate-500">لا توجد مستندات.</p>'}
        ${FA.can('project.write') ? `<form id="upload-form" class="mt-3 flex gap-2 items-center"><input type="file" name="file" class="text-sm" accept=".pdf,.png,.jpg,.jpeg,.csv,.xlsx,.docx"><button class="btn-ghost btn-sm">رفع</button></form><p class="text-xs text-slate-400 mt-1">PDF/صور/CSV/Excel/Word — حتى 10MB</p>` : ''}</section>`, { title: p.name })
    const eb = $('#edit-p'); if (eb) eb.onclick = () => openProjectModal(p, () => FA.render())
    const ab = $('#arch-p'); if (ab) ab.onclick = async () => { await api(`/projects/${p.id}/archive`, { method: 'POST', body: { archived: p.status !== 'archived' } }); toast('تم'); FA.render() }
    const db = $('#del-p'); if (db) db.onclick = async () => { if (!await confirmDlg('حذف المشروع وكل دراساته؟ المشروعات التي لها تقارير مصدرة ستؤرشف بدل الحذف.', { danger: true, okText: 'حذف' })) return; const r = await api('/projects/' + p.id, { method: 'DELETE' }); toast(r.message || 'تم الحذف'); go('/app/projects') }
    const ns = $('#new-study'); if (ns) ns.onclick = () => openNewStudy(p)
    const uf = $('#upload-form'); if (uf) uf.onsubmit = async (e) => {
      e.preventDefault(); const file = uf.file.files[0]; if (!file) return toast('اختر ملفًا', 'warning')
      const fd = new FormData(); fd.append('file', file)
      const r = await fetch(`/api/projects/${p.id}/files`, { method: 'POST', body: fd, headers: { 'X-Requested-With': 'fetch' } }); const j = await r.json()
      if (!r.ok) return toast(j.error?.message || 'فشل الرفع', 'error'); toast('تم الرفع'); FA.render()
    }
    if (q.newStudy && ns) ns.click()
  })

  /* ---------------- Studies list ---------------- */
  route('/app/studies', async (_, q) => {
    await loadSettings(); await refreshMe()
    FA.mountApp('studies', `<div class="flex flex-wrap gap-2 mb-4"><input id="sq" class="input w-60" placeholder="بحث"><select id="sst" class="input w-40"><option value="">كل الحالات</option><option value="in_progress">قيد الإعداد</option><option value="computed">محسوبة</option><option value="completed">مكتملة</option><option value="archived">مؤرشفة</option></select></div><div id="slist" class="card"></div>`, { title: 'الدراسات' })
    const load = async () => {
      const d = await api(`/studies?q=${encodeURIComponent($('#sq').value)}&status=${$('#sst').value}`)
      $('#slist').innerHTML = d.items.length ? `<div class="scroll-x"><table class="tbl"><thead><tr><th>الدراسة</th><th>المشروع</th><th>الحالة</th><th>الاكتمال</th><th>الإصدار</th><th>آخر تعديل</th></tr></thead><tbody>${d.items.map(s => `<tr class="cursor-pointer" onclick="FA.go('/app/studies/${s.id}')"><td class="font-semibold text-navy-800">${esc(s.title)}</td><td>${esc(s.project_name)}</td><td>${statusBadge(s.status)}</td><td>${s.completion_pct}%</td><td>${s.latest_version ? 'v' + s.latest_version : '—'}</td><td class="text-xs">${date(s.updated_at)}</td></tr>`).join('')}</tbody></table></div>` : emptyState('fa-file-lines', 'لا توجد دراسات', 'أنشئ دراسة من صفحة المشروع.', '<a href="/app/projects" data-link class="btn-primary">المشروعات</a>')
    }
    let t; $('#sq').oninput = () => { clearTimeout(t); t = setTimeout(load, 300) }; $('#sst').onchange = load
    await load()
  })

  /* ---------------- Sources ---------------- */
  route('/app/sources', async () => {
    await loadSettings(); await refreshMe()
    const d = await api('/sources')
    FA.mountApp('sources', `<div class="flex justify-between items-center mb-4"><p class="text-sm text-slate-600 max-w-2xl">سجل المصادر المستخدمة في دراساتك. المصادر العامة يديرها فريق المنصة؛ ويمكنك إضافة مصادر خاصة بمؤسستك. سجّل دائمًا تاريخ الرصد.</p>${FA.can('source.write') ? '<button id="add-src" class="btn-primary btn-sm"><i class="fas fa-plus"></i> مصدر جديد</button>' : ''}</div>
      <div class="card scroll-x"><table class="tbl"><thead><tr><th>المصدر</th><th>الناشر</th><th>النوع</th><th>الدولة</th><th>الثقة</th><th>تاريخ الرصد</th><th>النطاق</th></tr></thead><tbody>${d.items.map(s => `<tr><td>${s.url ? `<a href="${esc(s.url)}" target="_blank" rel="noopener" class="text-navy-700 underline">${esc(s.name)}</a>` : esc(s.name)}</td><td>${esc(s.publisher || '')}</td><td class="text-xs">${esc(s.data_type || '')}</td><td>${esc(s.country || '')}</td><td>${({ high: 'عالية', medium: 'متوسطة', low: 'منخفضة' })[s.confidence]}</td><td class="text-xs">${esc(s.observed_at || '—')}</td><td class="text-xs">${s.org_id ? 'خاص' : 'عام'}</td></tr>`).join('')}</tbody></table></div>`, { title: 'المصادر والأدلة' })
    const b = $('#add-src'); if (b) b.onclick = () => FA.openSourceModal(() => FA.render())
  })
  FA.openSourceModal = function (onDone) {
    const m = modal({ title: 'إضافة مصدر', size: 'max-w-2xl', body: `<form id="src-form" class="grid sm:grid-cols-2 gap-3"><div class="sm:col-span-2"><label class="label">اسم المصدر <span class="req">*</span></label><input name="name" class="input"></div><div><label class="label">الجهة الناشرة</label><input name="publisher" class="input"></div><div><label class="label">الرابط</label><input name="url" class="input" dir="ltr" placeholder="https://"></div><div><label class="label">نوع البيانات</label><input name="data_type" class="input"></div><div><label class="label">الدولة</label><input name="country" class="input" value="EG"></div><div><label class="label">تاريخ النشر</label><input name="published_at" type="date" class="input"></div><div><label class="label">تاريخ الرصد</label><input name="observed_at" type="date" class="input" value="${new Date().toISOString().slice(0, 10)}"></div><div><label class="label">الوحدة</label><input name="unit" class="input"></div><div><label class="label">مستوى الثقة</label><select name="confidence" class="input"><option value="medium">متوسطة</option><option value="high">عالية</option><option value="low">منخفضة</option></select></div><div class="sm:col-span-2"><label class="label">طريقة الجمع / شروط إعادة الاستخدام</label><input name="collection_method" class="input"></div><div class="sm:col-span-2"><label class="label">ملاحظات</label><textarea name="notes" class="input" rows="2"></textarea></div></form>`, actions: '<button data-close class="btn-ghost">إلغاء</button><button id="src-save" class="btn-primary">حفظ</button>' })
    $('#src-save', m.el).onclick = async (e) => { const f = $('#src-form', m.el); busy(e.currentTarget, true); try { const d = formData(f); for (const k in d) if (d[k] === '') d[k] = null; const r = await api('/sources', { method: 'POST', body: d }); m.close(); toast('تمت الإضافة'); onDone && onDone(r.id) } catch (er) { fieldErrors(f, er.details); errToast(er) } finally { busy(e.currentTarget, false) } }
  }

  /* ---------------- Notifications ---------------- */
  route('/app/notifications', async () => {
    await loadSettings(); await refreshMe()
    const d = await api('/notifications')
    FA.mountApp('', `<div class="flex justify-end mb-3"><button id="read-all" class="btn-ghost btn-sm">تعليم الكل كمقروء</button></div><div class="card divide-y">${d.items.length ? d.items.map(n => `<a ${n.link ? `href="${esc(n.link)}" data-link` : ''} class="block p-4 ${n.read_at ? '' : 'bg-navy-50/50'}"><b class="text-navy-800">${esc(n.title)}</b><p class="text-sm text-slate-600">${esc(n.body || '')}</p><small class="text-xs text-slate-400">${date(n.created_at)}</small></a>`).join('') : emptyState('fa-bell', 'لا توجد إشعارات', '')}</div>`, { title: 'الإشعارات' })
    $('#read-all').onclick = async () => { await api('/notifications/read-all', { method: 'POST' }); FA.render() }
  })

  /* ---------------- Billing ---------------- */
  route('/app/billing', async () => {
    await loadSettings(); await refreshMe()
    const [sub, plans] = await Promise.all([api('/billing/subscription'), api('/billing/plans')])
    const PST = { pending: 'قيد الانتظار', succeeded: 'ناجحة', failed: 'فاشلة', refunded: 'مستردة', canceled: 'ملغاة' }
    FA.mountApp('billing', `
      <section class="card p-5 flex flex-wrap justify-between gap-4"><div><div class="text-sm text-slate-500">باقتك الحالية</div><h2 class="text-2xl font-extrabold text-navy-800">${esc(sub.plan.name_ar)}</h2>${sub.plan.current_period_end ? `<p class="text-sm text-slate-500">تنتهي في ${date(sub.plan.current_period_end)}${sub.plan.cancel_at_period_end ? ' (سيتم الإلغاء)' : ''}</p>` : ''}</div>
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center text-sm">${[['المشروعات', sub.usage.projects, sub.plan.max_projects], ['الدراسات', sub.usage.studies, sub.plan.max_studies + (sub.plan.extra_study_credits || 0)], ['طلبات AI', sub.usage.ai_requests, sub.plan.max_ai_requests_month], ['التصدير', sub.usage.exports, sub.plan.max_exports_month]].map(([l, u, m]) => `<div class="bg-slate-50 rounded-xl p-3"><div class="text-xs text-slate-500">${l}</div><b class="text-navy-800">${u} / ${m}</b></div>`).join('')}</div></section>
      ${sub.paymentsEnabled ? (sub.providerMode === 'dev' ? '<div class="mt-4 bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm text-amber-800"><i class="fas fa-flask"></i> وضع التطوير: الدفع محاكاة فقط ولا يتم تحصيل أي أموال حقيقية.</div>' : '') : '<div class="mt-4 bg-slate-100 rounded-xl p-3 text-sm text-slate-600"><i class="fas fa-info-circle"></i> بوابة الدفع غير مفعّلة حاليًا. سيتم تفعيلها بعد إعداد مزود الدفع من الإدارة.</div>'}
      <h3 class="font-bold text-navy-800 mt-6 mb-3">الترقية</h3>
      <div class="flex gap-2 mb-3"><label class="text-sm"><input type="radio" name="cycle" value="monthly" checked> شهري</label><label class="text-sm"><input type="radio" name="cycle" value="yearly"> سنوي</label><input id="coupon" class="input w-40 btn-sm" placeholder="كوبون خصم"></div>
      <div class="grid md:grid-cols-3 gap-4">${plans.items.filter(p => p.id !== 'free').map(p => `<div class="card p-5 ${sub.plan.id === p.id ? 'ring-2 ring-gold-500' : ''}"><h4 class="font-bold text-navy-800">${esc(p.name_ar)}</h4><div class="text-2xl font-extrabold mt-2">${p.price_monthly != null ? fmt(p.price_monthly) + ' <small class="text-sm">' + p.currency + '/شهر</small>' : '<span class="text-base text-slate-500">السعر لم يُحدد بعد</span>'}</div><p class="text-xs text-slate-500 mt-1">${p.max_studies} دراسة • ${p.max_ai_requests_month} طلب AI • ${p.max_exports_month} تصدير</p><button data-plan="${p.id}" class="btn-primary w-full mt-4 btn-sm" ${sub.plan.id === p.id || !sub.paymentsEnabled || p.price_monthly == null ? 'disabled' : ''}>${sub.plan.id === p.id ? 'باقتك الحالية' : 'اشترك'}</button></div>`).join('')}</div>
      ${sub.plan.id !== 'free' && FA.can('billing.manage') ? '<button id="cancel-sub" class="btn-ghost btn-sm mt-4 !text-red-600">إلغاء الاشتراك بنهاية الفترة</button>' : ''}
      <h3 class="font-bold text-navy-800 mt-8 mb-3">سجل المدفوعات والفواتير</h3>
      <div class="card scroll-x">${sub.payments.length ? `<table class="tbl"><thead><tr><th>التاريخ</th><th>الغرض</th><th>المبلغ</th><th>الحالة</th><th>الفاتورة</th></tr></thead><tbody>${sub.payments.map(p => `<tr><td class="text-xs">${date(p.created_at)}</td><td>${p.purpose === 'subscription' ? 'اشتراك ' + esc(p.plan_id) : 'دراسة منفردة'}</td><td class="num">${fmt(p.amount, 2)} ${p.currency}</td><td>${PST[p.status]}</td><td>${p.invoice_number || '—'}${p.status === 'pending' && sub.providerMode === 'dev' ? ` <button data-sim="${p.id}" class="btn-ghost btn-sm">محاكاة نجاح الدفع</button>` : ''}</td></tr>`).join('')}</tbody></table>` : '<p class="p-4 text-sm text-slate-500">لا توجد مدفوعات.</p>'}</div>`, { title: 'الاشتراك والفواتير' })
    $$('[data-plan]').forEach(b => b.onclick = async () => {
      busy(b, true)
      try { const r = await api('/billing/checkout', { method: 'POST', body: { purpose: 'subscription', planId: b.dataset.plan, cycle: document.querySelector('input[name=cycle]:checked').value, coupon: $('#coupon').value || undefined, idempotencyKey: crypto.randomUUID() } }); toast(`تم إنشاء طلب دفع بقيمة ${fmt(r.amount, 2)} ${r.currency}`); FA.render() } catch (e) { errToast(e) } finally { busy(b, false) }
    })
    $$('[data-sim]').forEach(b => b.onclick = async () => { try { await api('/billing/dev/simulate-webhook', { method: 'POST', body: { paymentId: b.dataset.sim, status: 'succeeded' } }); toast('تم تأكيد الدفع (محاكاة) وتفعيل الباقة'); FA.render() } catch (e) { errToast(e) } })
    const cb = $('#cancel-sub'); if (cb) cb.onclick = async () => { if (await confirmDlg('إلغاء الاشتراك بنهاية الفترة الحالية؟')) { const r = await api('/billing/subscription/cancel', { method: 'POST' }); toast(r.message); FA.render() } }
  })

  /* ---------------- Settings ---------------- */
  route('/app/settings', async () => {
    await loadSettings(); await refreshMe()
    const me = S.me
    const [sess, members] = await Promise.all([api('/auth/sessions'), api('/org/members').catch(() => ({ members: [] }))])
    FA.mountApp('settings', `<div class="grid lg:grid-cols-2 gap-5">
      <section class="card p-5"><h3 class="font-bold text-navy-800 mb-4">الملف الشخصي</h3><form id="prof-form" class="space-y-3"><div><label class="label">الاسم</label><input name="name" class="input" value="${esc(me.user.name)}"></div><div><label class="label">البريد الإلكتروني</label><input class="input bg-slate-50" value="${esc(me.user.email)}" disabled dir="ltr"></div><div><label class="label">اللغة المفضلة</label><select name="locale" class="input"><option value="ar">العربية</option><option value="en" ${me.user.locale === 'en' ? 'selected' : ''}>English</option></select></div><button class="btn-primary btn-sm">حفظ</button></form></section>
      <section class="card p-5"><h3 class="font-bold text-navy-800 mb-4">تغيير كلمة المرور</h3><form id="pw-form" class="space-y-3"><div><label class="label">كلمة المرور الحالية</label><input name="current" type="password" class="input" dir="ltr"></div><div><label class="label">كلمة المرور الجديدة</label><input name="password" type="password" class="input" dir="ltr"></div><button class="btn-primary btn-sm">تغيير</button></form></section>
      <section class="card p-5"><h3 class="font-bold text-navy-800 mb-2">المصادقة الثنائية (TOTP)</h3><p class="text-sm text-slate-600 mb-3">${me.user.mfa_enabled ? '<span class="text-emerald-700 font-bold">مفعّلة</span>' : 'غير مفعّلة — أضف طبقة حماية باستخدام تطبيق مثل Google Authenticator.'}</p><div id="mfa-box">${me.user.mfa_enabled ? '<button id="mfa-off" class="btn-ghost btn-sm !text-red-600">تعطيل</button>' : '<button id="mfa-on" class="btn-ghost btn-sm">تفعيل</button>'}</div></section>
      <section class="card p-5"><h3 class="font-bold text-navy-800 mb-3">الجلسات النشطة</h3>${sess.sessions.map(s => `<div class="flex justify-between text-sm py-2 border-b"><span class="truncate max-w-[70%]">${esc((s.user_agent || '').slice(0, 60))} ${s.current ? '<b class="text-emerald-700">(الحالية)</b>' : ''}</span><span class="text-xs text-slate-500">${date(s.last_seen_at)}</span></div>`).join('')}<button id="logout-all" class="btn-ghost btn-sm mt-3">تسجيل الخروج من كل الأجهزة</button></section>
      <section class="card p-5 lg:col-span-2"><div class="flex justify-between items-center mb-3"><h3 class="font-bold text-navy-800">فريق العمل — ${esc(me.org?.name || '')}</h3>${FA.can('org.manage') && me.org?.type !== 'personal' ? '<button id="add-member" class="btn-primary btn-sm"><i class="fas fa-user-plus"></i> إضافة عضو</button>' : ''}</div>${me.org?.type === 'personal' ? '<p class="text-sm text-slate-500">الحساب الفردي لا يدعم فرق العمل. أنشئ حساب شركة أو مكتب استشارات لإدارة فريق.</p>' : ''}
        <table class="tbl"><thead><tr><th>الاسم</th><th>البريد</th><th>الدور</th><th></th></tr></thead><tbody>${members.members.map(m => `<tr><td>${esc(m.name)}</td><td dir="ltr" class="text-right">${esc(m.email)}</td><td>${roleAr(m.role)}</td><td>${FA.can('org.manage') && m.role !== 'ORGANIZATION_OWNER' ? `<button data-rm="${m.id}" class="text-red-600 text-xs">إزالة</button>` : ''}</td></tr>`).join('')}</tbody></table></section></div>`, { title: 'الإعدادات' })
    $('#prof-form').onsubmit = async (e) => { e.preventDefault(); try { await api('/me', { method: 'PATCH', body: formData(e.target) }); toast('تم الحفظ') } catch (er) { errToast(er) } }
    $('#pw-form').onsubmit = async (e) => { e.preventDefault(); try { await api('/auth/change-password', { method: 'POST', body: formData(e.target) }); toast('تم تغيير كلمة المرور'); e.target.reset() } catch (er) { fieldErrors(e.target, er.details); errToast(er) } }
    $('#logout-all').onclick = async () => { await api('/auth/logout-all', { method: 'POST' }); S.me = null; go('/login') }
    const on = $('#mfa-on'); if (on) on.onclick = async () => { const r = await api('/auth/mfa/setup', { method: 'POST' }); $('#mfa-box').innerHTML = `<p class="text-sm">أضف هذا المفتاح في تطبيق المصادقة:</p><code class="block bg-slate-100 p-2 rounded my-2 text-xs break-all" dir="ltr">${esc(r.secret)}</code><div class="flex gap-2"><input id="mfa-code" class="input w-32" dir="ltr" placeholder="123456" maxlength="6"><button id="mfa-confirm" class="btn-primary btn-sm">تأكيد</button></div>`; $('#mfa-confirm').onclick = async () => { try { await api('/auth/mfa/enable', { method: 'POST', body: { code: $('#mfa-code').value } }); toast('تم تفعيل المصادقة الثنائية'); FA.render() } catch (e) { errToast(e) } } }
    const off = $('#mfa-off'); if (off) off.onclick = () => { const m = modal({ title: 'تعطيل المصادقة الثنائية', body: '<label class="label">كلمة المرور</label><input id="mfa-pw" type="password" class="input" dir="ltr">', actions: '<button id="mfa-dis" class="btn-danger">تعطيل</button>' }); $('#mfa-dis', m.el).onclick = async () => { try { await api('/auth/mfa/disable', { method: 'POST', body: { password: $('#mfa-pw', m.el).value } }); m.close(); toast('تم التعطيل'); FA.render() } catch (e) { errToast(e) } } }
    const am = $('#add-member'); if (am) am.onclick = () => { const m = modal({ title: 'إضافة عضو', body: `<div class="space-y-3"><div><label class="label">البريد الإلكتروني (مستخدم مسجل)</label><input id="mem-email" class="input" dir="ltr"></div><div><label class="label">الدور</label><select id="mem-role" class="input">${['ORGANIZATION_ADMIN', 'CONSULTANT', 'ANALYST', 'MEMBER', 'VIEWER'].map(r => `<option value="${r}">${roleAr(r)}</option>`).join('')}</select></div></div>`, actions: '<button id="mem-save" class="btn-primary">إضافة</button>' }); $('#mem-save', m.el).onclick = async () => { try { await api('/org/members', { method: 'POST', body: { email: $('#mem-email', m.el).value, role: $('#mem-role', m.el).value } }); m.close(); toast('تمت الإضافة'); FA.render() } catch (e) { errToast(e) } } }
    $$('[data-rm]').forEach(b => b.onclick = async () => { if (await confirmDlg('إزالة العضو من المؤسسة؟', { danger: true })) { await api('/org/members/' + b.dataset.rm, { method: 'DELETE' }); FA.render() } })
  })
})()
