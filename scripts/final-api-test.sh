#!/usr/bin/env bash
set +euo pipefail

BASE="http://localhost:3000/api/v1"

T_SUPER="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJFTVAwMDEiLCJyb2xlIjoiU1VQRVJfQURNSU4iLCJyZWdpb25JZCI6ImNtcnU4N3MzcTAwMDB0Znk0bDJxdmRkenQiLCJpYXQiOjE3ODQ5MjQxMjMsImV4cCI6MTc4NDkyNzcyM30.ENQ4OUOYgaNLCKLKV82h-vAl16XaS5VbO5gtGgIBmMU"
T_REGIONAL="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJFTVAwMDIiLCJyb2xlIjoiUkVHSU9OQUxfQURNSU4iLCJyZWdpb25JZCI6ImNtcnU4N3MzcTAwMDB0Znk0bDJxdmRkenQiLCJpYXQiOjE3ODQ5MjQxMjMsImV4cCI6MTc4NDkyNzcyM30.DVCO3Y-kQoRMG7CJXuKpLFq9bFDIjq6Rag7hKEiXpkg"
T_MANAGER="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJFTVAwMDMiLCJyb2xlIjoiU0FMRVNfTUFOQUdFUiIsInJlZ2lvbklkIjoiY21ydTg3czNxMDAwMHRmeTRsMnF2ZGR6dCIsImlhdCI6MTc4NDkyNDEyMywiZXhwIjoxNzg0OTI3NzIzfQ.0upiEqOUCs7vXF-KoicSdQdrU4Z3XrxwO9Jrzf_kruQ"
T_EXEC="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJFTVAwMDQiLCJyb2xlIjoiU0FMRVNfRVhFQ1VUSVZFIiwicmVnaW9uSWQiOiJjbXJ1ODdzM3EwMDAwdGZ5NGwycXZkZHp0IiwiaWF0IjoxNzg0OTI0MTIzLCJleHAiOjE3ODQ5Mjc3MjN9.Rfxt-FGpEA9DzsOguT4e0THe2UQMMBXD_dVAW1jbmV4"
T_AUDITOR="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJFTVAwMDUiLCJyb2xlIjoiQVVESVRPUiIsInJlZ2lvbklkIjoiY21ydTg3czNxMDAwMHRmeTRsMnF2ZGR6dCIsImlhdCI6MTc4NDkyNDEyMywiZXhwIjoxNzg0OTI3NzIzfQ.f4jQL1BKBP2N7HklIXG_BAshE_5Oo9i8uKaMhEoHlHQ"
T_EXEC_DL="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJFTVAwMDciLCJyb2xlIjoiU0FMRVNfRVhFQ1VUSVZFIiwicmVnaW9uSWQiOiJjbXJ1ODdzM3gwMDAxdGZ5NGprZ2RibzEzIiwiaWF0IjoxNzg0OTI0MTIzLCJleHAiOjE3ODQ5Mjc3MjN9.NCRAzKZ15nwgg6dXGLtnM_EbHFTkbBaKOaauhEDox24"

PASS=0
FAIL=0
TOTAL=0

run_test() {
  local name="$1" method="$2" path="$3" token="$4" body="${5:-}" expected_code="${6:-200}" expected_err="${7:-}"
  TOTAL=$((TOTAL+1))
  local response http_code body_content
  if [ -n "$body" ]; then
    response=$(curl -s -X "$method" -H "Authorization: Bearer $token" -H "Content-Type: application/json" -d "$body" "$BASE$path" -w "\n__HTTP_CODE__=%{http_code}")
  else
    response=$(curl -s -X "$method" -H "Authorization: Bearer $token" "$BASE$path" -w "\n__HTTP_CODE__=%{http_code}")
  fi
  http_code=$(echo "$response" | tail -1 | sed 's/__HTTP_CODE__=//')
  body_content=$(echo "$response" | sed '$d')
  local err_code=""
  if echo "$body_content" | grep -q '"error"'; then
    err_code=$(echo "$body_content" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('error',{}).get('code',''))" 2>/dev/null || echo "")
  fi

  local status="PASS"
  local detail=""
  if [ "$http_code" != "$expected_code" ]; then
    status="FAIL"
    detail="expected HTTP $expected_code got $http_code"
  elif [ -n "$expected_err" ] && [ "$err_code" != "$expected_err" ]; then
    status="FAIL"
    detail="expected error $expected_err got $err_code"
  fi

  if [ "$status" = "PASS" ]; then PASS=$((PASS+1)); else FAIL=$((FAIL+1)); fi
  local preview
  preview=$(echo "$body_content" | head -c 180 | tr '\n' ' ')
  printf "%-6s %-6s %-72s HTTP=%3s  %s %s\n" "$status" "$method" "$path" "$http_code" "$detail" "$preview"
}

# =============== SECTION 1: AUTHENTICATION ===============
echo "================================== AUTHENTICATION (unauth expected) =================================="
run_test "noauth catalog"    GET    "/catalog/items"                                  "invalidtoken" "" 401 "UNAUTHORIZED"
run_test "noauth leads"      GET    "/leads"                                          "invalidtoken" "" 401 "UNAUTHORIZED"
run_test "noauth opps"       GET    "/opportunities"                                  "invalidtoken" "" 401 "UNAUTHORIZED"
run_test "noauth queries"    GET    "/sales-queries"                                  "invalidtoken" "" 401 "UNAUTHORIZED"

# =============== SECTION 2: CATALOG (5 endpoints) ===============
echo ""
echo "=================================================== CATALOG ==================================================="
run_test "list super"        GET    "/catalog/items"                                  "$T_SUPER" "" 200
run_test "list exec"         GET    "/catalog/items"                                  "$T_EXEC" "" 200
run_test "list auditor"      GET    "/catalog/items"                                  "$T_AUDITOR" "" 200
run_test "create super ✔"    POST   "/catalog/items"                                  "$T_SUPER"   '{"code":"TESTCAT2","name":"Test Item 2","category":"Test","unit":"pcs","basePrice":100,"taxClass":"GST18"}' 201
run_test "create exec ✗"     POST   "/catalog/items"                                  "$T_EXEC"    '{"code":"XX","name":"Y","category":"Z","unit":"pcs","basePrice":10,"taxClass":"GST18"}' 403 "FORBIDDEN"
run_test "create auditor ✗"  POST   "/catalog/items"                                  "$T_AUDITOR" '{"code":"XX","name":"Y","category":"Z","unit":"pcs","basePrice":10,"taxClass":"GST18"}' 403 "FORBIDDEN"
run_test "price rule RA ✔"   POST   "/catalog/price-rules"                            "$T_REGIONAL" '{"catalogItemId":"nonexist","ruleType":"REGION_OVERRIDE","value":120,"effectiveFrom":"2025-01-01T00:00:00Z"}' 404
run_test "price rule EX ✗"   POST   "/catalog/price-rules"                            "$T_EXEC"    '{"catalogItemId":"nonexist","ruleType":"REGION_OVERRIDE","value":120,"effectiveFrom":"2025-01-01T00:00:00Z"}' 403 "FORBIDDEN"
# Fetch real catalog item id for update + resolve price
ITEM_ID=$(curl -s -H "Authorization: Bearer $T_SUPER" "$BASE/catalog/items" | python3 -c "import sys,json; d=json.load(sys.stdin); it=d.get('data',[]); print(it[0]['id'] if it else 'nonexist')" 2>/dev/null || echo "nonexist")
if [ "$ITEM_ID" != "nonexist" ]; then
  run_test "resolve price"    GET   "/catalog/items/$ITEM_ID/price"                   "$T_EXEC" "" 200
  run_test "update item sup"   PATCH "/catalog/items/$ITEM_ID"                         "$T_SUPER" '{"basePrice":150}' 200
  run_test "update item ex ✗"  PATCH "/catalog/items/$ITEM_ID"                         "$T_EXEC"  '{"basePrice":50}' 403 "FORBIDDEN"
fi

# =============== SECTION 3: LEADS (6 endpoints) ===============
echo ""
echo "==================================================== LEADS ===================================================="
run_test "create exec ✔"      POST   "/leads"                                          "$T_EXEC"    '{"contactName":"API Test Lead","contactEmail":"lead@test.com","source":"MANUAL","notes":"Created by API test"}' 201
run_test "create auditor ✗"   POST   "/leads"                                          "$T_AUDITOR" '{"contactName":"X","source":"MANUAL"}' 403 "FORBIDDEN"
run_test "list exec"          GET    "/leads"                                          "$T_EXEC" "" 200
run_test "list auditor"       GET    "/leads"                                          "$T_AUDITOR" "" 200
run_test "list super"         GET    "/leads"                                          "$T_SUPER" "" 200
# Get a fresh lead for detail endpoints
LEAD_DATA=$(curl -s -H "Authorization: Bearer $T_SUPER" "$BASE/leads" | python3 -c "
import sys, json
d = json.load(sys.stdin)
items = d.get('data', [])
for i in items:
    if i.get('status') == 'NEW':
        print(json.dumps(i))
        break
" 2>/dev/null || echo "")
if [ -n "$LEAD_DATA" ]; then
  LEAD_ID=$(echo "$LEAD_DATA" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])" 2>/dev/null)
  run_test "get lead"         GET    "/leads/$LEAD_ID"                                 "$T_SUPER" "" 200
  run_test "add follow-up"    POST   "/leads/$LEAD_ID/follow-ups"                      "$T_SUPER" '{"note":"Test follow-up from API","channel":"email"}' 201
  run_test "qualify lead"     POST   "/leads/$LEAD_ID/qualify"                         "$T_SUPER" '{"dealType":"INSTALLATION","value":150000}' 201
fi
# Get a different NEW lead for lost test
LEAD_DATA2=$(curl -s -H "Authorization: Bearer $T_SUPER" "$BASE/leads" | python3 -c "
import sys, json
d = json.load(sys.stdin)
items = d.get('data', [])
for i in items:
    if i.get('status') == 'NEW':
        print(json.dumps(i))
        break
" 2>/dev/null || echo "")
if [ -n "$LEAD_DATA2" ]; then
  LEAD_ID2=$(echo "$LEAD_DATA2" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])" 2>/dev/null)
  run_test "mark lost"        POST   "/leads/$LEAD_ID2/lost"                            "$T_SUPER" '{"reason":"no_budget"}' 200
fi

# =============== SECTION 4: OPPORTUNITIES (6 endpoints) ===============
echo ""
echo "================================================= OPPORTUNITIES ================================================="
run_test "list super"         GET    "/opportunities"                                  "$T_SUPER" "" 200
run_test "list exec"          GET    "/opportunities"                                  "$T_EXEC" "" 200
run_test "list auditor"       GET    "/opportunities"                                  "$T_AUDITOR" "" 200
run_test "list dl exec"       GET    "/opportunities"                                  "$T_EXEC_DL" "" 200
OPP_DATA=$(curl -s -H "Authorization: Bearer $T_SUPER" "$BASE/opportunities" | python3 -c "
import sys, json
d = json.load(sys.stdin)
items = d.get('data', [])
print(json.dumps(items[0]) if items else '')
" 2>/dev/null || echo "")
if [ -n "$OPP_DATA" ]; then
  OPP_ID=$(echo "$OPP_DATA" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])" 2>/dev/null)
  OWNER=$(echo "$OPP_DATA" | python3 -c "import sys,json; print(json.load(sys.stdin).get('ownerId',''))" 2>/dev/null)
  run_test "get opp"          GET    "/opportunities/$OPP_ID"                           "$T_SUPER" "" 200
  run_test "stage ✔"          PATCH  "/opportunities/$OPP_ID/stage"                     "$T_SUPER" '{"toStage":"CONTACTED","remark":"Initial contact done"}' 200
  run_test "reassign mgr ✔"   POST   "/opportunities/$OPP_ID/reassign"                  "$T_MANAGER" "{\"ownerId\":\"$OWNER\"}" 200
  run_test "reassign ex ✗"    POST   "/opportunities/$OPP_ID/reassign"                  "$T_EXEC" "{\"ownerId\":\"$OWNER\"}" 403 "FORBIDDEN"
fi

# =============== SECTION 5: QUOTATIONS (7 endpoints) ===============
echo ""
echo "=================================================== QUOTATIONS =================================================="
run_test "list opp quotes ✗ nonexist" GET "/opportunities/nonexistent-opp-id-xyz/quotations" "$T_SUPER" "" 404
if [ -n "${OPP_ID:-}" ]; then
  run_test "list quotes ✔ empty"   GET  "/opportunities/$OPP_ID/quotations"             "$T_SUPER" "" 200
  run_test "create exec"           POST "/quotations"                                    "$T_EXEC" "{\"opportunityId\":\"$OPP_ID\",\"lines\":[{\"description\":\"Test Line from API\",\"qty\":2,\"unitPrice\":5000,\"taxRatePct\":18}]}" 201
fi
# Fetch a quotation for action tests
if [ -n "${OPP_ID:-}" ]; then
QUOT_ID=$(curl -s -H "Authorization: Bearer $T_SUPER" "$BASE/opportunities/$OPP_ID/quotations" | python3 -c "
import sys, json
d = json.load(sys.stdin)
items = d.get('data', [])
for i in items:
    if i.get('status') == 'DRAFT':
        print(i.get('id',''))
        exit(0)
print(items[0].get('id','') if items else '')
" 2>/dev/null || echo "")
if [ -n "$QUOT_ID" ]; then
  run_test "revise quote"        POST "/quotations/$QUOT_ID/revise"                    "$T_SUPER" '{"lines":[{"description":"Revised line","qty":3,"unitPrice":6000,"taxRatePct":18}]}' 200
  run_test "submit quote"        POST "/quotations/$QUOT_ID/submit"                    "$T_SUPER" "" 200
  run_test "approve mgr ✔"       POST "/quotations/$QUOT_ID/approve"                   "$T_MANAGER" "" 200
  run_test "approve exec ✗"      POST "/quotations/$QUOT_ID/approve"                   "$T_EXEC" "" 403 "FORBIDDEN"
  run_test "reject quote"        POST "/quotations/$QUOT_ID/reject"                    "$T_SUPER" "" 200
  run_test "send quote"          POST "/quotations/$QUOT_ID/send"                      "$T_SUPER" "" 200
fi
fi

# =============== SECTION 6: SALES QUERIES (23 endpoints) ===============
echo ""
echo "================================================= SALES QUERIES ================================================="
run_test "dashboard super"     GET    "/sales-queries/dashboard/stats"                 "$T_SUPER" "" 200
run_test "dashboard auditor"   GET    "/sales-queries/dashboard/stats"                 "$T_AUDITOR" "" 200
run_test "dashboard exec"      GET    "/sales-queries/dashboard/stats"                 "$T_EXEC" "" 200
run_test "reports super"       GET    "/sales-queries/reports?reportType=pending_queries&fromDate=2025-01-01T00:00:00Z&toDate=2026-12-31T23:59:59Z" "$T_SUPER" "" 200
run_test "reports exec ✗"      GET    "/sales-queries/reports?reportType=pending_queries&fromDate=2025-01-01T00:00:00Z&toDate=2026-12-31T23:59:59Z" "$T_EXEC" "" 403 "FORBIDDEN"
run_test "reports mgr ✗"       GET    "/sales-queries/reports?reportType=pending_queries&fromDate=2025-01-01T00:00:00Z&toDate=2026-12-31T23:59:59Z" "$T_MANAGER" "" 403 "FORBIDDEN"
run_test "create exec ✔"       POST   "/sales-queries"                                 "$T_EXEC"    '{"customerName":"API Test Customer","meetingType":"WALK_IN","requirement":"Need CCTV quote for 4 cameras","priority":"MEDIUM"}' 201
run_test "create auditor ✗"    POST   "/sales-queries"                                 "$T_AUDITOR" '{"customerName":"X","meetingType":"WALK_IN","requirement":"Y"}' 403 "FORBIDDEN"
run_test "list super"          GET    "/sales-queries"                                 "$T_SUPER" "" 200
run_test "list exec"           GET    "/sales-queries"                                 "$T_EXEC" "" 200
run_test "list dl exec"        GET    "/sales-queries"                                 "$T_EXEC_DL" "" 200
run_test "list + sort + tags (AND fix test)" GET "/sales-queries?sortBy=priority&tags=test" "$T_SUPER" "" 200
run_test "list filters"        GET    "/sales-queries?status=NEW&priority=HIGH&sortBy=createdAt&sortOrder=desc" "$T_SUPER" "" 200
run_test "list pagination"     GET    "/sales-queries?page=1&pageSize=2"               "$T_SUPER" "" 200

# Get a sales query for detailed testing
SQ_ID=$(curl -s -H "Authorization: Bearer $T_SUPER" "$BASE/sales-queries" | python3 -c "
import sys, json
d = json.load(sys.stdin)
items = d.get('data',{}).get('items', d.get('data', []))
for i in items:
    if i.get('status') == 'NEW':
        print(i.get('id',''))
        exit(0)
print(items[0].get('id','') if items else '')
" 2>/dev/null || echo "")

SQ_ID_NEW=""
SQ_ID_WITH_DEPT=""
if [ -n "$SQ_ID" ]; then
  # Fetch the full row for owner/dept info
  SQ_FULL=$(curl -s -H "Authorization: Bearer $T_SUPER" "$BASE/sales-queries/$SQ_ID" | python3 -c "import sys,json; d=json.load(sys.stdin); print(json.dumps(d.get('data',{})))" 2>/dev/null || echo "")
  SQ_OWNER=$(echo "$SQ_FULL" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('ownerId',''))" 2>/dev/null)
  SQ_DEPT=$(echo "$SQ_FULL" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('departmentId','') or '')" 2>/dev/null)
  SQ_STATUS=$(echo "$SQ_FULL" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('status',''))" 2>/dev/null)
  if [ "$SQ_STATUS" = "NEW" ]; then SQ_ID_NEW="$SQ_ID"; fi
  if [ -n "$SQ_DEPT" ]; then SQ_ID_WITH_DEPT="$SQ_ID"; fi

  run_test "get query"         GET    "/sales-queries/$SQ_ID"                           "$T_SUPER" "" 200
  run_test "update super"      PATCH  "/sales-queries/$SQ_ID"                           "$T_SUPER" '{"priority":"HIGH","requirement":"[Updated via API test]"}' 200
  run_test "update auditor ✗"  PATCH  "/sales-queries/$SQ_ID"                           "$T_AUDITOR" '{"priority":"LOW"}' 403 "FORBIDDEN"
  run_test "update exec"       PATCH  "/sales-queries/$SQ_ID"                           "$T_EXEC"    '{"requirement":"Exec trying to edit (ok if owner)"}' 200
  # Test invalid dept assign (should NOT 500)
  run_test "assign invalid dept (no crash!)" POST "/sales-queries/$SQ_ID/assign-department" "$T_MANAGER" '{"departmentId":"nonexistent-dept-xyz123","remark":"Invalid dept test"}' 400
  # Reassign owner via MANAGER (publish ASSIGNED even w/o dept - no crash!)
  run_test "reassign mgr ✔"    POST   "/sales-queries/$SQ_ID/reassign-owner"           "$T_MANAGER" "{\"ownerId\":\"${SQ_OWNER:-EMP004}\"}" 200
  run_test "reassign exec ✗"   POST   "/sales-queries/$SQ_ID/reassign-owner"           "$T_EXEC"    "{\"ownerId\":\"${SQ_OWNER:-EMP004}\"}" 403 "FORBIDDEN"
  # Try all valid transitions based on actual current status
  SQ_CURR_ST=$(curl -s -H "Authorization: Bearer $T_SUPER" "$BASE/sales-queries/$SQ_ID" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('data',{}).get('status','NEW'))" 2>/dev/null || echo "NEW")
  case "$SQ_CURR_ST" in
    NEW) NEXT_ST="ASSIGNED" ;;
    ASSIGNED) NEXT_ST="UNDER_REVIEW" ;;
    UNDER_REVIEW) NEXT_ST="QUOTATION_PREPARATION" ;;
    QUOTATION_PREPARATION) NEXT_ST="QUOTATION_PREPARED" ;;
    QUOTATION_PREPARED) NEXT_ST="QUOTATION_SENT" ;;
    *) NEXT_ST="" ;;
  esac
  if [ -n "$NEXT_ST" ]; then
    run_test "transition $SQ_CURR_ST→$NEXT_ST" PATCH "/sales-queries/$SQ_ID/status"     "$T_SUPER" "{\"toStatus\":\"$NEXT_ST\",\"remark\":\"API test transition\"}" 200
  fi
  run_test "list comments"      GET    "/sales-queries/$SQ_ID/comments"                "$T_SUPER" "" 200
  run_test "add comment"        POST   "/sales-queries/$SQ_ID/comments"                "$T_SUPER" '{"body":"API test comment"}' 201
  run_test "add follow-up"      POST   "/sales-queries/$SQ_ID/follow-ups"              "$T_SUPER" "{\"title\":\"API test follow-up\",\"scheduledAt\":\"2026-08-15T10:00:00Z\",\"channel\":\"CALL\"}" 201
  run_test "list follow-ups"    GET    "/sales-queries/$SQ_ID/follow-ups"              "$T_SUPER" "" 200
fi

# If we have comments, test update/pin/delete
if [ -n "${SQ_ID:-}" ]; then
CMT_ID=$(curl -s -H "Authorization: Bearer $T_SUPER" "$BASE/sales-queries/$SQ_ID/comments" | python3 -c "
import sys, json
d = json.load(sys.stdin)
items = d.get('data', [])
print(items[0].get('id','') if items else '')
" 2>/dev/null || echo "")
if [ -n "$CMT_ID" ]; then
  run_test "update comment"   PATCH  "/sales-queries/$SQ_ID/comments/$CMT_ID"         "$T_SUPER" '{"body":"Updated via API test"}' 200
  run_test "pin comment mgr"  PATCH  "/sales-queries/$SQ_ID/comments/$CMT_ID/pin"     "$T_MANAGER" '{"isPinned":true}' 200
  run_test "delete comment"   DELETE "/sales-queries/$SQ_ID/comments/$CMT_ID"         "$T_SUPER" "" 200
fi
fi

# If we have follow-ups, test all 4 actions
if [ -n "${SQ_ID:-}" ]; then
FU_ID=$(curl -s -H "Authorization: Bearer $T_SUPER" "$BASE/sales-queries/$SQ_ID/follow-ups" | python3 -c "
import sys, json
d = json.load(sys.stdin)
items = d.get('data', [])
print(items[0].get('id','') if items else '')
" 2>/dev/null || echo "")
if [ -n "$FU_ID" ]; then
  run_test "update follow-up"  PATCH  "/sales-queries/$SQ_ID/follow-ups/$FU_ID"       "$T_SUPER" '{"title":"Updated via API test"}' 200
  run_test "complete follow-up" POST  "/sales-queries/$SQ_ID/follow-ups/$FU_ID/complete" "$T_SUPER" '{"customerResponse":"Interested","outcome":"Positive discussion"}' 200
  run_test "reschedule fu"     POST   "/sales-queries/$SQ_ID/follow-ups/$FU_ID/reschedule" "$T_SUPER" '{"scheduledAt":"2026-08-20T10:00:00Z","note":"Postponed by customer"}' 200
  run_test "cancel fu"         POST   "/sales-queries/$SQ_ID/follow-ups/$FU_ID/cancel" "$T_SUPER" "" 200
fi
fi

# Test 13-status state machine coverage: test WAITING_FOR_CUSTOMER remark required
if [ -n "${SQ_ID:-}" ]; then
  SQ_CURR_ST2=$(curl -s -H "Authorization: Bearer $T_SUPER" "$BASE/sales-queries/$SQ_ID" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('data',{}).get('status','NEW'))" 2>/dev/null || echo "NEW")
  if [ "$SQ_CURR_ST2" = "UNDER_REVIEW" ] || [ "$SQ_CURR_ST2" = "ASSIGNED" ] || [ "$SQ_CURR_ST2" = "QUOTATION_PREPARATION" ]; then
    run_test "remark required for WAITING_FOR_CUSTOMER (fail!)" PATCH "/sales-queries/$SQ_ID/status" "$T_SUPER" '{"toStatus":"WAITING_FOR_CUSTOMER"}' 400
  fi
fi

echo ""
echo "=================================================================================================================="
echo "========================================  TOTAL: $TOTAL    PASS: $PASS    FAIL: $FAIL  ================================="
echo "=================================================================================================================="
