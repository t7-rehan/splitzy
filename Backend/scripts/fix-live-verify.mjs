/**
 * Connection-fix LIVE verification (blank screen + broken connection task).
 * Real HTTP → CORS → auth middleware → services → Prisma → real PostgreSQL.
 * Uses the backend's development-only x-dev-user-id path (local verification
 * only) and cleans up exactly its own namespace-scoped data.
 *
 * Run: node scripts/fix-live-verify.mjs   (from Backend/, server running)
 */
const BASE = "http://localhost:5000/api/v1";
const NS = "Connection Fix Verification";
const USER_A = "dev-user-fix-a";

let passed = 0, failed = 0;
function check(name, cond, extra = "") {
  if (cond) { passed++; console.log(`  pass  ${name}`); }
  else { failed++; console.log(`  FAIL  ${name} ${extra}`); }
}
async function req(method, path, { uid, body, origin } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (uid) headers["x-dev-user-id"] = uid;
  if (origin) headers["Origin"] = origin;
  const res = await fetch(BASE + path, {
    method,
    headers,
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  let json = null;
  try { json = await res.json(); } catch { /* non-JSON */ }
  return { status: res.status, json, headers: res.headers };
}

console.log("=== Connection-fix live verification (real PostgreSQL) ===");

// 1) health
const health = await req("GET", "/health");
check("GET /health → 200", health.status === 200);

// 2) CORS allows the frontend origins (5173 AND the 5174 preview origin)
for (const origin of ["http://localhost:5173", "http://localhost:5174", "http://127.0.0.1:5173"]) {
  const probe = await req("GET", "/health", { origin });
  check(
    `CORS allows ${origin}`,
    probe.headers.get("access-control-allow-origin") === origin,
    `got ${probe.headers.get("access-control-allow-origin")}`,
  );
}
const preflight = await fetch(BASE + "/groups", {
  method: "OPTIONS",
  headers: { "Origin": "http://localhost:5174", "Access-Control-Request-Method": "POST" },
});
check(
  "CORS preflight (POST from 5174) OK",
  preflight.status < 400 &&
    preflight.headers.get("access-control-allow-origin") === "http://localhost:5174",
  `status ${preflight.status}`,
);

// 3) provision the user through the real authed path
const me = await req("GET", "/auth/me", { uid: USER_A });
check("user provisioned via /auth/me", me.status === 200 && !!me.json?.data?.id);
const A = me.json.data.id;

// 4) create a group (the exact flow that failed in the browser)
const gRes = await req("POST", "/groups", {
  uid: USER_A,
  body: { name: NS, currencyCode: "INR", isRoommateGroup: true },
});
check("POST /groups → 201", gRes.status === 201, `got ${gRes.status}`);
const G = gRes.json?.data?.id;
check("creator is OWNER in response", gRes.json?.data?.viewerRole === "OWNER");

// 5–8) PostgreSQL persistence + list + detail + refresh semantics
if (G) {
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();
  try {
    const row = await prisma.group.findUnique({
      where: { id: G },
      include: { members: true },
    });
    check("group row exists in PostgreSQL", !!row);
    check(
      "creator has an OWNER GroupMember row",
      row?.members.some((m) => m.userId === A && m.role === "OWNER") === true,
    );
  } finally {
    await prisma.$disconnect();
  }

  const list = await req("GET", "/groups", { uid: USER_A });
  check(
    "group appears in GET /groups",
    Array.isArray(list.json?.data) && list.json.data.some((g) => g.id === G),
  );

  const detail = await req("GET", `/groups/${G}`, { uid: USER_A });
  check("GET /groups/:id → 200 (open group)", detail.status === 200);
  check(
    "detail members include the OWNER viewer",
    Array.isArray(detail.json?.data?.members) &&
      detail.json.data.members.some((m) => m.role === "OWNER"),
  );

  const again = await req("GET", `/groups/${G}`, { uid: USER_A });
  check("detail still loads on re-fetch (refresh)", again.status === 200 && again.json?.data?.id === G);

  // cleanup: exactly this script's data
  const prisma2 = new (await import("@prisma/client")).PrismaClient();
  try {
    await prisma2.groupMember.deleteMany({ where: { groupId: G } });
    await prisma2.group.delete({ where: { id: G } });
    console.log("  cleanup: verification group removed");
  } finally {
    await prisma2.$disconnect();
  }
}

console.log(`\n=== ${passed} passed, ${failed} failed ===`);
process.exit(failed > 0 ? 1 : 0);
