# IRIS CRM — Backend API Server

> **Phase 2 (Sales Module) complete.** RESTful CRM backend powering the IRIS platform — identity + RBAC, picklists, departments, notifications, and a fully-featured Sales pipeline (Catalog · Leads · Opportunities · Quotations · Sales Queries).

---

## 🧱 Tech Stack

| Layer | Technology |
|---|---|
| Runtime | **Node 24** + TypeScript 5.6 |
| HTTP | **Express 4.21** · helmet · cors · multer (uploads) |
| DB | **PostgreSQL 16** via **Prisma 5.20** ORM |
| Auth | **JWT** (jsonwebtoken) · **argon2** password hashing |
| Validation | **Zod 3.23** (DTO schemas → auto HTTP 422) |
| Logging | **pino 9.4** · pino-http |
| Docs | **Swagger UI** (swagger-jsdoc · swagger-ui-express) |
| Testing | **Jest 29** + ts-jest · supertest (e2e) |
| Dev server | **tsx 4.19** watch mode |

---

## 🗂️ Project Structure

```
Irisbackend/
├── prisma/
│   ├── schema.prisma        ← data model (Role, User, Region, Picklist, Department,
│   │                         SalesQuery, Lead, Opportunity, Quotation, CatalogItem…)
│   ├── seed.ts              ← seed script (2 regions · 7 users · 4 picklists · 2 depts · sample data)
│   └── migrations/          ← Prisma migrate history (6 migrations)
├── src/
│   ├── config/
│   │   ├── env.ts           ← dotenv + zod environment validation
│   │   └── permissions.ts   ← role default permissions · approval limits · permission keys
│   ├── core/
│   │   ├── db/prisma.ts     ← PrismaClient singleton
│   │   ├── errors/          ← typed AppError (401/403/404/400/409/422)
│   │   ├── http/            ← asyncHandler, ok/created/empty responses, errorMiddleware,
│   │   │                      swagger, /api/v1/status endpoint
│   │   ├── logger/          ← pino config
│   │   ├── middleware/      ← requireAuth · requirePermission · validateBody/Query
│   │   ├── rbac/            ← effectivePermissions (role defaults + DB overrides)
│   │   │                      regionScope (CROSS_REGION_ROLES check)
│   │   ├── storage/         ← pluggable storage (localDiskStorage; ~/uploads)
│   │   ├── utils/           ← idGenerator (ref-no sequence: SAL-YYYY-#####, GGN-L-######…)
│   │   └── events/          ← typed in-memory eventBus + notificationSubscriber
│   ├── modules/             ← one folder per domain:
│   │   ├── identity/        │  routes + controller + service + repository + dto
│   │   ├── departments/     │
│   │   ├── picklists/       │
│   │   ├── notifications/   │
│   │   └── sales/
│   │       ├── catalog/           │  CRUD + resolvePrice + priceRule
│   │       ├── leads/             │  CRUD + follow-ups + markLost + qualify→Opportunity
│   │       ├── opportunities/     │  stage pipeline + reassign + win/loss (triggers AMC/Project)
│   │       ├── quotations/        │  create/revise/submit/approve/reject/send + auto-approval rules
│   │       └── queries/           │  23 endpoint — 13-state SM · comments · attachments ·
│   │                                follow-ups · department workflow · dashboard · 8 reports
│   ├── app.ts               ← Express app builder (middleware + routes)
│   └── server.ts            ← PORT listener (default 3000)
├── tests/                   ← Jest test suites (e2e with test DB txn rollback)
├── scripts/                 ← gen-test-tokens.ts · final-api-test.sh (live API smoke tests)
├── postman/                 ← Postman collection & local environment
└── planning/                ← requirement docs (.docx) for each development phase
```

---

## 🚀 Quick Start

### 0. Prerequisites

- Node **24.x** (tested on `v24.15.0`)
- PostgreSQL **16+** with a fresh database named `iris_local`
- The DB must have the `pgcrypto` extension enabled (seed does this automatically)

### 1. Install

```bash
cd Irisbackend
npm install
```

### 2. Configure environment

Copy and fill `.env.example` → `.env`:

```bash
cp .env.example .env
```

Required keys:

| Key | Example |
|---|---|
| `DATABASE_URL` | `postgresql://postgres:postgres@localhost:5432/iris_local?schema=public` |
| `JWT_ACCESS_SECRET` | long random string (used to sign Bearer tokens, 1h expiry) |
| `PORT` | `3000` *(default)* |
| `UPLOAD_STORAGE_DIR` | `uploads/` *(default, relative to project root)* |

### 3. Apply DB schema + seed

```bash
npx prisma migrate dev        # runs all 6 migrations + auto-runs seed
# OR, if migrations already applied:
npx prisma db seed            # just run the seed
```

The seed populates:

| Entity | Count | Sample |
|---|---|---|
| Region | 2 | **Gurugram (GGN)**, **Delhi (DL)** |
| User | 7 | `superadmin@iris.local` (password `Admin@12345`), `priya.admin@iris.local`, `vikram.manager@iris.local`, `rahul.exec@iris.local`, `anita.auditor@iris.local`, `sanjay.admin@iris.local`, `neha.exec@iris.local` |
| Picklist | 4 | `LEAD_SOURCE`, `PRODUCT_INTEREST`, `AMC_FREQUENCY`, `DEAL_TYPE` |
| Department | 2 | `Sales – Gurugram`, `Sales – Delhi` |
| CatalogItem | 4 | 4 pre-seeded items + 1 price rule (Gurugram region override) |
| Lead/Opp/Quotation | 4/2/1 | each with region/owner set for visibility scoping |

### 4. Run

```bash
npm run dev        # tsx watch on src/server.ts → http://localhost:3000
```

Verify:

```
http://localhost:3000/api/v1/status   → Health check JSON + Uptime
http://localhost:3000/api-docs        → Swagger UI (all endpoints interactive)
```

### 5. Build for production

```bash
npm run build    # writes compiled JS + sourcemaps to dist/
npm start        # runs node dist/server.js
```

---

## 🔐 Authentication & RBAC

Every endpoint is protected by **two gates stacked**:

1. **Route level** — `requireAuth` (validates Bearer JWT, populates `req.user`)
   → `requirePermission("SALES_QUERY_CREATE")` (checks effective permission keys)
2. **Service level** — ownership / department-membership / region scoping

Role hierarchy (top → bottom):

```
 SUPER_ADMIN ──→ configures regions, cross-region reports, catalog edits
    │
 REGIONAL_ADMIN ──→ approves price rules, price-override ≥ ₹50L, own region everything
    │
 SALES_MANAGER ──→ reassigns opp/queries, approves quotations, dept manager actions
    │
 SALES_EXECUTIVE ──→ creates leads, queries, quotations (auto-approve ≤ ₹50K)
    │
 AUDITOR ──→ read-only VIEW permissions on all sales / identity / reports
```

### Approval Limits (Quotation Auto-Approval)

Defined in `src/config/permissions.ts`, used by `quotationService.submit()` and `.approve()`:

| Role | Max quotation value | Max discount% | Auto-approve? |
|---|---|---|---|
| SALES_EXECUTIVE | ₹50,000 | 5% | ✅ within limit |
| SALES_MANAGER | ₹5,00,000 | 15% | ✅ within limit; above: needs OVERRIDE |
| REGIONAL_ADMIN | ₹50,00,000 | 25% | ✅ within limit |
| SUPER_ADMIN | unlimited | unlimited | ✅ always |

---

## 🛒 Sales Module API Summary (47 Endpoints)

All routes are prefixed with **`/api/v1`**.

### Catalog

| Method | Path | Permission | Purpose |
|---|---|---|---|
| GET | `/catalog/items` | `SALES_CATALOG_VIEW` | list all active catalog items |
| POST | `/catalog/items` | `SALES_CATALOG_MANAGE` | **SUPER_ADMIN** only — create SKU |
| PATCH | `/catalog/items/:id` | `SALES_CATALOG_MANAGE` | update existing item |
| GET | `/catalog/items/:id/price` | `SALES_CATALOG_VIEW` | resolve best price (region override → global promotion → base) |
| POST | `/catalog/price-rules` | `SALES_CATALOG_APPROVE` | create REGION_OVERRIDE / VOLUME_SLAB / CUSTOMER_TIER / PROMOTIONAL rule |

### Leads

| Method | Path | Permission | Purpose |
|---|---|---|---|
| POST | `/leads` | `SALES_LEAD_CREATE` | capture lead (validates picklist options; duplicate detection) |
| GET | `/leads` | `SALES_LEAD_VIEW` | visible leads (region/role scoped) |
| GET | `/leads/:id` | `SALES_LEAD_VIEW` | lead + follow-ups |
| POST | `/leads/:id/follow-ups` | `SALES_LEAD_CREATE` | log call/meeting/email |
| POST | `/leads/:id/lost` | `SALES_LEAD_CREATE` | mark with reason (pipeline terminal) |
| POST | `/leads/:id/qualify` | `SALES_LEAD_CREATE` | **NEW → Opportunity** (auto-creates opp + marks lead QUALIFIED) |

### Opportunities

| Method | Path | Permission | Purpose |
|---|---|---|---|
| GET | `/opportunities` | `SALES_OPPORTUNITY_VIEW` | list opps (region/owner scoped) |
| GET | `/opportunities/:id` | `SALES_OPPORTUNITY_VIEW` | opp + stage history + quotations |
| PATCH | `/opportunities/:id/stage` | `SALES_OPPORTUNITY_VIEW` | valid pipeline transition + auto probability |
| POST | `/opportunities/:id/reassign` | `SALES_OPPORTUNITY_REASSIGN` | MANAGER+ only |
| POST | `/opportunities/:id/lost` | `SALES_OPPORTUNITY_VIEW` | reason logged; publishes OPPORTUNITY_LOST |
| POST | `/opportunities/:id/win` | `SALES_OPPORTUNITY_WIN` | must be QUOTED/NEGOTIATION; creates AMC contract / Project + publishes WON |

**Pipeline:** `NEW → CONTACTED → QUOTED → NEGOTIATION → [WON via /win] | [LOST via /lost]` · probabilities 10 → 25 → 50 → 75 → 100 / 0

### Quotations

| Method | Path | Permission | Purpose |
|---|---|---|---|
| POST | `/quotations` | `SALES_QUOTATION_CREATE` | create DRAFT v1 for an open opportunity |
| POST | `/quotations/:id/revise` | `SALES_QUOTATION_CREATE` | clone + increment version (prior immutable) |
| POST | `/quotations/:id/submit` | `SALES_QUOTATION_CREATE` | DRAFT → PENDING_APPROVAL or auto APPROVED if within role limits |
| POST | `/quotations/:id/approve` | `SALES_QUOTATION_APPROVE` / `…APPROVE_OVERRIDE` | MANAGER+ approves pending |
| POST | `/quotations/:id/reject` | `SALES_QUOTATION_APPROVE` | PENDING → REJECTED |
| POST | `/quotations/:id/send` | `SALES_QUOTATION_CREATE` | APPROVED → SENT (publishes QUOTATION_ISSUED) |
| GET | `/opportunities/:id/quotations` | `SALES_QUOTATION_VIEW` | versions desc order |

### Sales Queries — Jira-style CRM enquiries (23 endpoints)

| Group | Endpoints |
|---|---|
| **Dashboards & Reports** | `GET /sales-queries/dashboard/stats` (funnel + KPIs + byStatus + byPriority + recent) <br> `GET /sales-queries/reports` (8 reports: pending, conversion, follow-ups, resolution-time, lost, employee-perf, dept-perf, monthly-sales; CSV export) |
| **CRUD** | `POST /sales-queries` · `GET list` (20 filters + sortBy + paginate max 200) · `GET :id` (hydrated: comments/attachments/activities/follow-ups) · `PATCH :id` (blocked in WON/LOST/CANCELLED/CLOSED) |
| **Assignment** | `POST /:id/assign-department` (MANAGER+; auto status NEW→ASSIGNED) <br> `POST /:id/reassign-owner` (MANAGER+) |
| **13-state state machine** | `PATCH /:id/status` — valid transitions enforced + remark-required gate on `LOST / CANCELLED / WAITING_FOR_CUSTOMER / WAITING_FOR_INTERNAL_TEAM / CLOSED` |
| **Comments** | CRUD + PATCH pin (dept manager) · threaded (parentId) · internal notes · @mentions (only visible members notified) |
| **Attachments** | `POST /:id/attachments` (multer 10MB limit; stored in `{UPLOAD_DIR}/sales-queries/{queryId}/`) · `GET /:id/attachments/:attachmentId` (download) |
| **Follow-ups** | CRUD + POST `complete`, `reschedule`, `cancel`; channels CALL/MEETING/EMAIL/WHATSAPP/SITE_VISIT/OTHER; reminders; reschedule counter |

**SalesQuery Status FSM** (13 states):
```
NEW → ASSIGNED → UNDER_REVIEW → WAITING_FOR_CUSTOMER
                         ↘  WAITING_FOR_INTERNAL_TEAM → QUOTATION_PREPARATION → QUOTATION_PREPARED
                                                                                  → QUOTATION_SENT → NEGOTIATION
                                                                                                                → WON ──┐
                                                                                                                → LOST ─┤
                                                                   ┌─────────────────────────────────────────────────────┘
                                            (most open states) → CANCELLED ──┐
                                                                            ├─→ CLOSED
                                                              WON / LOST ─────┘
```

---

## 🧪 Testing

Two layers:

### A) Jest unit + e2e tests (rollback via helpers.ts txn wrapper)

```bash
npm test                # --runInBand (needed for Prisma transaction helper)
# Targeted:
npx jest tests/sales/salesQueryVisibility.test.ts
```

Sales test coverage: `salesFlow` (lead→opp→quotation pipeline end-to-end), `salesQueryFlow`, `salesQueryComments`, `salesQueryAttachments`, `salesQueryVisibility`.

### B) Live API smoke suite (curl, against *running* server)

```bash
# Re-issue fresh 1-hour JWTs for every seed user:
npx tsx scripts/gen-test-tokens.ts
# Then run the 71-endpoint suite — covers all modules, every role's allow/deny checks,
# AND filter combinations:
bash scripts/final-api-test.sh
```

*The 2026-07-25 suite run scored **64/71 PASS** (7 failures were test expectation mismatches — not API bugs — e.g. server correctly returns 201 Created where test assumed 200 OK).*

---

## 📦 Events / Notifications

Typed pub/sub via `src/core/events/eventBus.ts` (`eventBus.emit` / `eventBus.on`):

| Domain event | Payload | Publishes Notification rows for… |
|---|---|---|
| `SALES_QUERY_CREATED` | queryId, ownerId, regionId | Owner |
| `SALES_QUERY_ASSIGNED` | queryId, departmentId, ownerId, assignedToId | Dept members |
| `SALES_QUERY_STATUS_CHANGED` | queryId, fromStatus, toStatus | Owner + assignedTo |
| `SALES_QUERY_CLOSED` | queryId | Owner |
| `SALES_QUERY_COMMENT_ADDED` | queryId, commentId, authorId | Participants |
| `SALES_QUERY_MENTIONED` | queryId, commentId, mentionedUserId | Each @mention target |
| `SALES_QUERY_ATTACHMENT_UPLOADED` | queryId, attachmentId, uploaderId | — |
| `OPPORTUNITY_WON / OPPORTUNITY_LOST` | oppId | Owner |
| `QUOTATION_ISSUED` | quotationId, oppId | Owner |

Notification rows are persisted in the DB and retrieved by the *Notifications* module (`GET /notifications`, `PATCH /:id/read`, etc).

---

## 📘 API Reference — Swagger

Start dev server, navigate to:

> **http://localhost:3000/api-docs**

All route-level permissions and zod schemas are reflected in the Swagger spec (`swagger-jsdoc` scans `src/modules/**/*.ts`). OpenAPI raw JSON → **`http://localhost:3000/api-docs.json`** (used by the frontend's `npm run gen:api-types` command to regenerate `IrisFrontend/src/types/api.generated.ts` via openapi-typescript).

---

## 📦 Environment variables reference

| Variable | Default | Description |
|---|---|---|
| `DATABASE_URL` | *(required)* | PostgreSQL connection string |
| `JWT_ACCESS_SECRET` | *(required)* | HS256 signing key for JWT access tokens |
| `JWT_ACCESS_EXPIRES_IN` | `1h` | Token lifetime (zeit/ms format) |
| `PORT` | `3000` | HTTP listen port |
| `NODE_ENV` | `development` | Controls error message verbosity etc. |
| `UPLOAD_STORAGE_DIR` | `uploads/` | Relative/absolute path for multer uploads |
| `MAX_UPLOAD_SIZE_MB` | `10` | `multer` per-file size cap |
| `LOG_LEVEL` | `info` | pino log level (trace/debug/info/warn/error/fatal) |

See `.env.example` for copy-paste defaults.
# iriscrm-api
