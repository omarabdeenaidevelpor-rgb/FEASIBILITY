/* Core: API client, state, router, UI helpers. No business/financial logic lives in the frontend. */
window.FA = (function () {
  const S = { me: null, settings: null, templates: null }
  const $ = (sel, root = document) => root.querySelector(sel)
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)]
  const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
  const fmt = (v, dp = 0) => (v == null || v === '' || !isFinite(Number(v))) ? '—' : Number(v).toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp })
  const pct = (v) => v == null ? '—' : fmt(v, 2) + '%'
  const date = (s) => s ? new Date(String(s).replace(' ', 'T') + (String(s).includes('Z') || String(s).includes('+') ? '' : 'Z')).toLocaleDateString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric' }) : '—'

  async function api(path, opts = {}) {
    const init = { method: opts.method || 'GET', headers: { 'X-Requested-With': 'fetch' }, credentials: 'same-origin' }
    if (opts.body !== undefined) { init.headers['Content-Type'] = 'application/json'; init.body = JSON.stringify(opts.body) }
    let res
    try { res = await fetch('/api' + path, init) } catch (e) { throw Object.assign(new Error('تعذر الاتصال بالخادم. تحقق من الإنترنت.'), { code: 'NETWORK' }) }
    const ct = res.headers.get('content-type') || ''
    const data = ct.includes('json') ? await res.json() : await res.text()
    if (!res.ok) {
      const err = new Error(data?.error?.message || 'حدث خطأ')
      err.code = data?.error?.code; err.status = res.status; err.details = data?.error?.details
      if (res.status === 401 && !opts.silent401 && location.pathname.startsWith('/app')) { S.me = null; go('/login?next=' + encodeURIComponent(location.pathname)) }
      throw err
    }
    return data
  }

  /* ---------- Toasts / modals ---------- */
  function toast(msg, type = 'success') {
    let box = $('#toasts')
    if (!box) { box = document.createElement('div'); box.id = 'toasts'; box.className = 'fixed bottom-4 left-4 z-[100] flex flex-col gap-2'; document.body.appendChild(box) }
    const el = document.createElement('div')
    const colors = { success: 'bg-emerald-600', error: 'bg-red-600', info: 'bg-navy-800', warning: 'bg-amber-500' }
    el.className = `${colors[type] || colors.info} text-white px-4 py-3 rounded-xl shadow-lg text-sm max-w-sm fade-in flex items-start gap-2`
    el.innerHTML = `<i class="fas ${type === 'error' ? 'fa-circle-exclamation' : type === 'warning' ? 'fa-triangle-exclamation' : 'fa-circle-check'} mt-0.5"></i><span>${esc(msg)}</span>`
    box.appendChild(el)
    setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 300) }, type === 'error' ? 6000 : 3500)
  }
  function errToast(e) {
    let m = e.message || 'حدث خطأ'
    if (e.details && Array.isArray(e.details) && e.details.length) m += ': ' + e.details.slice(0, 3).map(d => d.message || d.message_ar || d.path).join('، ')
    toast(m, 'error')
  }
  function modal({ title, body, actions = '', size = 'max-w-lg', onMount }) {
    const wrap = document.createElement('div')
    wrap.className = 'fixed inset-0 z-[90] bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4 fade-in'
    wrap.innerHTML = `<div role="dialog" aria-modal="true" class="bg-white w-full ${size} rounded-t-2xl sm:rounded-2xl shadow-2xl max-h-[92vh] flex flex-col">
      <header class="flex items-center justify-between px-5 py-4 border-b"><h3 class="font-bold text-navy-800 text-lg">${title}</h3><button data-close class="text-slate-400 hover:text-slate-700 w-8 h-8" aria-label="إغلاق"><i class="fas fa-xmark text-lg"></i></button></header>
      <div class="p-5 overflow-y-auto modal-body">${body}</div>${actions ? `<footer class="px-5 py-3 border-t flex gap-2 justify-end bg-slate-50 rounded-b-2xl">${actions}</footer>` : ''}</div>`
    const close = () => wrap.remove()
    wrap.addEventListener('click', (e) => { if (e.target === wrap || e.target.closest('[data-close]')) close() })
    document.body.appendChild(wrap)
    onMount && onMount(wrap, close)
    return { el: wrap, close }
  }
  function confirmDlg(message, { danger = false, okText = 'تأكيد' } = {}) {
    return new Promise((resolve) => {
      const m = modal({ title: 'تأكيد', body: `<p class="text-slate-700">${esc(message)}</p>`, actions: `<button data-close class="btn-ghost">إلغاء</button><button id="cfm-ok" class="${danger ? 'btn-danger' : 'btn-primary'}">${okText}</button>` })
      $('#cfm-ok', m.el).onclick = () => { m.close(); resolve(true) }
      m.el.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) resolve(false) })
    })
  }
  function busy(btn, on) {
    if (!btn) return
    if (on) { btn.dataset.html = btn.innerHTML; btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>' }
    else { btn.disabled = false; if (btn.dataset.html) btn.innerHTML = btn.dataset.html }
  }

  /* ---------- Router ---------- */
  const routes = []
  function route(pattern, handler, opts = {}) {
    const keys = []
    const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)' }) + '/?$')
    routes.push({ re, keys, handler, opts })
  }
  function go(path, replace = false) {
    if (replace) history.replaceState({}, '', path); else history.pushState({}, '', path)
    render()
  }
  async function render() {
    const path = location.pathname
    const q = Object.fromEntries(new URLSearchParams(location.search))
    for (const r of routes) {
      const m = path.match(r.re)
      if (!m) continue
      const params = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]))
      if (r.opts.auth || r.opts.admin) {
        if (!S.me) { try { const ss = await api('/session'); S.me = ss.authenticated ? await api('/me', { silent401: true }) : null } catch { S.me = null } }
        if (!S.me) return go('/login?next=' + encodeURIComponent(path + location.search), true)
        if (r.opts.admin && !['ADMIN', 'SUPER_ADMIN'].includes(S.me.user.platform_role)) return go('/app', true)
      }
      window.scrollTo(0, 0)
      try { await r.handler(params, q) } catch (e) { console.error(e); $('#app').innerHTML = errorPage(e) }
      return
    }
    $('#app').innerHTML = FA.publicLayout(`<section class="max-w-xl mx-auto text-center py-24"><div class="text-7xl font-extrabold text-navy-800">404</div><p class="mt-4 text-slate-600">الصفحة غير موجودة</p><a href="/" data-link class="btn-primary mt-6 inline-flex">العودة للرئيسية</a></section>`)
  }
  const errorPage = (e) => `<div class="max-w-lg mx-auto text-center py-20 px-4"><i class="fas fa-triangle-exclamation text-4xl text-amber-500"></i><h2 class="mt-4 font-bold text-xl">${esc(e.status === 404 ? 'غير موجود' : 'تعذر تحميل الصفحة')}</h2><p class="mt-2 text-slate-600">${esc(e.message)}</p><a href="/app" data-link class="btn-primary mt-6 inline-flex">العودة</a></div>`

  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[data-link]')
    if (a && !e.metaKey && !e.ctrlKey && a.getAttribute('href')?.startsWith('/')) { e.preventDefault(); go(a.getAttribute('href')) }
  })
  window.addEventListener('popstate', render)

  async function loadSettings() {
    if (!S.settings) { try { S.settings = await api('/public/settings') } catch { S.settings = { name_ar: 'اصنع مشروعك بنفسك', logo: '/static/img/logo.png' } } }
    if (S.settings.primary) document.documentElement.style.setProperty('--brand', S.settings.primary)
    if (S.settings.accent) document.documentElement.style.setProperty('--accent', S.settings.accent)
    return S.settings
  }

  /* ---------- Form helpers ---------- */
  function formData(form) {
    const o = {}
    for (const el of form.elements) {
      if (!el.name || el.disabled) continue
      if (el.type === 'checkbox') o[el.name] = el.checked
      else if (el.type === 'number') o[el.name] = el.value === '' ? null : Number(el.value)
      else o[el.name] = el.value
    }
    return o
  }
  function fieldErrors(form, details) {
    $$('.field-err', form).forEach(x => x.remove())
    $$('.input-err', form).forEach(x => x.classList.remove('input-err'))
    for (const d of (details || [])) {
      const el = form.querySelector(`[name="${d.path}"]`)
      if (el) { el.classList.add('input-err'); el.insertAdjacentHTML('afterend', `<p class="field-err text-xs text-red-600 mt-1">${esc(d.message)}</p>`) }
    }
  }
  const SECTORS = { commercial: 'تجاري', food_service: 'مطاعم وكافيهات', digital: 'رقمي', industrial: 'صناعي', agriculture: 'زراعي وحيواني', real_estate: 'عقاري', services: 'خدمي', tourism: 'سياحي', medical: 'طبي', custom: 'مخصص' }
  const STATUS = { draft: ['مسودة', 'bg-slate-100 text-slate-600'], in_progress: ['قيد الإعداد', 'bg-amber-100 text-amber-700'], computed: ['محسوبة', 'bg-blue-100 text-blue-700'], completed: ['مكتملة', 'bg-emerald-100 text-emerald-700'], archived: ['مؤرشفة', 'bg-slate-200 text-slate-500'] }
  const statusBadge = (s) => { const [l, c] = STATUS[s] || [s, 'bg-slate-100']; return `<span class="text-xs px-2 py-0.5 rounded-full ${c}">${l}</span>` }
  const GOVS = ['القاهرة', 'الجيزة', 'الإسكندرية', 'القليوبية', 'الشرقية', 'الدقهلية', 'الغربية', 'المنوفية', 'البحيرة', 'كفر الشيخ', 'دمياط', 'بورسعيد', 'الإسماعيلية', 'السويس', 'الفيوم', 'بني سويف', 'المنيا', 'أسيوط', 'سوهاج', 'قنا', 'الأقصر', 'أسوان', 'البحر الأحمر', 'الوادي الجديد', 'مطروح', 'شمال سيناء', 'جنوب سيناء']

  const charts = {}
  function chart(id, config) {
    if (charts[id]) { charts[id].destroy(); delete charts[id] }
    const el = document.getElementById(id)
    if (!el || !window.Chart) return
    Chart.defaults.font.family = 'Cairo'; Chart.defaults.locale = 'en-US'
    charts[id] = new Chart(el, config)
  }

  return { S, $, $$, esc, fmt, pct, date, api, toast, errToast, modal, confirmDlg, busy, route, go, render, loadSettings, formData, fieldErrors, SECTORS, statusBadge, GOVS, chart }
})()
