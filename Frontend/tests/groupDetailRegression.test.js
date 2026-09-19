/**
 * Regression tests for the two user-facing bugs:
 *   Bug 1 — blank group screen (ReferenceError: deletingExpenseIds is not
 *           defined inside GroupDetailScreen: App owned the state but never
 *           passed it down, so opening ANY group threw during render and
 *           React unmounted the whole tree).
 *   Bug 2 — create-group reported failure after a successful creation
 *           (App.handleCreateGroup never returned the mapped group, so the
 *           modal showed "Could not create the group…" and stayed open,
 *           inviting duplicate submissions).
 *
 * The render tests execute the REAL components through react-dom/server —
 * a render-time throw is exactly what blanked the screen in the browser.
 *
 * Run: npm test  (from Frontend/)
 */
import assert from "node:assert/strict";
import React from "react";
import { renderToString } from "react-dom/server";
import { describe, it, mock, afterEach } from "node:test";

const apiClient = await import("../src/services/apiClient.js");
const { createGroup } = await import("../src/services/groupsService.js");
const { mapGroupFromApi, mapGroupsFromApi } = await import(
  "../src/services/groupMapper.js"
);
const { appendGroupOnce } = await import("../src/services/groupState.js");
const { GroupDetailScreen } = await import(
  "../src/components/groups/GroupDetailScreen.jsx"
);
const { CreateGroupModal } = await import(
  "../src/components/groups/CreateGroupModal.jsx"
);
const { ThemeProvider, getThemeTokens } = await import(
  "../src/theme/clayTheme.js"
);

const fetchMock = mock.fn();
globalThis.fetch = fetchMock;

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  };
}

const MY_ID = "11111111-1111-4111-8111-111111111111";
const USER_B_ID = "22222222-2222-4222-8222-222222222222";

const GROUP_DTO = {
  id: "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa",
  name: "Goa Trip",
  description: null,
  currencyCode: "INR",
  isRoommateGroup: false,
  viewerRole: "OWNER",
  memberCount: 2,
  membershipId: "mm-1",
  joinedAt: "2026-09-19T10:00:00.000Z",
  members: [
    { userId: MY_ID, displayName: "User A", avatarId: null, role: "OWNER", joinedAt: "2026-09-19T10:00:00.000Z" },
    { userId: USER_B_ID, displayName: "User B", avatarId: null, role: "MEMBER", joinedAt: "2026-09-19T10:05:00.000Z" },
  ],
};

const THEME = getThemeTokens("light");

/** Render the real GroupDetailScreen with a mapped server group. */
function renderDetail(group, { deletingExpenseIds = [] } = {}) {
  return renderToString(
    React.createElement(
      ThemeProvider,
      { themeMode: "light", setThemeMode: () => {} },
      React.createElement(GroupDetailScreen, {
        group,
        onBack: () => {},
        onUpdateGroup: () => {},
        onDeleteGroup: () => {},
        onAddExpense: () => {},
        onEditExpense: () => {},
        onOpenUPI: () => {},
        onOpenShareLink: () => {},
        isPro: false,
        onShowProUpgrade: () => {},
        onToast: () => {},
        theme: THEME,
        deletingExpenseIds,
      })
    )
  );
}

afterEach(() => {
  apiClient.clearApiTokenProvider();
});

// ---------------------------------------------------------------------------
// 1. Mapping → GroupDetail-compatible object
// ---------------------------------------------------------------------------

describe("regression: group maps into a GroupDetail-compatible object", () => {
  it("provides every field the detail screen and its children consume", () => {
    const group = mapGroupFromApi(GROUP_DTO, { localGroup: null, myUserId: MY_ID });
    assert.equal(group.id, GROUP_DTO.id);
    assert.equal(group.name, "Goa Trip");
    assert.equal(group.currency, "INR");
    assert.equal(typeof group.isRoommateGroup, "boolean");
    assert.ok(Array.isArray(group.members), "members must be an array");
    assert.ok(Array.isArray(group.expenses), "expenses must be an array");
    // "you" convention for the viewer + server ids for everyone else:
    assert.ok(group.members.some((m) => m.id === "you"));
    assert.ok(group.members.some((m) => m.id === USER_B_ID));
    for (const m of group.members) {
      assert.equal(typeof m.name, "string", "member name must exist");
    }
    assert.equal(group.isServerGroup, true);
  });
});

// ---------------------------------------------------------------------------
// 2. Detail renders with the mapped server group (Bug 1)
// ---------------------------------------------------------------------------

describe("regression: group detail renders with a mapped server group", () => {
  it("renders without throwing and shows group + members + actions", () => {
    const group = mapGroupFromApi(GROUP_DTO, { localGroup: null, myUserId: MY_ID });
    const html = renderDetail(group, { deletingExpenseIds: [] });
    assert.ok(html.length > 1000, "detail screen should render substantial content");
    assert.ok(html.includes("Goa Trip"), "group name must appear");
    assert.ok(html.includes("User A"), "viewer member must appear");
    assert.ok(html.includes("User B"), "other members must appear");
    assert.ok(html.includes("Add Expense"), "action bar must appear");
    assert.ok(html.includes("People in Group"), "PeopleManager must render");
  });

  it("deletion in-flight bookkeeping renders without throwing", () => {
    const group = mapGroupFromApi(GROUP_DTO, { localGroup: null, myUserId: MY_ID });
    group.expenses = [
      {
        id: "e1", desc: "Dinner", category: "Food", paidBy: "you",
        amount: 100.01, date: "2026-09-19T19:30:00.000Z", splitType: "equal",
        participants: ["you", USER_B_ID], percentages: {}, items: [],
        recurring: false, isServerExpense: true, serverShares: { you: 50, [USER_B_ID]: 50.01 },
      },
    ];
    const html = renderDetail(group, { deletingExpenseIds: ["e1"] });
    assert.ok(html.includes("Dinner"), "expense list must render during deletion");
  });
});

// ---------------------------------------------------------------------------
// 3. Missing/empty optional server fields render safely
// ---------------------------------------------------------------------------

describe("regression: detail handles missing/empty optional server fields", () => {
  it("renders a summary-only DTO (no members array, no metadata)", () => {
    const group = mapGroupFromApi(
      { id: "g-min", name: "Minimal Group", currencyCode: "USD" },
      { localGroup: null, myUserId: null }
    );
    assert.deepEqual(group.members, [], "missing members map to an empty list");
    const html = renderDetail(group);
    assert.ok(html.length > 500, "screen must still render");
    assert.ok(html.includes("Minimal Group"));
  });

  it("renders an empty member list without throwing", () => {
    const group = mapGroupFromApi(
      { ...GROUP_DTO, members: [] },
      { localGroup: null, myUserId: MY_ID }
    );
    const html = renderDetail(group);
    assert.ok(html.includes("Goa Trip"));
  });
});

// ---------------------------------------------------------------------------
// 4. Create-group service sends the expected request
// ---------------------------------------------------------------------------

describe("regression: create-group service request", () => {
  it("POSTs /api/v1/groups with content fields only", async () => {
    fetchMock.mock.resetCalls();
    apiClient.setApiTokenProvider(() => Promise.resolve("fake-id-token"));
    fetchMock.mock.mockImplementation(() =>
      Promise.resolve(jsonResponse(201, { success: true, data: GROUP_DTO }))
    );
    await createGroup({ name: "Goa Trip", currencyCode: "INR", isRoommateGroup: false });
    const [url, init] = fetchMock.mock.calls[0].arguments;
    assert.equal(init.method, "POST");
    assert.ok(url.endsWith("/api/v1/groups"));
    const body = JSON.parse(init.body);
    assert.deepEqual(body, { name: "Goa Trip", currencyCode: "INR", isRoommateGroup: false });
    assert.ok(init.headers.Authorization.startsWith("Bearer "));
  });
});

// ---------------------------------------------------------------------------
// 5. Successful create response maps correctly (Bug 2, mapping half)
// ---------------------------------------------------------------------------

describe("regression: created group maps into the UI shape", () => {
  it("POST response DTO maps to a list/detail-compatible group", () => {
    const mapped = mapGroupFromApi(GROUP_DTO, { localGroup: null, myUserId: MY_ID });
    assert.equal(mapped.id, GROUP_DTO.id, "server-assigned id is preserved");
    assert.equal(mapped.isServerGroup, true);
    assert.ok(mapped.members.some((m) => m.id === "you"), "creator maps to 'you' with OWNER role");
    assert.equal(mapped.members.find((m) => m.id === "you").role, "OWNER");
  });
});

// ---------------------------------------------------------------------------
// 6. The new group is inserted exactly once into state
// ---------------------------------------------------------------------------

describe("regression: created group is inserted exactly once", () => {
  it("appendGroupOnce appends a new group and ignores a duplicate id", () => {
    const existing = [{ id: "g1", name: "Existing", members: [], expenses: [] }];
    const created = { id: "g2", name: "New", members: [], expenses: [] };
    const withNew = appendGroupOnce(existing, created);
    assert.equal(withNew.length, 2);
    const duplicated = appendGroupOnce(withNew, created);
    assert.equal(duplicated.length, 2, "same-id group must never be duplicated");
    assert.equal(duplicated, withNew, "duplicate append returns the same state");
  });

  it("App's create contract: handler resolves with the mapped group", async () => {
    // Mirrors App.handleCreateGroup's post-fix shape: the modal closes only
    // when the promise resolves with the created (mapped) group.
    const handleCreateGroup = async (groupData, { backendUser = { id: MY_ID } } = {}) => {
      const dto = await createGroup({
        name: groupData.name,
        currencyCode: groupData.currency,
        isRoommateGroup: groupData.isRoommateGroup,
      });
      const mapped = mapGroupFromApi(dto, { localGroup: null, myUserId: backendUser.id });
      if (!mapped) throw new Error("Invalid group data received from server");
      return mapped; // ← the fix: this return was missing (Bug 2)
    };
    fetchMock.mock.resetCalls();
    apiClient.setApiTokenProvider(() => Promise.resolve("fake-id-token"));
    fetchMock.mock.mockImplementation(() =>
      Promise.resolve(jsonResponse(201, { success: true, data: GROUP_DTO }))
    );
    const resolved = await handleCreateGroup({ name: "Goa Trip", currency: "INR", isRoommateGroup: false });
    assert.ok(resolved, "the modal's success contract must receive the created group");
    assert.equal(resolved.id, GROUP_DTO.id);
  });
});

// ---------------------------------------------------------------------------
// 7. API failure does not crash the UI
// ---------------------------------------------------------------------------

describe("regression: API failure paths never crash the UI", () => {
  it("failed create keeps the modal open (existing error style) with no state change", async () => {
    fetchMock.mock.resetCalls();
    apiClient.setApiTokenProvider(() => Promise.resolve("fake-id-token"));
    fetchMock.mock.mockImplementation(() =>
      Promise.resolve(
        jsonResponse(500, { success: false, error: { code: "INTERNAL_SERVER_ERROR", message: "boom" } })
      )
    );
    let state = [{ id: "g1", name: "Existing", members: [], expenses: [] }];
    let resolvedWith = "unset";
    try {
      const dto = await createGroup({ name: "X", currency: "INR", isRoommateGroup: false });
      const mapped = mapGroupFromApi(dto, { localGroup: null, myUserId: MY_ID });
      state = appendGroupOnce(state, mapped);
      resolvedWith = mapped;
    } catch {
      // App.handleCreateGroup catches, toasts the userMessage, and the modal
      // stays open — nothing is inserted into state.
      resolvedWith = null;
    }
    assert.equal(resolvedWith, null, "failure must not resolve with a group");
    assert.equal(state.length, 1, "failure must not modify group state");
    assert.equal(state[0].id, "g1");

    // And the modal itself renders its error path without throwing:
    const html = renderToString(
      React.createElement(
        ThemeProvider,
        { themeMode: "light", setThemeMode: () => {} },
        React.createElement(CreateGroupModal, {
          isOpen: true,
          onClose: () => {},
          onCreateGroup: async () => null, // the failure contract
          userProfile: { homeCurrency: "INR", isPro: true },
          groupCount: 1,
          onShowProUpgrade: () => {},
        })
      )
    );
    assert.ok(html.includes("Create Group"), "modal must render on the failure path");
  });

  it("a malformed create response (missing id) cannot enter state", () => {
    const mapped = mapGroupFromApi({ name: "Broken" }, { localGroup: null, myUserId: MY_ID });
    assert.equal(mapped, null, "DTO without an id maps to null");
    const state = appendGroupOnce([], mapped);
    assert.equal(state.length, 0, "null mappings are never appended");
  });
});
