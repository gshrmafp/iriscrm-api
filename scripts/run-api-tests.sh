#!/usr/bin/env bash
set -euo pipefail

BASE="http://localhost:3000/api/v1"

T_SUPER="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJFTVAwMDEiLCJyb2xlIjoiU1VQRVJfQURNSU4iLCJyZWdpb25JZCI6ImNtcnU4N3MzcTAwMDB0Znk0bDJxdmRkenQiLCJpYXQiOjE3ODQ5MjM4ODQsImV4cCI6MTc4NDkyNzQ4NH0.PPPsT2YXHslVgzgGhFqAa9HTt7hQ2ck7CXLepdM8dEE"
T_REGIONAL="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJFTVAwMDIiLCJyb2xlIjoiUkVHSU9OQUxfQURNSU4iLCJyZWdpb25JZCI6ImNtcnU4N3MzcTAwMDB0Znk0bDJxdmRkenQiLCJpYXQiOjE3ODQ5MjM4ODQsImV4cCI6MTc4NDkyNzQ4NH0.qbeH2B6ViGyqQ3_fkzLutVX5vrm_TSfK1_rVvchgnGg"
T_MANAGER="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJFTVAwMDMiLCJyb2xlIjoiU0FMRVNfTUFOQUdFUiIsInJlZ2lvbklkIjoiY21ydTg3czNxMDAwMHRmeTRsMnF2ZGR6dCIsImlhdCI6MTc4NDkyMzg4NCwiZXhwIjoxNzg0OTI3NDg0fQ.ECTwft7DapliBq0VDLuO4VU60_pmLHrsm3pJOJ2HCYE"
T_EXEC="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJFTVAwMDQiLCJyb2xlIjoiU0FMRVNfRVhFQ1VUSVZFIiwicmVnaW9uSWQiOiJjbXJ1ODdzM3EwMDAwdGZ5NGwycXZkZHp0IiwiaWF0IjoxNzg0OTIzODg0LCJleHAiOjE3ODQ5Mjc0ODR9.hT-qMw0yNv_32fE2xuh7KPy3Fp7EqtRZfebl7nMT5aY"
T_AUDITOR="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJFTVAwMDUiLCJyb2xlIjoiQVVESVRPUiIsInJlZ2lvbklkIjoiY21ydTg3czNxMDAwMHRmeTRsMnF2ZGR6dCIsImlhdCI6MTc4NDkyMzg4NCwiZXhwIjoxNzg0OTI3NDg0fQ.eGAaTVHTu9LIWih4cJ3CAMDSHhPqWD2bebFQoVvUnr8"
T_EXEC_DL="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJFTVAwMDciLCJyb2xlIjoiU0FMRVNfRVhFQ1VUSVZFIiwicmVnaW9uSWQiOiJjbXJ1ODdzM3gwMDAxdGZ5NGprZ2RibzEzIiwiaWF0IjoxNzg0OTIzODg0LCJleHAiOjE3ODQ5Mjc0ODR9.bceqGlHrP8kBq6yQFHf53VPDq2JglNd8Xm9O3PYAtxs"

PASS=0
FAIL=0
SKIP=0

TEST_FILE=$(mktemp)
RESULT_FILE=$(mktemp)

run_test() {
  local name="$1" method="$2" path="$3" token="$4" body="${5:-}" expected_code="${6:-200}" expected_err_code="${7:-}"
  local extra_args_string=""
  if [ -n "$body" ]; then
    extra_args_string="$(printf "%s" "-H 'Content-Type: application/json' -d '$body'")"
  fi
  local response http_code
  local auth_header="Authorization: Bearer $token"
  if [ -n "$body" ]; then
    response=$(curl -s -X "$method" -H "$auth_header" -H "Content-Type: application/json" -d "$body" "$BASE$path" -w "\n__HTTP_CODE__=%{http_code}")
  else
    response=$(curl -s -X "$method" -H "$auth_header" "$BASE$path" -w "\n__HTTP_CODE__=%{http_code}")
  fi
  http_code=$(echo "$response" | tail -1 | sed 's/__HTTP_CODE__=//')
  local body_content=$(echo "$response" | sed '$d')
  local err_code=""
  if echo "$body_content" | grep -q '"code"'; then
    err_code=$(echo "$body_content" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('error',{}).get('code','') if 'error' in d else d.get('code',''))" 2>/dev/null || echo "")
  fi

  local status="PASS"
  local detail=""
  if [ "$http_code" != "$expected_code" ]; then
    status="FAIL"
    detail="expected HTTP $expected_code got $http_code"
  elif [ -n "$expected_err_code" ] && [ "$err_code" != "$expected_err_code" ]; then
    status="FAIL"
    detail="expected error code $expected_err_code got $err_code"
  fi

  if [ "$status" = "PASS" ]; then
    PASS=$((PASS+1))
  else
    FAIL=$((FAIL+1))
  fi
  printf "%-6s | %-6s %-65s | HTTP=%3s | %s %s\n" "$status" "$method" "$path" "$http_code" "$detail" "$(echo "$body_content" | head -c 200)"
}

echo "=== SALES MODULE API TEST SUITE ==="
echo ""
echo "---------------------------------------------------- CATALOG (5) -----------------------------------------------------"
run_test "List catalog (SUPER)"    GET    "/catalog/items"                                     "$T_SUPER"   "" 200
run_test "List catalog (EXEC)"     GET    "/catalog/items"                                     "$T_EXEC"    "" 200
run_test "List catalog (AUDITOR)"  GET    "/catalog/items"                                     "$T_AUDITOR" "" 200
run_test "Create catalog (SUPER)"  POST   "/catalog/items"                                     "$T_SUPER"   '{"code":"TEST01","name":"Test Item","category":"Test","unit":"pcs","basePrice":100,"taxClass":"GST18"}' 200
run_test "Create catalog (EXEC) ❌" POST  "/catalog/items"                                     "$T_EXEC"    '{"code":"TEST02","name":"Blocked Item","category":"Test","unit":"pcs","basePrice":100,"taxClass":"GST18"}' 403 "FORBIDDEN"
run_test "Update catalog (SUPER)"  PATCH  "/catalog/items/$(echo n/a)"                         "$T_SUPER"   '{"basePrice":150}' 404
run_test "Create price rule (RA)"  POST   "/catalog/price-rules"                               "$T_REGIONAL" '{"catalogItemId":"nonexist","ruleType":"REGION_OVERRIDE","value":120,"effectiveFrom":"2025-01-01T00:00:00Z"}' 404
run_test "Create price rule (EX) ❌" POST "/catalog/price-rules"                               "$T_EXEC"    '{"catalogItemId":"x","ruleType":"REGION_OVERRIDE","value":120,"effectiveFrom":"2025-01-01T00:00:00Z"}' 403 "FORBIDDEN"
# Now find a real catalog item and test price resolution
ITEM_ID=$(curl -s -H "Authorization: Bearer $T_SUPER" "$BASE/catalog/items" | python3 -c "import sys,json; d=json.load(sys.stdin); it=d.get('data',{}).get('items',d.get('data',d)); print((it[0]['id'] if isinstance(it,list) else 'nonexist') if isinstance(it,list) else 'nonexist')" 2>/dev/null || echo "nonexist")
if [ "$ITEM_ID" != "nonexist" ]; then
  run_test "Get item price (EXEC)" GET   "/catalog/items/$ITEM_ID/price"                        "$T_EXEC"    "" 200
  run_test "Update catalog item"   PATCH "/catalog/items/$ITEM_ID"                               "$T_SUPER"   '{"basePrice":150}' 200
fi

echo ""
echo "---------------------------------------------------- LEADS (6) -------------------------------------------------------"
run_test "Create lead (EXEC)"      POST   "/leads"                                              "$T_EXEC"    '{"contactName":"Test Lead","contactEmail":"t@example.com","source":"MANUAL","notes":"API test"}' 200
run_test "Create lead (AUD) ❌"    POST   "/leads"                                              "$T_AUDITOR" '{"contactName":"X","source":"MANUAL"}' 403 "FORBIDDEN"
run_test "List leads (EXEC)"       GET    "/leads"                                              "$T_EXEC"    "" 200
run_test "List leads (AUDITOR)"    GET    "/leads"                                              "$T_AUDITOR" "" 200
run_test "List leads (SUPER)"      GET    "/leads"                                              "$T_SUPER"   "" 200
# Fetch a lead id to test detail endpoints
LEAD_JSON=$(curl -s -H "Authorization: Bearer $T_SUPER" "$BASE/leads" | python3 -c "import sys,json; d=json.load(sys.stdin); items=d.get('data',{}).get('items',d.get('data',[])); print(json.dumps(items[0]) if items else '')" 2>/dev/null || echo "")
if [ -n "$LEAD_JSON" ]; then
  LEAD_ID=$(echo "$LEAD_JSON" | python3 -c "import sys,json; print(json.load(sys.stdin).get('id',''))" 2>/dev/null)
  LEAD_STATUS=$(echo "$LEAD_JSON" | python3 -c "import sys,json; print(json.load(sys.stdin).get('status',''))" 2>/dev/null)
  if [ -n "$LEAD_ID" ]; then
    run_test "Get lead detail"   GET    "/leads/$LEAD_ID"                                       "$T_SUPER"   "" 200
    run_test "Add follow-up"     POST   "/leads/$LEAD_ID/follow-ups"                            "$T_SUPER"   '{"note":"Test follow-up","channel":"call"}' 200
    run_test "Mark lead lost"    POST   "/leads/$LEAD_ID/lost"                                  "$T_SUPER"   '{"reason":"no_budget"}' 200
    if [ "$LEAD_STATUS" = "NEW" ]; then
      run_test "Qualify lead"    POST   "/leads/$LEAD_ID/qualify"                               "$T_SUPER"   '{"dealType":"INSTALLATION","value":100000}' 200
    fi
  fi
fi

echo ""
echo "---------------------------------------------------- OPPORTUNITIES (6) ----------------------------------------------"
run_test "List opps (SUPER)"       GET    "/opportunities"                                     "$T_SUPER"   "" 200
run_test "List opps (EXEC)"        GET    "/opportunities"                                     "$T_EXEC"    "" 200
run_test "List opps (AUD)"         GET    "/opportunities"                                     "$T_AUDITOR" "" 200
run_test "List opps (DL exec)"     GET    "/opportunities"                                     "$T_EXEC_DL" "" 200
OPP_JSON=$(curl -s -H "Authorization: Bearer $T_SUPER" "$BASE/opportunities" | python3 -c "import sys,json; d=json.load(sys.stdin); items=d.get('data',{}).get('items',d.get('data',[])); print(json.dumps(items[0]) if items else '')" 2>/dev/null || echo "")
if [ -n "$OPP_JSON" ]; then
  OPP_ID=$(echo "$OPP_JSON" | python3 -c "import sys,json; print(json.load(sys.stdin).get('id',''))" 2>/dev/null)
  OPP_STAGE=$(echo "$OPP_JSON" | python3 -c "import sys,json; print(json.load(sys.stdin).get('stage',''))" 2>/dev/null)
  OWNER_ID=$(echo "$OPP_JSON" | python3 -c "import sys,json; print(json.load(sys.stdin).get('ownerId',''))" 2>/dev/null)
  if [ -n "$OPP_ID" ]; then
    run_test "Get opp detail"    GET    "/opportunities/$OPP_ID"                                "$T_SUPER"   "" 200
    run_test "Transition stage"  PATCH  "/opportunities/$OPP_ID/stage"                          "$T_SUPER"   '{"toStage":"CONTACTED","remark":"Contacted"}' 200
    run_test "Reassign (MGR)"    POST   "/opportunities/$OPP_ID/reassign"                       "$T_MANAGER" "{\"ownerId\":\"$OWNER_ID\"}" 200
    run_test "Reassign (EX) ❌"  POST   "/opportunities/$OPP_ID/reassign"                       "$T_EXEC"    "{\"ownerId\":\"$OWNER_ID\"}" 403 "FORBIDDEN"
    run_test "Mark lost"         POST   "/opportunities/$OPP_ID/lost"                           "$T_SUPER"   '{"reason":"Test"}' 200
  fi
fi

echo ""
echo "---------------------------------------------------- QUOTATIONS (7) --------------------------------------------------"
run_test "List opp quotations"     GET    "/opportunities/nonexist/quotations"                 "$T_SUPER"   "" 404
if [ -n "${OPP_ID:-}" ]; then
  run_test "List quotations"       GET    "/opportunities/$OPP_ID/quotations"                   "$T_SUPER"   "" 200
  run_test "Create quotation (EX)" POST   "/quotations"                                         "$T_EXEC"    "{\"opportunityId\":\"$OPP_ID\",\"lines\":[{\"description\":\"Test Line\",\"qty\":1,\"unitPrice\":1000,\"taxRatePct\":18}]}" 200
fi
# Try to get a quotation id for action tests
QUOT_JSON=$(if [ -n "${OPP_ID:-}" ]; then curl -s -H "Authorization: Bearer $T_SUPER" "$BASE/opportunities/$OPP_ID/quotations" | python3 -c "import sys,json; d=json.load(sys.stdin); items=d.get('data',[]); print(json.dumps(items[0]) if items else '')" 2>/dev/null; else echo ""; fi || echo "")
if [ -n "$QUOT_JSON" ]; then
  QUOT_ID=$(echo "$QUOT_JSON" | python3 -c "import sys,json; print(json.load(sys.stdin).get('id',''))" 2>/dev/null)
  QUOT_STATUS=$(echo "$QUOT_JSON" | python3 -c "import sys,json; print(json.load(sys.stdin).get('status',''))" 2>/dev/null)
  if [ -n "$QUOT_ID" ]; then
    run_test "Revise quotation"    POST   "/quotations/$QUOT_ID/revise"                         "$T_SUPER"   '{"lines":[{"description":"Revised","qty":1,"unitPrice":1200,"taxRatePct":18}]}' 200
    run_test "Submit quotation"    POST   "/quotations/$QUOT_ID/submit"                         "$T_SUPER"   "" 200
    run_test "Approve (MGR)"       POST   "/quotations/$QUOT_ID/approve"                        "$T_MANAGER" "" 200
    run_test "Approve (EX) ❌"     POST   "/quotations/$QUOT_ID/approve"                        "$T_EXEC"    "" 403 "FORBIDDEN"
    run_test "Reject quotation"    POST   "/quotations/$QUOT_ID/reject"                         "$T_SUPER"   "" 200
    run_test "Send quotation"      POST   "/quotations/$QUOT_ID/send"                           "$T_SUPER"   "" 200
  fi
fi

echo ""
echo "---------------------------------------------------- SALES QUERIES (23) ---------------------------------------------"
run_test "Dashboard stats"         GET    "/sales-queries/dashboard/stats"                      "$T_SUPER"   "" 200
run_test "Dashboard (AUDITOR)"     GET    "/sales-queries/dashboard/stats"                      "$T_AUDITOR" "" 200
run_test "Dashboard (EXEC)"        GET    "/sales-queries/dashboard/stats"                      "$T_EXEC"    "" 200
run_test "Reports (SUPER)"         GET    "/sales-queries/reports?reportType=pending_queries&fromDate=2025-01-01T00:00:00Z&toDate=2026-12-31T23:59:59Z" "$T_SUPER" "" 200
run_test "Reports (EX) ❌"         GET    "/sales-queries/reports?reportType=pending_queries&fromDate=2025-01-01T00:00:00Z&toDate=2026-12-31T23:59:59Z" "$T_EXEC" "" 403 "FORBIDDEN"
run_test "Create query (EXEC)"     POST   "/sales-queries"                                     "$T_EXEC"    '{"customerName":"Walk-in Customer","meetingType":"WALK_IN","requirement":"Need a quote for CCTV","priority":"MEDIUM"}' 200
run_test "Create query (AUD) ❌"   POST   "/sales-queries"                                     "$T_AUDITOR" '{"customerName":"X","meetingType":"WALK_IN","requirement":"Y"}' 403 "FORBIDDEN"
run_test "List queries (SUPER)"    GET    "/sales-queries"                                     "$T_SUPER"   "" 200
run_test "List queries (EXEC)"     GET    "/sales-queries"                                     "$T_EXEC"    "" 200
run_test "List queries (with sort priority+tags) [AND fix test]" GET "/sales-queries?sortBy=priority&tags=urgent" "$T_SUPER" "" 200
# Fetch a sales query id
SQ_JSON=$(curl -s -H "Authorization: Bearer $T_SUPER" "$BASE/sales-queries" | python3 -c "import sys,json; d=json.load(sys.stdin); items=d.get('data',{}).get('items',d.get('data',[])); print(json.dumps(items[0]) if items else '')" 2>/dev/null || echo "")
if [ -n "$SQ_JSON" ]; then
  SQ_ID=$(echo "$SQ_JSON" | python3 -c "import sys,json; print(json.load(sys.stdin).get('id',''))" 2>/dev/null)
  SQ_STATUS=$(echo "$SQ_JSON" | python3 -c "import sys,json; print(json.load(sys.stdin).get('status',''))" 2>/dev/null)
  OWNER_ID_SQ=$(echo "$SQ_JSON" | python3 -c "import sys,json; print(json.load(sys.stdin).get('ownerId',''))" 2>/dev/null)
  DEPT_ID=$(echo "$SQ_JSON" | python3 -c "import sys,json; print(json.load(sys.stdin).get('departmentId','') or '')" 2>/dev/null)
  if [ -n "$SQ_ID" ]; then
    run_test "Get query detail"  GET    "/sales-queries/$SQ_ID"                                 "$T_SUPER"   "" 200
    run_test "Update query"      PATCH  "/sales-queries/$SQ_ID"                                 "$T_SUPER"   '{"priority":"HIGH","requirement":"Updated req"}' 200
    run_test "Update (AUD) ❌"   PATCH  "/sales-queries/$SQ_ID"                                 "$T_AUDITOR" '{"priority":"LOW"}' 403 "FORBIDDEN"
    run_test "Assign dept (MGR)" POST   "/sales-queries/$SQ_ID/assign-department"               "$T_MANAGER" "{\"departmentId\":\"$(if [ -n \"$DEPT_ID\" ]; then echo \"$DEPT_ID\"; else echo \"nonexist\"; fi)\",\"remark\":\"Assigning\"}" 200
    run_test "Assign dept (EX)❌" POST  "/sales-queries/$SQ_ID/assign-department"               "$T_EXEC"    '{"departmentId":"any","remark":"X"}' 403 "FORBIDDEN"
    run_test "Reassign owner (M)" POST  "/sales-queries/$SQ_ID/reassign-owner"                  "$T_MANAGER" "{\"ownerId\":\"$OWNER_ID_SQ\"}" 200
    run_test "Reassign owner (E)❌" POST "/sales-queries/$SQ_ID/reassign-owner"                 "$T_EXEC"    "{\"ownerId\":\"$OWNER_ID_SQ\"}" 403 "FORBIDDEN"
    run_test "Transition NEW→ASSIGNED" PATCH "/sales-queries/$SQ_ID/status"                      "$T_SUPER"   '{"toStatus":"ASSIGNED","remark":"Test"}' 200
    run_test "List comments"     GET    "/sales-queries/$SQ_ID/comments"                         "$T_SUPER"   "" 200
    run_test "Add comment"       POST   "/sales-queries/$SQ_ID/comments"                         "$T_SUPER"   '{"body":"Test comment"}' 200
    run_test "Add follow-up"     POST   "/sales-queries/$SQ_ID/follow-ups"                       "$T_SUPER"   "{\"title\":\"Callback\",\"scheduledAt\":\"2026-08-01T10:00:00Z\",\"channel\":\"CALL\"}" 200
    run_test "List follow-ups"   GET    "/sales-queries/$SQ_ID/follow-ups"                       "$T_SUPER"   "" 200
  fi
fi

# Try updating + completing a follow-up if we have a sq
if [ -n "${SQ_ID:-}" ]; then
  FU_JSON=$(curl -s -H "Authorization: Bearer $T_SUPER" "$BASE/sales-queries/$SQ_ID/follow-ups" | python3 -c "import sys,json; d=json.load(sys.stdin); items=d.get('data',[]); print(json.dumps(items[0]) if items else '')" 2>/dev/null || echo "")
  if [ -n "$FU_JSON" ]; then
    FU_ID=$(echo "$FU_JSON" | python3 -c "import sys,json; print(json.load(sys.stdin).get('id',''))" 2>/dev/null)
    if [ -n "$FU_ID" ]; then
      run_test "Update follow-up" PATCH  "/sales-queries/$SQ_ID/follow-ups/$FU_ID"               "$T_SUPER"   '{"title":"Updated Title"}' 200
      run_test "Complete follow-up" POST "/sales-queries/$SQ_ID/follow-ups/$FU_ID/complete"      "$T_SUPER"   '{"customerResponse":"Positive","outcome":"Interested"}' 200
      run_test "Reschedule fu"    POST   "/sales-queries/$SQ_ID/follow-ups/$FU_ID/reschedule"    "$T_SUPER"   '{"scheduledAt":"2026-08-05T10:00:00Z","note":"Postponed"}' 200
      run_test "Cancel fu"        POST   "/sales-queries/$SQ_ID/follow-ups/$FU_ID/cancel"        "$T_SUPER"   "" 200
    fi
  fi
fi

# Try updating + pinning a comment if we have a sq
if [ -n "${SQ_ID:-}" ]; then
  CMT_JSON=$(curl -s -H "Authorization: Bearer $T_SUPER" "$BASE/sales-queries/$SQ_ID/comments" | python3 -c "import sys,json; d=json.load(sys.stdin); items=d.get('data',[]); print(json.dumps(items[0]) if items else '')" 2>/dev/null || echo "")
  if [ -n "$CMT_JSON" ]; then
    CMT_ID=$(echo "$CMT_JSON" | python3 -c "import sys,json; print(json.load(sys.stdin).get('id',''))" 2>/dev/null)
    if [ -n "$CMT_ID" ]; then
      run_test "Update comment"   PATCH  "/sales-queries/$SQ_ID/comments/$CMT_ID"                "$T_SUPER"   '{"body":"Updated comment body"}' 200
      run_test "Pin comment"      PATCH  "/sales-queries/$SQ_ID/comments/$CMT_ID/pin"            "$T_MANAGER" '{"isPinned":true}' 200
      run_test "Delete comment"   DELETE "/sales-queries/$SQ_ID/comments/$CMT_ID"                "$T_SUPER"   "" 200
    fi
  fi
fi

echo ""
echo "=========================================== TOTAL: PASS=$PASS  FAIL=$FAIL ==========================================="
