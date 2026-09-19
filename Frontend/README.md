# Splitzy Frontend

React + Vite (JavaScript/JSX) mobile-style app with a claymorphism design
system. Authentication is real Firebase (Google Sign-In); groups and
expenses are backed by the Splitzy Express/PostgreSQL API (Tasks 8–9).
Recurring scheduling, settlements as transactions, payments and other
features remain local until their dedicated integration tasks.

## Getting started

```bash
npm install
cp .env.example .env.local   # then fill in the values
npm run dev                  # http://localhost:5173
```

Environment variables (`VITE_*` are build-time public by design):

| Variable | Purpose |
| :--- | :--- |
| `VITE_API_BASE_URL` | Backend base URL, e.g. `http://localhost:5000` (backend default port) |
| `VITE_FIREBASE_*` | Firebase **Web App** config (public client configuration, not secrets) |

## How the frontend talks to the backend

```
Firebase authentication (Google)
        ↓  Firebase ID token (getIdToken)
services/apiClient.js  →  Authorization: Bearer <token>
        ↓
Express requireAuth → Firebase Admin verification
        ↓
PostgreSQL User  →  GET /api/v1/auth/me  (bootstrapService.js)
PostgreSQL Groups →  GET/POST /api/v1/groups...  (groupsService.js)
PostgreSQL Expenses → /api/v1/groups/:id/expenses...  (expensesService.js)
        ↓
groupMapper.js / expenseMapper.js → the existing UI's shapes
```

- **Firebase = authentication identity** (who you are).
- **PostgreSQL User = the Splitzy application user** (created by the backend on
  first `/auth/me`; the frontend never creates or assigns it).
- **PostgreSQL Group = the shared server-side group** (creator, OWNER
  membership, ids and timestamps are decided by the server).
- **PostgreSQL Expense = the shared server-side expense** (split shares are
  calculated by the server in integer minor units and displayed as-is).

### Data precedence (Tasks 8–9 contract)

```
Server group data  > local cached group data
Server expense data > local cached expense data
```

Groups and expenses loaded from the API are authoritative; localStorage holds
only a read cache for first paint. Local twins of server groups/expenses are
dropped on sync, so there is never a second source of truth for the same data.
Expense saving is never optimistic: the modal stays open until PostgreSQL
confirms, and the server response (its calculated shares) enters app state.
Recurring scheduling, settlement transaction records and payments remain local
until their integration tasks.

### Server-backed vs still-local

| Operation | Source |
| :--- | :--- |
| Group list / create / detail | **Server** (`groupsService.js`) |
| Group metadata (name/description/currency) | Server-authoritative |
| Group members (identity, roles) | Server (member *edits* are not wired yet — the UI names free-text members, the backend needs real user IDs) |
| Expense list / create / edit / delete | **Server** (`expensesService.js`) — server-calculated shares are authoritative |
| Recurring *scheduling*, settlement transaction records, UPI payment | Local until later tasks (a settlement/log action creates a real server expense) |
| Money display precision | Server shares arrive as integer minor units and are converted at exactly one boundary (`expenseMapper.js`) |

## Local development startup order

1. **Backend + database** (see `Backend/README.md`):
   `npm run db:start` → `npm run db:migrate` → `npm run dev` (port 5000).
2. **Frontend**: `npm run dev` (port 5173) with `VITE_API_BASE_URL=http://localhost:5000`.
3. **Firebase**: sign-in requires the project's Web App config in `.env.local`.
   Without real Firebase credentials, sign-in cannot run; the API itself can
   still be exercised with the backend's development-only auth header
   (never enabled in production).

### Device (phone) development

`localhost` on the phone is the phone itself. To test on a device:

1. Start Vite exposed on the LAN: `npm run dev -- --host`.
2. Set `VITE_API_BASE_URL=http://<computer-LAN-IP>:5000` in `.env.local`
   (the backend listens on `0.0.0.0`, so it is LAN-reachable).
3. Add the frontend's exact LAN origin (e.g. `http://192.168.x.x:5173`) to
   the backend's `CORS_ORIGIN` list — CORS treats every origin separately.
4. Keep the Firebase authorized-domain requirements in mind for the domain
   you open the app from.

Never commit a machine-specific IP to `.env.example` or source — the LAN
value is a local `.env.local` setting.

## Tests

```bash
npm test       # node --test over tests/*.test.js (Firebase & fetch mocked)
npm run build
```

Current suite: 88 tests (Task 8 auth/api/groups, Task 9 expense service,
mapper and integration flows, plus the connection/blank-screen/create-group
regression suites).
