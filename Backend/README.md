# Splitzy Backend

The Splitzy API server: a Node.js + TypeScript + Express service that will
eventually power authentication, groups, expenses, settlements and more for
the Splitzy frontend.

**Current status: Task 5 — Groups API.** The backend foundation (Task 1), the
relational database schema (Task 2), the authentication identity layer
(Task 4), and the first business feature: a secure, tested Groups API with
membership and role management. Expenses, settlements, recurring expenses and
frontend↔backend integration are intentionally **not** implemented yet (see
[Task 5 Status](#task-5-status)).

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
│   │   ├── auth.ts              # requireAuth: Bearer + dev-only header path
│   │   └── groupAuthorization.ts# requireActor / loadGroupMembership / requireRole
│   ├── routes/
│   │   ├── index.ts             # /api/v1 route registry
│   │   ├── health.routes.ts     # Health routes
│   │   ├── auth.routes.ts       # /api/v1/auth routes (requireAuth)
│   │   └── groups.routes.ts     # /api/v1/groups routes (role policy)
│   ├── controllers/
│   │   ├── health.controller.ts # Request handlers
│   │   ├── auth.controller.ts   # GET /auth/me (never sees token internals)
│   │   └── groups.controller.ts # Thin Groups API handlers
│   ├── services/
│   │   ├── db.ts                # Shared lazy Prisma client singleton
│   │   ├── authService.ts       # THE only module that verifies tokens
│   │   ├── currentUserService.ts# Firebase UID → PostgreSQL User (+provisioning)
│   │   └── groups.service.ts    # Groups business rules + repository seam
│   ├── types/
│   │   ├── api.ts               # API response envelope types
│   │   ├── auth.ts              # VerifiedIdentity / PublicUser contracts
│   │   └── groups.ts            # Groups DTOs + request augmentation
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
│   ├── auth.test.ts             # Auth middleware/service/endpoint (no Firebase, no DB)
│   └── groups.test.ts           # Groups API: 38 scenarios (no Firebase, no DB)
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
  `CORS_ORIGIN=http://localhost:5173,https://app.splitzy.example`. Include
  **every** origin the frontend is served from — `localhost` and `127.0.0.1`
  are different origins for CORS, and a LAN (phone) origin must be listed
  explicitly too. `CORS_ORIGIN=*` is rejected by design; only explicit
  origins are allowed.

#### Port resolution (ambient PORT hazard)

The backend resolves its port in this order:

1. explicit `--port N` CLI flag;
2. `PORT` from this project's git-ignored `.env` file;
3. ambient `process.env.PORT`;
4. default `5000` (matches the frontend's default `VITE_API_BASE_URL`).

The project's own `.env` deliberately **beats** an ambient `PORT` inherited
from a parent shell: some shells export a generic `PORT` (e.g. `PORT=0`) to
every child process, which used to silently send the API to a random
ephemeral port while the frontend kept calling its fixed URL — every request
then failed as a network error. Invalid values fail fast at startup instead
of binding somewhere unexpected (`PORT=0` remains valid when chosen
explicitly).

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
| `npm run db:start` / `db:stop` / `db:status` | Manage the local portable PostgreSQL (Task 7) |
| `npm run db:migrate` | Deploy pending migrations to `DATABASE_URL` |
| `npm run db:verify` | Read-only schema verification against the real database |
| `npm run db:smoke` | End-to-end API smoke test against the real database |

### Local PostgreSQL development (Task 7)

The backend runs against a **real PostgreSQL** instance locally. Two options:

**Option 1 — bundled portable PostgreSQL (default, zero install).**
Official PostgreSQL 16.4 binaries live in `Backend/.postgres-local/`
(git-ignored; downloaded once from the official binary distribution used by
embedded-postgres). The cluster was initialized with a dedicated `splitzy`
superuser and a random password written straight into the git-ignored `Backend/.env`
— no credentials exist anywhere else.

```bash
npm run db:start      # start on 127.0.0.1:54329 (loopback only)
npm run db:status
npm run db:stop
```

Data persists in `.postgres-local/data`. Deleting that folder deletes the local
dev database (recreate by re-initializing and running `npm run db:migrate`).

**Option 2 — any existing PostgreSQL.** Point `DATABASE_URL` in `Backend/.env`
at your instance (use a dedicated database), then continue below. The
`.postgres-local` folder is optional and safe to delete.

Then, in both cases:

```bash
npm run db:migrate    # npx prisma migrate deploy — applies pending migrations
npx prisma migrate status
npm run db:verify     # read-only pg_catalog checks: tables/enums/FKs/uniques/money
npm run db:smoke      # full API smoke test against the real database (self-cleaning)
```

`db:smoke` boots the real app, exercises groups → memberships → expenses over
HTTP via the development-authentication path, asserts database state directly,
and deletes only the records it created (namespaced `dev-user-task7-*` and
`Task 7 ...`). No Firebase/Firebase Admin credentials are needed or used
locally — production Firebase configuration is a separate deployment task.

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

## Groups API (Task 5)

All routes require authentication (Firebase ID token in production,
`x-dev-user-id` in development). Authorization chain:

```
verified identity (req.auth)
  -> requireActor          find-or-provision PostgreSQL User  -> req.actor
  -> loadGroupMembership   GroupMember for :groupId           -> req.groupMembership
  -> requireRole(...)      GroupRole gate                     -> 403 if insufficient
```

Non-members and nonexistent groups receive the **same generic 404** — group
existence is never leaked to outsiders.

| Method & path | Role policy | Notes |
| :--- | :--- | :--- |
| `POST /api/v1/groups` | any authenticated user | Creator becomes `OWNER`; group + owner membership created in one transaction; 201 |
| `GET /api/v1/groups` | any authenticated user | Only groups the user has a membership row in; includes `viewerRole` + `memberCount` |
| `GET /api/v1/groups/:groupId` | any member | Full details incl. safe member list (no emails) |
| `PATCH /api/v1/groups/:groupId` | `OWNER`, `ADMIN` | Whitelisted fields only: `name`, `description`, `currencyCode`, `isRoommateGroup` |
| `POST /api/v1/groups/:groupId/leave` | any member | `OWNER` cannot leave (409) until ownership transfer exists; membership row only — group and financial records untouched |
| `POST /api/v1/groups/:groupId/members` | `OWNER`, `ADMIN` | Adds an existing internal user id as `MEMBER`; duplicate → 409; unknown user → 404 |
| `DELETE /api/v1/groups/:groupId/members/:userId` | `OWNER`, `ADMIN` | Owner can never be removed (409); an admin cannot remove another admin (403); deletes only the membership |
| `PATCH /api/v1/groups/:groupId/members/:userId/role` | `OWNER` only | `ADMIN` ⇄ `MEMBER` only; `OWNER` can never be assigned (400) |

Validation rules: name 1–60 chars (required on create), description ≤ 280
chars (optional), `currencyCode` must be one of INR/USD/EUR/GBP/JPY/AUD
(normalized to uppercase), `isRoommateGroup` boolean. Unknown/forbidden fields
(`id`, `ownerId`, `createdBy`, `role`, `createdAt`, ...) are never accepted as
input — identity and roles always derive from the verified context.

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

## Task 5 status

**Implemented:** the Groups API (create / list / details / update / leave /
add-member / remove-member / change-role) with database-backed role
authorization, generic-404 group isolation, transactional group creation,
safe member projections (no emails), whitelisted input validation, and 38
tests (no Firebase or database required).

**Not implemented (future tasks):** ownership transfer, email/link
invitations, group deletion, expenses/settlements/recurring APIs,
frontend↔backend integration, payments/UPI, subscriptions, notifications,
AI/OCR.

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

## Expenses API (Task 6)

All routes are nested under the Groups API (membership is the only way to
touch an expense) and require authentication. Authorization chain: verified
identity → PostgreSQL `User` (actor) → `GroupMember` → role / expense-creator
check. Non-members and unknown groups receive the same generic 404 — expense
group association can never be probed.

### Routes

| Route | Authorization |
| :--- | :--- |
| `POST /api/v1/groups/:groupId/expenses` | any group member; creator = authenticated user |
| `GET /api/v1/groups/:groupId/expenses` | any group member; own group only, newest `expenseDate` first |
| `GET /api/v1/groups/:groupId/expenses/:expenseId` | any group member; expense must belong to that group |
| `PATCH /api/v1/groups/:groupId/expenses/:expenseId` | creator OR group OWNER/ADMIN |
| `DELETE /api/v1/groups/:groupId/expenses/:expenseId` | creator OR group OWNER/ADMIN |

A plain `MEMBER` who is not the creator receives `403` on update/delete.

### Server-side split validation (never trust the client)

All monetary math is integer BigInt minor units. The server computes and
persists the split; client-supplied share amounts are never accepted.

- **EQUAL** — server divides `amountMinor` across the participants; the
  **last listed participant absorbs the rounding remainder**, so the sum is
  exactly the expense total.
- **PERCENTAGE** — percentages are **integer basis points** (1 bp = 0.01%,
  matching the schema's `Decimal(5,2)`); `"3300"` = 33.00%. The map keys are
  validated against group membership, the total must equal exactly 10 000 bp
  (99.99%/100.01% are rejected), and the participant with the largest
  percentage absorbs the rounding remainder.
- **ITEMIZED** — each item's `amountMinor` divides equally across its
  participants (last absorbs remainder, mirroring the frontend's `getShares`);
  item amounts must sum to the expense total exactly; one user MAY appear on
  several items (duplicates are rejected only within a single item); expense
  participants are derived from item shares.

For all types: at least one participant, every participant must currently be
a group member, duplicates rejected, `paidByUserId` must be a member.

### Money, currency, dates

- Amounts: **integer minor units** (`amountMinor`, string at the API edge;
  ₹100.50 → `"10050"`). Strict parsing: no floats, signs, leading zeros,
  zero, NaN/Infinity; ceiling 10¹⁵ minor units.
- Currencies: the same six as the Groups API (`INR USD EUR GBP JPY AUD`),
  and an expense's currency **must match the group's currency** (frontend
  always bills in `group.currency`; no conversion exists).
- `expenseDate` (user-selected, ISO date or date-time, 2000–2100) is distinct
  from `createdAt`/`updatedAt`, which clients can never set.
- Categories: the frontend's seven (`Food Travel Rent Utilities Shopping
  Entertainment Other`, case-insensitive input, stored canonical).
- Expenses carry **no payment-method field** (the frontend has none; only
  `Settlement` does).

### Transactional behavior

Create persists `Expense` + `ExpenseParticipant` (+ `ExpenseItem`/
`ExpenseItemParticipant`) in **one Prisma transaction**. Updates re-validate
the merged split (client values win, stored values fill gaps — a partial
split update can never produce an invalid state) and replace derived rows
wholesale in the same transaction; fields-only patches leave participants and
items untouched. Delete relies on the schema's CASCADE relations — no other
group data is affected.

### Testing / PostgreSQL status

63 dedicated scenarios (`tests/expenses.test.ts`) run the real HTTP chain
(auth → membership → role/creator policy → service) against injected
in-memory repositories — no Firebase or PostgreSQL needed. Live HTTP checks
(health, 401 guards on the new routes) run without a database; full
database-backed persistence remains untested locally because PostgreSQL is
not available in this environment (schema/migrations from Task 2/4 are
validated offline only).

## Task 6 status

Implemented: expense CRUD routes, membership-scoped authorization with
cross-group protection, server-side split validation and computation
(EQUAL/PERCENTAGE/ITEMIZED, integer minor units, deterministic remainder
rules), group-currency enforcement, transactional create/update/delete,
safe serialization (no emails/firebase UIDs/tokens), 63-test suite.

Not implemented (future tasks): frontend API integration, list filtering
(by participant/category), payment methods on expenses, settlements,
recurring expenses, invitations, notifications, currency conversion.

## Task 7 status

Implemented: real local PostgreSQL environment (portable official binaries,
git-ignored, dedicated `splitzy` role + database on 127.0.0.1:54329), migration
deployment (`20260918120000_init`, `20260919000000_add_firebase_identity`) to
the real database, idempotency re-check, read-only schema verification
(`scripts/verify-schema.ts`), and a self-cleaning end-to-end smoke suite
(`scripts/smoke-postgres.ts` — 79 checks over real HTTP + real PostgreSQL:
provisioning, groups, memberships, EQUAL/PERCENTAGE/ITEMIZED expenses, updates,
delete cascades, FK/RESTRICT/rollback behavior, isolation).

Real-database fix found during Task 7: expense create/update re-loaded the row
through the main Prisma client inside the transaction, which cannot see the
transaction's uncommitted writes — every transactional expense write would have
failed against PostgreSQL. The re-load now uses the transaction client
(`loadOneWith` in `src/services/expenses.service.ts`). The 122-test in-memory
suite and all builds remain green; frontend untouched.

Not implemented (future tasks): production Firebase deployment/Admin
credentials, frontend API integration, localStorage migration, settlements,
recurring scheduler, invitations, payments/UPI, notifications.

## Task 8 status — frontend ↔ backend integration foundation

The React frontend now consumes this API (see `Frontend/README.md`):

- `GET /api/v1/auth/me` — frontend bootstrap resolves the Firebase identity to
  the PostgreSQL User (backend-authoritative; the client never creates users).
- `GET/POST /api/v1/groups`, `GET/PATCH /api/v1/groups/:id` — group list,
  creation and detail are server-backed; the client sends only content fields
  (creator/OWNER/id/timestamps are server-assigned) and authenticates with the
  Firebase ID token (`Authorization: Bearer ...`).
- Identity model: **Firebase = authentication identity; PostgreSQL User =
  Splitzy application user; PostgreSQL Group = shared server-side group.**
- Group members stay server-authoritative; the frontend does not yet wire
  member mutations (its member UI names free-text locals — a later task maps
  real Splitzy user IDs). Expenses remain frontend-local (Task 8 scope).

No schema or backend-behavior changes were required: 122/122 backend tests,
`db:verify` (51 checks) and `db:smoke` (79 checks) all green.

## Task 9 status — complete server-backed expense integration

The frontend's expense system now runs entirely through this API (see
`Frontend/README.md`):

- `GET/POST /api/v1/groups/:groupId/expenses` and
  `GET/PATCH/DELETE .../expenses/:expenseId` — list, create, edit and delete
  are server-backed for server groups; the client sends only content fields
  (amounts as integer minor-unit strings, percentages as integer basis
  points) and never identity/creator fields.
- Split shares are **server-calculated** and authoritative: the client
  displays the `shareMinor` values from PostgreSQL as-is (deterministic
  remainder rules included) instead of re-deriving them.
- PATCH bodies are fields-only when the split is unchanged (participant/item
  rows are preserved), and carry the complete merged split when it changes.
- Saving is never optimistic: the UI updates only after the PostgreSQL-backed
  response arrives; failures keep the previous state and surface a safe
  message.
- Settlement "Settle" / recurring "Log monthly" / UPI "marked as settled"
  flows create real server expenses through the same endpoint.

Identity model now includes: **PostgreSQL Expense = shared server-side
expense; localStorage = read cache only (server data always wins).**

No schema changes were required: 122/122 backend tests, `db:verify`,
`db:smoke` (79 checks) and a 23-check live multi-user HTTP verification
(`scripts/task9-live-verify.mjs`, dev-auth, local only) all green.
