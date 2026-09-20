/**
 * Unit tests for the Task 8 auth/bootstrap + groups services.
 *
 * The Firebase SDK and the network are mocked at module boundaries:
 *   - authService's token provider is replaced via apiClient.setApiTokenProvider
 *   - global fetch is replaced wholesale
 * so these tests exercise real service logic without Firebase or PostgreSQL.
 *
 * Run: npm test  (from Frontend/)
 */
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it, mock } from "node:test";

const apiClient = await import("../src/services/apiClient.js");
const { fetchBackendUser, mapUserFromApi } = await import(
  "../src/services/bootstrapService.js"
);
const {
  fetchMyGroups,
  fetchGroupDetails,
  createGroup,
  updateGroup,
} = await import("../src/services/groupsService.js");
const {
  mapGroupFromApi,
  mapGroupsFromApi,
  mergeServerAndLocalGroups,
} = await import("../src/services/groupMapper.js");

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
  // routes: Array<{ match(method, url), respond() }>
  fetchMock.mock.mockImplementation((url, init = {}) => {
    const method = init.method || "GET";
    const route = routes.find((r) => r.match(method, url));
    if (!route) {
      return Promise.resolve(jsonResponse(404, { success: false, error: { code: "NOT_FOUND", message: "no route" } }));
    }
    return Promise.resolve(route.respond());
  });
}

const MY_USER = {
  id: "11111111-1111-4111-8111-111111111111",
  firebaseUid: "firebase-uid-A",
  email: "usera@users.splitzy.local",
  displayName: "User A",
  photoUrl: null,
};

const GROUP_SUMMARY = {
  id: "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa",
  name: "Goa Trip",
  description: null,
  currencyCode: "INR",
  isRoommateGroup: false,
  viewerRole: "OWNER",
  memberCount: 2,
  membershipId: "mm-1",
  joinedAt: "2026-09-19T10:00:00.000Z",
};

const GROUP_DETAILS = {
  ...GROUP_SUMMARY,
  members: [
    { userId: MY_USER.id, displayName: "User A", avatarId: null, role: "OWNER", joinedAt: "2026-09-19T10:00:00.000Z" },
    { userId: "22222222-2222-4222-8222-222222222222", displayName: "User B", avatarId: null, role: "MEMBER", joinedAt: "2026-09-19T10:05:00.000Z" },
  ],
};

beforeEach(() => {
  fetchMock.mock.resetCalls();
  apiClient.setApiTokenProvider(() => Promise.resolve("fake-id-token"));
});

afterEach(() => {
  apiClient.clearApiTokenProvider();
});

describe("auth bootstrap", () => {
  it("mapUserFromApi keeps only the safe public projection", () => {
    const mapped = mapUserFromApi({
      id: "u1",
      firebaseUid: "fb-1",
      email: "x@y.z",
      displayName: "X",
      photoUrl: null,
      birthdate: null,
      profileCompleted: false,
      upiId: null,
      upiQrDataUrl: null,
      secretField: "nope",
    });
    assert.deepEqual(mapped, {
      id: "u1",
      firebaseUid: "fb-1",
      email: "x@y.z",
      displayName: "X",
      photoUrl: null,
      birthdate: null,
      profileCompleted: false,
      upiId: null,
      upiQrDataUrl: null,
    });
    assert.ok(!("secretField" in mapped));
  });

  it("fetchBackendUser hits GET /auth/me with the bearer token", async () => {
    route([
      {
        match: (m, url) => m === "GET" && url.includes("/api/v1/auth/me"),
        respond: () => jsonResponse(200, { success: true, data: MY_USER }),
      },
    ]);
    const user = await fetchBackendUser();
    assert.equal(user.id, MY_USER.id);
    const init = fetchMock.mock.calls[0].arguments[1];
    assert.equal(init.headers.Authorization, "Bearer fake-id-token");
    assert.equal(fetchMock.mock.calls.length, 1);
  });

  it("fetchBackendUser propagates normalized errors on /auth/me failure", async () => {
    route([
      {
        match: () => true,
        respond: () =>
          jsonResponse(500, {
            success: false,
            error: { code: "INTERNAL_SERVER_ERROR", message: "boom" },
          }),
      },
    ]);
    await assert.rejects(fetchBackendUser(), (e) => e.status === 500 && e.code === "INTERNAL_SERVER_ERROR");
  });
});

describe("groups service", () => {
  it("list groups: GET /groups, bearer auth, envelope unwrapped", async () => {
    route([
      {
        match: (m, url) => m === "GET" && url.endsWith("/api/v1/groups"),
        respond: () => jsonResponse(200, { success: true, data: [GROUP_SUMMARY] }),
      },
    ]);
    const list = await fetchMyGroups();
    assert.equal(list.length, 1);
    assert.equal(list[0].id, GROUP_SUMMARY.id);
    const [url, init] = fetchMock.mock.calls[0].arguments;
    assert.ok(url.endsWith("/api/v1/groups"));
    assert.equal(init.method, "GET");
    assert.ok(init.headers.Authorization.startsWith("Bearer "));
  });

  it("create group: POST /groups with content fields only (no identity fields)", async () => {
    route([
      {
        match: (m, url) => m === "POST" && url.endsWith("/api/v1/groups"),
        respond: () => jsonResponse(201, { success: true, data: GROUP_DETAILS }),
      },
    ]);
    const dto = await createGroup({ name: "Goa Trip", currencyCode: "INR", isRoommateGroup: false });
    assert.equal(dto.id, GROUP_DETAILS.id);
    const [url, init] = fetchMock.mock.calls[0].arguments;
    assert.equal(init.method, "POST");
    const body = JSON.parse(init.body);
    assert.deepEqual(body, { name: "Goa Trip", currencyCode: "INR", isRoommateGroup: false });
    assert.ok(!("ownerId" in body) && !("createdBy" in body) && !("userId" in body) && !("firebaseUid" in body));
    assert.ok(url.endsWith("/api/v1/groups"));
  });

  it("fetch group detail: GET /groups/:groupId with encoded UUID", async () => {
    route([
      {
        match: (m, url) => m === "GET" && url.includes(`/api/v1/groups/${GROUP_SUMMARY.id}`),
        respond: () => jsonResponse(200, { success: true, data: GROUP_DETAILS }),
      },
    ]);
    const dto = await fetchGroupDetails(GROUP_SUMMARY.id);
    assert.equal(dto.memberCount, 2);
  });

  it("update group: PATCH with only whitelisted fields", async () => {
    route([
      {
        match: (m, url) => m === "PATCH" && url.includes(`/api/v1/groups/${GROUP_SUMMARY.id}`),
        respond: () => jsonResponse(200, { success: true, data: { ...GROUP_DETAILS, name: "Renamed" } }),
      },
    ]);
    const dto = await updateGroup(GROUP_SUMMARY.id, { name: "Renamed" });
    assert.equal(dto.name, "Renamed");
    const [, init] = fetchMock.mock.calls[0].arguments;
    assert.equal(init.method, "PATCH");
    assert.deepEqual(JSON.parse(init.body), { name: "Renamed" });
  });

  it("normalized API errors bubble through the service (409 conflict)", async () => {
    route([
      {
        match: () => true,
        respond: () =>
          jsonResponse(409, {
            success: false,
            error: { code: "CONFLICT", message: "User is already a member of this group" },
          }),
      },
    ]);
    await assert.rejects(fetchMyGroups(), (e) => e.status === 409 && e.code === "CONFLICT");
  });
});

describe("group mapper", () => {
  it("maps the viewer to the literal 'you' and keeps server ids for others", () => {
    const group = mapGroupFromApi(GROUP_DETAILS, { myUserId: MY_USER.id });
    const you = group.members.find((m) => m.id === "you");
    const other = group.members.find((m) => m.id !== "you");
    assert.ok(you, "viewer must map to 'you'");
    assert.equal(you.name, "User A");
    assert.equal(other.id, "22222222-2222-4222-8222-222222222222");
    assert.equal(group.name, "Goa Trip");
    assert.equal(group.currency, "INR");
    assert.equal(group.isServerGroup, true);
    assert.equal(group.viewerRole, "OWNER");
  });

  it("carries local expenses into the mapped server group", () => {
    const local = { id: "g_local_twin", name: "Goa Trip", members: [], expenses: [{ id: "e1", desc: "Dinner" }] };
    const group = mapGroupFromApi(GROUP_DETAILS, { localGroup: local, myUserId: MY_USER.id });
    assert.equal(group.expenses.length, 1);
    assert.equal(group.expenses[0].desc, "Dinner");
  });

  it("merge: server data wins and local twins are dropped, local-only groups survive", () => {
    const mappedServer = mapGroupsFromApi([GROUP_DETAILS], { myUserId: MY_USER.id });
    const current = [
      { id: "g_twin", name: "goa trip", isServerGroup: false, members: [], expenses: [] }, // name twin (case-insensitive)
      { id: "g_local_only", name: "Local Demo", isServerGroup: false, members: [], expenses: [{ id: "e9" }] },
    ];
    const merged = mergeServerAndLocalGroups(mappedServer, current);
    const goa = merged.filter((g) => g.name.toLowerCase() === "goa trip");
    assert.equal(goa.length, 1, "duplicate local twin must be dropped");
    assert.equal(goa[0].isServerGroup, true);
    assert.ok(merged.some((g) => g.id === "g_local_only"), "genuinely local groups survive");
  });
});

describe("integration: authenticated user → groups API → frontend group state", () => {
  it("bootstrap + list + map produces the existing UI's group shape", async () => {
    route([
      {
        match: (m, url) => m === "GET" && url.includes("/api/v1/auth/me"),
        respond: () => jsonResponse(200, { success: true, data: MY_USER }),
      },
      {
        match: (m, url) => m === "GET" && url.endsWith("/api/v1/groups"),
        respond: () => jsonResponse(200, { success: true, data: [GROUP_SUMMARY] }),
      },
      {
        match: (m, url) => m === "GET" && url.includes("/api/v1/groups/"),
        respond: () => jsonResponse(200, { success: true, data: GROUP_DETAILS }),
      },
    ]);
    const user = await fetchBackendUser();
    const summaries = await fetchMyGroups();
    const detailed = await Promise.all(
      summaries.map((s) => fetchGroupDetails(s.id).catch(() => s))
    );
    const groups = mapGroupsFromApi(detailed, { localGroups: [], myUserId: user.id });
    assert.equal(groups.length, 1);
    const g = groups[0];
    // The shape the existing components already consume:
    assert.equal(typeof g.id, "string");
    assert.equal(typeof g.name, "string");
    assert.equal(typeof g.currency, "string");
    assert.equal(typeof g.isRoommateGroup, "boolean");
    assert.ok(Array.isArray(g.members));
    assert.ok(Array.isArray(g.expenses));
    assert.ok(g.members.some((m) => m.id === "you"));
  });

  it("create flow: POST → returned server group → UI-ready mapped group", async () => {
    route([
      {
        match: (m, url) => m === "POST" && url.endsWith("/api/v1/groups"),
        respond: () => jsonResponse(201, { success: true, data: GROUP_DETAILS }),
      },
    ]);
    const dto = await createGroup({ name: "Goa Trip", currencyCode: "INR", isRoommateGroup: false });
    const mapped = mapGroupFromApi(dto, { localGroup: null, myUserId: MY_USER.id });
    assert.equal(mapped.name, "Goa Trip");
    assert.equal(mapped.isServerGroup, true);
    assert.ok(mapped.members.some((m) => m.id === "you"));
    assert.ok(mapped.members.some((m) => m.id === "22222222-2222-4222-8222-222222222222"));
  });
});
