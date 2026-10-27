#!/usr/bin/env bash
# End-to-end API journey + authorization/isolation checks. Usage: bash tests/e2e/api-flow.sh [base_url]
set -u
B=${1:-http://localhost:3000}
PASS=0; FAIL=0
H=(-H "Content-Type: application/json" -H "X-Requested-With: fetch")
ok(){ PASS=$((PASS+1)); echo "  ✔ $1"; }
ko(){ FAIL=$((FAIL+1)); echo "  ✘ $1 :: $2"; }
req(){ # jar method path body -> sets CODE, BODY
  local jar=$1 m=$2 p=$3 d=${4:-}
  if [ -n "$d" ]; then BODY=$(curl -s -o /tmp/e2e_out -w "%{http_code}" -b $jar -c $jar -X $m "${H[@]}" "$B$p" -d "$d"); else BODY=$(curl -s -o /tmp/e2e_out -w "%{http_code}" -b $jar -c $jar -X $m "${H[@]}" "$B$p"); fi
  CODE=$BODY; BODY=$(cat /tmp/e2e_out)
}
jq_(){ echo "$BODY" | python3 -c "import sys,json; d=json.load(sys.stdin); e=sys.argv[1]; print(eval(e if not e.startswith('[') else 'd'+e))" "$1" 2>/dev/null; }
TS=$(date +%s%N)
A=/tmp/e2e_a_$TS; Bj=/tmp/e2e_b_$TS
echo "== 1. Register users"
req $A POST /api/auth/register "{\"name\":\"User A\",\"email\":\"a$TS@test.dev\",\"password\":\"Passw0rd!x\",\"acceptTerms\":true}"; [ "$CODE" = 201 ] && ok "register A" || ko "register A" "$CODE $BODY"
req $Bj POST /api/auth/register "{\"name\":\"User B\",\"email\":\"b$TS@test.dev\",\"password\":\"Passw0rd!x\",\"acceptTerms\":true}"; [ "$CODE" = 201 ] && ok "register B" || ko "register B" "$CODE"
req /tmp/e2e_x POST /api/auth/register "{\"name\":\"X\",\"email\":\"a$TS@test.dev\",\"password\":\"Passw0rd!x\",\"acceptTerms\":true}"; [ "$CODE" = 400 ] && ok "duplicate email rejected" || ko "dup email" "$CODE"
req /tmp/e2e_x POST /api/auth/register "{\"name\":\"X\",\"email\":\"w$TS@test.dev\",\"password\":\"short\",\"acceptTerms\":true}"; [ "$CODE" = 400 ] && ok "weak password rejected" || ko "weak pw" "$CODE"
echo "== 2. Auth"
req /tmp/e2e_none GET /api/me; [ "$CODE" = 401 ] && ok "anonymous /me → 401" || ko "anon" "$CODE"
req /tmp/e2e_y POST /api/auth/login "{\"email\":\"a$TS@test.dev\",\"password\":\"wrongpass1\"}"; [ "$CODE" = 401 ] && ok "wrong password → 401" || ko "wrong pw" "$CODE"
CODE=$(curl -s -o /dev/null -w "%{http_code}" -b $A -X POST -H "Content-Type: application/json" "$B/api/projects" -d '{"name":"x"}'); [ "$CODE" = 403 ] && ok "CSRF: missing header → 403" || ko "csrf" "$CODE"
req $A GET /api/me; [ "$CODE" = 200 ] && ok "A logged in" || ko "me" "$CODE"
echo "== 3. Project & study"
req $A POST /api/projects '{"name":"مصنع تعبئة","sector":"industrial","country":"EG","currency":"EGP","governorate":"القاهرة"}'; PID=$(jq_ "['id']"); [ "$CODE" = 201 ] && ok "create project" || ko "project" "$CODE $BODY"
req $A POST /api/projects '{"name":"second"}'; [ "$CODE" = 402 ] && ok "free plan project limit enforced" || ko "limit" "$CODE"
req $A POST /api/studies "{\"projectId\":\"$PID\",\"title\":\"دراسة مصنع\",\"templateId\":\"factory\"}"; SID=$(jq_ "['id']"); [ "$CODE" = 201 ] && ok "create study" || ko "study" "$CODE $BODY"
req $A POST /api/studies/$SID/compute; [ "$(jq_ "['base']['computable']")" = "False" ] && ok "incomplete study not computable (no fake numbers)" || ko "not computable" "$BODY"
req $A GET /api/studies/$SID; UPD=$(jq_ "['study']['updated_at']")
INPUTS='{"info":{"title":"دراسة مصنع","horizonYears":5,"currency":"EGP"},"idea":{"summary":"تعبئة","products":"عبوات"},"market":{"targetCustomers":"مصانع"},"templateFields":{"dailyCapacity":1000,"workingDays":300,"utilizationPct":80,"wastePct":5,"unitPrice":10,"unitMaterialCost":4},"investment":[{"name":"Machine","category":"equipment","amount":1000000,"usefulLife":10}],"opex":[{"name":"Rent","costType":"fixed","amount":120000}],"staff":[{"role":"Worker","count":5,"monthlySalary":6000,"insurancePct":18.75}],"revenue":[{"name":"Pack","price":10,"unitVariableCost":4,"year1Volume":200000,"capacity":300000,"utilizationPct":80,"wastePct":5}],"funding":{"equity":"","loans":[{"name":"Bank","principal":500000,"annualRatePct":15,"years":5,"method":"annuity"}]},"tax":{"incomeTaxPct":22.5,"cashReserveMonths":3},"macro":{"discountRatePct":20,"fxRate":1},"scenarios":{"OPTIMISTIC":{"approved":true,"volumePct":10},"PESSIMISTIC":{"approved":true,"volumePct":-20,"variableCostPct":10}}}'
req $A PUT /api/studies/$SID/inputs "{\"inputs\":$INPUTS,\"currentStep\":13,\"baseUpdatedAt\":\"$UPD\"}"; [ "$CODE" = 200 ] && ok "autosave inputs (completeness $(jq_ "['completeness']['pct']")%)" || ko "save" "$CODE $BODY"
req $A PUT /api/studies/$SID/inputs "{\"inputs\":$INPUTS,\"baseUpdatedAt\":\"1999-01-01 00:00:00\"}"; [ "$CODE" = 409 ] && ok "stale write → 409 conflict" || ko "conflict" "$CODE"
req $A POST /api/studies/$SID/derive-revenue; [ "$CODE" = 200 ] && ok "derive revenue from template ($(jq_ "['item']['year1Volume']") units)" || ko "derive" "$BODY"
echo "== 4. Engine"
req $A POST /api/studies/$SID/compute; [ "$(jq_ "['base']['computable']")" = "True" ] && ok "computed: NPV=$(jq_ "['base']['metrics']['npv']") IRR=$(jq_ "['base']['metrics']['irrPct']") payback=$(jq_ "['base']['metrics']['paybackYears']")" || ko "compute" "$BODY"
NPV1=$(jq_ "['base']['metrics']['npv']")
[ "$(jq_ "len(d['scenarios'])")" = "2" ] && ok "2 approved scenarios computed" || ko "scenarios" ""
BAL=$(jq_ "max(abs(y['balanceCheck']) for y in d['base']['years'])"); python3 -c "import sys; sys.exit(0 if float('$BAL')<0.05 else 1)" && ok "balance sheet balances (max diff $BAL)" || ko "balance" "$BAL"
req $A POST /api/studies/$SID/what-if '{"pricePct":-10}'; [ "$CODE" = 200 ] && ok "what-if price -10% → NPV $(jq_ "['alt']['npv']") (base unchanged $(jq_ "['base']['npv']"))" || ko "whatif" "$BODY"
req $A POST /api/studies/$SID/sensitivity; [ "$(jq_ "['computable']")" = "True" ] && ok "sensitivity (top driver: $(jq_ "['rows'][0]['key']"))" || ko "sens" ""
echo "== 5. Versions"
req $A POST /api/studies/$SID/versions '{"changelog":"v1"}'; [ "$CODE" = 201 ] && ok "version 1 saved" || ko "v1" "$CODE $BODY"
req $A GET /api/studies/$SID; UPD=$(jq_ "['study']['updated_at']")
I2=$(echo "$INPUTS" | sed 's/"price":10,/"price":11,/')
req $A PUT /api/studies/$SID/inputs "{\"inputs\":$I2,\"baseUpdatedAt\":\"$UPD\"}"; req $A POST /api/studies/$SID/compute; NPV2=$(jq_ "['base']['metrics']['npv']")
python3 -c "import sys; sys.exit(0 if float('$NPV2')>float('$NPV1') else 1)" && ok "edit assumption & recompute: NPV $NPV1 → $NPV2" || ko "recompute" "$NPV1 $NPV2"
req $A POST /api/studies/$SID/versions '{"changelog":"price 11"}'; [ "$CODE" = 201 ] && ok "version 2 saved" || ko "v2" "$CODE"
req $A GET "/api/studies/$SID/compare?a=1&b=2"; [ "$(jq_ "len(d['inputChanges'])>0")" = "True" ] && ok "compare v1 vs v2" || ko "compare" "$BODY"
req $A GET /api/studies/$SID/versions/1/verify; [ "$(jq_ "['reproducible']")" = "True" ] && ok "v1 reproducible" || ko "verify" "$BODY"
echo "== 6. Reports"
req $A POST /api/studies/$SID/reports '{"version":1,"format":"html"}'; RID=$(jq_ "['id']"); [ "$CODE" = 201 ] && ok "report exported" || ko "report" "$CODE $BODY"
curl -s -b $A "$B/api/reports/$RID/download" -o /tmp/e2e_rep.html; python3 - "$NPV1" << 'PY' && ok "report contains v1 NPV figure" || ko "report numbers" "mismatch"
import sys; npv=float(sys.argv[1]); s=open('/tmp/e2e_rep.html',encoding='utf8').read()
sys.exit(0 if f"{round(npv):,}" in s else 1)
PY
req $A POST /api/studies/$SID/reports '{"version":1,"format":"xlsx"}'; [ "$CODE" = 400 ] && ok "xlsx blocked on free plan (feature gate)" || ko "gate" "$CODE"
echo "== 7. Isolation (user B)"
req $Bj GET /api/studies/$SID; [ "$CODE" = 404 ] && ok "B cannot read A's study" || ko "iso read" "$CODE"
req $Bj PUT /api/studies/$SID/inputs "{\"inputs\":{}}"; [ "$CODE" = 404 ] && ok "B cannot write A's study" || ko "iso write" "$CODE"
req $Bj GET /api/projects/$PID; [ "$CODE" = 404 ] && ok "B cannot read A's project" || ko "iso proj" "$CODE"
req $Bj GET /api/reports/$RID/download; [ "$CODE" = 404 ] && ok "B cannot download A's report" || ko "iso report" "$CODE"
req $Bj DELETE /api/studies/$SID; [ "$CODE" = 404 ] && ok "B cannot delete A's study" || ko "iso del" "$CODE"
req $Bj GET /api/admin/stats; [ "$CODE" = 403 ] && ok "non-admin blocked from admin API" || ko "admin" "$CODE"
echo "== 8. Billing (dev provider)"
req $A POST /api/billing/checkout '{"purpose":"subscription","planId":"pro","cycle":"monthly","idempotencyKey":"k'$TS'"}'; [ "$CODE" = 400 ] && ok "checkout refused: price not set by admin" || ko "price" "$CODE $BODY"
echo "== 9. Retention"
req $A DELETE /api/studies/$SID; [ "$(jq_ "['archivedInstead']")" = "True" ] && ok "study with reports archived instead of deleted" || ko "retention" "$BODY"
echo "== 10. Ready-made studies catalog + purchase requests"
N=/tmp/e2e_n_$TS
req $N GET /api/public/sectors; [ "$(jq_ "len(d['items'])")" = 7 ] && ok "7 sectors listed" || ko "sectors" "$BODY"
req $N GET /api/public/sectors/livestock; [ "$(jq_ "len(d['studies'])")" -ge 1 ] && ok "sector studies listed" || ko "sector studies" "$CODE"
req $N GET /api/public/catalog/poultry; [ "$(jq_ "d['study']['price'] is None or d['study']['price']>=0")" = True ] && [ "$(jq_ "d['whatsapp']")" != "" ] && ok "study detail + whatsapp number" || ko "detail" "$BODY"
req $N GET /api/public/catalog/does-not-exist; [ "$CODE" = 404 ] && ok "unknown study → 404" || ko "404" "$CODE"
req $N POST /api/public/purchase-requests '{"studyId":"cs-poultry","name":"x","phone":"abc"}'; [ "$CODE" = 400 ] && ok "purchase validation" || ko "pv" "$CODE"
req $N POST /api/public/purchase-requests '{"studyId":"cs-poultry","name":"عميل تجريبي","phone":"01000000000"}'; [ "$(jq_ "d['ok']")" = True ] && ok "purchase request stored" || ko "purchase" "$BODY"
req $A GET /api/admin/catalog/purchase-requests; [ "$CODE" = 403 ] && ok "non-admin blocked from purchase requests" || ko "pr admin" "$CODE"
req $A PUT /api/admin/catalog/studies/cs-poultry '{"price":1}'; [ "$CODE" = 403 ] && ok "non-admin cannot change prices" || ko "price admin" "$CODE"
echo; echo "RESULT: $PASS passed, $FAIL failed"; [ $FAIL = 0 ]
