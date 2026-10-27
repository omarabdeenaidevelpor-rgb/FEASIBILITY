# Generates templates.json (reference data: field definitions, cost/revenue ELEMENT NAMES only — no amounts).
import json
common_kpis = ["npv","irrPct","paybackYears","breakEvenRevenue","grossMarginPct","netMarginPct","roiPct"]
common_report = ["cover","project","executive","description","market","competitors","technical","operational","management","marketing","legal","investment","opex","revenue","statements","metrics","scenarios","sensitivity","risks","implementation","recommendations","sources","assumptions","disclaimer"]
common_sources = ["capmas","cbe","gafi","eta","msmeda","worldbank"]

def F(key, ar, en, unit=None, type="number", required=False, help=None, options=None):
    d={"key":key,"label_ar":ar,"label_en":en,"type":type,"required":required}
    if unit: d["unit"]=unit
    if help: d["help_ar"]=help
    if options: d["options"]=options
    return d
def inv(*items): return [{"name":n,"category":c,"usefulLife":l} for n,c,l in items]
def opx(*items): return [{"name":n,"costType":t} for n,t in items]

T=[]
def add(id, sector, ar, en, icon, image, desc, fields, revenue_helper, investment, opex, staff, revenue, kpis_extra, risks, sources_extra, validations):
    T.append({"id":id,"sector":sector,"name_ar":ar,"name_en":en,"icon":icon,"image":image,"definition":{
      "description_ar":desc,"fields":fields,"revenueHelper":revenue_helper,
      "suggested":{"investment":investment,"opex":opex,"staff":[{"role":s} for s in staff],"revenue":[{"name":n,"unit":u} for n,u in revenue]},
      "kpis":common_kpis+kpis_extra,"risks":risks,"reportSections":common_report,
      "dataSources":common_sources+sources_extra,"validations":validations}})

add("commercial","commercial","المشروعات التجارية والمحلات","Retail & trading","fa-store","commercial.jpg",
 "محلات التجزئة والجملة والسوبر ماركت. يركز على المساحة وحركة العملاء ومتوسط الفاتورة ومعدل دوران المخزون.",
 [F("areaSqm","مساحة المحل","Store area","م²",required=True),F("dailyCustomers","متوسط عدد العملاء يوميًا","Daily customers","عميل",required=True),
  F("avgBasket","متوسط قيمة الفاتورة","Average basket","عملة",required=True),F("operatingDays","أيام العمل سنويًا","Operating days","يوم",required=True),
  F("grossMarkupPct","هامش الربح على سعر الشراء","Markup on cost","%")],
 {"volumeFrom":["dailyCustomers","operatingDays"],"priceFrom":"avgBasket","unit":"فاتورة","costFromMarkup":"grossMarkupPct"},
 inv(("ديكورات وتجهيزات المحل","furniture",5),("ثلاجات وأرفف","equipment",7),("نظام نقاط البيع POS","technology",3),("مخزون أولي (يُدرج ضمن رأس المال العامل)","other",0),("رخص وتأسيس","license",0)),
 opx(("إيجار المحل","fixed"),("كهرباء ومياه","fixed"),("تسويق","fixed"),("عمولة الدفع الإلكتروني","variable_pct"),("هالك وفاقد بضاعة","variable_pct")),
 ["مدير محل","كاشير","عامل رفوف"],[("مبيعات تجزئة","فاتورة")],["inventoryTurnover","salesPerSqm"],
 ["تقلب أسعار الموردين","منافسة السلاسل الكبرى","انخفاض القوة الشرائية","سرقة وفاقد المخزون","تغير موقع الحركة التجارية"],[],
 ["متوسط الفاتورة > 0","أيام العمل ≤ 365"])

add("restaurant","food_service","المطاعم والكافيهات","Restaurants & cafés","fa-utensils","hero1.jpg",
 "يعتمد على عدد المقاعد ومعدل دوران الطاولات ومتوسط الفاتورة ونسبة تكلفة الطعام (Food Cost).",
 [F("seats","عدد المقاعد","Seats","مقعد",required=True),F("turnsPerDay","دوران الطاولة يوميًا","Table turns/day","مرة",required=True),
  F("occupancyPct","متوسط نسبة الإشغال","Average occupancy","%",required=True),F("operatingDays","أيام العمل سنويًا","Operating days","يوم",required=True),
  F("avgTicket","متوسط فاتورة الفرد","Average ticket per guest","عملة",required=True),F("foodCostPct","نسبة تكلفة الطعام من السعر","Food cost %","%",required=True),
  F("deliverySharePct","نسبة مبيعات التوصيل","Delivery share","%")],
 {"volumeFrom":["seats","turnsPerDay","operatingDays"],"volumePctFrom":"occupancyPct","priceFrom":"avgTicket","unit":"زائر","costPctFrom":"foodCostPct"},
 inv(("معدات المطبخ","equipment",7),("أثاث وديكور الصالة","furniture",5),("تجهيزات وتشطيبات","building",10),("أنظمة POS وكاميرات","technology",3),("رخص وسجل صحي","license",0)),
 opx(("إيجار","fixed"),("غاز وكهرباء ومياه","fixed"),("عمولة تطبيقات التوصيل","variable_pct"),("تسويق وسوشيال ميديا","fixed"),("صيانة","fixed")),
 ["شيف رئيسي","مساعد شيف","ويتر","كاشير","عامل نظافة"],[("وجبات ومشروبات","زائر")],["revPerSeat","foodCostPct"],
 ["ارتفاع أسعار الخامات الغذائية","اشتراطات سلامة الغذاء","تقلب الإقبال الموسمي","الاعتماد على تطبيقات التوصيل","دوران العمالة"],["nfsa"],
 ["نسبة الإشغال ≤ 100%","تكلفة الطعام < 100%"])

add("ecommerce","digital","التجارة الإلكترونية","E-commerce","fa-cart-shopping","tech.jpg",
 "متاجر إلكترونية: الزيارات ومعدل التحويل ومتوسط الطلب وتكلفة الاستحواذ على العميل والشحن والمرتجعات.",
 [F("monthlyVisitors","الزيارات الشهرية","Monthly visitors","زيارة",required=True),F("conversionPct","معدل التحويل","Conversion rate","%",required=True),
  F("avgOrderValue","متوسط قيمة الطلب","Average order value","عملة",required=True),F("cogsPct","تكلفة البضاعة من السعر","COGS %","%",required=True),
  F("returnsPct","نسبة المرتجعات","Returns","%"),F("cac","تكلفة الاستحواذ على العميل","CAC","عملة")],
 {"volumeFrom":["monthlyVisitors"],"volumeMultiplier":12,"volumePctFrom":"conversionPct","priceFrom":"avgOrderValue","unit":"طلب","costPctFrom":"cogsPct","returnsFrom":"returnsPct"},
 inv(("تطوير المتجر والمنصة","technology",3),("أجهزة ومعدات مكتبية","equipment",5),("مخزون أولي","other",0),("تسجيل وعلامة تجارية","license",0)),
 opx(("استضافة واشتراكات برمجية","fixed"),("إعلانات رقمية","fixed"),("شحن وتوصيل","variable_pct"),("عمولات بوابة الدفع","variable_pct"),("مخزن","fixed")),
 ["مدير متجر","مسؤول تسويق رقمي","خدمة عملاء","أمين مخزن"],[("طلبات أونلاين","طلب")],["cac","ltv","conversionPct"],
 ["ارتفاع تكلفة الإعلانات","المرتجعات والدفع عند الاستلام","المنافسة السعرية","الاعتماد على منصات خارجية","أمن المعلومات"],["itc"],
 ["معدل التحويل ≤ 100%"])

add("factory","industrial","المصانع وخطوط الإنتاج","Factories & production lines","fa-industry","economic.jpg",
 "يعتمد على الطاقة الإنتاجية ونسبة التشغيل والهالك وتكلفة الوحدة والصيانة والطاقة.",
 [F("dailyCapacity","الطاقة الإنتاجية اليومية","Daily capacity","وحدة",required=True),F("workingDays","أيام التشغيل سنويًا","Working days","يوم",required=True),
  F("utilizationPct","نسبة التشغيل المتوقعة","Utilization","%",required=True),F("wastePct","نسبة الهالك","Waste","%",required=True),
  F("unitPrice","سعر بيع الوحدة","Unit price","عملة",required=True),F("unitMaterialCost","تكلفة الخامات للوحدة","Material cost per unit","عملة",required=True),
  F("shifts","عدد الورديات","Shifts","وردية"),F("powerKw","القدرة الكهربائية","Power load","ك.و")],
 {"capacityFrom":["dailyCapacity","workingDays"],"utilizationFrom":"utilizationPct","wasteFrom":"wastePct","priceFrom":"unitPrice","costFrom":"unitMaterialCost","unit":"وحدة"},
 inv(("أرض المصنع","land",0),("مباني وإنشاءات","building",25),("خطوط إنتاج ومعدات","equipment",10),("تركيب وتشغيل تجريبي","installation",10),("مولد ومحولات","equipment",10),("وسائل نقل","vehicles",5),("تراخيص وسجل صناعي","license",0),("مصروفات ما قبل التشغيل","preoperating",0)),
 opx(("كهرباء وطاقة","fixed"),("صيانة وقطع غيار","fixed"),("تأمين على الأصول","fixed"),("نقل وتوزيع","variable_pct"),("تعبئة وتغليف","variable_pct"),("مصروفات إدارية","fixed")),
 ["مدير مصنع","مهندس إنتاج","فني صيانة","عامل إنتاج","مراقب جودة","محاسب"],[("منتج رئيسي","وحدة")],["breakEvenUtilizationPct","costPerUnit","minDscr"],
 ["تذبذب أسعار الخامات وسعر الصرف","أعطال المعدات","تأخر التراخيص الصناعية","انخفاض نسبة التشغيل","اشتراطات بيئية"],["ida"],
 ["الهالك < 100%","نسبة التشغيل ≤ 100%"])

add("food_factory","industrial","مصانع الأغذية","Food processing","fa-bowl-food","sectors.jpg",
 "مصانع الأغذية: معدل التحويل من الخامات للمنتج، الموسمية، سلامة الغذاء، التبريد ومدة الصلاحية.",
 [F("dailyCapacity","الطاقة الإنتاجية اليومية","Daily capacity","كجم",required=True),F("workingDays","أيام التشغيل","Working days","يوم",required=True),
  F("utilizationPct","نسبة التشغيل","Utilization","%",required=True),F("yieldPct","نسبة التصافي من الخامات","Yield","%",required=True),
  F("wastePct","الهالك","Waste","%"),F("unitPrice","سعر البيع للكجم","Price per kg","عملة",required=True),F("unitMaterialCost","تكلفة الخامات للكجم منتج","Material cost per kg","عملة",required=True),
  F("shelfLifeDays","مدة الصلاحية","Shelf life","يوم")],
 {"capacityFrom":["dailyCapacity","workingDays"],"utilizationFrom":"utilizationPct","wasteFrom":"wastePct","priceFrom":"unitPrice","costFrom":"unitMaterialCost","unit":"كجم"},
 inv(("أرض","land",0),("مبنى بمواصفات غذائية","building",25),("خط تصنيع","equipment",10),("غرف تبريد وتجميد","equipment",10),("معمل جودة","equipment",7),("سيارات مبردة","vehicles",5),("تراخيص سلامة الغذاء","license",0)),
 opx(("كهرباء وتبريد","fixed"),("مواد تعبئة","variable_pct"),("تحاليل وشهادات جودة","fixed"),("توزيع","variable_pct"),("صيانة","fixed")),
 ["مدير مصنع","مهندس أغذية","أخصائي جودة","عامل إنتاج","سائق"],[("منتج غذائي","كجم")],["yieldPct","costPerUnit"],
 ["اشتراطات الهيئة القومية لسلامة الغذاء","موسمية الخامات","انتهاء الصلاحية والمرتجعات","انقطاع سلسلة التبريد"],["nfsa","fao"],["نسبة التصافي ≤ 100%"])

add("packaging","industrial","التعبئة والتغليف","Packaging","fa-box","sectors.jpg",
 "مشروعات التعبئة والتغليف وخدمات التعبئة للغير: سرعة الماكينة، تكلفة الخامة للعبوة، الهالك.",
 [F("unitsPerHour","إنتاجية الماكينة/ساعة","Units/hour","عبوة",required=True),F("hoursPerDay","ساعات التشغيل يوميًا","Hours/day","ساعة",required=True),
  F("workingDays","أيام التشغيل","Working days","يوم",required=True),F("utilizationPct","نسبة التشغيل","Utilization","%",required=True),
  F("wastePct","الهالك","Waste","%"),F("unitPrice","سعر العبوة/الخدمة","Price per unit","عملة",required=True),F("unitMaterialCost","تكلفة خامات العبوة","Material per unit","عملة",required=True)],
 {"capacityFrom":["unitsPerHour","hoursPerDay","workingDays"],"utilizationFrom":"utilizationPct","wasteFrom":"wastePct","priceFrom":"unitPrice","costFrom":"unitMaterialCost","unit":"عبوة"},
 inv(("ماكينات تعبئة","equipment",10),("ماكينات طباعة وتغليف","equipment",10),("تجهيز العنبر","building",20),("تركيب","installation",10)),
 opx(("كهرباء","fixed"),("إيجار عنبر","fixed"),("صيانة","fixed"),("نقل","variable_pct")),
 ["مشرف إنتاج","فني ماكينات","عامل تعبئة"],[("عبوات","عبوة")],["breakEvenUtilizationPct"],
 ["تذبذب أسعار البلاستيك والكرتون","الاعتماد على عملاء محدودين","أعطال الماكينات"],["ida"],[])

add("agriculture","agriculture","المشروعات الزراعية","Agriculture","fa-seedling","agri.jpg",
 "زراعة المحاصيل والصوب والنخيل: المساحة، الإنتاجية للفدان، المواسم، الري، أسعار البيع عند الحصاد.",
 [F("areaFeddan","المساحة","Area","فدان",required=True),F("yieldPerFeddan","الإنتاجية للفدان/الموسم","Yield per feddan","طن",required=True),
  F("seasonsPerYear","عدد المواسم سنويًا","Seasons/year","موسم",required=True),F("pricePerTon","سعر بيع الطن","Price per ton","عملة",required=True),
  F("costPerTon","تكلفة مستلزمات الإنتاج للطن","Input cost per ton","عملة",required=True),F("lossPct","الفاقد بعد الحصاد","Post-harvest loss","%"),
  F("irrigation","نظام الري","Irrigation","",type="select",options=["غمر","تنقيط","رش","محوري"])],
 {"volumeFrom":["areaFeddan","yieldPerFeddan","seasonsPerYear"],"priceFrom":"pricePerTon","costFrom":"costPerTon","wasteFrom":"lossPct","unit":"طن"},
 inv(("استصلاح وتجهيز الأرض","land",0),("شبكة ري","equipment",10),("صوب زراعية","building",8),("آبار وطلمبات","equipment",10),("جرار ومعدات","vehicles",8),("مخزن ومبرد","building",15)),
 opx(("إيجار الأرض","fixed"),("كهرباء/سولار للري","fixed"),("عمالة موسمية","variable_pct"),("نقل وتسويق","variable_pct"),("صيانة","fixed")),
 ["مهندس زراعي","مشرف مزرعة","عامل زراعي دائم"],[("محصول رئيسي","طن")],["yieldPerFeddan","revenuePerFeddan"],
 ["التغيرات المناخية والآفات","تذبذب أسعار المحاصيل","توافر المياه","ارتفاع تكلفة الأسمدة"],["moa","fao"],[])

add("livestock","agriculture","الثروة الحيوانية والداجنة","Livestock & poultry","fa-cow","livestock.jpg",
 "تسمين الماشية والألبان والدواجن والأرانب والاستزراع السمكي ونحل العسل: دورات الإنتاج، معدل النفوق، معامل التحويل الغذائي.",
 [F("headCount","عدد الرؤوس/الطيور في الدورة","Heads per cycle","رأس",required=True),F("cyclesPerYear","عدد الدورات سنويًا","Cycles per year","دورة",required=True),
  F("mortalityPct","نسبة النفوق","Mortality","%",required=True),F("outputPerHead","الناتج للرأس (وزن/لتر)","Output per head","كجم",required=True),
  F("pricePerUnit","سعر بيع الكجم/اللتر","Price per kg/l","عملة",required=True),F("feedCostPerUnit","تكلفة العلف للكجم ناتج","Feed cost per kg","عملة",required=True),
  F("fcr","معامل التحويل الغذائي","FCR","")],
 {"volumeFrom":["headCount","cyclesPerYear","outputPerHead"],"wasteFrom":"mortalityPct","priceFrom":"pricePerUnit","costFrom":"feedCostPerUnit","unit":"كجم"},
 inv(("حظائر/عنابر/أحواض","building",15),("معدات تغذية وشرب وتهوية","equipment",8),("مولد كهرباء","equipment",10),("شراء القطيع الأم (إن وجد)","other",6),("تراخيص بيطرية","license",0)),
 opx(("أدوية وتحصينات بيطرية","variable_pct"),("كهرباء وتدفئة","fixed"),("نقل","variable_pct"),("نشارة وفرشة","variable_pct"),("صيانة","fixed")),
 ["طبيب بيطري (جزئي)","مشرف عنبر","عامل"],[("لحوم/ألبان/بيض","كجم")],["mortalityPct","fcr"],
 ["الأمراض الوبائية ونفوق القطيع","ارتفاع أسعار الأعلاف المستوردة","تذبذب أسعار البيع","اشتراطات البيئة والصحة"],["moa","fao"],["النفوق < 100%"])

add("realestate","real_estate","المشروعات العقارية","Real estate","fa-building","hero2.jpg",
 "التطوير العقاري والتأجير: مساحات قابلة للبيع/التأجير، سعر المتر، نسبة الإشغال، جدول البيع والإنشاء.",
 [F("sellableSqm","المساحة البيعية/التأجيرية","Sellable/leasable area","م²",required=True),F("pricePerSqm","سعر بيع/إيجار المتر سنويًا","Price per m²","عملة",required=True),
  F("occupancyPct","نسبة البيع/الإشغال السنوية","Absorption/occupancy","%",required=True),F("constructionCostSqm","تكلفة إنشاء المتر","Construction cost per m²","عملة",required=True),
  F("model","نموذج الإيراد","Revenue model","",type="select",options=["بيع","تأجير","مختلط"])],
 {"volumeFrom":["sellableSqm"],"volumePctFrom":"occupancyPct","priceFrom":"pricePerSqm","unit":"م²"},
 inv(("الأرض","land",0),("أعمال الإنشاء","building",40),("تشطيبات ومرافق","building",20),("تصميمات وإشراف هندسي","preoperating",0),("تراخيص بناء","license",0)),
 opx(("تسويق ومبيعات","variable_pct"),("صيانة وإدارة عقار","fixed"),("تأمين","fixed"),("ضريبة عقارية","fixed")),
 ["مدير مشروع","مهندس موقع","مسؤول مبيعات"],[("وحدات/مساحات","م²")],["revenuePerSqm"],
 ["تأخر التراخيص والتنفيذ","ارتفاع أسعار مواد البناء","تباطؤ المبيعات","مخاطر التمويل والفائدة"],[],[])

add("services","services","المشروعات الخدمية","Services","fa-handshake","idea.jpg",
 "مكاتب الخدمات والصيانة والاستشارات والمغاسل وغيرها: الطاقة الاستيعابية بالساعات أو العملاء.",
 [F("serviceCapacityPerDay","عدد الخدمات الممكن تقديمها يوميًا","Services per day","خدمة",required=True),F("workingDays","أيام العمل","Working days","يوم",required=True),
  F("utilizationPct","نسبة الاستغلال","Utilization","%",required=True),F("avgServicePrice","متوسط سعر الخدمة","Average service price","عملة",required=True),
  F("directCostPerService","التكلفة المباشرة للخدمة","Direct cost per service","عملة")],
 {"capacityFrom":["serviceCapacityPerDay","workingDays"],"utilizationFrom":"utilizationPct","priceFrom":"avgServicePrice","costFrom":"directCostPerService","unit":"خدمة"},
 inv(("تجهيز المقر","furniture",5),("معدات وأدوات","equipment",5),("أجهزة وبرامج","technology",3),("تأسيس ورخص","license",0)),
 opx(("إيجار","fixed"),("مرافق","fixed"),("تسويق","fixed"),("مستهلكات","variable_pct")),
 ["مدير","مقدم خدمة/فني","موظف استقبال"],[("خدمة","خدمة")],["utilizationPct"],
 ["الاعتماد على كفاءات بشرية محددة","المنافسة السعرية","تذبذب الطلب"],[],[])

add("tech","digital","المشروعات التقنية والبرمجية","Technology & software","fa-microchip","tech.jpg",
 "منصات SaaS وتطبيقات ومشروعات برمجية: المشتركون، معدل الانسحاب، سعر الاشتراك، تكلفة البنية السحابية.",
 [F("subscribersYear1","متوسط المشتركين المدفوعين في السنة الأولى","Avg paying subscribers yr1","مشترك",required=True),F("monthlyPrice","سعر الاشتراك الشهري","Monthly price","عملة",required=True),
  F("churnPct","معدل الانسحاب الشهري","Monthly churn","%"),F("hostingCostPerUser","تكلفة الاستضافة للمستخدم شهريًا","Hosting per user/month","عملة"),F("cac","تكلفة الاستحواذ","CAC","عملة")],
 {"volumeFrom":["subscribersYear1"],"volumeMultiplier":12,"priceFrom":"monthlyPrice","costFrom":"hostingCostPerUser","unit":"اشتراك شهري"},
 inv(("تطوير المنتج (MVP)","technology",3),("أجهزة الفريق","equipment",3),("علامة تجارية وتسجيل","license",0)),
 opx(("اشتراكات سحابية وأدوات","fixed"),("تسويق رقمي","fixed"),("عمولات بوابات الدفع","variable_pct"),("مقر/مساحة عمل","fixed")),
 ["مطور برمجيات","مصمم UI/UX","مدير منتج","مسؤول مبيعات","دعم فني"],[("اشتراكات","اشتراك شهري")],["ltv","cac","churnPct"],
 ["صعوبة اكتساب العملاء","المنافسة العالمية","الأمن السيبراني","الاعتماد على كفاءات نادرة","تقلب سعر الصرف للخدمات السحابية"],[],[])

add("education","services","المشروعات التعليمية","Education","fa-graduation-cap","idea.jpg",
 "مراكز تدريب ومدارس وحضانات ومنصات تعليمية: عدد الطلاب، الفصول، المصروفات الدراسية.",
 [F("classrooms","عدد القاعات","Classrooms","قاعة",required=True),F("studentsPerClass","الطلاب لكل قاعة","Students per class","طالب",required=True),
  F("occupancyPct","نسبة الإشغال","Occupancy","%",required=True),F("annualFee","المصروفات السنوية للطالب","Annual fee","عملة",required=True),F("costPerStudent","تكلفة مباشرة للطالب","Direct cost per student","عملة")],
 {"volumeFrom":["classrooms","studentsPerClass"],"volumePctFrom":"occupancyPct","priceFrom":"annualFee","costFrom":"costPerStudent","unit":"طالب"},
 inv(("تجهيز المبنى","building",20),("أثاث تعليمي","furniture",7),("أجهزة ومعامل","technology",4),("تراخيص تعليمية","license",0)),
 opx(("إيجار","fixed"),("مرافق","fixed"),("تسويق","fixed"),("أنشطة ومستلزمات","variable_pct")),
 ["مدير","معلم/مدرب","إداري","عامل"],[("طلاب","طالب")],["revenuePerStudent"],
 ["الاشتراطات والتراخيص التعليمية","موسمية التسجيل","استقطاب كوادر مؤهلة"],[],[])

add("tourism","tourism","المشروعات السياحية","Tourism & hospitality","fa-umbrella-beach","economic.jpg",
 "فنادق وقرى ومنتجعات وأنشطة سياحية: عدد الغرف، نسبة الإشغال، متوسط سعر الليلة، الموسمية.",
 [F("rooms","عدد الغرف/الوحدات","Rooms","غرفة",required=True),F("occupancyPct","متوسط نسبة الإشغال","Occupancy","%",required=True),
  F("adr","متوسط سعر الليلة","ADR","عملة",required=True),F("operatingDays","أيام التشغيل","Operating days","يوم",required=True),F("costPerRoomNight","تكلفة الغرفة الليلة","Cost per room-night","عملة"),
  F("fxPricing","التسعير بالعملة الأجنبية؟","Priced in FX?","",type="select",options=["لا","نعم"])],
 {"volumeFrom":["rooms","operatingDays"],"volumePctFrom":"occupancyPct","priceFrom":"adr","costFrom":"costPerRoomNight","unit":"ليلة"},
 inv(("أرض","land",0),("إنشاءات","building",30),("تجهيز وفرش الغرف","furniture",7),("مطابخ ومعدات","equipment",8),("حمامات سباحة ومرافق","building",15),("تراخيص سياحية","license",0)),
 opx(("مرافق وطاقة","fixed"),("عمولات منصات الحجز","variable_pct"),("تسويق","fixed"),("صيانة","fixed"),("مستلزمات الضيافة","variable_pct")),
 ["مدير فندق","استقبال","خدمة غرف","طاهٍ","أمن"],[("ليالي فندقية","ليلة")],["revpar","occupancyPct"],
 ["تذبذب الحركة السياحية","الموسمية","عمولات المنصات","الأحداث الإقليمية"],["tourism"],[])

add("medical","medical","المشروعات الطبية","Medical","fa-stethoscope","idea.jpg",
 "عيادات ومراكز أشعة ومعامل وصيدليات — ضمن حدود الاشتراطات المنظمة. الدراسة لا تغني عن الاستشارة الطبية والقانونية المتخصصة.",
 [F("dailyPatients","متوسط الحالات يوميًا","Daily patients","حالة",required=True),F("workingDays","أيام العمل","Working days","يوم",required=True),
  F("avgFee","متوسط سعر الخدمة/الكشف","Average fee","عملة",required=True),F("consumablesPerCase","مستهلكات للحالة","Consumables per case","عملة"),F("insuranceSharePct","نسبة التعاقدات/التأمين","Insurance share","%")],
 {"volumeFrom":["dailyPatients","workingDays"],"priceFrom":"avgFee","costFrom":"consumablesPerCase","unit":"حالة"},
 inv(("أجهزة طبية","equipment",7),("تجهيز وتشطيب المقر","building",10),("أثاث","furniture",5),("نظام إدارة طبي","technology",3),("تراخيص وزارة الصحة","license",0)),
 opx(("إيجار","fixed"),("صيانة أجهزة وعقود خدمة","fixed"),("تخلص آمن من النفايات الطبية","fixed"),("خصومات التعاقدات","variable_pct")),
 ["طبيب","تمريض","فني","استقبال"],[("خدمات طبية","حالة")],["revenuePerCase"],
 ["الاشتراطات التنظيمية والتراخيص","المسؤولية المهنية","تقادم الأجهزة","تأخر مستحقات شركات التأمين"],[],[])

add("logistics","services","النقل والخدمات اللوجستية","Transport & logistics","fa-truck","economic.jpg",
 "أساطيل النقل والتوزيع والتخزين: عدد المركبات، الرحلات، الكيلومترات، الوقود، الصيانة.",
 [F("vehicles","عدد المركبات","Vehicles","مركبة",required=True),F("tripsPerVehicleDay","رحلات المركبة يوميًا","Trips per vehicle/day","رحلة",required=True),
  F("workingDays","أيام التشغيل","Working days","يوم",required=True),F("pricePerTrip","متوسط سعر الرحلة","Price per trip","عملة",required=True),F("fuelCostPerTrip","تكلفة الوقود للرحلة","Fuel per trip","عملة",required=True)],
 {"volumeFrom":["vehicles","tripsPerVehicleDay","workingDays"],"priceFrom":"pricePerTrip","costFrom":"fuelCostPerTrip","unit":"رحلة"},
 inv(("مركبات وشاحنات","vehicles",5),("ورشة صيانة","equipment",8),("نظام تتبع GPS","technology",3),("مستودع","building",20),("تراخيص تشغيل","license",0)),
 opx(("تأمين المركبات","fixed"),("صيانة وإطارات","fixed"),("رسوم طرق","variable_pct"),("مقر","fixed")),
 ["مدير عمليات","سائق","فني صيانة","منسق شحنات"],[("رحلات نقل","رحلة")],["revenuePerVehicle"],
 ["تقلب أسعار الوقود","حوادث الطرق","تأخر تحصيل المستحقات","تقادم الأسطول"],[],[])

add("renewable","industrial","الطاقة المتجددة","Renewable energy","fa-solar-panel","sectors.jpg",
 "محطات الطاقة الشمسية وأنظمة الطاقة: القدرة المركبة، ساعات الإشعاع، التدهور السنوي، تعريفة البيع.",
 [F("capacityKwp","القدرة المركبة","Installed capacity","ك.و.ذ",required=True),F("specificYield","الإنتاجية السنوية لكل ك.و.ذ","Specific yield","ك.و.س/ك.و.ذ",required=True),
  F("tariff","تعريفة بيع الكيلووات ساعة","Tariff","عملة",required=True),F("degradationPct","التدهور السنوي للألواح","Annual degradation","%")],
 {"volumeFrom":["capacityKwp","specificYield"],"priceFrom":"tariff","unit":"ك.و.س","growthFromNeg":"degradationPct"},
 inv(("ألواح شمسية","equipment",25),("محولات (Inverters)","equipment",10),("هياكل وتركيبات","installation",25),("أرض/حق انتفاع","land",0),("ربط بالشبكة وتراخيص","license",0)),
 opx(("تشغيل وصيانة O&M","fixed"),("تنظيف الألواح","fixed"),("تأمين","fixed"),("إيجار أرض","fixed")),
 ["مهندس تشغيل","فني","حارس"],[("كهرباء مباعة","ك.و.س")],["lcoe","minDscr"],
 ["تغير التعريفة والتشريعات","سعر الصرف للمعدات المستوردة","انخفاض الإنتاجية","مخاطر الربط بالشبكة"],["nrea"],[])

add("unconventional","agriculture","المشروعات غير التقليدية","Unconventional projects","fa-dragon","rare.jpg",
 "مشروعات غير تقليدية مثل تربية الزواحف أو العقارب أو الفراخ والبط الأسود — تتطلب تراخيص خاصة ودراسة دقيقة لأسواق التصدير والاشتراطات البيئية واتفاقية CITES.",
 [F("headCount","عدد الرؤوس/الكائنات في الدورة","Heads per cycle","رأس",required=True),F("cyclesPerYear","الدورات سنويًا","Cycles per year","دورة",required=True),
  F("mortalityPct","نسبة النفوق","Mortality","%",required=True),F("pricePerUnit","سعر بيع الوحدة/المنتج","Price per unit","عملة",required=True),F("costPerUnit","تكلفة مباشرة للوحدة","Direct cost per unit","عملة",required=True),
  F("exportSharePct","نسبة التصدير","Export share","%")],
 {"volumeFrom":["headCount","cyclesPerYear"],"wasteFrom":"mortalityPct","priceFrom":"pricePerUnit","costFrom":"costPerUnit","unit":"وحدة"},
 inv(("مزرعة/حظائر خاصة","building",15),("تجهيزات تحكم بيئي","equipment",8),("القطيع/السلالات الأم","other",5),("تراخيص خاصة","license",0)),
 opx(("تغذية ورعاية بيطرية","variable_pct"),("كهرباء وتحكم حراري","fixed"),("شحن وتصدير","variable_pct"),("تأمين وأمن","fixed")),
 ["متخصص رعاية","طبيب بيطري (جزئي)","عامل"],[("منتج رئيسي","وحدة")],["mortalityPct"],
 ["الاشتراطات القانونية واتفاقية CITES","محدودية السوق المحلي","مخاطر السلامة","تقلب الطلب التصديري"],["fao","itc"],[])

add("custom","custom","مشروع مخصص","Custom project","fa-wand-magic-sparkles","brand-poster.jpg",
 "قالب مرن لأي نشاط غير مدرج. أدخل عناصر التكلفة والإيراد بحرية.",
 [], {}, [], [], [], [], ["npv","irrPct"], ["مخاطر السوق","مخاطر التشغيل","مخاطر التمويل","المخاطر التنظيمية"], [], [])

for i,t in enumerate(T): t["sort_order"]=i
json.dump(T, open("templates.json","w"), ensure_ascii=False, indent=1)
print(len(T))
