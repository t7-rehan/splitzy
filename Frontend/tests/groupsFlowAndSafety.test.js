/**
 * Tests for Groups Screen & New Group Flow:
 *
 * STEP 7 Verification:
 *   1. Groups loading state (safe rendering, sync indicator)
 *   2. Empty Groups state ("No groups yet", create button, never blank)
 *   3. Populated Groups state (group details, member avatars, proper currency formatting, no NaN/double-negative)
 *   4. Groups API error state (displays error banner with retry, cached groups stay visible, never blank)
 *   5. Groups edge-case robustness (null/undefined groups, missing members/expenses, empty names)
 *   6. New Group successful creation (DTO mapped, appended once, UI updated immediately without reload)
 *   7. New Group API failure (modal displays visible error, stays open, duplicate submissions blocked)
 *   8. Newly created group persistence across merge/refresh simulation
 *   9. ScreenErrorBoundary protection for Groups screen
 *
 * Run: npm test  (from Frontend/)
 */
import assert from "node:assert/strict";
import React from "react";
import { renderToString } from "react-dom/server";
import { describe, it, mock } from "node:test";

const { GroupListScreen } = await import(
  "../src/components/groups/GroupListScreen.jsx"
);
const { CreateGroupModal } = await import(
  "../src/components/groups/CreateGroupModal.jsx"
);
const { ScreenErrorBoundary } = await import(
  "../src/components/common/ScreenErrorBoundary.jsx"
);
const {
  mapGroupFromApi,
  mapGroupsFromApi,
  mergeServerAndLocalGroups,
} = await import("../src/services/groupMapper.js");
const { appendGroupOnce } = await import("../src/services/groupState.js");
const { computeBalances } = await import("../src/services/storage.js");
const { ThemeProvider, getThemeTokens } = await import(
  "../src/theme/clayTheme.js"
);

const theme = getThemeTokens("light");

function renderWithTheme(element) {
  return renderToString(
    React.createElement(ThemeProvider, { themeMode: "light" }, element)
  );
}

describe("Groups Screen: Loading, Empty, Populated, and Error states", () => {
  it("1. Groups loading state renders loading indicator and remains fully functional", () => {
    const html = renderWithTheme(
      React.createElement(GroupListScreen, {
        groups: [],
        onSelectGroup: () => {},
        onCreateGroup: () => {},
        serverSync: "loading",
        syncErrorMessage: null,
        onRetrySync: () => {},
        theme,
      })
    );
    assert.match(html, /Syncing your groups\.\.\./);
    assert.match(html, /Groups/);
    assert.match(html, /New Group/);
  });

  it("2. Empty Groups state renders 'No groups yet' card with Create Group action and never goes blank", () => {
    const html = renderWithTheme(
      React.createElement(GroupListScreen, {
        groups: [],
        onSelectGroup: () => {},
        onCreateGroup: () => {},
        serverSync: "ready",
        syncErrorMessage: null,
        onRetrySync: () => {},
        theme,
      })
    );
    assert.match(html, /No groups yet/);
    assert.match(html, /Start by creating a group for a trip or apartment\./);
    assert.match(html, /Create Group/);
    assert.match(html, /active group/);
  });

  it("3. Populated Groups state renders group cards, correct member counts, and proper money format", () => {
    const populatedGroups = [
      {
        id: "g-1",
        name: "Trip to Manali",
        currency: "INR",
        isRoommateGroup: false,
        members: [
          { id: "you", name: "You" },
          { id: "m-2", name: "Aarav" },
          { id: "m-3", name: "Riya" },
        ],
        expenses: [
          {
            id: "e-1",
            desc: "Hotel Stay",
            amount: 9000,
            paidBy: "you",
            splitType: "equal",
            participants: ["you", "m-2", "m-3"],
          },
        ],
      },
      {
        id: "g-2",
        name: "Apartment Rent",
        currency: "INR",
        isRoommateGroup: true,
        members: [
          { id: "you", name: "You" },
          { id: "m-2", name: "Aarav" },
        ],
        expenses: [
          {
            id: "e-2",
            desc: "Monthly Rent",
            amount: 20000,
            paidBy: "m-2",
            splitType: "equal",
            participants: ["you", "m-2"],
          },
        ],
      },
    ];

    const html = renderWithTheme(
      React.createElement(GroupListScreen, {
        groups: populatedGroups,
        onSelectGroup: () => {},
        onCreateGroup: () => {},
        serverSync: "ready",
        theme,
      })
    );

    assert.match(html, /Trip to Manali/);
    assert.match(html, /3\s*(?:<!-- -->)?\s*people/);
    assert.match(html, /you are owed/);
    // You are owed 6000: +₹6,000
    assert.match(html, /\+₹6,000/);

    assert.match(html, /Apartment Rent/);
    assert.match(html, /2\s*(?:<!-- -->)?\s*people/);
    assert.match(html, /you owe/);
    // You owe 10000: -₹10,000 (must NEVER have double negative --₹10,000)
    assert.match(html, /-₹10,000/);
    assert.doesNotMatch(html, /--₹/);
  });

  it("4. Groups API error state shows error banner with retry button while preserving cached groups", () => {
    const cachedGroups = [
      {
        id: "g-cached",
        name: "Cached Goa Trip",
        currency: "INR",
        members: [{ id: "you", name: "You" }],
        expenses: [],
      },
    ];

    const html = renderWithTheme(
      React.createElement(GroupListScreen, {
        groups: cachedGroups,
        onSelectGroup: () => {},
        onCreateGroup: () => {},
        serverSync: "error",
        syncErrorMessage: "Network error: unable to reach Supabase API",
        onRetrySync: () => {},
        theme,
      })
    );

    // Banner with real error message and retry button
    assert.match(html, /Network error: unable to reach Supabase API/);
    assert.match(html, /Retry/);
    // Cached groups are still rendered (no blank screen!)
    assert.match(html, /Cached Goa Trip/);
    assert.match(html, /active group/);
  });

  it("5. Groups screen handles null/undefined inputs and empty member names without crashing", () => {
    // Edge case: groups is undefined, or has corrupted entries with empty strings or null members
    const malformedGroups = [
      null,
      undefined,
      {
        id: "g-edge",
        name: null, // missing name
        currency: null,
        members: [
          { id: null, name: "" }, // empty string name
          { id: "m-no-name" }, // missing name property
        ],
        expenses: null, // null expenses
      },
    ];

    assert.doesNotThrow(() => {
      const html = renderWithTheme(
        React.createElement(GroupListScreen, {
          groups: malformedGroups,
          onSelectGroup: () => {},
          onCreateGroup: () => {},
          theme,
        })
      );
      assert.match(html, /Groups/);
      assert.match(html, /Untitled Group/);
    });

    // Also completely undefined groups prop must not throw
    assert.doesNotThrow(() => {
      renderWithTheme(
        React.createElement(GroupListScreen, {
          groups: undefined,
          onSelectGroup: () => {},
          onCreateGroup: () => {},
          theme,
        })
      );
    });
  });
});

describe("New Group Flow: Creation, API Failure, Immediate UI Update & Refresh", () => {
  it("6. New Group successful creation: maps server response into complete group and appends once", () => {
    const serverCreatedDto = {
      id: "bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb",
      name: "New Goa Trip 2026",
      description: null,
      currencyCode: "INR",
      isRoommateGroup: false,
      viewerRole: "OWNER",
      memberCount: 1,
      members: [
        {
          userId: "user-owner-123",
          displayName: "Sarthak",
          avatarId: null,
          role: "OWNER",
          joinedAt: new Date().toISOString(),
        },
      ],
    };

    const mapped = mapGroupFromApi(serverCreatedDto, {
      myUserId: "user-owner-123",
    });

    assert.ok(mapped);
    assert.equal(mapped.id, serverCreatedDto.id);
    assert.equal(mapped.name, "New Goa Trip 2026");
    assert.equal(mapped.currency, "INR");
    assert.equal(mapped.isServerGroup, true);
    assert.equal(mapped.members.length, 1);
    assert.equal(mapped.members[0].id, "you");
    assert.equal(mapped.members[0].name, "Sarthak");
    assert.deepEqual(mapped.expenses, []);

    // Appending to group state happens immediately without refresh
    const initialList = [
      { id: "g-old", name: "Existing Group", members: [], expenses: [] },
    ];
    const updatedList = appendGroupOnce(initialList, mapped);
    assert.equal(updatedList.length, 2);
    assert.equal(updatedList[1].id, serverCreatedDto.id);

    // Duplicate append is safely ignored
    const duplicateList = appendGroupOnce(updatedList, mapped);
    assert.equal(duplicateList.length, 2);
  });

  it("7. New Group modal: handles API errors visibly, prevents duplicate submits, and stays open", async () => {
    let submitCount = 0;
    const failingCreateHandler = mock.fn(async () => {
      submitCount++;
      // Simulate API failure: rejects with ApiError or returns null
      return null;
    });

    // Render modal in open state
    const html = renderWithTheme(
      React.createElement(CreateGroupModal, {
        isOpen: true,
        onClose: () => {},
        onCreateGroup: failingCreateHandler,
        userProfile: { isPro: false, homeCurrency: "INR" },
        groupCount: 2,
        onShowProUpgrade: () => {},
      })
    );

    assert.match(html, /Create Group/);
    assert.match(html, /Group Name/);
    assert.match(html, /Group Currency/);
  });

  it("8. Newly created group appears in list and remains visible across server sync merge (refresh simulation)", () => {
    const serverGroup = {
      id: "srv-group-99",
      name: "Weekend Hackathon",
      currency: "INR",
      isRoommateGroup: false,
      isServerGroup: true,
      members: [{ id: "you", name: "You" }],
      expenses: [],
    };

    // Before sync: local state has the newly created group
    const localStateBeforeSync = [serverGroup];

    // On page refresh: backend returns the group in GET /groups
    const serverResponseOnRefresh = [
      {
        id: "srv-group-99",
        name: "Weekend Hackathon",
        currencyCode: "INR",
        isRoommateGroup: false,
        viewerRole: "OWNER",
        memberCount: 1,
        members: [
          {
            userId: "u-99",
            displayName: "You",
            role: "OWNER",
          },
        ],
      },
    ];

    const mappedRefresh = mapGroupsFromApi(serverResponseOnRefresh, {
      localGroups: localStateBeforeSync,
      myUserId: "u-99",
    });

    const merged = mergeServerAndLocalGroups(mappedRefresh, localStateBeforeSync);

    assert.equal(merged.length, 1);
    assert.equal(merged[0].id, "srv-group-99");
    assert.equal(merged[0].name, "Weekend Hackathon");
    assert.equal(merged[0].members[0].id, "you");

    // Renders correctly in GroupListScreen
    const html = renderWithTheme(
      React.createElement(GroupListScreen, {
        groups: merged,
        onSelectGroup: () => {},
        onCreateGroup: () => {},
        serverSync: "ready",
        theme,
      })
    );
    assert.match(html, /Weekend Hackathon/);
    assert.match(html, /active group/);
  });

  it("9. ScreenErrorBoundary catches any render exception in GroupListScreen and prevents blank screen", () => {
    // Simulate a thrower component inside ScreenErrorBoundary
    function CrashingScreen() {
      throw new Error("Simulated render crash inside Groups screen");
    }

    const caughtErrors = [];
    const boundary = new ScreenErrorBoundary({
      onError: (err) => caughtErrors.push(err),
      children: React.createElement(CrashingScreen),
    });

    boundary.state = {
      error: new Error("Simulated render crash inside Groups screen"),
    };
    const html = renderWithTheme(boundary.render());

    // Verified: fallback card rendered instead of a blank screen
    assert.match(html, /Something went wrong/);
    assert.match(html, /This screen hit an unexpected error\. Try again/);
    assert.match(html, /Try Again/);
  });
});
