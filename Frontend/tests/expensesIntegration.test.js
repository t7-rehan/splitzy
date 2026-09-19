/**
 * Unit + integration tests for the Task 9 server-backed expense integration.
 *
 * The network and the Firebase token provider are mocked at module boundaries
 * (same approach as the Task 8 tests): global fetch is replaced wholesale and
 * apiClient's token provider is stubbed, so these tests exercise the real
 * service/mapper logic without Firebase or PostgreSQL.
 *
 * Run: npm test  (from Frontend/)
 */
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it, mock } from "node:test";

const apiClient = await import("../src/services/apiClient.js");
const {
  fetchGroupExpenses,
  fetchExpenseDetails,
  createExpense,
  updateExpense,
  deleteExpense,
} = await import("../src/services/expensesService.js");
const {
  splitTypeToApi,
  splitTypeFromApi,
  toApiMinorUnits,
  fromApiMinorUnits,
  percentToBasisPoints,
  percentageStringToPercent,
  buildExpenseApiPayload,
  buildExpensePatchPayload,
  mapExpenseFromApi,
  mapExpensesFromApi,
  mergeServerAndLocalExpenses,
  splitFingerprint,
} = await import("../src/services/expenseMapper.js");

const fetchMock = mock.fn();
globalThis.fetch = fetchMock;

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  };
}

function route(routes) {
  fetchMock.mock.mockImplementation((url, init = {}) => {
    const method = init.method || "GET";
    const hit = routes.find((r) => r.match(method, url));
    if (!hit) {
      return Promise.resolve(
        jsonResponse(404, { success: false, error: { code: "NOT_FOUND", message: "no route" } })
      );
    }
    return Promise.resolve(hit.respond());
  });
}

const MY_ID = "11111111-1111-4111-8111-111111111111";
const MEMBER_B_ID = "22222222-2222-4222-8222-222222222222";
const MEMBER_C_ID = "33333333-3333-4333-8333-333333333333";
const GROUP_ID = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa";
const EXPENSE_ID = "eeeeeeee-1111-4111-8111-eeeeeeeeeeee";

/** The frontend group shape the mapper produces (Task 8) + server member ids. */
const GROUP = {
  id: GROUP_ID,
  name: "Goa Trip",
  currency: "INR",
  isServerGroup: true,
  members: [
    { id: "you", name: "User A", role: "OWNER", userId: MY_ID },
    { id: MEMBER_B_ID, name: "User B", role: "MEMBER", userId: MEMBER_B_ID },
    { id: MEMBER_C_ID, name: "User C", role: "MEMBER", userId: MEMBER_C_ID },
  ],
  expenses: [],
};

const MY_OPTIONS = { myUserId: MY_ID };

/** Backend PublicExpense DTO: EQUAL, ₹100.01 over you + B (B last → remainder). */
const EQUAL_DTO = {
  id: EXPENSE_ID,
  groupId: GROUP_ID,
  description: "Dinner",
  category: "Food",
  amountMinor: "10001",
  currencyCode: "INR",
  splitType: "EQUAL",
  expenseDate: "2026-09-19T19:30:00.000Z",
  createdAt: "2026-09-19T19:31:00.000Z",
  updatedAt: "2026-09-19T19:31:00.000Z",
  paidBy: { userId: MY_ID, displayName: "User A" },
  createdBy: { userId: MY_ID, displayName: "User A" },
  participants: [
    { userId: MY_ID, displayName: "User A", shareMinor: "5000", percentage: null },
    { userId: MEMBER_B_ID, displayName: "User B", shareMinor: "5001", percentage: null },
  ],
  items: [],
};

beforeEach(() => {
  fetchMock.mock.resetCalls();
  apiClient.setApiTokenProvider(() => Promise.resolve("fake-id-token"));
});

afterEach(() => {
  apiClient.clearApiTokenProvider();
});

// ---------------------------------------------------------------------------
// Money conversion boundary
// ---------------------------------------------------------------------------

describe("money conversion (the single float→integer boundary)", () => {
  it("converts major units to exact minor-unit strings", () => {
    assert.equal(toApiMinorUnits(100.01), "10001");
    assert.equal(toApiMinorUnits(0.01), "1");
    assert.equal(toApiMinorUnits(100), "10000");
    assert.equal(toApiMinorUnits(199.99), "19999");
    assert.equal(toApiMinorUnits(0.1 + 0.2), "30"); // float noise must not leak
    assert.equal(toApiMinorUnits(1234.5), "123450");
  });

  it("rejects invalid amounts (never fabricates a value)", () => {
    assert.equal(toApiMinorUnits(-1), null);
    assert.equal(toApiMinorUnits(NaN), null);
    assert.equal(toApiMinorUnits(Infinity), null);
    assert.equal(toApiMinorUnits("12"), null); // strings are not accepted
  });

  it("converts minor-unit strings back for display", () => {
    assert.equal(fromApiMinorUnits("10001"), 100.01);
    assert.equal(fromApiMinorUnits("1"), 0.01);
    assert.equal(fromApiMinorUnits("5000"), 50);
    assert.equal(fromApiMinorUnits("abc"), 0);
  });

  it("never serializes BigInt into JSON payloads", () => {
    const payload = buildExpenseApiPayload(
      { desc: "x", category: "Food", paidBy: "you", amount: 10, splitType: "equal", participants: ["you"] },
      GROUP
    );
    assert.equal(JSON.parse(JSON.stringify(payload)).amountMinor, "1000");
    assert.ok(typeof payload.amountMinor === "string");
  });
});

// ---------------------------------------------------------------------------
// Split types + percentages
// ---------------------------------------------------------------------------

describe("split-type + percentage conversion", () => {
  it("maps split types both ways", () => {
    assert.equal(splitTypeToApi("equal"), "EQUAL");
    assert.equal(splitTypeToApi("percentage"), "PERCENTAGE");
    assert.equal(splitTypeToApi("itemized"), "ITEMIZED");
    assert.equal(splitTypeFromApi("EQUAL"), "equal");
    assert.equal(splitTypeFromApi("PERCENTAGE"), "percentage");
    assert.equal(splitTypeFromApi("ITEMIZED"), "itemized");
  });

  it("converts percent ↔ server percentage strings without float drift", () => {
    assert.equal(percentToBasisPoints(33.33), 3333);
    assert.equal(percentToBasisPoints(50), 5000);
    assert.equal(percentToBasisPoints(0.01), 1);
    assert.equal(percentageStringToPercent("33.33"), 33.33);
    assert.equal(percentageStringToPercent("50.00"), 50);
  });
});

// ---------------------------------------------------------------------------
// Request payload building (identity rules)
// ---------------------------------------------------------------------------

describe("buildExpenseApiPayload", () => {
  it("builds an EQUAL payload with server user ids and minor units", () => {
    const payload = buildExpenseApiPayload(
      {
        desc: "Dinner",
        category: "Food",
        paidBy: "you",
        amount: 100.01,
        date: "2026-09-19T19:30:00.000Z",
        splitType: "equal",
        participants: ["you", MEMBER_B_ID, MEMBER_C_ID],
      },
      GROUP
    );
    assert.deepEqual(payload, {
      description: "Dinner",
      category: "Food",
      currencyCode: "INR",
      paidByUserId: MY_ID,
      expenseDate: "2026-09-19T19:30:00.000Z",
      splitType: "EQUAL",
      amountMinor: "10001",
      participants: [MY_ID, MEMBER_B_ID, MEMBER_C_ID],
    });
  });

  it("never sends identity/creator/group/timestamp fields", () => {
    const payload = buildExpenseApiPayload(
      { desc: "x", category: "Other", paidBy: "you", amount: 5, splitType: "equal", participants: ["you"] },
      GROUP
    );
    for (const forbidden of ["id", "groupId", "createdBy", "createdById", "firebaseUid", "userId", "paidBy"]) {
      assert.ok(!(forbidden in payload), `forbidden field: ${forbidden}`);
    }
  });

  it("builds a PERCENTAGE payload in basis points totaling exactly 10000", () => {
    const payload = buildExpenseApiPayload(
      {
        desc: "Scooters",
        category: "Travel",
        paidBy: "you",
        amount: 3200,
        splitType: "percentage",
        percentages: { you: 33.33, [MEMBER_B_ID]: 33.33, [MEMBER_C_ID]: 33.34 },
      },
      GROUP
    );
    assert.equal(payload.splitType, "PERCENTAGE");
    const total = Object.values(payload.percentages).reduce((a, b) => a + b, 0);
    assert.equal(total, 10000);
    assert.equal(payload.percentages[MY_ID], 3333);
  });

  it("corrects ±1–2 bp input drift so a valid 100% split is not rejected", () => {
    const payload = buildExpenseApiPayload(
      {
        desc: "Scooters",
        category: "Travel",
        paidBy: "you",
        amount: 100,
        splitType: "percentage",
        percentages: { you: 33.33, [MEMBER_B_ID]: 33.33, [MEMBER_C_ID]: 33.33 }, // 99.99%
      },
      GROUP
    );
    const total = Object.values(payload.percentages).reduce((a, b) => a + b, 0);
    assert.equal(total, 10000);
  });

  it("builds an ITEMIZED payload; the same person may appear on several items", () => {
    const payload = buildExpenseApiPayload(
      {
        desc: "Groceries",
        category: "Food",
        paidBy: "you",
        amount: 250,
        splitType: "itemized",
        items: [
          { name: "Pizza", price: 100.01, participants: ["you", MEMBER_B_ID] },
          { name: "Juice", price: 149.99, participants: ["you", MEMBER_C_ID] }, // "you" again — allowed
        ],
      },
      GROUP
    );
    assert.equal(payload.splitType, "ITEMIZED");
    assert.equal(payload.items.length, 2);
    assert.deepEqual(payload.items[0], {
      name: "Pizza",
      amountMinor: "10001",
      participantUserIds: [MY_ID, MEMBER_B_ID],
    });
    assert.deepEqual(payload.items[1], {
      name: "Juice",
      amountMinor: "14999",
      participantUserIds: [MY_ID, MEMBER_C_ID],
    });
  });

  it("throws when a payer/participant is not a resolvable group member", () => {
    assert.throws(
      () =>
        buildExpenseApiPayload(
          { desc: "x", category: "Other", paidBy: "m_ghost", amount: 5, splitType: "equal", participants: ["you"] },
          GROUP
        ),
      /not a member/
    );
  });
});

// ---------------------------------------------------------------------------
// PATCH building — fields-only vs split update
// ---------------------------------------------------------------------------

describe("buildExpensePatchPayload (fields-only vs split update)", () => {
  const existing = mapExpenseFromApi(EQUAL_DTO, MY_OPTIONS);

  it("sends NO split fields when only description/category/date change", () => {
    const edited = { ...existing, desc: "Dinner (fixed)", category: "Entertainment" };
    const patch = buildExpensePatchPayload(edited, GROUP, existing);
    assert.deepEqual(patch, {
      description: "Dinner (fixed)",
      category: "Entertainment",
      paidByUserId: MY_ID,
      expenseDate: existing.date,
    });
    for (const splitKey of ["amountMinor", "splitType", "participants", "percentages", "items"]) {
      assert.ok(!(splitKey in patch), `split field must be omitted: ${splitKey}`);
    }
  });

  it("sends the full split when the amount changed", () => {
    const edited = { ...existing, amount: 200.02 };
    const patch = buildExpensePatchPayload(edited, GROUP, existing);
    assert.equal(patch.amountMinor, "20002");
    assert.deepEqual(patch.participants, [MY_ID, MEMBER_B_ID]);
  });

  it("sends the split when participants change", () => {
    const edited = { ...existing, participants: ["you"] };
    const patch = buildExpensePatchPayload(edited, GROUP, existing);
    assert.deepEqual(patch.participants, [MY_ID]);
  });

  it("treats a percentage→itemized switch as a split update", () => {
    const percentageExpense = {
      ...existing,
      splitType: "percentage",
      percentages: { you: 50, [MEMBER_B_ID]: 50 },
    };
    const asItemized = {
      ...percentageExpense,
      splitType: "itemized",
      items: [{ name: "All", price: 100.01, participants: ["you", MEMBER_B_ID] }],
    };
    const patch = buildExpensePatchPayload(asItemized, GROUP, percentageExpense);
    assert.equal(patch.splitType, "ITEMIZED");
    assert.ok(Array.isArray(patch.items));
    assert.ok(!("participants" in patch));
  });

  it("splitFingerprint is stable for identical splits and differs on change", () => {
    const a = mapExpenseFromApi(EQUAL_DTO, MY_OPTIONS);
    const b = mapExpenseFromApi(EQUAL_DTO, MY_OPTIONS);
    assert.equal(splitFingerprint(a, GROUP), splitFingerprint(b, GROUP));
    assert.notEqual(
      splitFingerprint({ ...a, amount: 42 }, GROUP),
      splitFingerprint(a, GROUP)
    );
  });
});

// ---------------------------------------------------------------------------
// DTO → frontend model mapping (server-authoritative shares)
// ---------------------------------------------------------------------------

describe("mapExpenseFromApi", () => {
  it("maps EQUAL: 'you' convention, server shares carried exactly", () => {
    const e = mapExpenseFromApi(EQUAL_DTO, MY_OPTIONS);
    assert.equal(e.id, EXPENSE_ID);
    assert.equal(e.desc, "Dinner");
    assert.equal(e.paidBy, "you");
    assert.equal(e.amount, 100.01);
    assert.equal(e.splitType, "equal");
    assert.deepEqual(e.participants, ["you", MEMBER_B_ID]);
    // The backend's deterministic remainder (B is last → absorbs it):
    assert.deepEqual(e.serverShares, { you: 50, [MEMBER_B_ID]: 50.01 });
    assert.equal(e.isServerExpense, true);
  });

  it("maps PERCENTAGE back into the 0–100 local convention", () => {
    const dto = {
      ...EQUAL_DTO,
      splitType: "PERCENTAGE",
      amountMinor: "19999",
      participants: [
        { userId: MY_ID, displayName: "User A", shareMinor: "10000", percentage: "50.00" },
        { userId: MEMBER_B_ID, displayName: "User B", shareMinor: "9999", percentage: "49.99" },
      ],
    };
    const e = mapExpenseFromApi(dto, MY_OPTIONS);
    assert.equal(e.splitType, "percentage");
    assert.equal(e.percentages.you, 50);
    assert.equal(e.percentages[MEMBER_B_ID], 49.99);
    // Server remainder allocation is displayed as-is (50.00 / 99.99).
    assert.deepEqual(e.serverShares, { you: 100, [MEMBER_B_ID]: 99.99 });
  });

  it("maps ITEMIZED with nested items and per-item participants", () => {
    const dto = {
      ...EQUAL_DTO,
      splitType: "ITEMIZED",
      amountMinor: "10001",
      items: [
        {
          id: "item-1",
          description: "Pizza",
          amountMinor: "10001",
          participants: [
            { userId: MY_ID, displayName: "User A", shareMinor: "5000" },
            { userId: MEMBER_B_ID, displayName: "User B", shareMinor: "5001" },
          ],
        },
        {
          id: "item-2",
          description: "Juice",
          amountMinor: "100",
          participants: [
            { userId: MY_ID, displayName: "User A", shareMinor: "100" },
          ],
        },
      ],
      participants: [
        { userId: MY_ID, displayName: "User A", shareMinor: "5100", percentage: null },
        { userId: MEMBER_B_ID, displayName: "User B", shareMinor: "5001", percentage: null },
      ],
    };
    const e = mapExpenseFromApi(dto, MY_OPTIONS);
    assert.equal(e.items.length, 2);
    assert.deepEqual(e.items[0], {
      id: "item-1",
      name: "Pizza",
      price: 100.01,
      participants: ["you", MEMBER_B_ID],
    });
    // The same person on multiple items is NOT deduplicated away.
    assert.equal(e.items[1].participants[0], "you");
    assert.equal(e.amount, 100.01);
  });

  it("maps a list and skips invalid entries", () => {
    const list = mapExpensesFromApi([EQUAL_DTO, null, {}], MY_OPTIONS);
    assert.equal(list.length, 1);
  });
});

// ---------------------------------------------------------------------------
// Expense list merge (SERVER > LOCAL CACHE)
// ---------------------------------------------------------------------------

describe("mergeServerAndLocalExpenses", () => {
  const serverExpense = mapExpenseFromApi(EQUAL_DTO, MY_OPTIONS);

  it("server data replaces stale local copies with the same id", () => {
    const staleLocal = { id: EXPENSE_ID, desc: "OLD stale copy", isServerExpense: true };
    const merged = mergeServerAndLocalExpenses([serverExpense], [staleLocal]);
    assert.equal(merged.length, 1);
    assert.equal(merged[0].desc, "Dinner");
  });

  it("keeps local entries that are not yet persisted (no vanishing expenses)", () => {
    const pending = { id: "e_local_pending", desc: "Just typed", isServerExpense: false };
    const merged = mergeServerAndLocalExpenses([serverExpense], [pending]);
    assert.equal(merged.length, 2);
    assert.ok(merged.some((e) => e.id === "e_local_pending"));
  });

  it("leaves genuinely local groups untouched", () => {
    const localExpenses = [{ id: "e1", desc: "local", isServerExpense: false }];
    const merged = mergeServerAndLocalExpenses([serverExpense], localExpenses, {
      groupIsServer: false,
    });
    assert.equal(merged, localExpenses);
  });
});

// ---------------------------------------------------------------------------
// Expenses service (paths, methods, bodies)
// ---------------------------------------------------------------------------

describe("expenses service", () => {
  it("list: GET /groups/:id/expenses with bearer auth", async () => {
    route([
      {
        match: (m, url) => m === "GET" && url.endsWith(`/api/v1/groups/${GROUP_ID}/expenses`),
        respond: () => jsonResponse(200, { success: true, data: [EQUAL_DTO] }),
      },
    ]);
    const list = await fetchGroupExpenses(GROUP_ID);
    assert.equal(list.length, 1);
    const [url, init] = fetchMock.mock.calls[0].arguments;
    assert.ok(url.endsWith(`/api/v1/groups/${GROUP_ID}/expenses`));
    assert.equal(init.method, "GET");
    assert.equal(init.headers.Authorization, "Bearer fake-id-token");
  });

  it("get: GET /groups/:id/expenses/:expenseId", async () => {
    route([
      {
        match: (m, url) =>
          m === "GET" && url.endsWith(`/api/v1/groups/${GROUP_ID}/expenses/${EXPENSE_ID}`),
        respond: () => jsonResponse(200, { success: true, data: EQUAL_DTO }),
      },
    ]);
    const dto = await fetchExpenseDetails(GROUP_ID, EXPENSE_ID);
    assert.equal(dto.id, EXPENSE_ID);
  });

  it("create: POST with the API-shaped payload (minor units, no identity fields)", async () => {
    route([
      {
        match: (m, url) => m === "POST" && url.endsWith(`/api/v1/groups/${GROUP_ID}/expenses`),
        respond: () => jsonResponse(201, { success: true, data: EQUAL_DTO }),
      },
    ]);
    const dto = await createExpense(GROUP_ID, {
      description: "Dinner",
      category: "Food",
      currencyCode: "INR",
      paidByUserId: MY_ID,
      splitType: "EQUAL",
      amountMinor: "10001",
      participants: [MY_ID, MEMBER_B_ID],
    });
    assert.equal(dto.id, EXPENSE_ID);
    const [url, init] = fetchMock.mock.calls[0].arguments;
    assert.equal(init.method, "POST");
    const body = JSON.parse(init.body);
    assert.equal(body.amountMinor, "10001");
    assert.ok(!("createdBy" in body) && !("id" in body) && !("groupId" in body));
  });

  it("update: PATCH /groups/:id/expenses/:expenseId", async () => {
    route([
      {
        match: (m, url) =>
          m === "PATCH" && url.endsWith(`/api/v1/groups/${GROUP_ID}/expenses/${EXPENSE_ID}`),
        respond: () => jsonResponse(200, { success: true, data: { ...EQUAL_DTO, description: "Renamed" } }),
      },
    ]);
    const dto = await updateExpense(GROUP_ID, EXPENSE_ID, { description: "Renamed" });
    assert.equal(dto.description, "Renamed");
    const [, init] = fetchMock.mock.calls[0].arguments;
    assert.equal(init.method, "PATCH");
    assert.deepEqual(JSON.parse(init.body), { description: "Renamed" });
  });

  it("delete: DELETE /groups/:id/expenses/:expenseId", async () => {
    route([
      {
        match: (m, url) =>
          m === "DELETE" && url.endsWith(`/api/v1/groups/${GROUP_ID}/expenses/${EXPENSE_ID}`),
        respond: () => jsonResponse(200, { success: true, data: { deleted: true, expenseId: EXPENSE_ID } }),
      },
    ]);
    const result = await deleteExpense(GROUP_ID, EXPENSE_ID);
    assert.equal(result.deleted, true);
    const [, init] = fetchMock.mock.calls[0].arguments;
    assert.equal(init.method, "DELETE");
  });

  it("rejects non-server ids before any request is made", () => {
    assert.throws(() => fetchGroupExpenses(""), /group id is required/);
    assert.throws(() => deleteExpense(GROUP_ID, undefined), /expense id is required/);
    assert.equal(fetchMock.mock.calls.length, 0);
  });

  it("normalizes API errors (400 validation, 403 authorization)", async () => {
    route([
      {
        match: () => true,
        respond: () =>
          jsonResponse(400, {
            success: false,
            error: { code: "VALIDATION_ERROR", message: "Percentages must total exactly 100%" },
          }),
      },
    ]);
    await assert.rejects(
      () => createExpense(GROUP_ID, { description: "x" }),
      (e) => e.status === 400 && e.code === "VALIDATION_ERROR"
    );
  });
});

// ---------------------------------------------------------------------------
// Integration flows (create → state, edit → state, delete → state, failures)
// ---------------------------------------------------------------------------

describe("integration: create expense → API → server response → frontend state", () => {
  it("round-trips a create: local payload → API → mapped server expense", async () => {
    route([
      {
        match: (m, url) => m === "POST" && url.endsWith(`/api/v1/groups/${GROUP_ID}/expenses`),
        respond: () => jsonResponse(201, { success: true, data: EQUAL_DTO }),
      },
    ]);

    // What the modal builds (existing local shape, no server id):
    const modalPayload = {
      id: "e_" + 1,
      desc: "Dinner",
      category: "Food",
      paidBy: "you",
      amount: 100.01,
      date: "2026-09-19T19:30:00.000Z",
      splitType: "equal",
      participants: ["you", MEMBER_B_ID],
      recurring: false,
    };
    const apiPayload = buildExpenseApiPayload(modalPayload, GROUP);
    const dto = await createExpense(GROUP_ID, apiPayload);
    const mapped = mapExpenseFromApi(dto, MY_OPTIONS);

    // The state entry is the server-authoritative expense:
    assert.equal(mapped.id, EXPENSE_ID); // server-assigned id
    assert.equal(mapped.isServerExpense, true);
    assert.deepEqual(mapped.serverShares, { you: 50, [MEMBER_B_ID]: 50.01 });
    // The merge alone keeps the still-unpersisted local entry (ids differ) —
    // which is why App drops the just-persisted local twin via removeLocalId
    // BEFORE the server expense enters state:
    const withoutRemoval = mergeServerAndLocalExpenses([mapped], [
      { ...modalPayload, isServerExpense: false },
    ]);
    assert.equal(withoutRemoval.length, 2);
    const finalState = mergeServerAndLocalExpenses(
      [mapped],
      [{ ...modalPayload, isServerExpense: false }].filter((e) => e.id !== modalPayload.id)
    );
    assert.equal(finalState.length, 1);
    assert.equal(finalState[0].id, EXPENSE_ID);
  });

  it("round-trips a fields-only edit without sending split fields", async () => {
    const existing = mapExpenseFromApi(EQUAL_DTO, MY_OPTIONS);
    route([
      {
        match: (m, url) => m === "PATCH" && url.includes(EXPENSE_ID),
        respond: () => jsonResponse(200, { success: true, data: { ...EQUAL_DTO, description: "Dinner 2" } }),
      },
    ]);
    const edited = { ...existing, desc: "Dinner 2" };
    const patch = buildExpensePatchPayload(edited, GROUP, existing);
    assert.ok(!("amountMinor" in patch) && !("participants" in patch));
    const dto = await updateExpense(GROUP_ID, existing.id, patch);
    assert.equal(dto.description, "Dinner 2");
  });

  it("round-trips a split edit (equal → percentage) with the complete split", async () => {
    const existing = mapExpenseFromApi(EQUAL_DTO, MY_OPTIONS);
    route([
      {
        match: (m, url) => m === "PATCH" && url.includes(EXPENSE_ID),
        respond: () =>
          jsonResponse(200, {
            success: true,
            data: {
              ...EQUAL_DTO,
              splitType: "PERCENTAGE",
              participants: [
                { userId: MY_ID, displayName: "User A", shareMinor: "5000", percentage: "50.00" },
                { userId: MEMBER_B_ID, displayName: "User B", shareMinor: "5001", percentage: "50.01" },
              ],
            },
          }),
      },
    ]);
    const edited = {
      ...existing,
      splitType: "percentage",
      percentages: { you: 50, [MEMBER_B_ID]: 50 },
    };
    const patch = buildExpensePatchPayload(edited, GROUP, existing);
    assert.equal(patch.splitType, "PERCENTAGE");
    await updateExpense(GROUP_ID, existing.id, patch);
    const sentBody = JSON.parse(fetchMock.mock.calls[0].arguments[1].body);
    assert.equal(sentBody.splitType, "PERCENTAGE");
    assert.deepEqual(sentBody.percentages, { [MY_ID]: 5000, [MEMBER_B_ID]: 5000 });
  });

  it("on API failure the expense is unchanged and the error is surfaced", async () => {
    route([
      {
        match: () => true,
        respond: () =>
          jsonResponse(403, {
            success: false,
            error: { code: "FORBIDDEN", message: "You don't have permission to modify this expense" },
          }),
      },
    ]);
    let error = null;
    try {
      await createExpense(GROUP_ID, buildExpenseApiPayload(
        { desc: "x", category: "Other", paidBy: "you", amount: 5, splitType: "equal", participants: ["you"] },
        GROUP
      ));
    } catch (e) {
      error = e;
    }
    assert.ok(error);
    assert.equal(error.status, 403);
    // The caller's contract (App.handleSaveExpense): catch → toast → return
    // null → the modal stays open and no expense is inserted into state.
    assert.match(error.userMessage, /permission/);
  });

  it("delete flow: server confirms before the expense leaves state", async () => {
    let deleted = false;
    route([
      {
        match: (m, url) => m === "DELETE" && url.includes(EXPENSE_ID),
        respond: () => {
          deleted = true;
          return jsonResponse(200, { success: true, data: { deleted: true, expenseId: EXPENSE_ID } });
        },
      },
    ]);
    await deleteExpense(GROUP_ID, EXPENSE_ID);
    assert.ok(deleted, "the DELETE must reach the server first");
    // State removal happens only after the awaited success (App removes the
    // expense inside the same try-block, after the awaited call).
  });

  it("no token/secret ever appears in a request URL", async () => {
    route([
      {
        match: (m, url) => m === "GET" && url.endsWith("/expenses"),
        respond: () => jsonResponse(200, { success: true, data: [] }),
      },
    ]);
    await fetchGroupExpenses(GROUP_ID);
    const [url] = fetchMock.mock.calls[0].arguments;
    assert.ok(!url.includes("token") && !url.includes("fake-id-token"));
  });
});
