# Splitzy Frontend

React + Vite (JavaScript/JSX) mobile-style app with a claymorphism design
system. Authentication is real Firebase (Google Sign-In); groups are backed by
the Splitzy Express/PostgreSQL API (Task 8). Expenses and other features remain
local (localStorage) until their dedicated integration tasks.

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
        ↓
groupMapper.js → the existing UI's group shape
```

- **Firebase = authentication identity** (who you are).
- **PostgreSQL User = the Splitzy application user** (created by the backend on
  first `/auth/me`; the frontend never creates or assigns it).
- **PostgreSQL Group = the shared server-side group** (creator, OWNER
  membership, ids and timestamps are decided by the server).

### Data precedence (Task 8 contract)

```
Server group data > local cached group data
```

Groups loaded from the API are authoritative; localStorage holds only a
read cache for first paint. Local twins of server groups are dropped on sync,
so there is never a second source of truth for the same group. Expenses,
recurring expenses and settlements remain local until their integration tasks.

### Server-backed vs still-local

| Operation | Source |
| :--- | :--- |
| Group list / create / detail | **Server** (`groupsService.js`) |
| Group metadata (name/description/currency) | Server-authoritative |
| Group members (identity, roles) | Server (member *edits* are not wired yet — the UI names free-text members, the backend needs real user IDs) |
| Expenses, recurring, settlements | Local (`localStorage`) until later tasks |

## Local development startup order

1. **Backend + database** (see `Backend/README.md`):
   `npm run db:start` → `npm run db:migrate` → `npm run dev` (port 5000).
2. **Frontend**: `npm run dev` (port 5173) with `VITE_API_BASE_URL=http://localhost:5000`.
3. **Firebase**: sign-in requires the project's Web App config in `.env.local`.
   Without real Firebase credentials, sign-in cannot run; the API itself can
   still be exercised with the backend's development-only auth header
   (never enabled in production).

## Tests

```bash
npm test       # node --test over tests/*.test.js (Firebase & fetch mocked)
npm run build
```
