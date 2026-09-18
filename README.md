# splitzy

Splitzy is a mobile-first expense splitting app: track group expenses, split bills, simplify debts, and settle up.

## Repository layout

| Directory | Description |
| :--- | :--- |
| `Frontend/` | React + Vite SPA (completed prototype) |
| `Backend/` | Node.js + TypeScript + Express API (Task 1: foundation) |

## Frontend

Completed React/Vite prototype — see `Frontend/architecture.md` and `Frontend/design.md`.

```bash
cd Frontend
npm install
npm run dev      # http://localhost:5173
npm run build
```

## Backend

Node.js + TypeScript + Express + Prisma foundation (Task 1). The API currently exposes `GET /api/v1/health`; database models, authentication, and business features come in later tasks.

```bash
cd Backend
npm install
cp .env.example .env
npm run dev      # http://localhost:5000
```

See `Backend/README.md` for full documentation.

## Current status

- **CURRENT — Frontend:** React/Vite SPA prototype, fully client-side (localStorage persistence). No live API integration yet.
- **CURRENT — Backend foundation (Task 1):** Node/TypeScript/Express with a health endpoint, validated env config, CORS allow-list, structured error handling, and request logging.
- **NEW — Database (Task 2):** PostgreSQL + Prisma relational schema (10 models — users, groups, members, expenses, participants, itemized items, settlements, recurring expenses — 5 enums, indexes, constraints) with initial migration. Money is stored as integer minor units (`amountMinor` BigInt) with a 3-letter currency code alongside. No authentication, API endpoints, or business services yet — those are future tasks.
