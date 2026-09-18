# Splitzy Backend

The Splitzy API server: a Node.js + TypeScript + Express service that will
eventually power authentication, groups, expenses, settlements and more for
the Splitzy frontend.

**Current status: Task 4 — Backend user identity foundation.** The backend
foundation (Task 1), the relational database schema (Task 2), and the
authentication identity layer (Task 4): Firebase-token verification behind a
clean seam, a development-only auth path, first-login user provisioning and
the protected `GET /api/v1/auth/me` endpoint. Business features (groups,
expenses, settlements, recurring) and frontend↔backend integration are
intentionally **not** implemented yet (see [Task 4 Status](#task-4-status)).

## Technology stack

| Layer | Technology |
| :--- | :--- |
| Runtime | Node.js (>= 20) |
| Language | TypeScript (strict mode) |
| HTTP framework | Express 5 |
| ORM | Prisma 6 (PostgreSQL datasource) |
| Identity provider | Firebase Authentication (verified via `firebase-admin`) |
| Config | dotenv + validated environment module |
| CORS | cors middleware, explicit origin allow-list |
| Tests | Node.js built-in test runner (`node --test`) |

## Folder structure

```
Backend/
├── src/
│   ├── config/
│   │   └── env.ts               # Validated environment configuration
│   ├── controllers/
│   │   └── health.controller.ts # Request handlers
│   ├── middleware/
│   │   ├── requestLogger.ts     # Method/path/status/duration logging
│   │   ├── notFound.ts          # 404 JSON envelope
│   │   ├── errorHandler.ts      # Centralized error handling
│   │   └── auth.ts              # requireAuth: Bearer + dev-only header path
│   ├── routes/
│   │   ├── index.ts             # /api/v1 route registry
│   │   ├── health.routes.ts     # Health routes
│   │   └── auth.routes.ts       # /api/v1/auth routes (requireAuth)
│   ├── controllers/
│   │   ├── health.controller.ts # Request handlers
│   │   └── auth.controller.ts   # GET /auth/me (never sees token internals)
│   ├── services/
│   │   ├── db.ts                # Shared lazy Prisma client singleton
│   │   ├── authService.ts       # THE only module that verifies tokens
│   │   └── currentUserService.ts# Firebase UID → PostgreSQL User (+provisioning)
│   ├── types/
│   │   ├── api.ts               # API response envelope types
│   │   └── auth.ts              # VerifiedIdentity / PublicUser contracts
│   ├── utils/
│   │   └── appError.ts          # AppError class + error code registry
│   ├── app.ts                   # Express app factory (no port binding)
│   └── server.ts                # Entry point: env, listen, shutdown
├── prisma/
│   ├── schema.prisma            # Full relational schema (10 models, 5 enums)
│   └── migrations/              # 20260918120000_init, 20260919000000_add_firebase_identity
├── tests/
│   ├── health.test.ts           # Health / 404 / CORS / malformed JSON tests
│   ├── schema.test.ts           # Schema shape checks (no DB required)
│   └── auth.test.ts             # Auth middleware/service/endpoint (no Firebase, no DB)
├── .env.example                 # Environment template (copy to .env)
├── package.json
├── tsconfig.json
└── README.md
```

## Getting started

### 1. Install dependencies

```bash
cd Backend
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Then edit `.env` as needed. Available variables:

| Variable | Required | Default | Description |
| :--- | :--- | :--- | :--- |
| `PORT` | no | `5000` | HTTP port |
| `NODE_ENV` | no | `development` | `development` / `test` / `production` |
| `DATABASE_URL` | yes (for migrations) | — | PostgreSQL connection string |
| `CORS_ORIGIN` | no | `http://localhost:5173` | Comma-separated allowed origins |
| `FIREBASE_PROJECT_ID` | production only | — | Firebase project for ID-token verification (see below) |
| `GOOGLE_APPLICATION_CREDENTIALS` | production only | — | Service-account JSON path, or unset for ADC (see below) |

Notes:

- The HTTP server still starts successfully **without** a database; the Prisma
  client is created lazily. `DATABASE_URL` becomes required for migrations and
  for any future endpoint that queries data.
- `CORS_ORIGIN` accepts multiple comma-separated origins, e.g.
  `CORS_ORIGIN=http://localhost:5173,https://app.splitzy.example`.
- `CORS_ORIGIN=*` is rejected by design; only explicit origins are allowed.

### 3. Run the development server

```bash
npm run dev
```

Starts with file watching (tsx) on `http://localhost:5000`.

### 4. Build for production

```bash
npm run build
```

Compiles `src/` to `dist/` (tests are excluded from the build).

### 5. Run the production server

```bash
npm start
```

Runs the compiled `dist/server.js`.

### Other scripts

| Script | Purpose |
| :--- | :--- |
| `npm run typecheck` | Strict TypeScript check, no emit |
| `npm test` | Run the test suite (Node built-in runner) |
| `npm run prisma:validate` | Validate `prisma/schema.prisma` |
| `npm run prisma:generate` | (Re)generate the Prisma Client |

## Health endpoint

```bash
curl http://localhost:5000/api/v1/health
```

Response — HTTP 200:

```json
{
  "success": true,
  "service": "splitzy-api",
  "status": "healthy"
}
```

This endpoint only verifies that the API process is up. It does **not** touch
PostgreSQL.

## API conventions

- All endpoints live under `/api/v1`.
- Unknown routes return HTTP 404 with:

```json
{
  "success": false,
  "error": { "code": "NOT_FOUND", "message": "Route not found" }
}
```

- Unexpected errors return HTTP 500 with `INTERNAL_SERVER_ERROR`; stack traces
  and internal details are never exposed in production responses.
- Malformed JSON bodies return HTTP 400 with `VALIDATION_ERROR`.
- Request logging records method, path, status and duration only — never
  headers, bodies, tokens or credentials.

## Database architecture

PostgreSQL through Prisma. The schema in `prisma/schema.prisma` models the
concepts the existing Splitzy frontend already uses (groups, members, equal /
percentage / itemized splits, recurring bills, settlements, multi-currency)
as a proper normalized relational model — **not** a mirror of the localStorage
object shape.

### Money model (important)

- Every monetary value is stored as an **integer number of minor units** in a
  `BigInt` column with a `*Minor` suffix (`amountMinor`, `shareMinor`).
  Example: ₹100.50 → `10050` paise. There are **no floating-point money
  columns** anywhere in the schema.
- Currency is stored **alongside every amount** as a 3-letter ISO 4217 code
  (`currencyCode CHAR(3)` — INR, USD, EUR, GBP, JPY, AUD). JPY is zero-decimal,
  so its minor unit equals the yen.
- Currency conversion is deliberately **not** implemented at the database
  layer; it belongs to a future service task.

### Entities

| Model | Purpose |
| :--- | :--- |
| `User` | A Splitzy account (`firebaseUid` identity key, email, name, photoUrl, avatar, preferred currency, timezone) |
| `Group` | A bill-splitting group with an identifiable owner (`createdBy`) |
| `GroupMember` | User ↔ Group many-to-many join with a role |
| `Expense` | A shared expense; belongs to one group, paid by one user |
| `ExpenseParticipant` | Who owes how much for an expense |
| `ExpenseItem` | One itemized line of an expense (e.g. "Pizza ₹600") |
| `ExpenseItemParticipant` | A user's portion of a single item |
| `Settlement` | Money one member pays another — a first-class entity, **never** a fake expense |
| `RecurringExpense` | A repeating-expense template (rent, Wi-Fi) consumed by a future scheduler |
| `RecurringExpenseParticipant` | Participant config for a template, defined independently of any materialized expense |

### Enums

`GroupRole` (OWNER / ADMIN / MEMBER) · `SplitType` (EQUAL / PERCENTAGE /
ITEMIZED) · `SettlementStatus` (PENDING / COMPLETED / CANCELLED) ·
`PaymentMethod` (CASH / UPI / BANK_TRANSFER / OTHER) · `RecurringFrequency`
(DAILY / WEEKLY / MONTHLY / YEARLY).

Expense **categories** (Food, Travel, Rent, Utilities, Shopping,
Entertainment, Other — the frontend's set) are stored as plain text instead of
a database enum so adding a category never requires a destructive migration;
the allowed set is enforced in application code.

### IDs & timestamps

- All primary keys are **UUIDs generated by PostgreSQL**
  (`gen_random_uuid()`, built into PostgreSQL 13+) — no predictable sequential
  IDs on future public API resources.
- `createdAt` defaults to `now()`; `updatedAt` is maintained by Prisma
  (`@updatedAt`).

### Integrity rules & delete behavior

Delete behavior follows business meaning rather than a blanket CASCADE:

- **Cascade** (owned child data): group → its members/expenses/settlements/
  recurring expenses; expense → its participants/items; item → its item
  participants; user → their own membership rows.
- **Restrict**: a group's `createdBy` owner — a group can never lose its owner,
  so a user with owned groups cannot be deleted through the schema alone.
- **SetNull** (historical financial records): `Expense.paidBy`,
  `Expense.createdBy`, `Settlement.fromUser/toUser`, participant `user`s.
  Deleting a user nullifies attribution but **never silently destroys
  financial history**.

Other constraints: unique `User.firebaseUid` (identity key) and unique
`User.email`; unique `GroupMember (groupId, userId)` (no duplicate membership);
unique `(expenseId, userId)` and `(recurringExpenseId, userId)` participant
pairs; percentage columns are `Decimal(5,2)`; all monetary values are
non-negative integers by convention (enforced in services, documented here).

Indexes exist on every foreign key used for queries plus `Expense (groupId,
expenseDate)` for group feeds and `RecurringExpense.nextRunAt` for the future
scheduler.

### User identity & authentication (Task 4)

Firebase Authentication is the production identity provider:

```
Google -> Firebase Auth -> Firebase ID token
      -> Splitzy frontend (Authorization: Bearer <token>)
      -> Express auth middleware -> authService.verifyIdToken (Firebase Admin)
      -> VerifiedIdentity { firebaseUid, email?, displayName?, photoUrl? }
      -> currentUserService.findOrProvisionUser
      -> PostgreSQL User (internal id referenced by all app data)
```

- **`firebaseUid` is the identity key** (unique constraint). The internal
  `User.id` is what all application data references. Email is unique for data
  integrity but is **not** the identity key (emails can change; providers can
  multiply).
- **First-login provisioning**: a verified UID with no matching row creates a
  `User` from verified token claims only. Concurrent first logins race through
  `create`; the loser catches Prisma `P2002` and re-reads the winner's row —
  duplicates are impossible. Identity-derived empty fields are backfilled;
  user-editable profile fields (avatarId, currencyCode, timezone) are never
  overwritten by login.
- **Controllers never see tokens.** Verification is isolated in
  `src/services/authService.ts`; middleware attaches `req.auth` (a
  `VerifiedIdentity`). Client-supplied `userId`/`email`/`displayName` outside
  the token are never trusted.

#### Development authentication (never in production)

With `NODE_ENV` set to anything other than `production`, requests may
authenticate by sending the explicit header

```
x-dev-user-id: <any-firebase-uid-shaped-string>
```

which asserts a Firebase UID **without verification** — enough to exercise
provisioning and endpoints locally and in tests before Firebase exists. The
header is ignored completely when `NODE_ENV=production`: those requests must
present a real Firebase ID token.

#### Production configuration (deploy time — never committed)

| Variable | Purpose |
| :--- | :--- |
| `FIREBASE_PROJECT_ID` | Firebase project identifier used by Admin verification |
| `GOOGLE_APPLICATION_CREDENTIALS` | Path to service-account JSON, or unset to use Application Default Credentials |

Protected endpoint:

```bash
# Development, before Firebase exists:
curl -H "x-dev-user-id: dev-uid-1" http://localhost:5000/api/v1/auth/me

# Production (once deployed with credentials):
curl -H "Authorization: Bearer <FIREBASE_ID_TOKEN>" https://api.example.com/api/v1/auth/me
```

Response — HTTP 200:

```json
{
  "success": true,
  "data": {
    "id": "2f0c…",
    "firebaseUid": "dev-uid-1",
    "email": "user@users.splitzy.local",
    "displayName": "Splitzy User",
    "photoUrl": null
  }
}
```

Unauthenticated requests receive `401 { "error": { "code": "UNAUTHORIZED" } }`.
The response never contains tokens, credentials or internal auth config.

### Migrations

Migrations live in `prisma/migrations/`:

- `20260918120000_init` — 10 tables, 5 enums, 27 indexes (Task 2).
- `20260919000000_add_firebase_identity` — `User.firebaseUid` (unique) and
  `User.photoUrl` (Task 4).

Apply them to a provisioned database with:

```bash
npx prisma migrate deploy     # apply existing migrations (CI/production)
# or, during local development:
npx prisma migrate dev        # also detects schema drift
```

## Task 4 status

**Implemented:** `User.firebaseUid` (unique identity key) + `User.photoUrl`,
Firebase Admin verification seam (`src/services/authService.ts`), `requireAuth`
middleware with the dev-only `x-dev-user-id` path, race-safe first-login
provisioning (`currentUserService`), protected `GET /api/v1/auth/me`, offline
generated migration, 11 auth tests (no Firebase or database required).

**Not implemented (future tasks):** frontend↔backend auth integration (the
frontend still uses Firebase directly from Task 3 and does not call `/auth/me`),
groups/expenses/settlements/recurring APIs and services, invitation flows,
payment processing, UPI integration, subscriptions, notifications, AI/OCR,
recurring scheduler, seed data, Android packaging.

A **seed script** is documented as a future task, not built: no fake
users/groups/expenses are created automatically.

When future systems are added, they should reuse the existing foundations:
`AppError` + error codes for failures, the `ApiSuccessBody`/`ApiFailureBody`
envelopes for responses, `requireAuth` + `req.auth` for protected routes, the
route registry in `src/routes/index.ts`, and the shared Prisma client from
`src/services/db.ts`.
