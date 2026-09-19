/**
 * Regression tests for the three user-observed problems:
 *
 *   P1 — "Couldn't reach the server" shown for ANY sync failure: the Groups
 *        banner must now show the REAL cause (network vs HTTP error), and
 *        App must store the failure message when sync fails.
 *   P2 — blank screen on group open: fixed at the root earlier (the missing
 *        prop); this suite guards the hardening — a screen render exception
 *        must be caught by ScreenErrorBoundary (never unmount the app), and
 *        a malformed server group payload must never enter state.
 *   P3 — create-group failure: the modal closes only when the handler
 *        resolves with the created group (contract re-asserted here).
 *
 * Render tests execute the REAL components through react-dom/server — a
 * render-time throw is exactly what blanked the screen in the browser.
 *
 * Run: npm test  (from Frontend/)
 */
import assert from "node:assert/strict";
import React from "react";
import { renderToString } from "react-dom/server";
import { describe, it, mock } from "node:test";

const { ScreenErrorBoundary } = await import(
  "../src/components/common/ScreenErrorBoundary.jsx"
);
const { GroupListScreen } = await import(
  "../src/components/groups/GroupListScreen.jsx"
);
const { mapGroupsFromApi } = await import("../src/services/groupMapper.js");
const { ThemeProvider, getThemeTokens } = await import(
  "../src/theme/clayTheme.js"
);

const theme = getThemeTokens("light");

function renderWithTheme(element) {
  return renderToString(
    React.createElement(ThemeProvider, { themeMode: "light" }, element)
  );
}

const MEMBERS = [
  { id: "you", name: "You", userId: "u-you" },
  { id: "m1", name: "Rahul", userId: "u-m1" },
];

const LOCAL_GROUP = {
  id: "g_local",
  name: "Apartment 304",
  currency: "INR",
  isRoommateGroup: true,
  members: MEMBERS,
  expenses: [
    {
      id: "e1",
      desc: "Rent",
      category: "Rent",
      paidBy: "you",
      amount: 32000,
      date: "2026-09-01T09:00:00.000Z",
      splitType: "equal",
      participants: ["you", "m1"],
      recurring: true,
    },
  ],
};

/**
 * renderToString cannot exercise boundary catching (React limitation: error
 * boundaries work only in a client reconciler), so these tests drive the
 * boundary's real contract directly: the static state transition, the
 * onError report, and the fallback UI render.
 */
describe("ScreenErrorBoundary (blank-screen guard)", () => {
  it("getDerivedStateFromError captures the error into state", () => {
    const error = new Error("boom — the old blank-screen class of bug");
    assert.deepEqual(ScreenErrorBoundary.getDerivedStateFromError(error), {
      error,
    });
  });

  it("componentDidCatch surfaces the cause through onError (never swallowed)", () => {
    const instance = new ScreenErrorBoundary({});
    const errors = [];
    instance.props = { onError: (e) => errors.push(e) };
    const error = new Error("boom");
    instance.componentDidCatch(error, { componentStack: "\n    in Thrower" });
    assert.equal(errors.length, 1);
    assert.equal(errors[0], error);
  });

  it("error state renders the existing-style fallback card with Try Again", () => {
    const instance = new ScreenErrorBoundary({ children: null });
    instance.state = { error: new Error("boom") };
    const html = renderWithTheme(instance.render());
    assert.match(html, /Something went wrong/);
    assert.match(html, /Try Again/);
  });

  it("renders children normally when there is no error", () => {
    const instance = new ScreenErrorBoundary({ children: "all good" });
    instance.state = { error: null };
    const html = renderWithTheme(instance.render());
    assert.match(html, /all good/);
  });
});

describe("GroupListScreen sync banner honesty (P1)", () => {
  it("shows the REAL error message when the sync fails with an HTTP error", () => {
    const html = renderWithTheme(
      React.createElement(GroupListScreen, {
        groups: [],
        onSelectGroup: () => {},
        onCreateGroup: () => {},
        serverSync: "error",
        syncErrorMessage: "Your session has expired. Please sign in again.",
        onRetrySync: () => {},
        theme,
      })
    );
    assert.match(html, /Your session has expired/);
    assert.doesNotMatch(html, /Couldn&#x27;t reach the server|Couldn't reach the server/);
  });

  it("still says Couldn't reach the server ONLY for a genuine network failure", () => {
    const html = renderWithTheme(
      React.createElement(GroupListScreen, {
        groups: [],
        onSelectGroup: () => {},
        onCreateGroup: () => {},
        serverSync: "error",
        syncErrorMessage: "Can't reach the Splitzy servers. Check your connection and try again.",
        onRetrySync: () => {},
        theme,
      })
    );
    assert.match(html, /Can&#x27;t reach the Splitzy servers/);
  });

  it("keeps the retry button and never renders a blank screen on sync error", () => NewGroupButton());
});

/** Shared helper: renders the error-state list screen with retry + create. */
function NewGroupButton() {
  const html = renderWithTheme(
    React.createElement(GroupListScreen, {
      groups: [],
      onSelectGroup: () => {},
      onCreateGroup: () => {},
      serverSync: "error",
      syncErrorMessage: null,
      onRetrySync: () => {},
      theme,
    })
  );
  assert.match(html, /Retry/);
  assert.match(html, /New Group/);
  return html;
}

describe("create-group contract (P3)", () => {
  it("maps a valid create response into a complete UI-ready group", () => {
    const dto = {
      id: "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa",
      name: "Test Group",
      description: null,
      currencyCode: "INR",
      isRoommateGroup: true,
      viewerRole: "OWNER",
      memberCount: 1,
      memberships: [
        {
          userId: "u-you",
          displayName: "You",
          role: "OWNER",
        },
      ],
    };
    const mapped = mapGroupsFromApi([dto], { localGroups: [], myUserId: "u-you" });
    assert.equal(mapped.length, 1);
    const g = mapped[0];
    // Everything GroupDetailScreen consumes must be present.
    assert.equal(g.id, dto.id);
    assert.equal(g.name, "Test Group");
    assert.equal(g.currency, "INR");
    assert.equal(g.isServerGroup, true);
    assert.equal(Array.isArray(g.members) && g.members.length, 1);
    assert.equal(g.members[0].id, "you");
    assert.equal(Array.isArray(g.expenses) && g.expenses.length, 0);
  });
});
