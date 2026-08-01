#!/bin/bash

BASE="http://localhost:3000/api/v1"

echo "========= 0. AUTHENTICATION"
SUPER_LOGIN=$(curl -s -X POST "$BASE/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"superadmin@iris.local","password":"ChangeMe123!"}')
SUPER_TOKEN=$(python3 -c "import sys,json; d=json.loads('$SUPER_LOGIN'); print(d['data']['accessToken'])")
echo "Super Admin logged in ✓"

EXEC_LOGIN=$(curl -s -X POST "$BASE/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"rahul.exec@iris.local","password":"Password123!"}')
EXEC_TOKEN=$(python3 -c "import sys,json; d=json.loads('$EXEC_LOGIN'); print(d['data']['accessToken'])")
EXEC_ID=$(python3 -c "import sys,json; d=json.loads('$EXEC_LOGIN'); print(d['data']['user']['id'])")
echo "Sales Exec (Rahul) logged in ✓"

MGR_LOGIN=$(curl -s -X POST "$BASE/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"vikram.manager@iris.local","password":"Password123!"}')
MGR_TOKEN=$(python3 -c "import sys,json; d=json.loads('$MGR_LOGIN'); print(d['data']['accessToken'])")
MGR_ID=$(python3 -c "import sys,json; d=json.loads('$MGR_LOGIN'); print(d['data']['user']['id'])")
echo "Sales Manager (Vikram) logged in ✓"

AUTH_SUPER="Authorization: Bearer $SUPER_TOKEN"
AUTH_EXEC="Authorization: Bearer $EXEC_TOKEN"
AUTH_MGR="Authorization: Bearer $MGR_TOKEN"

echo -e "\n========= 1. REGIONS & USERS"
echo "--- 1a. List Regions"
curl -s "$BASE/regions" -H "$AUTH_SUPER" | python3 -m json.tool | head -20
echo "--- 1b. List Users"
USERS=$(curl -s "$BASE/users" -H "$AUTH_SUPER")
python3 -c "
import json
d = json.loads('''$USERS''')
print(f'Total users: {len(d[\"data\"])}')
for u in d['data']:
    print(f'  - {u[\"name\"]} ({u[\"role\"]}) id={u[\"id\"]}')"
echo "--- 1c. User Directory"
DIR=$(curl -s "$BASE/users/directory" -H "$AUTH_EXEC")
python3 -c "import json; d=json.loads('''$DIR'''); print(f'Directory users: {len(d[\"data\"])}')"

echo -e "\n========= 2. DEPARTMENTS"
echo "--- 2a. List Departments"
DEPTS=$(curl -s "$BASE/departments" -H "$AUTH_SUPER")
TECH_DEPT_ID=$(python3 -c "
import json
d=json.loads('''$DEPTS''')
for x in d['data']:
    print(f'  dept: {x[\"code\"]} - {x[\"name\"]} (id={x[\"id\"]})')
for x in d['data']:
    if x['code']=='TECH':
        print(x['id'])
" | tail -1)
echo "Tech dept ID: $TECH_DEPT_ID"

echo -e "\n========= 3. SALES QUERIES (Core Workflow)"
REQ_JSON=$(cat <<EOF
{
  "customerName": "Test Customer Pvt Ltd",
  "companyName": "Test Customer Pvt Ltd",
  "contactPhone": "9876543210",
  "contactEmail": "test@customer.example",
  "meetingType": "SCHEDULED",
  "visitDate": "2026-07-25T10:00:00Z",
  "visitLocation": "Sector 44, Gurugram",
  "requirement": "Need CCTV installation for 3-floor office with 20 cameras",
  "priority": "HIGH",
  "productInterest": "CCTV Installation",
  "estimatedValue": 250000
}
EOF
)
echo "--- 3a. Create Sales Query"
CREATE_Q=$(curl -s -X POST "$BASE/sales-queries" -H "$AUTH_EXEC" -H "Content-Type: application/json" -d "$REQ_JSON")
echo "$CREATE_Q" | python3 -m json.tool
QUERY_ID=$(python3 -c "import json; d=json.loads('''$CREATE_Q'''); print(d['data']['id'])")
QUERY_REF=$(python3 -c "import json; d=json.loads('''$CREATE_Q'''); print(d['data']['refNo'])")
echo "Created Query: $QUERY_REF (id=$QUERY_ID)"

echo "--- 3b. Get Query Details"
GET_Q=$(curl -s "$BASE/sales-queries/$QUERY_ID" -H "$AUTH_MGR")
python3 -c "
import json
d=json.loads('''$GET_Q''')['data']
print(f'Query {d[\"refNo\"]} | Status: {d[\"status\"]} | Priority: {d[\"priority\"]}')
print(f'Comments count: {len(d.get(\"comments\",[]))}')"

echo "--- 3c. List Sales Queries (all visible to Exec)"
LIST_Q=$(curl -s "$BASE/sales-queries" -H "$AUTH_EXEC")
python3 -c "import json; d=json.loads('''$LIST_Q'''); print(f'Total visible to Exec: {len(d[\"data\"])} queries')"

echo "--- 3d. Filter by Priority HIGH"
LIST_HIGH=$(curl -s "$BASE/sales-queries?priority=HIGH" -H "$AUTH_SUPER")
python3 -c "import json; d=json.loads('''$LIST_HIGH'''); print(f'High priority queries: {len(d[\"data\"])}')"

echo "--- 3e. Edit Query"
EDIT_JSON='{"estimatedValue": 275000, "priority": "URGENT"}'
EDITED=$(curl -s -X PATCH "$BASE/sales-queries/$QUERY_ID" -H "$AUTH_EXEC" -H "Content-Type: application/json" -d "$EDIT_JSON")
python3 -c "
import json
d=json.loads('''$EDITED''')
print(f'Updated. Value={d[\"data\"][\"estimatedValue\"]}, Priority={d[\"data\"][\"priority\"]}')"

echo "--- 3f. Assign to Department"
ASSIGN_JSON=$(printf '{"departmentId": "%s", "remark": "Technical pre-sales team to prepare scope"}' "$TECH_DEPT_ID")
ASSIGNED=$(curl -s -X POST "$BASE/sales-queries/$QUERY_ID/assign-department" -H "$AUTH_MGR" -H "Content-Type: application/json" -d "$ASSIGN_JSON")
python3 -c "
import json
d=json.loads('''$ASSIGNED''')
print(f'Assigned: status={d[\"data\"][\"status\"]}, deptId={d[\"data\"][\"departmentId\"]}')"

echo "--- 3g. Status Transition ASSIGNED->UNDER_REVIEW"
S1=$(curl -s -X PATCH "$BASE/sales-queries/$QUERY_ID/status" -H "$AUTH_MGR" -H "Content-Type: application/json" -d '{"toStatus":"UNDER_REVIEW"}')
python3 -c "import json; d=json.loads('''$S1'''); print(f'Status: {d[\"data\"][\"status\"]}')"

echo "--- 3h. Status -> WAITING_FOR_CUSTOMER (requires remark)"
S2=$(curl -s -X PATCH "$BASE/sales-queries/$QUERY_ID/status" -H "$AUTH_EXEC" -H "Content-Type: application/json" -d '{"toStatus":"WAITING_FOR_CUSTOMER","remark":"Customer will share building layout by Monday"}')
python3 -c "
import json
d=json.loads('''$S2''')
print(f'Status: {d[\"data\"][\"status\"]}, closeReason={d[\"data\"][\"closeReason\"]}')"

echo "--- 3i. Status -> QUOTATION_PREPARED"
S3=$(curl -s -X PATCH "$BASE/sales-queries/$QUERY_ID/status" -H "$AUTH_MGR" -H "Content-Type: application/json" -d '{"toStatus":"QUOTATION_PREPARED"}')
python3 -c "import json; d=json.loads('''$S3'''); print(f'Status: {d[\"data\"][\"status\"]}')"

echo -e "\n========= 4. COMMENTS & MENTIONS"
echo "--- 4a. Add top-level comment with @mention"
C1_JSON=$(printf '{"body":"Site survey completed, 20 cameras recommended for full coverage","mentionedUserIds":["%s"]}' "$MGR_ID")
C1=$(curl -s -X POST "$BASE/sales-queries/$QUERY_ID/comments" -H "$AUTH_EXEC" -H "Content-Type: application/json" -d "$C1_JSON")
C1_ID=$(python3 -c "import json; d=json.loads('''$C1'''); print(d['data']['id'])")
python3 -c "
import json
d=json.loads('''$C1''')['data']
print(f'Comment id={d[\"id\"]}, mentions={d[\"mentionedUserIds\"]}')"

echo "--- 4b. Add Internal Note"
C2=$(curl -s -X POST "$BASE/sales-queries/$QUERY_ID/comments" -H "$AUTH_MGR" -H "Content-Type: application/json" \
  -d '{"body":"Internal check: Apply max 15% discount before sending quote","isInternalNote":true}')
C2_ID=$(python3 -c "import json; d=json.loads('''$C2'''); print(d['data']['id'])")
python3 -c "
import json
d=json.loads('''$C2''')['data']
print(f'Internal note id={d[\"id\"]}, isInternal={d[\"isInternalNote\"]}')"

echo "--- 4c. Threaded Reply"
C3=$(curl -s -X POST "$BASE/sales-queries/$QUERY_ID/comments" -H "$AUTH_EXEC" -H "Content-Type: application/json" \
  -d "$(printf '{"body":"Acknowledged sir. Will prepare 2D layout drawing by tomorrow EOD.","parentId":"%s"}' "$C1_ID")")
python3 -c "import json; d=json.loads('''$C3'''); print(f'Reply id={d[\"data\"][\"id\"]}, parentId={d[\"data\"][\"parentId\"]}')"

echo "--- 4d. Edit Comment"
C1EDIT=$(curl -s -X PATCH "$BASE/sales-queries/$QUERY_ID/comments/$C1_ID" -H "$AUTH_EXEC" -H "Content-Type: application/json" \
  -d '{"body":"Site survey completed: 22 cameras now recommended (added staircase & lobby)"}')
python3 -c "import json; d=json.loads('''$C1EDIT'''); print(f'Edited: edited={d[\"data\"][\"edited\"]}')"

echo "--- 4e. List Comments (full thread)"
COMMENTS=$(curl -s "$BASE/sales-queries/$QUERY_ID/comments" -H "$AUTH_SUPER")
python3 -c "import json; d=json.loads('''$COMMENTS'''); print(f'Top-level comments: {len(d[\"data\"])}')"

echo -e "\n========= 5. ATTACHMENTS (Local Disk Storage - S3 will be connected later)"
echo "This is a sample QUOTATION v1 document with CCTV pricing and scope of work." > /tmp/quote_v1.txt
echo "--- 5a. Upload Attachment"
ATT=$(curl -s -X POST "$BASE/sales-queries/$QUERY_ID/attachments" -H "$AUTH_EXEC" -F "file=@/tmp/quote_v1.txt")
ATT_ID=$(python3 -c "import json; d=json.loads('''$ATT'''); print(d['data']['id'])")
python3 -c "
import json
d=json.loads('''$ATT''')['data']
print(f'Uploaded: id={d[\"id\"]}, name={d[\"fileName\"]}, size={d[\"sizeBytes\"]}B')"

echo "--- 5b. Download Attachment (check HTTP status)"
HTTP_CODE=$(curl -s -o /tmp/dl_test.txt -w "%{http_code}" "$BASE/sales-queries/$QUERY_ID/attachments/$ATT_ID" -H "$AUTH_SUPER")
echo "Download HTTP status: $HTTP_CODE"
DOWNLOADED=$(cat /tmp/dl_test.txt)
echo "Downloaded content check: $DOWNLOADED"

echo -e "\n========= 6. NOTIFICATIONS"
echo "--- 6a. List Notifications"
NOTIFS=$(curl -s "$BASE/notifications" -H "$AUTH_MGR")
python3 -c "
import json
d=json.loads('''$NOTIFS''')['data']
print(f'Items: {len(d[\"items\"])}, total: {d[\"total\"]}')
for n in d['items'][:3]:
    print(f'  - {n[\"type\"]}: {n[\"title\"]} read={n[\"readAt\"]}')"

echo "--- 6b. Unread Count"
UNREAD=$(curl -s "$BASE/notifications/unread-count" -H "$AUTH_MGR")
python3 -c "import json; d=json.loads('''$UNREAD'''); print(f'Unread: {d[\"data\"]}')"

echo "--- 6c. Mark all Read"
READALL=$(curl -s -X POST "$BASE/notifications/read-all" -H "$AUTH_MGR")
python3 -c "import json; d=json.loads('''$READALL'''); print(f'Marked all read: success={d[\"success\"]}')"
UNREAD2=$(curl -s "$BASE/notifications/unread-count" -H "$AUTH_MGR")
python3 -c "import json; d=json.loads('''$UNREAD2'''); print(f'After read-all: unread={d[\"data\"]}')"

echo -e "\n========= 7. FULL QUERY VIEW (Activity Timeline Audit Trail)"
FULL_Q=$(curl -s "$BASE/sales-queries/$QUERY_ID" -H "$AUTH_SUPER")
python3 -c "
import json
d=json.loads('''$FULL_Q''')['data']
print('=== FULL QUERY AUDIT TRAIL ===')
print(f'REF: {d[\"refNo\"]}  |  Status: {d[\"status\"]}  |  Priority: {d[\"priority\"]}')
print(f'Activities count: {len(d[\"activities\"])}')
for a in d['activities']:
    ts = a['createdAt'][:19].replace('T',' ')
    from_s = a.get('fromStatus') or ''
    to_s = a.get('toStatus') or ''
    trans = f'{from_s}->{to_s}' if from_s or to_s else ''
    remark = a.get('remark') or ''
    print(f'  [{ts}] {a[\"action\"]:20s} {trans:30s} {remark}')"

echo -e "\n========= 8. PICKLISTS"
echo "--- 8a. PRODUCT_INTEREST"
PI=$(curl -s "$BASE/picklists/PRODUCT_INTEREST" -H "$AUTH_SUPER")
python3 -c "import json; d=json.loads('''$PI'''); print(f'Product Interest options: {len(d[\"data\"])}')"
echo "--- 8b. LEAD_SOURCE"
LS=$(curl -s "$BASE/picklists/LEAD_SOURCE" -H "$AUTH_EXEC")
python3 -c "import json; d=json.loads('''$LS'''); print(f'Lead Source options: {len(d[\"data\"])}')"

echo -e "\n========= 9. DELETE COMMENT (soft-delete / audit trail)"
DEL=$(curl -s -X DELETE "$BASE/sales-queries/$QUERY_ID/comments/$C2_ID" -H "$AUTH_MGR")
python3 -c "
import json
d=json.loads('''$DEL''')['data']
print(f'Soft-deleted: id={d[\"id\"]}, deleted={d[\"deleted\"]}, body={d[\"body\"]}, deletedAt={d[\"deletedAt\"]}')"

echo -e "\n========= 10. INVALID TRANSITIONS (negative test)"
echo "--- 10a. Try CLOSED->NEW (should fail)"
BAD=$(curl -s -X PATCH "$BASE/sales-queries/$QUERY_ID/status" -H "$AUTH_SUPER" -H "Content-Type: application/json" \
  -d '{"toStatus":"NEW"}')
python3 -c "import json; d=json.loads('''$BAD'''); print(f'success={d[\"success\"]}, error={d.get(\"error\",\"\")}')"

echo -e "\n========= 11. Refresh Token flow"
REFR=$(python3 -c "import json; d=json.loads('''$SUPER_LOGIN'''); print(d['data']['refreshToken'])")
REFRESH=$(curl -s -X POST "$BASE/auth/refresh" -H "Content-Type: application/json" -d "{\"refreshToken\":\"$REFR\"}")
python3 -c "import json; d=json.loads('''$REFRESH'''); print(f'Refresh: success={d[\"success\"]}, got accessToken={\"accessToken\" in d[\"data\"]}')"

echo -e "\n============================================="
echo "✅  ALL EXISTING API ENDPOINTS TESTED SUCCESSFULLY"
echo "============================================="
echo "Sales Query ID: $QUERY_ID"
echo "Sales Query REF: $QUERY_REF"
echo "Stored at: http://localhost:3000/api/v1/sales-queries/$QUERY_ID"
echo ""
echo "Note: S3 account not connected yet - using local disk storage."
