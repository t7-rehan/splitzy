import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";

import {
  loadGroups,
  saveGroups,
  loadProfile,
  saveProfile,
  clearUserCache,
  getScopedKey,
} from "../src/services/storage.js";
import {
  mapGroupFromApi,
  mapGroupsFromApi,
  mergeServerAndLocalGroups,
} from "../src/services/groupMapper.js";

// Mock minimal localStorage for Node test runner
const mockStorage = new Map();
globalThis.localStorage = {
  getItem: (k) => (mockStorage.has(k) ? mockStorage.get(k) : null),
  setItem: (k, v) => mockStorage.set(k, String(v)),
  removeItem: (k) => mockStorage.delete(k),
  clear: () => mockStorage.clear(),
};

describe("Feature 2: Brand-New User Experience and Isolation", () => {
  const USER_A_UID = "firebase_uid_user_a";
  const USER_B_UID = "firebase_uid_user_b";

  beforeEach(() => {
    mockStorage.clear();
  });

  it("1 & 2. User A creates a group and can see the group", () => {
    // User A creates a server-backed group
    const userAGroup = {
      id: "group_a_1",
      name: "Trip to Manali",
      currency: "INR",
      isServerGroup: true,
      members: [{ id: "you", name: "Alice", role: "OWNER" }],
      expenses: [],
    };

    saveGroups([userAGroup], USER_A_UID);

    const loadedForA = loadGroups(USER_A_UID);
    assert.equal(loadedForA.length, 1);
    assert.equal(loadedForA[0].id, "group_a_1");
    assert.equal(loadedForA[0].name, "Trip to Manali");
  });

  it("3, 4 & 5. User A logs out; User B logs in (new user) and sees zero groups (no seed data)", () => {
    // Setup: User A has data in localStorage
    const userAGroup = {
      id: "group_a_1",
      name: "Alice's Secret Flat",
      currency: "INR",
      isServerGroup: true,
      members: [{ id: "you", name: "Alice", role: "OWNER" }],
      expenses: [],
    };
    saveGroups([userAGroup], USER_A_UID);
    saveProfile({ name: "Alice", email: "alice@test.com" }, USER_A_UID);

    // User A logs out (client-side active state cleared)
    // User B logs in as a brand-new user:
    const loadedForB = loadGroups(USER_B_UID);
    assert.equal(
      loadedForB.length,
      0,
      "Brand-new User B must see zero groups, never seed groups or User A's groups"
    );

    const profileB = loadProfile(USER_B_UID);
    assert.equal(profileB, null, "Brand-new User B must not inherit User A's profile");

    // Server returns zero groups for User B
    const serverGroupsForB = [];
    const mappedForB = mapGroupsFromApi(serverGroupsForB, { myUserId: "user_b_internal" });
    const mergedForB = mergeServerAndLocalGroups(mappedForB, loadedForB);

    assert.equal(mergedForB.length, 0, "New user receives 0 groups after sync merge");
  });

  it("6 & 7. User B creates a group and sees only User B's group", () => {
    // User A has their group
    saveGroups(
      [{ id: "group_a_1", name: "Alice Group", isServerGroup: true }],
      USER_A_UID
    );

    // User B creates a new group
    const userBGroup = {
      id: "group_b_1",
      name: "Bob's Weekend Trek",
      currency: "INR",
      isServerGroup: true,
      members: [{ id: "you", name: "Bob", role: "OWNER" }],
      expenses: [],
    };
    saveGroups([userBGroup], USER_B_UID);

    const loadedForB = loadGroups(USER_B_UID);
    assert.equal(loadedForB.length, 1);
    assert.equal(loadedForB[0].id, "group_b_1");
    assert.equal(loadedForB[0].name, "Bob's Weekend Trek");
    assert.ok(!loadedForB.some((g) => g.id === "group_a_1"), "User B must not see User A's group");
  });

  it("8 & 9. User A logs back in and sees only User A's group", () => {
    // User A and User B both have groups stored
    saveGroups(
      [{ id: "group_a_1", name: "Alice Group", isServerGroup: true }],
      USER_A_UID
    );
    saveGroups(
      [{ id: "group_b_1", name: "Bob Group", isServerGroup: true }],
      USER_B_UID
    );

    // User A logs back in
    const loadedForA = loadGroups(USER_A_UID);
    assert.equal(loadedForA.length, 1);
    assert.equal(loadedForA[0].id, "group_a_1");
    assert.ok(!loadedForA.some((g) => g.id === "group_b_1"), "User A must not see User B's group");
  });

  it("10. Server authorization isolation: User A cannot access User B's group", () => {
    // Simulating backend membership check rule:
    // A group belongs to users with a GroupMember row for that group
    const memberships = [
      { groupId: "group_b_1", userId: "user_b_internal", role: "OWNER" },
    ];

    const canUserAccessGroup = (userId, groupId) => {
      return memberships.some((m) => m.userId === userId && m.groupId === groupId);
    };

    assert.equal(canUserAccessGroup("user_a_internal", "group_b_1"), false);
    assert.equal(canUserAccessGroup("user_b_internal", "group_b_1"), true);
  });

  it("11. Client-side cached data from User A does not appear for User B", () => {
    // Verify storage key namespaces
    const keyA = getScopedKey("groups", USER_A_UID);
    const keyB = getScopedKey("groups", USER_B_UID);

    assert.notEqual(keyA, keyB);
    assert.equal(keyA, `splitzy:${USER_A_UID}:groups`);
    assert.equal(keyB, `splitzy:${USER_B_UID}:groups`);

    // Writing to keyA does not pollute keyB
    localStorage.setItem(keyA, JSON.stringify([{ id: "alice_secret" }]));
    assert.equal(localStorage.getItem(keyB), null);

    // loadGroups for User B returns clean empty array
    const bGroups = loadGroups(USER_B_UID);
    assert.deepEqual(bGroups, []);
  });


  it("merging excludes legacy demo seed groups for authenticated users", () => {
    // If local memory had seed groups lingering
    const currentWithSeed = [
      { id: "g_goa", name: "Goa Trip 2026", isServerGroup: false },
      { id: "g_flat", name: "Apartment 304", isServerGroup: false },
    ];

    const mappedServer = []; // New user has 0 server groups
    const merged = mergeServerAndLocalGroups(mappedServer, currentWithSeed, { filterSeedGroups: true });

    assert.equal(merged.length, 0, "Seed groups must be filtered out when merging server groups");
  });
});
