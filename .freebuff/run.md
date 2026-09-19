# Splitzy — Preview Run Doc

Run doc for this thread's live preview (Frontend dev server).

## Repo layout

- `Frontend/` — React + Vite (JavaScript/JSX), Firebase auth, Express/PostgreSQL API client
- `Backend/` — Node.js + TypeScript + Express + Prisma + PostgreSQL

## 1. Reproduce the uncommitted artifacts (fresh checkout / worktree)

All commands run from the **repo root** (`D:\PERSONAL PROJECTS\splitzy`).

1. **Copy env files from the main checkout** (never commit these; never symlink — ports may differ per worktree):
   - `Frontend/.env.local` — Vite env: `VITE_API_BASE_URL`, Firebase web config keys (`VITE_FIREBASE_*`).
   - `Backend/.env` — backend env: `DATABASE_URL` (local PostgreSQL), `PORT` (5000), Firebase Admin credentials for production-path verification.
2. **Install dependencies** with npm (the project's package manager — lockfiles `package-lock.json` in both apps):
   ```bash
   cd Frontend && npm install
   cd ../Backend && npm install
   ```
3. **Prisma client + schema** (Backend):
   ```bash
   cd Backend && npx prisma generate
   npx prisma validate
   ```
4. **PostgreSQL** — Task 7 portable setup lives in the Backend scripts:
   ```bash
   cd Backend && npm run db:start   # then: npm run db:status
   ```

If the working directory **is** the main checkout (as in this thread), steps 1 is already satisfied — the env files and `node_modules` are present.

## 2. Run the servers

1. **Backend** (API on port **5000**, must be up before the frontend is used):
   ```bash
   cd Backend && npx tsx src/server.ts
   ```
2. **Frontend dev server** — default Vite port **5173** if free; this thread's preview uses **5174** because the user's own dev server occupies 5173:
   ```bash
   cd Frontend && npm run dev -- --port 5174
   ```
   Detached start (Windows, from repo root):
   ```powershell
   powershell -NoProfile -Command "(Start-Process -FilePath 'npm.cmd' -ArgumentList 'run','dev','--','--port','5174' -WorkingDirectory 'D:\PERSONAL PROJECTS\splitzy\Frontend' -RedirectStandardOutput 'D:\PERSONAL PROJECTS\splitzy\.freebuff\preview-7bed454e-a159-40e1-930d-345a71310894.log' -RedirectStandardError 'D:\PERSONAL PROJECTS\splitzy\.freebuff\preview-7bed454e-a159-40e1-930d-345a71310894.log.err' -WindowStyle Hidden -PassThru).Id"
   ```
   (stdout and stderr MUST go to different files — PowerShell fails otherwise.)

## 3. Notes

- Preview URL: `http://localhost:5174` (pid recorded at registration; log: `.freebuff/preview-7bed454e-a159-40e1-930d-345a71310894.log[.err]`).
- Auth: real Firebase Google Sign-In in the UI; local API verification may use the backend's dev-auth header (`x-dev-user-id`, backend-only, production-blocked).
- Do not reset the database or delete migrations (Task 7 contract).
