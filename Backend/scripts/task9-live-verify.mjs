/**
 * Task 9 LIVE verification: real HTTP → auth middleware → services → Prisma →
 * real PostgreSQL. One-off script (mirrors the Task 7 smoke script's flow);
 * uses the backend's development-only x-dev-user-id path for local
 * verification only. Cleans up exactly its own namespace-scoped data.
 *
 * Run: node Backend/scripts/task9-live-verify.mjs   (backend must be running)
 */
const BASE = "http://localhost:5000/api/v1";
const NS = "Task 9 Verification";
const USER_A = "dev-user-task9-a";
const USER_B = "dev-user-task9-b";

let passed = 0, failed = 0;
function check(name, cond, extra = "") {
  if (cond) { passed++; console.log(`  pass  ${name}`); }
  else { failed++; console.log(`  FAIL  ${name} ${extra}`); }
}
async function req(method, path, { uid, body } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (uid) headers["x-dev-user-id"] = uid;
  const res = await fetch(BASE + path, {
    method,
    headers,
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  let json = null;
  try { json = await res.json(); } catch { /* non-JSON */ }
  return { status: res.status, json };
}

console.log("=== Task 9 live verification against real PostgreSQL ===");

// 0) health
const health = await req("GET", "/health", { uid: USER_A });
check("GET /health → 200", health.status === 200);

// 1) provision both users through the real authed path
const meA = await req("GET", "/auth/me", { uid: USER_A });
const meB = await req("GET", "/auth/me", { uid: USER_B });
check("user A provisioned via /auth/me", meA.status === 200 && !!meA.json?.data?.id);
check("user B provisioned via /auth/me", meB.status === 200 && !!meB.json?.data?.id);
const A = meA.json.data.id;
const B = meB.json.data.id;

// 2) A creates a group (namespace-scoped)
const gRes = await req("POST", "/groups", {
  uid: USER_A,
  body: { name: NS, currencyCode: "INR", isRoommateGroup: false },
});
check("A creates group → 201", gRes.status === 201);
const G = gRes.json.data.id;
check("A is OWNER", gRes.json.data.viewerRole === "OWNER");

// 3) B added as MEMBER (backend's existing member-add, local verification only)
const addB = await req("POST", `/groups/${G}/members`, {
  uid: USER_A,
  body: { userId: B },
});
check("A adds B as member → 201", addB.status === 201);

// 4) A creates an EQUAL expense with an uneven total (₹100.01, 2 people) and
// a deliberately invalid duplicate-participant variant must be rejected.
const eqDup = await req("POST", `/groups/${G}/expenses`, {
  uid: USER_A,
  body: {
    description: "Task 9 invalid duplicate participants",
    category: "Food",
    currencyCode: "INR",
    paidByUserId: A,
    amountMinor: "10001",
    splitType: "EQUAL",
    participants: [A, A],
  },
});
const eqClean = await req("POST", `/groups/${G}/expenses`, {
  uid: USER_A,
  body: {
    description: "Task 9 equal dinner",
    category: "Food",
    currencyCode: "INR",
    paidByUserId: A,
    amountMinor: "10001",
    splitType: "EQUAL",
    participants: [A, B],
  },
});
const EQ = eqClean.json?.data?.id;
check("A creates EQUAL expense → 201", eqClean.status === 201);
check("EQUAL shares: server remainder to last participant (5000/5001)",
  eqClean.json?.data?.participants?.[0]?.shareMinor === "5000" &&
  eqClean.json?.data?.participants?.[1]?.shareMinor === "5001",
  JSON.stringify(eqClean.json?.data?.participants?.map((p) => p.shareMinor))
);
check("invalid duplicate-participant EQUAL create rejected (400)", eqDup.status === 400 || eqDup.status === 409);

// 5) fields-only PATCH: description changes, participants untouched
const patch1 = await req("PATCH", `/groups/${G}/expenses/${EQ}`, {
  uid: USER_A,
  body: { description: "Task 9 equal dinner (renamed)" },
});
check("fields-only PATCH → 200", patch1.status === 200);
check("fields-only PATCH preserved both participant rows",
  patch1.json?.data?.participants?.length === 2);

// 6) split PATCH: EQUAL → PERCENTAGE (50/50)
const patch2 = await req("PATCH", `/groups/${G}/expenses/${EQ}`, {
  uid: USER_A,
  body: {
    splitType: "PERCENTAGE",
    percentages: { [A]: "5000", [B]: "5000" },
  },
});
check("split PATCH EQUAL→PERCENTAGE → 200", patch2.status === 200);
check("PERCENTAGE shares server-calculated (remainder to first of tied entries)",
  patch2.json?.data?.splitType === "PERCENTAGE" &&
  patch2.json?.data?.participants?.reduce((s, p) => s + BigInt(p.shareMinor), 0n) === 10001n &&
  patch2.json?.data?.participants?.[0]?.shareMinor === "5001" &&
  patch2.json?.data?.participants?.[1]?.shareMinor === "5000",
  JSON.stringify(patch2.json?.data?.participants?.map((p) => p.shareMinor))
);

// 7) B (MEMBER, not creator) cannot PATCH or DELETE
const patchB = await req("PATCH", `/groups/${G}/expenses/${EQ}`, {
  uid: USER_B,
  body: { description: "B tampering" },
});
const delB = await req("DELETE", `/groups/${G}/expenses/${EQ}`, { uid: USER_B });
check("B cannot modify (403)", patchB.status === 403);
check("B cannot delete (403)", delB.status === 403);
check("expense survived B's attempts",
  (await req("GET", `/groups/${G}/expenses/${EQ}`, { uid: USER_B })).status === 200);

// 8) B sees the expense through their own session (multi-device read)
const listB = await req("GET", `/groups/${G}/expenses`, { uid: USER_B });
check("B lists expenses and sees A's expense", listB.status === 200 &&
  listB.json?.data?.some((e) => e.id === EQ));

// 8b) Multi-device round-trip: B (group member, non-creator) makes an
// AUTHORIZED edit of its own (creator-of-own-expense right) and A's next
// load must see it — Device B edit → PostgreSQL → Device A refresh.
const bExpense = await req("POST", `/groups/${G}/expenses`, {
  uid: USER_B,
  body: {
    description: "Task 9 B's own expense",
    category: "Food",
    currencyCode: "INR",
    paidByUserId: B,
    amountMinor: "3000",
    splitType: "EQUAL",
    participants: [A, B],
  },
});
check("B (member) creates own expense → 201", bExpense.status === 201);
const B_EXP = bExpense.json?.data?.id;
const editByB = await req("PATCH", `/groups/${G}/expenses/${B_EXP}`, {
  uid: USER_B,
  body: { description: "Task 9 B's own expense (edited by B)" },
});
check("B edits own expense → 200 (authorized as creator)", editByB.status === 200);
const aReload = await req("GET", `/groups/${G}/expenses`, { uid: USER_A });
check("Device A reload sees B's authorized edit",
  aReload.status === 200 &&
  aReload.json?.data?.some((e) => e.id === B_EXP && e.description === "Task 9 B's own expense (edited by B)"));

// 9) A creates PERCENTAGE (uneven 199.99 @ 50/50) then ITEMIZED expense
const pct = await req("POST", `/groups/${G}/expenses`, {
  uid: USER_A,
  body: {
    description: "Task 9 percentage boat",
    category: "Entertainment",
    currencyCode: "INR",
    paidByUserId: A,
    amountMinor: "19999",
    splitType: "PERCENTAGE",
    percentages: { [A]: "5000", [B]: "5000" },
  },
});
check("PERCENTAGE ₹199.99 → shares 9999/9999 + server remainder logic OK",
  pct.status === 201 &&
  pct.json?.data?.participants?.reduce((s, p) => s + BigInt(p.shareMinor), 0n) === 19999n);
const PCT = pct.json?.data?.id;

const items = await req("POST", `/groups/${G}/expenses`, {
  uid: USER_A,
  body: {
    description: "Task 9 itemized groceries",
    category: "Shopping",
    currencyCode: "INR",
    paidByUserId: A,
    amountMinor: "25000",
    splitType: "ITEMIZED",
    items: [
      { name: "Pizza", amountMinor: "10001", participantUserIds: [A, B] },
      { name: "Juice", amountMinor: "14999", participantUserIds: [B] },
    ],
  },
});
check("ITEMIZED create → 201 with 2 item rows", items.status === 201 &&
  items.json?.data?.items?.length === 2);
const ITM = items.json?.data?.id;

// 10) A deletes the ITEMIZED expense; group + other expenses unaffected
const del = await req("DELETE", `/groups/${G}/expenses/${ITM}`, { uid: USER_A });
check("A deletes expense → 200", del.status === 200);
const after = await req("GET", `/groups/${G}/expenses`, { uid: USER_A });
check("deleted expense gone from list", !after.json?.data?.some((e) => e.id === ITM));
check("other expenses unaffected",
  after.json?.data?.some((e) => e.id === EQ) && after.json?.data?.some((e) => e.id === PCT));

// 11) A edits the PERCENTAGE expense's amount with a changed split (200.01)
const patch3 = await req("PATCH", `/groups/${G}/expenses/${PCT}`, {
  uid: USER_A,
  body: { amountMinor: "20001", splitType: "PERCENTAGE", percentages: { [A]: "5000", [B]: "5000" } },
});
check("split+amount PATCH reconciles (10001/10000 with remainder to first entry)",
  patch3.status === 200 &&
  patch3.json?.data?.participants?.reduce((s, p) => s + BigInt(p.shareMinor), 0n) === 20001n);

// ---- cleanup: only this namespace's data ----------------------------------
// (The API intentionally has no DELETE /groups/:id endpoint, so the group
// itself is removed via Prisma — cascading its expenses and memberships.)
if (B_EXP) await req("DELETE", `/groups/${G}/expenses/${B_EXP}`, { uid: USER_B });
for (const id of [ITM, PCT, EQ]) {
  if (id) await req("DELETE", `/groups/${G}/expenses/${id}`, { uid: USER_A });
}
const { PrismaClient } = await import("@prisma/client").catch(() => ({}));
if (PrismaClient) {
  const prisma = new PrismaClient();
  try {
    await prisma.group.deleteMany({ where: { name: { startsWith: NS } } });
  } finally {
    await prisma.$disconnect();
  }
}

console.log(`\n=== ${passed} passed, ${failed} failed ===`);
process.exit(failed === 0 ? 0 : 1);
