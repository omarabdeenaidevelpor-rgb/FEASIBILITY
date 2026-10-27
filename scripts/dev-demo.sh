#!/usr/bin/env bash
# DEV ONLY: creates admin@example.com (password Admin12345) with a Business plan and one restaurant study.
# Inputs are illustrative user-entered assumptions marked ESTIMATED — not market data.
set -e
B=${1:-http://localhost:3000}; J=/tmp/fa_admin_jar; rm -f $J
H=(-H "Content-Type: application/json" -H "X-Requested-With: fetch")
py(){ python3 -c "import sys,json;d=json.load(sys.stdin);print($1)"; }
curl -s -c $J "${H[@]}" -X POST $B/api/auth/register -d '{"name":"مدير المنصة","email":"admin@example.com","password":"Admin12345","acceptTerms":true}' >/dev/null || true
curl -s -c $J -b $J "${H[@]}" -X POST $B/api/auth/login -d '{"email":"admin@example.com","password":"Admin12345"}' >/dev/null
ORG=$(curl -s -b $J $B/api/me | py "d['org']['id']")
curl -s -b $J "${H[@]}" -X POST $B/api/admin/organizations/$ORG/subscription -d '{"planId":"business","months":12,"reason":"dev demo account"}' >/dev/null
PID=$(curl -s -b $J "${H[@]}" -X POST $B/api/projects -d '{"name":"مطعم مأكولات شعبية — مدينة نصر","sector":"food_service","activity":"مطعم","country":"EG","governorate":"القاهرة","city":"مدينة نصر","currency":"EGP","description":"مطعم مأكولات شعبية بطاقة 60 مقعدًا مع خدمة توصيل."}' | py "d['id']")
SID=$(curl -s -b $J "${H[@]}" -X POST $B/api/studies -d "{\"projectId\":\"$PID\",\"title\":\"دراسة جدوى مطعم مأكولات شعبية\",\"templateId\":\"restaurant\"}" | py "d['id']")
UPD=$(curl -s -b $J $B/api/studies/$SID | py "d['study']['updated_at']")
cat > /tmp/fa_inp.json << JSON
{"inputs":{"info":{"title":"دراسة جدوى مطعم مأكولات شعبية","horizonYears":5,"currency":"EGP"},"idea":{"summary":"مطعم مأكولات شعبية (فول، طعمية، كشري) بجودة ثابتة وأسعار مناسبة.","products":"وجبات إفطار وغداء وخدمة توصيل"},"market":{"targetCustomers":"سكان وموظفو مدينة نصر","competitors":[{"name":"مطعم مجاور","price":"متوسط","strengths":"شهرة","weaknesses":"زحام"}]},
"templateFields":{"seats":60,"turnsPerDay":3,"occupancyPct":55,"operatingDays":360,"avgTicket":120,"foodCostPct":35},
"investment":[{"name":"معدات المطبخ","category":"equipment","amount":450000,"usefulLife":7,"classification":"ESTIMATED"},{"name":"أثاث وديكور","category":"furniture","amount":250000,"usefulLife":5,"classification":"ESTIMATED"},{"name":"تشطيبات","category":"building","amount":300000,"usefulLife":10,"classification":"ESTIMATED"},{"name":"رخص وسجل صحي","category":"license","amount":40000,"usefulLife":0,"classification":"ESTIMATED"}],
"opex":[{"name":"إيجار","costType":"fixed","amount":360000,"classification":"ESTIMATED"},{"name":"مرافق","costType":"fixed","amount":120000,"classification":"ESTIMATED"},{"name":"عمولة التوصيل","costType":"variable_pct","pctOfRevenue":5,"classification":"ESTIMATED"},{"name":"تسويق","costType":"fixed","amount":60000,"classification":"ESTIMATED"}],
"staff":[{"role":"شيف","count":2,"monthlySalary":12000,"insurancePct":18.75},{"role":"ويتر","count":4,"monthlySalary":6000,"insurancePct":18.75},{"role":"كاشير","count":1,"monthlySalary":6500,"insurancePct":18.75}],
"revenue":[{"name":"وجبات ومشروبات","unit":"زائر","price":120,"unitVariableCost":42,"year1Volume":35640,"growthPct":5,"classification":"ESTIMATED"}],
"funding":{"equity":"","loans":[{"name":"قرض بنكي","principal":400000,"annualRatePct":18,"years":4,"graceYears":1,"method":"annuity"}]},"tax":{"incomeTaxPct":22.5,"cashReserveMonths":2,"lossCarryForwardYears":5,"receivableDays":5,"inventoryDays":7,"payableDays":15},
"macro":{"discountRatePct":22,"priceGrowthPct":10,"costGrowthPct":12,"salaryGrowthPct":10,"fxRate":1},
"scenarios":{"OPTIMISTIC":{"approved":true,"volumePct":15},"PESSIMISTIC":{"approved":true,"volumePct":-20,"variableCostPct":10}}},"currentStep":13,"baseUpdatedAt":"$UPD"}
JSON
curl -s -b $J "${H[@]}" -X PUT $B/api/studies/$SID/inputs --data-binary @/tmp/fa_inp.json >/dev/null
curl -s -b $J "${H[@]}" -X POST $B/api/studies/$SID/versions -d '{"changelog":"الإصدار الأول"}' >/dev/null
echo "STUDY=$SID"
