-- Configuration seed: plans (limits only; paid prices are NULL until set by admin), RBAC matrix, platform settings,
-- and a country tax profile flagged NEEDS_REVIEW (must be confirmed by admin before relying on it).

INSERT OR IGNORE INTO plans (id,name_ar,name_en,description_ar,description_en,price_monthly,price_yearly,price_single_study,currency,max_projects,max_studies,max_ai_requests_month,max_exports_month,max_members,features_json,sort_order) VALUES
 ('free','المجانية','Free','لتجربة المنصة وبناء دراسة واحدة كاملة بالمحرك المالي.','Try the platform with one full study.',0,0,NULL,'EGP',1,1,10,2,1,'["financial_engine","scenarios","html_report"]',0),
 ('pro','الاحترافية','Pro','لرواد الأعمال وأصحاب المشروعات الصغيرة.','For entrepreneurs and SMEs.',NULL,NULL,NULL,'EGP',10,20,200,50,1,'["financial_engine","scenarios","sensitivity","ai_assistant","pdf","excel","versions"]',1),
 ('consultant','المستشار','Consultant','لمكاتب الاستشارات والمحللين الماليين مع فريق عمل.','For consultancies with a team.',NULL,NULL,NULL,'EGP',50,100,1000,300,5,'["financial_engine","scenarios","sensitivity","ai_assistant","pdf","excel","versions","team","org_logo"]',2),
 ('business','الأعمال','Business','للشركات التي تقيّم مشروعات متعددة.','For companies evaluating many projects.',NULL,NULL,NULL,'EGP',500,1000,5000,2000,25,'["financial_engine","scenarios","sensitivity","ai_assistant","pdf","excel","versions","team","org_logo","priority_support"]',3);

-- RBAC matrix (org-scoped roles)
INSERT OR IGNORE INTO role_permissions (role, permission) VALUES
 ('ORGANIZATION_OWNER','project.read'),('ORGANIZATION_OWNER','project.write'),('ORGANIZATION_OWNER','project.delete'),
 ('ORGANIZATION_OWNER','study.read'),('ORGANIZATION_OWNER','study.write'),('ORGANIZATION_OWNER','study.delete'),('ORGANIZATION_OWNER','study.export'),('ORGANIZATION_OWNER','ai.use'),
 ('ORGANIZATION_OWNER','org.manage'),('ORGANIZATION_OWNER','billing.manage'),('ORGANIZATION_OWNER','source.write'),
 ('INDIVIDUAL_USER','project.read'),('INDIVIDUAL_USER','project.write'),('INDIVIDUAL_USER','project.delete'),
 ('INDIVIDUAL_USER','study.read'),('INDIVIDUAL_USER','study.write'),('INDIVIDUAL_USER','study.delete'),('INDIVIDUAL_USER','study.export'),('INDIVIDUAL_USER','ai.use'),
 ('INDIVIDUAL_USER','org.manage'),('INDIVIDUAL_USER','billing.manage'),('INDIVIDUAL_USER','source.write'),
 ('ORGANIZATION_ADMIN','project.read'),('ORGANIZATION_ADMIN','project.write'),('ORGANIZATION_ADMIN','project.delete'),
 ('ORGANIZATION_ADMIN','study.read'),('ORGANIZATION_ADMIN','study.write'),('ORGANIZATION_ADMIN','study.delete'),('ORGANIZATION_ADMIN','study.export'),('ORGANIZATION_ADMIN','ai.use'),
 ('ORGANIZATION_ADMIN','org.manage'),('ORGANIZATION_ADMIN','source.write'),
 ('CONSULTANT','project.read'),('CONSULTANT','project.write'),('CONSULTANT','study.read'),('CONSULTANT','study.write'),('CONSULTANT','study.export'),('CONSULTANT','ai.use'),('CONSULTANT','source.write'),
 ('ANALYST','project.read'),('ANALYST','study.read'),('ANALYST','study.write'),('ANALYST','study.export'),('ANALYST','ai.use'),('ANALYST','source.write'),
 ('MEMBER','project.read'),('MEMBER','project.write'),('MEMBER','study.read'),('MEMBER','study.write'),
 ('VIEWER','project.read'),('VIEWER','study.read');

INSERT OR IGNORE INTO system_settings (key, value) VALUES
 ('platform', '{"name_ar":"اصنع مشروعك بنفسك","name_en":"FEASIBILITY AI","tagline_ar":"من فكرتك .. إلى خطة عمل متكاملة","tagline_en":"Smart Business Planning Platform","logo":"/static/img/logo.png","primary":"#0B2A5B","accent":"#F2B705","support_email":"","default_country":"EG","default_currency":"EGP","registration_open":true}'),
 ('ai', '{"enabled":true,"model":"gpt-5-mini","max_output_tokens":4000,"monthly_cost_cap_tokens":5000000,"send_financials_to_ai":true}'),
 ('payments', '{"provider":"none","mode":"development"}');

-- Egypt corporate income tax: 22.5% under Income Tax Law No. 91 of 2005 (general rate). VAT 14% (Law 67/2016).
-- Status is NEEDS_REVIEW: activity-specific regimes (e.g. simplified SME regime Law 6/2025, free zones) differ.
INSERT OR IGNORE INTO tax_profiles (id,country,name_ar,name_en,income_tax_pct,vat_pct,effective_from,source_name,source_url,status,notes) VALUES
 ('eg-general','EG','الضريبة العامة على أرباح الأشخاص الاعتبارية','Egypt general corporate income tax',22.5,14,'2005-06-09','مصلحة الضرائب المصرية — قانون 91 لسنة 2005','https://www.eta.gov.eg','NEEDS_REVIEW','قد تختلف النسبة لأنشطة معينة أو للمشروعات الصغيرة (النظام المبسط) أو المناطق الحرة. يجب مراجعتها مع محاسب قانوني.');

-- Curated public source directory (no values; publishers only)
INSERT OR IGNORE INTO market_sources (id,org_id,name,publisher,url,country,data_type,confidence,notes) VALUES
 ('src-capmas',NULL,'الجهاز المركزي للتعبئة العامة والإحصاء','CAPMAS','https://www.capmas.gov.eg','EG','إحصاءات سكانية واقتصادية وأسعار','high','مصدر رسمي — يجب تسجيل تاريخ الرصد والجدول المستخدم'),
 ('src-cbe',NULL,'البنك المركزي المصري','Central Bank of Egypt','https://www.cbe.org.eg','EG','أسعار الصرف والفائدة والتضخم','high','مصدر رسمي لأسعار الصرف وأسعار الفائدة'),
 ('src-gafi',NULL,'الهيئة العامة للاستثمار والمناطق الحرة','GAFI','https://www.gafi.gov.eg','EG','إجراءات التأسيس والحوافز','high',NULL),
 ('src-eta',NULL,'مصلحة الضرائب المصرية','Egyptian Tax Authority','https://www.eta.gov.eg','EG','قواعد ضريبية','high',NULL),
 ('src-msmeda',NULL,'جهاز تنمية المشروعات المتوسطة والصغيرة ومتناهية الصغر','MSMEDA','https://www.msmeda.org.eg','EG','تمويل وبرامج دعم المشروعات','high',NULL),
 ('src-ida',NULL,'الهيئة العامة للتنمية الصناعية','IDA','https://www.ida.gov.eg','EG','التراخيص والأراضي الصناعية','high',NULL),
 ('src-nfsa',NULL,'الهيئة القومية لسلامة الغذاء','NFSA','https://www.nfsa.gov.eg','EG','اشتراطات سلامة الغذاء','high',NULL),
 ('src-worldbank',NULL,'World Bank Open Data','World Bank','https://data.worldbank.org','GLOBAL','مؤشرات اقتصادية كلية','high',NULL),
 ('src-fao',NULL,'FAOSTAT','FAO','https://www.fao.org/faostat','GLOBAL','إنتاج وأسعار زراعية','high',NULL),
 ('src-itc',NULL,'ITC Trade Map','International Trade Centre','https://www.trademap.org','GLOBAL','بيانات التجارة الدولية','high','يتطلب تسجيلًا مجانيًا');
