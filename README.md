# اصنع مشروعك بنفسك — FEASIBILITY AI
منصة SaaS لإعداد دراسات الجدوى الاقتصادية والمالية بمحرك مالي مستقل ومساعد ذكاء اصطناعي مسؤول. عربية بالكامل (RTL) وتبدأ بالسوق المصري.

## المكونات المكتملة
- **محرك مالي مستقل** (`packages/financial-engine`) بدقة عشرية (decimal.js): قائمة دخل، تدفقات نقدية (مشروع وحقوق ملكية)، ميزانية متوازنة، إهلاك (ثابت/متناقص)، قروض (أقساط متساوية/أصل متساوٍ، سماح، رسوم)، ضرائب بترحيل خسائر، رأس مال عامل، تضخم ونمو وسعر صرف، طاقة/تشغيل/هالك، NPV، IRR، IRR الملكية، استرداد عادي ومخصوم، تعادل (قيمة/وحدات/نقدي)، ROI، DSCR، مؤشر الربحية، سيناريوهات، حساسية، What-if. **31 اختبارًا مرجعيًا ناجحًا**.
- **مصادقة**: تسجيل، دخول، خروج، خروج من كل الأجهزة، استعادة كلمة المرور، تحقق البريد، MFA (TOTP)، قفل بعد 5 محاولات، Rate limiting، جلسات HttpOnly، حماية CSRF، رؤوس أمان CSP.
- **RBAC وعزل المؤسسات**: 9 أدوار، تحقق الملكية على الخادم لكل مورد (404 لمنع التخمين).
- **مشروعات** (CRUD، بحث، فرز، ترقيم، أرشفة، حذف وفق سياسة الاحتفاظ، مرفقات R2 عند تفعيله).
- **18 قالبًا قطاعيًا مُصدَّرًا بالإصدارات** (تجاري، مطاعم، تجارة إلكترونية، مصانع، أغذية، تعبئة، زراعي، ثروة حيوانية، عقاري، خدمي، تقني، تعليمي، سياحي، طبي، لوجستي، طاقة متجددة، غير تقليدي، مخصص) مع اشتقاق الإيراد من الطاقة التشغيلية.
- **معالج 13 خطوة** بحفظ تلقائي وكشف تعارض (409) ونسبة اكتمال وبيان النواقص وتصنيف كل بند (موثق/من المستخدم/تقديري/يحتاج مراجعة).
- **النتائج**: مؤشرات، رسوم بيانية، قوائم مالية كاملة، جداول القروض والإهلاك، سيناريوهات معتمدة من المستخدم، حساسية + Tornado، What-if فوري لا يُحفظ.
- **الإصدارات**: لقطات ثابتة، مقارنة إصدارين (مؤشرات + مدخلات)، استعادة آمنة، تحقق قابلية إعادة الإنتاج.
- **التقارير**: تقرير عربي من 24 قسمًا (غلاف، فهرس، ترقيم صفحات، رسوم SVG، بصمة SHA-256)، طباعة PDF، Excel حقيقي (8 أوراق)، سجل إصدارات للتقارير، منع تكرار التصدير.
- **المصادر والأدلة**: سجل مصادر بتاريخ الرصد والثقة، ربط الادعاءات بالأقسام، تنبيه المصادر القديمة، منع تصنيف "موثق" بلا مصدر.
- **الذكاء الاصطناعي**: طبقة مستقلة عن المزود، 7 مهام بـ JSON Schema + تحقق zod، حماية Prompt Injection، Retry/Timeout، إلغاء، منع التكرار، سجل استهلاك، سقف شهري. لا يغير أرقام المحرك أبدًا.
- **الاشتراكات**: 4 باقات (الأسعار يحددها الأدمن)، حدود استخدام، كوبونات، فواتير، Payment Provider Interface، Webhooks موقعة + Idempotency، مزود "dev" للمحاكاة فقط.
- **لوحة الإدارة**: إحصاءات، مستخدمون، مؤسسات ومنح باقات، الباقات والكوبونات، المدفوعات، القوالب (إصدار جديد بـ JSON)، الضرائب وأسعار الصرف والمصادر، مراقبة AI، المحتوى والرسائل، هوية المنصة (الاسم/الشعار/الألوان)، سجل التدقيق.
- **صفحات عامة**: الرئيسية، المميزات، كيف تعمل، أنواع الدراسات، نماذج التقارير، الأسعار، الأسئلة الشائعة، المقالات، التواصل، الخصوصية، الشروط، إخلاء المسؤولية، دخول/تسجيل/استعادة/تحقق.

### دراسات جدوى جاهزة + طلب عبر واتساب
- `/sectors` بطاقات القطاعات السبعة ← `/sectors/:id` دراسات القطاع ← `/catalog/:slug` صفحة الدراسة وزر «شراء».
- نموذج الشراء يحفظ الطلب ثم يفتح `https://wa.me/201008338490?text=...` (الرقم قابل للتعديل من الإدارة).
- الإدارة: `/admin/catalog` (القطاعات، الدراسات، الأسعار، رقم واتساب) و`/admin/requests` (طلبات الشراء).

## مسارات API الرئيسية
- `GET /api/public/sectors` · `GET /api/public/sectors/:id` · `GET /api/public/catalog/:slug` · `GET /api/public/catalog/search?q=` · `POST /api/public/purchase-requests`
- `GET|POST|PUT /api/admin/catalog/sectors` · `GET|POST|PUT|DELETE /api/admin/catalog/studies` · `GET|PATCH /api/admin/catalog/purchase-requests`
| المسار | الوصف |
|---|---|
| `GET /api/health` | حالة الخدمة والتكاملات |
| `POST /api/auth/register|login|logout|forgot-password|reset-password|verify-email` | المصادقة |
| `GET/POST /api/projects`, `GET/PUT/DELETE /api/projects/:id` | المشروعات |
| `POST /api/studies`, `GET /api/studies/:id`, `PUT /api/studies/:id/inputs` | الدراسات والحفظ التلقائي |
| `POST /api/studies/:id/compute|what-if|sensitivity|derive-revenue` | المحرك المالي |
| `POST /api/studies/:id/versions`, `GET .../compare?a=&b=`, `.../versions/:v/verify|restore` | الإصدارات |
| `GET /api/studies/:id/report/preview`, `POST /api/studies/:id/reports`, `GET /api/reports/:rid/download` | التقارير |
| `POST /api/studies/:id/ai/:task`, `GET /api/ai-jobs/:id` | الذكاء الاصطناعي |
| `GET /api/billing/plans|subscription`, `POST /api/billing/checkout`, `POST /api/billing/webhooks/payments` | الاشتراكات |
| `/api/admin/*` | الإدارة (ADMIN/SUPER_ADMIN فقط) |

## التشغيل المحلي
```bash
npm install
cp .dev.vars.example .dev.vars        # عدّل القيم
npm run db:migrate:local
npm run build
pm2 start ecosystem.config.cjs        # http://localhost:3000
npm test                              # 31 اختبار للمحرك المالي
npm run test:e2e                      # 36 فحصًا للمسار الكامل والصلاحيات
bash scripts/dev-demo.sh              # (تطوير فقط) admin@example.com / Admin12345 + دراسة مطعم
```

## المعمارية
Hono على Cloudflare Workers/Pages + D1 (SQLite) + R2 اختياري + واجهة SPA (Vanilla JS + Tailwind + Chart.js). راجع `docs/ARCHITECTURE.md` لسبب اختيار هذا البديل بدل Next.js/NestJS/PostgreSQL.

## البيانات
D1: 30+ جدولًا (users, sessions, organizations, organization_members, role_permissions, plans, subscriptions, subscription_usage, coupons, payments, payment_events, invoices, projects, feasibility_studies, study_versions, study_templates, study_template_versions, market_sources, study_source_links, tax_profiles, exchange_rates, reports, uploaded_files, ai_jobs, ai_usage_logs, notifications, audit_logs, system_settings, articles, contact_messages). انظر `docs/DATABASE_SCHEMA.md`.

## حالة النشر
- **المنصة**: Cloudflare Pages (غير منشورة بعد)
- **الحزمة التقنية**: Hono + TypeScript + D1 + Tailwind
- انظر `docs/DEPLOYMENT.md` و `PROJECT_STATUS.md`
