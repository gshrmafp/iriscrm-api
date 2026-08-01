#!/bin/bash
BASE="http://localhost:3000/api/v1"
AUTH_BASE="http://localhost:3000/api/v1"
echo "=== Testing enhanced Sales Query CRM APIs ==="
echo ""

echo "--- 1. Login as Super Admin ---"
LOGIN=$(curl -s -X POST "$AUTH_BASE/auth/login" -H "Content-Type: application/json" -d '{"email":"superadmin@iris.local","password":"ChangeMe123!"}')
echo "Login success: $(echo "$LOGIN" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d.get('success'))")"
TOKEN=$(echo "$LOGIN" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d['data']['accessToken'])")
AUTH="Authorization: Bearer $TOKEN"

DIR_USERS=$(curl -s "$BASE/users/directory" -H "$AUTH")
echo "Directory users: $(echo "$DIR_USERS" | python3 -c "import sys,json;d=json.load(sys.stdin);print(len(d['data']) if d.get('success') else d)")"

EXEC_ID=$(echo "$DIR_USERS" | python3 -c "import sys,json;d=json.load(sys.stdin);u=[x for x in d['data'] if x.get('role')=='SALES_EXECUTIVE'];print(u[0]['id'] if u else '')")
MGR_ID=$(echo "$DIR_USERS" | python3 -c "import sys,json;d=json.load(sys.stdin);u=[x for x in d['data'] if x.get('role')=='SALES_MANAGER'];print(u[0]['id'] if u else '')")
EXEC2_ID=$(echo "$DIR_USERS" | python3 -c "import sys,json;d=json.load(sys.stdin);u=[x for x in d['data'] if x.get('role')=='SALES_EXECUTIVE'];print(u[1]['id'] if len(u)>1 else (u[0]['id'] if u else ''))")

DEPT_RAW=$(curl -s "$BASE/departments" -H "$AUTH")
DEPT_ID=$(echo "$DEPT_RAW" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d['data'][0]['id'] if d.get('success') and d['data'] else '')")
echo "EXEC=$EXEC_ID MGR=$MGR_ID EXEC2=$EXEC2_ID DEPT=$DEPT_ID"
echo ""

echo "--- 2. Dashboard Stats ---"
curl -s "$BASE/sales-queries/dashboard/stats" -H "$AUTH" | python3 -m json.tool
echo ""

echo "--- 3. Create Query with all new fields (address, gstn, city, gps, subject, qty, budget, duedate, tags, labels) ---"
Q=$(curl -s -X POST "$BASE/sales-queries" -H "$AUTH" -H "Content-Type: application/json" -d '{
  "customerName":"Acme Foods Pvt Ltd",
  "companyName":"Acme Foods",
  "contactPhone":"+919810012345",
  "contactEmail":"purchase@acme.com",
  "address":"22 MG Road, Sector 18",
  "gstNumber":"07AAACI1234M1Z5",
  "city":"Gurgaon",
  "meetingType":"SCHEDULED",
  "visitLocation":"Acme HO",
  "gpsLatitude":28.4595,
  "gpsLongitude":77.0266,
  "subject":"Office Furniture Bulk Order",
  "requirement":"Need 200 ergonomic chairs + 40 executive desks",
  "priority":"URGENT",
  "productInterest":"Chairs",
  "quantity":240,
  "budget":5000000,
  "estimatedValue":4800000,
  "dueDate":"2026-08-15T10:00:00.000Z",
  "tags":["bulk","corporate"],
  "labels":{"vertical":"BFSI"}
}')
echo "$Q" | python3 -m json.tool
QID=$(echo "$Q" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d['data']['id'] if d.get('success') else '')")
REF=$(echo "$Q" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d['data']['refNo'] if d.get('success') else '')")
echo "Created QID=$QID REF=$REF"
echo ""

echo "--- 4. Reassign owner + assignedTo ---"
if [ -n "$QID" ] && [ -n "$EXEC_ID" ] && [ -n "$EXEC2_ID" ]; then
curl -s -X POST "$BASE/sales-queries/$QID/reassign-owner" -H "$AUTH" -H "Content-Type: application/json" -d "{
  \"ownerId\":\"$EXEC_ID\",
  \"assignedToId\":\"$EXEC2_ID\",
  \"remark\":\"Reassigned to Gurgaon field team\"
}" | python3 -m json.tool
fi
echo ""

echo "--- 5. Assign Department ---"
if [ -n "$QID" ] && [ -n "$DEPT_ID" ]; then
curl -s -X POST "$BASE/sales-queries/$QID/assign-department" -H "$AUTH" -H "Content-Type: application/json" -d "{\"departmentId\":\"$DEPT_ID\",\"remark\":\"Sent to TECH for spec review\"}" | python3 -m json.tool
fi
echo ""

echo "--- 6. Paginated list with filters (pageSize, priority=URGENT, city, sortBy) ---"
curl -s "$BASE/sales-queries?page=1&pageSize=5&priority=URGENT&sortBy=createdAt&sortOrder=desc&city=Gurgaon" -H "$AUTH" | python3 -m json.tool
echo ""

echo "--- 7. Add comment with mention then PIN it ---"
CID=""
if [ -n "$QID" ] && [ -n "$EXEC2_ID" ]; then
C=$(curl -s -X POST "$BASE/sales-queries/$QID/comments" -H "$AUTH" -H "Content-Type: application/json" -d "{
  \"body\":\"Please validate spec and confirm pricing\",
  \"mentionedUserIds\":[\"$EXEC2_ID\"],
  \"isInternalNote\":true
}")
echo "$C" | python3 -m json.tool
CID=$(echo "$C" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d['data']['id'] if d.get('success') else '')")
if [ -n "$CID" ]; then
echo "PIN comment $CID:"
curl -s -X PATCH "$BASE/sales-queries/$QID/comments/$CID/pin" -H "$AUTH" -H "Content-Type: application/json" -d '{"isPinned":true}' | python3 -m json.tool
fi
fi
echo ""

echo "--- 8. Follow-ups (6 endpoints: create, list, update, reschedule, complete, cancel) ---"
FUID=""
if [ -n "$QID" ] && [ -n "$EXEC_ID" ]; then
FU1=$(curl -s -X POST "$BASE/sales-queries/$QID/follow-ups" -H "$AUTH" -H "Content-Type: application/json" -d "{
  \"title\":\"Call Acme purchaser to confirm specs\",
  \"note\":\"Ask about color preferences\",
  \"scheduledAt\":\"2026-07-26T10:30:00.000Z\",
  \"reminderMinutes\":60,
  \"channel\":\"call\",
  \"assignedToId\":\"$EXEC_ID\"
}")
echo "$FU1" | python3 -m json.tool
FUID=$(echo "$FU1" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d['data']['id'] if d.get('success') else '')")
if [ -n "$FUID" ]; then
  echo "List follow-ups:"
  curl -s "$BASE/sales-queries/$QID/follow-ups?includeOverdue=true" -H "$AUTH" | python3 -c "import sys,json;d=json.load(sys.stdin);print(f'count={len(d[\"data\"])} ok={d[\"success\"]}') if d.get('success') else print(d)"
  echo "Update FU:"
  curl -s -X PATCH "$BASE/sales-queries/$QID/follow-ups/$FUID" -H "$AUTH" -H "Content-Type: application/json" -d '{"note":"Also ask about GST billing"}' | python3 -c "import sys,json;d=json.load(sys.stdin);print(d['success'])"
  echo "Reschedule FU:"
  curl -s -X POST "$BASE/sales-queries/$QID/follow-ups/$FUID/reschedule" -H "$AUTH" -H "Content-Type: application/json" -d '{"scheduledAt":"2026-07-28T15:00:00.000Z","note":"Customer rescheduled","reminderMinutes":30}' | python3 -c "import sys,json;d=json.load(sys.stdin);print(d['success'])"
  echo "Complete FU:"
  curl -s -X POST "$BASE/sales-queries/$QID/follow-ups/$FUID/complete" -H "$AUTH" -H "Content-Type: application/json" -d '{"customerResponse":"Will confirm tomorrow","outcome":"positive_interest"}' | python3 -c "import sys,json;d=json.load(sys.stdin);print(d['success'])"
fi
fi
echo ""

echo "--- 9. Get query full (comments+pinned, activities with from->to, follow-ups, tags) ---"
if [ -n "$QID" ]; then
curl -s "$BASE/sales-queries/$QID" -H "$AUTH" | python3 -c "
import sys,json
d=json.load(sys.stdin)
if not d.get('success'): print(d); sys.exit()
q=d['data']
print('Query:', q['refNo'], '| status:', q['status'], '| priority:', q['priority'])
print('city:', q.get('city'), '| budget:', q.get('budget'), '| qty:', q.get('quantity'))
print('tags:', q.get('tags'), '| labels:', q.get('labels'))
print('comments top-level:', len(q.get('comments',[])))
print('pinned comments:', len([c for c in q.get('comments',[]) if c.get('isPinned')]))
print('activities:', len(q.get('activities',[])))
for a in q.get('activities',[]):
    field = a.get('field') or ''
    fr = a.get('fromValue') or ''
    to = a.get('toValue') or ''
    print('  ', a['action'], field, f'{fr}->{to}' if (fr or to) else '', '@', a['createdAt'][:19])
print('follow-ups:', len(q.get('followUps',[])))
for f in q.get('followUps',[]):
    print('  ', f['status'], f['title'], f['scheduledAt'][:19], 'resched_count=', f.get('rescheduledCount'), 'outcome=', f.get('outcome'))
print('attachments:', len(q.get('attachments',[])))
"
fi
echo ""

echo "--- 10. Reports (8 types) + CSV export ---"
for RT in sales_conversion pending_queries follow_ups employee_performance department_performance resolution_time lost_opportunity monthly_sales; do
  echo -n "  $RT: "
  curl -s "$BASE/sales-queries/reports?reportType=$RT&format=json" -H "$AUTH" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d.get('success'))"
done
echo ""
echo "CSV download:"
curl -s -o /tmp/rpt.csv -w "  HTTP=%{http_code} type=%{content_type} size=%{size_download}\n" "$BASE/sales-queries/reports?reportType=follow_ups&format=csv" -H "$AUTH"
echo "  head1=$(head -1 /tmp/rpt.csv | cut -c1-120)"
echo ""

echo "=== DONE ==="
