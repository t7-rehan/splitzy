import React, { useState, useEffect, useRef } from "react";
import { GLOBAL_STYLES, getThemeTokens, ThemeProvider } from "./theme/clayTheme";
import {
  loadProfile,
  saveProfile,
  loadGroups,
  saveGroups,
  loadAuthSession,
  saveAuthSession,
  clearAuthSession,
  clearLegacyAuthSession,
  clearUserCache,
  loadStoredTheme,
} from "./services/storage";
import { Coins } from "lucide-react";

// Services — authentication (Firebase identity) + backend integration (Task 8)
import {
  subscribeToAuthState,
  signOut as firebaseSignOut,
} from "./services/authService";
import { fetchBackendUser, saveBackendProfile } from "./services/bootstrapService";
import {
  fetchMyGroups,
  fetchGroupDetails,
  createGroup as apiCreateGroup,
  searchUsersByUsername,
  addGroupMember,
  removeGroupMember,
} from "./services/groupsService";
import {
  mapGroupFromApi,
  mapGroupsFromApi,
  mergeServerAndLocalGroups,
} from "./services/groupMapper";
import { appendGroupOnce } from "./services/groupState";
import { ScreenErrorBoundary } from "./components/common/ScreenErrorBoundary";
import {
  fetchGroupExpenses,
  createExpense as apiCreateExpense,
  updateExpense as apiUpdateExpense,
  deleteExpense as apiDeleteExpense,
} from "./services/expensesService";
import {
  buildExpenseApiPayload,
  buildExpensePatchPayload,
  mapExpenseFromApi,
  mapExpensesFromApi,
  mergeServerAndLocalExpenses,
} from "./services/expenseMapper";

// Components
import { MobileContainer } from "./components/common/MobileContainer";
import { BottomNav } from "./components/navigation/BottomNav";
import { Toast } from "./components/common/Toast";
import { LandingAnimation } from "./components/auth/LandingAnimation";
import { AuthScreen } from "./components/auth/AuthScreen";
import { OnboardingFlow } from "./components/onboarding/OnboardingFlow";

// Screens
import { HomeScreen } from "./components/home/HomeScreen";
import { GroupListScreen } from "./components/groups/GroupListScreen";
import { GroupDetailScreen } from "./components/groups/GroupDetailScreen";
import { CalendarScreen } from "./components/calendar/CalendarScreen";
import { InsightsScreen } from "./components/insights/InsightsScreen";
import { SettingsScreen } from "./components/settings/SettingsScreen";

// Modals
import { CreateGroupModal } from "./components/groups/CreateGroupModal";
import { AddExpenseModal } from "./components/expenses/AddExpenseModal";
import { MonthlyGraphModal } from "./components/home/MonthlyGraphModal";
import { ProUpgradeModal } from "./components/pro/ProUpgradeModal";
import { UPIPaymentModal } from "./components/pro/UPIPaymentModal";
import { GroupLinkModal } from "./components/pro/GroupLinkModal";

export default function App() {
  const [authSession, setAuthSession] = useState(() => loadAuthSession());
  const [firebaseReady, setFirebaseReady] = useState(false);
  const [profile, setProfile] = useState(() => loadProfile(authSession?.uid));
  const [themeMode, setThemeMode] = useState(() => profile?.theme || loadStoredTheme() || "light");
  const [groups, setGroups] = useState(() => (authSession?.uid ? loadGroups(authSession.uid) : []));

  // Task 8: server-backed identity + groups state.
  //   backendUser     — the PostgreSQL User resolved from the Firebase identity
  //                     via GET /auth/me (the backend is authoritative; the
  //                     frontend never creates or assigns it).
  //   groupsSyncState — 'idle' | 'loading' | 'ready' | 'error' for the groups sync.
  //   syncNonce       — bump to retry a failed sync.
  //   creatingGroup   — guards double-submits of server group creation.
  const [backendUser, setBackendUser] = useState(null);
  const [userProfileReady, setUserProfileReady] = useState(false);
  const [groupsSyncState, setGroupsSyncState] = useState("idle");
  // The sync failure's user-safe message — the Groups screen banner shows the
  // REAL cause (network vs HTTP error) instead of a hardcoded network text.
  const [syncErrorMessage, setSyncErrorMessage] = useState(null);
  const [syncNonce, setSyncNonce] = useState(0);
  const [creatingGroup, setCreatingGroup] = useState(false);
  // Task 9: server-backed expense sync (same pattern as the groups sync) and
  // deletion bookkeeping for the optimistic-none UI (ExpenseCard confirm row).
  const [expensesSyncState, setExpensesSyncState] = useState("idle");
  const [deletingExpenseIds, setDeletingExpenseIds] = useState([]);
  
  // Auth navigation stage: 'landing' | 'login'
  const [authStage, setAuthStage] = useState("landing");
  const [authEmail, setAuthEmail] = useState("");

  // App navigation
  const [activeTab, setActiveTab] = useState("home");
  const [selectedGroupId, setSelectedGroupId] = useState(null);

  // Modals state
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [showAddExpense, setShowAddExpense] = useState(false);
  const [showMonthlyGraph, setShowMonthlyGraph] = useState(false);
  const [editingExpense, setEditingExpense] = useState(null);
  const [showProUpgrade, setShowProUpgrade] = useState(false);
  const [proCustomReason, setProCustomReason] = useState("");
  const [showUPI, setShowUPI] = useState(false);
  const [payeeDetails, setPayeeDetails] = useState(null);
  const [showShareLink, setShowShareLink] = useState(false);

  // Toast state
  const [toast, setToast] = useState(null);

  const theme = getThemeTokens(themeMode);
  const authSessionRef = useRef(authSession);
  useEffect(() => {
    authSessionRef.current = authSession;
  }, [authSession]);

  // Latest-groups mirror for async flows that must read current state without
  // re-running (the groups sync reads it right before committing its result).
  const groupsRef = useRef(groups);
  useEffect(() => {
    groupsRef.current = groups;
  }, [groups]);

  // Firebase auth state is the single source of truth for sign-in. The listener
  // fires once with the current session (so refresh restores login) and again
  // on every sign-in/sign-out. Until the first Firebase event arrives we keep
  // showing the mirrored session; null transitions before that are mirror
  // artifacts, not real sign-outs.
  useEffect(() => {
    clearLegacyAuthSession();
    const unsubscribe = subscribeToAuthState((firebaseUser, error) => {
      setFirebaseReady(true);
      if (error) {
        // Firebase unavailable/unconfigured: fall back to the local mirror.
        return;
      }
      if (firebaseUser) {
        const sessionData = {
          uid: firebaseUser.uid,
          email: firebaseUser.email,
          displayName: firebaseUser.displayName,
          authType: "google",
          loggedInAt: new Date().toISOString(),
        };
        setUserProfileReady(false);
        const previousUid = authSessionRef.current?.uid;
        saveAuthSession(sessionData);
        setAuthSession((prev) => {
          if (prev?.uid && prev.uid !== firebaseUser.uid) {
            setSelectedGroupId(null);
            setBackendUser(null);
          }
          return sessionData;
        });

        if (previousUid && previousUid !== firebaseUser.uid) {
          clearUserCache(previousUid);
        }

        let userProfile = loadProfile(firebaseUser.uid);
        if (!userProfile) {
          userProfile = {
            email: firebaseUser.email,
            name: firebaseUser.displayName || "Splitzy User",
            homeCurrency: "INR",
            theme: "light",
            isPro: false,
            profileCompleted: false,
          };
        }
        setProfile(userProfile);

        const userGroups = loadGroups(firebaseUser.uid);
        setGroups(userGroups);
      } else {
        // Real sign-out
        setAuthSession((current) => {
          if (current?.authType === "google") {
            clearAuthSession();
            setUserProfileReady(false);
            setBackendUser(null);
            setGroups([]);
            setProfile(null);
            setSelectedGroupId(null);
            return null;
          }
          return current;
        });
      }
    });
    return unsubscribe;
  }, []);

  // Save profile changes to localStorage scoped to active UID
  useEffect(() => {
    if (profile && authSession?.uid) {
      saveProfile(profile, authSession.uid);
      if (profile.theme && profile.theme !== themeMode) {
        setThemeMode(profile.theme);
      }
    }
  }, [profile, authSession?.uid]);

  // Save groups changes to localStorage scoped to active UID
  useEffect(() => {
    if (groups && authSession?.uid) {
      saveGroups(groups, authSession.uid);
    }
  }, [groups, authSession?.uid]);

  // ---- Server groups sync (Task 8) ---------------------------------------
  // Firebase auth → GET /auth/me → GET /groups. PostgreSQL is authoritative
  // for server-backed groups; local-only groups (demo/pre-integration data)
  // remain and keep working unchanged. Cached copies of server groups in
  // localStorage are a READ CACHE only — server data always wins on sync and
  // colliding local twins are dropped, so there is never a second source of
  // truth for the same group. Pre-Firebase local sessions are not synced.
  useEffect(() => {
    if (!firebaseReady) return;
    if (!authSession || authSession.authType !== "google") return;
    let cancelled = false;
    setGroupsSyncState("loading");
    setSyncErrorMessage(null);
    (async () => {
      try {
        const user = await fetchBackendUser();
        if (cancelled) return;
        setBackendUser(user);

        const mergedProfile = {
          id: user.id,
          email: user.email,
          name: user.displayName || "Splitzy User",
          username: user.username || null,
          birthdate: user.birthdate || null,
          profileCompleted: Boolean(user.profileCompleted),
          photoUrl: user.photoUrl || null,
          homeCurrency: "INR",
          theme: user.theme || profile?.theme || "light",
          isPro: Boolean(profile?.isPro),
          avatarId: profile?.avatarId || "avatar_cool",
          upiId: user.upiId || null,
          upiQrDataUrl: user.upiQrDataUrl || null,
        };
        setProfile((current) => ({
          ...current,
          ...mergedProfile,
          profileCompleted: Boolean(user.profileCompleted),
        }));
        saveProfile(mergedProfile, authSession.uid);
        setUserProfileReady(true);

        const summaries = await fetchMyGroups();
        if (cancelled) return;
        // Authoritative member lists live on the detail endpoint; a detail
        // failure falls back to its summary DTO (bounded 1+N — groups are few).
        const detailed = await Promise.all(
          summaries.map((dto) => fetchGroupDetails(dto.id).catch(() => dto))
        );
        if (cancelled) return;
        const mapped = mapGroupsFromApi(detailed, {
          localGroups: groupsRef.current,
          myUserId: user.id,
        });
        // Commit ONLY fully mapped groups. A half-mapped entry (e.g. a group
        // whose members array failed to map) must never enter state — the
        // detail screen would render undefined fields. mapGroupsFromApi
        // already drops null mappings; this keeps the invariant explicit.
        if (mapped.some((g) => !g || !g.id || !Array.isArray(g.members))) {
          throw new Error("Malformed group payload from server");
        }
        setGroups((current) => {
          // Server data wins; local twins of server groups are dropped so
          // there is never a second source of truth for the same group.
          return mergeServerAndLocalGroups(mapped, current);
        });
        setGroupsSyncState("ready");
      } catch (error) {
        if (cancelled) return;
        // /auth/me is the gate for the profile screen. Always resolve that
        // gate on failure so a network, CORS, or malformed API response can
        // never leave the app on an infinite loading screen.
        setUserProfileReady(true);
        if (error?.status === 401) {
          showToast({
            message: "Your session expired. Please sign in again.",
            type: "error",
          });
          await firebaseSignOut();
          clearAuthSession();
          setAuthSession(null);
          setBackendUser(null);
          setGroups([]);
          setProfile(null);
          setSelectedGroupId(null);
          return;
        }
        setGroupsSyncState("error");
        setSyncErrorMessage(
          error?.userMessage || "Couldn't sync your groups from the server."
        );
        // Distinct, honest messages: a genuine network failure is different
        // from an HTTP failure (which carries the backend's safe message).
        showToast({
          message:
            error?.userMessage ||
            "Couldn't sync your groups from the server.",
          type: "error",
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [firebaseReady, authSession, syncNonce]);

  // ---- Server expenses sync (Task 9) --------------------------------------
  // PostgreSQL is authoritative for expenses of server-backed groups. Expenses
  // fetch AFTER the group list resolves (the group sync needs it; the expense
  // sync needs the group id + viewer identity). Local expenses of genuinely
  // local groups are untouched; stale local copies of server expenses are
  // replaced (SERVER > LOCAL CACHE) while still-unpersisted local entries are
  // kept so a just-added expense never vanishes mid-flight.
  useEffect(() => {
    if (groupsSyncState !== "ready") return;
    if (!backendUser) return;
    let cancelled = false;
    setExpensesSyncState("loading");
    (async () => {
      try {
        const serverGroups = groups.filter((g) => g.isServerGroup);
        const results = await Promise.all(
          serverGroups.map(async (g) => {
            try {
              const list = await fetchGroupExpenses(g.id);
              return [g, mapExpensesFromApi(list, { myUserId: backendUser.id })];
            } catch {
              return [g, null]; // non-fatal: keep current view of this group
            }
          })
        );
        if (cancelled) return;
        setGroups((current) =>
          current.map((g) => {
            if (!g.isServerGroup) return g;
            const mapped = results.find(([grp]) => grp.id === g.id)?.[1];
            if (mapped === null || mapped === undefined) return g;
            return {
              ...g,
              expenses: mergeServerAndLocalExpenses(mapped, g.expenses, {
                groupIsServer: true,
              }),
            };
          })
        );
        if (!cancelled) setExpensesSyncState("ready");
      } catch {
        if (!cancelled) setExpensesSyncState("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [groupsSyncState, backendUser, syncNonce]);

  // Opening a server-backed group re-reads authoritative details (members,
  // roles, metadata) and, in Task 9, the authoritative expense list.
  // Track the fetch generation so a SLOW response for a PREVIOUSLY opened
  // group can never overwrite the group now on screen (open A → open B fast →
  // A's late response must not clobber B's data).
  const openFetchRef = useRef(0);
  useEffect(() => {
    if (!selectedGroupId || !backendUser) return;
    const target = groups.find((g) => g.id === selectedGroupId);
    if (!target || !target.isServerGroup) return;
    const generation = ++openFetchRef.current;
    let cancelled = false;
    (async () => {
      try {
        const [dto, expenseDtos] = await Promise.all([
          fetchGroupDetails(selectedGroupId),
          fetchGroupExpenses(selectedGroupId).catch(() => null),
        ]);
        if (cancelled) return;
        setGroups((current) =>
          current.map((g) => {
            if (g.id !== selectedGroupId) return g;
            const mapped = mapGroupFromApi(dto, {
              localGroup: g,
              myUserId: backendUser.id,
            });
            if (!mapped) return g; // malformed DTO — keep the current view
            if (expenseDtos) {
              mapped.expenses = mergeServerAndLocalExpenses(
                mapExpensesFromApi(expenseDtos, { myUserId: backendUser.id }),
                g.expenses,
                { groupIsServer: true }
              );
            }
            return mapped;
          })
        );
      } catch {
        // Non-fatal by design: the last known (mapped, complete) view stays
        // on screen. Open-group failures never blank or degrade the UI.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedGroupId, backendUser]);

  const showToast = (messageOrToast, type = "info") => {
    if (typeof messageOrToast === "string") {
      setToast({ message: messageOrToast, type });
    } else {
      setToast(messageOrToast);
    }
  };

  const handleThemeChange = (newTheme) => {
    setThemeMode(newTheme);
    if (profile) {
      const updated = { ...profile, theme: newTheme };
      setProfile(updated);
      saveProfile(updated);
    }
  };

  const handleAuthenticate = (authData) => {
    setAuthEmail(authData.email);
    const sessionData = {
      uid: authData.uid,
      email: authData.email,
      authType: authData.authType,
      loggedInAt: new Date().toISOString(),
    };

    // Check if existing profile is already completed
    if (profile && profile.profileCompleted) {
      saveAuthSession(sessionData);
      setAuthSession(sessionData);
      showToast({ message: `Welcome back, ${profile.name.split(" ")[0]}!`, type: "success" });
    } else {
      // Need profile creation
      setAuthSession(sessionData);
    }
  };

  const handleCompleteProfile = async (newProfile) => {
    const fullProfile = {
      ...newProfile,
      email: authEmail || newProfile.email || "user@splitzy.app",
      birthdate: newProfile.birthdate || newProfile.birthday || null,
      profileCompleted: true,
    };

    try {
      const saved = await saveBackendProfile({
        name: fullProfile.name,
        username: fullProfile.username,
        birthdate: fullProfile.birthdate,
        avatarId: fullProfile.avatarId,
        homeCurrency: fullProfile.homeCurrency,
        theme: fullProfile.theme,
        upiId: fullProfile.upiId || null,
        upiQrDataUrl: fullProfile.upiQrDataUrl || null,
      });
      const backendProfile = {
        ...fullProfile,
        ...saved,
        birthdate: saved?.birthdate || fullProfile.birthdate || null,
        profileCompleted: Boolean(saved?.profileCompleted),
      };
      setBackendUser(backendProfile);
      setProfile(backendProfile);
      saveProfile(backendProfile, authSession?.uid);
    } catch (error) {
      setProfile(fullProfile);
      saveProfile(fullProfile, authSession?.uid);
      showToast({ message: "Profile saved locally. Please refresh if the server is busy.", type: "info" });
    }
    showToast({ message: `Welcome to Splitzy, ${fullProfile.name.split(" ")[0]}!`, type: "success" });
  };

  const handleUpdateProfile = async (updatedProfile) => {
    const next = {
      ...updatedProfile,
      birthdate: updatedProfile.birthdate || updatedProfile.birthday || null,
      profileCompleted: true,
    };
    try {
      const saved = await saveBackendProfile({
        name: next.name,
        username: next.username,
        birthdate: next.birthdate,
        avatarId: next.avatarId,
        homeCurrency: next.homeCurrency,
        theme: next.theme,
        upiId: next.upiId || null,
      });
      const merged = { ...next, ...saved, birthdate: saved?.birthdate || next.birthdate || null };
      setBackendUser(merged);
      setProfile(merged);
      saveProfile(merged, authSession?.uid);
    } catch {
      setProfile(next);
      saveProfile(next, authSession?.uid);
    }
    showToast({ message: "Profile updated successfully", type: "success" });
  };

  const handleLogout = async () => {
    await firebaseSignOut();
    clearAuthSession();
    setAuthSession(null);
    setBackendUser(null);
    setGroups([]);
    setProfile(null);
    setAuthStage("login");
    setSelectedGroupId(null);
    setActiveTab("home");
    showToast({ message: "Logged out of Splitzy", type: "info" });
  };

  const handleTogglePro = (isPro) => {
    const nextProfile = { ...profile, isPro };
    setProfile(nextProfile);
    showToast({
      message: isPro ? "Unlocked Splitzy Pro features!" : "Reverted to Free Tier",
      type: "success",
    });
  };

  // Server-backed creation (Task 8): POST /groups decides id, creator, OWNER
  // membership and timestamps — the client sends only content fields. On
  // failure nothing fake is inserted; the error surfaces with the existing toast.
  const handleCreateGroup = async (groupData) => {
    if (creatingGroup) return null;
    setCreatingGroup(true);
    try {
      const dto = await apiCreateGroup({
        name: groupData.name,
        currencyCode: groupData.currency,
        isRoommateGroup: groupData.isRoommateGroup,
      });
      const mapped = mapGroupFromApi(dto, {
        localGroup:
          groups.find((g) => !g.isServerGroup && g.name === dto.name) ?? null,
        myUserId: backendUser?.id ?? null,
      });
      if (!mapped) throw new Error("Invalid group data received from server");
      // Inserted exactly once — a duplicate response/re-submit can never
      // create two entries with the same server id.
      setGroups((current) => appendGroupOnce(current, mapped));
      setSelectedGroupId(mapped.id);
      setActiveTab("groups");
      showToast({ message: `Created group "${mapped.name}"`, type: "success" });
      // Task 8 modal contract: resolve with the created group on success so
      // CreateGroupModal closes. (Its absence made the modal report failure
      // — and stay open — after a successful creation.)
      return mapped;
    } catch (error) {
      showToast({
        message:
          error?.userMessage ||
          "Could not create the group. Please try again.",
        type: "error",
      });
      return null;
    } finally {
      setCreatingGroup(false);
    }
  };

  const handleUpdateGroup = (updatedGroup, meta = {}) => {
    // Task 9: explicit server-backed expense removal (delete confirmation).
    // The DELETE call must succeed before the expense leaves state — on
    // failure nothing is removed and the error is surfaced via the toast.
    if (meta.deletedExpenseId) {
      return removeExpenseOnServer(updatedGroup.id, meta.deletedExpenseId);
    }
    const current = groups.find((g) => g.id === updatedGroup.id);
    // Task 9: server-backed expense creation from non-modal flows (settlement
    // "Settle" button, recurring "Log monthly"). No optimistic insertion —
    // the mapped server expense enters state only after PostgreSQL confirms.
    if (meta.createExpensePayload && current?.isServerGroup) {
      return handleSaveExpense(meta.createExpensePayload);
    }
    // Server-backed groups: membership is authoritative in PostgreSQL. The
    // member UI (free-text local names) cannot address server users, so member
    // changes are politely refused while everything else keeps working.
    if (current?.isServerGroup && updatedGroup.members !== current.members) {
      const membersChanged =
        JSON.stringify(updatedGroup.members) !== JSON.stringify(current.members);
      if (membersChanged) {
        showToast({
          message: "Members of server-backed groups are managed on the server — member edits aren't available yet.",
          type: "info",
        });
        setGroups(
          groups.map((g) =>
            g.id === updatedGroup.id
              ? { ...updatedGroup, members: current.members }
              : g
          )
        );
        return;
      }
    }
    setGroups(groups.map((g) => (g.id === updatedGroup.id ? updatedGroup : g)));
  };

  const handleSearchGroupUsers = (username) => searchUsersByUsername(username);

  const handleAddGroupMember = async (groupId, username) => {
    const dto = await addGroupMember(groupId, username);
    setGroups((current) => current.map((group) => {
      if (group.id !== groupId) return group;
      const member = mapGroupFromApi({ ...group, members: [dto] }, { localGroup: group, myUserId: backendUser?.id }).members.find((item) => item.userId === dto.userId);
      return member && !group.members.some((item) => item.userId === member.userId)
        ? { ...group, members: [...group.members, member], memberCount: group.members.length + 1 }
        : group;
    }));
    showToast({ message: `${dto.displayName} added to ${groups.find((group) => group.id === groupId)?.name || "the group"}`, type: "success" });
    return dto;
  };

  const handleRemoveGroupMember = async (groupId, member) => {
    if (!member.userId) return;
    await removeGroupMember(groupId, member.userId);
    setGroups((current) => current.map((group) => group.id === groupId
      ? { ...group, members: group.members.filter((item) => item.userId !== member.userId), memberCount: Math.max(0, group.members.length - 1) }
      : group));
    showToast({ message: `${member.name} removed from the group`, type: "info" });
  };

  const handleDeleteGroup = (groupId) => {
    const target = groups.find((g) => g.id === groupId);
    // The backend has no group-deletion endpoint (by design so far) — never
    // pretend a server-backed group was deleted.
    if (target?.isServerGroup) {
      showToast({
        message: "Server-backed groups can't be deleted from the app yet.",
        type: "info",
      });
      return;
    }
    setGroups(groups.filter((g) => g.id !== groupId));
    if (selectedGroupId === groupId) setSelectedGroupId(null);
    showToast({ message: `Deleted group "${target?.name || "Group"}"`, type: "info" });
  };

  // ---------------------------------------------------------------------------
  // Server-backed expense persistence (Task 9) — request → server → state.
  // NEVER optimistic: the modal stays open and the UI unchanged until
  // PostgreSQL confirms; only then does the server-authoritative expense
  // (its calculated shares) enter state.
  // ---------------------------------------------------------------------------

  const replaceExpenseInGroup = (groupId, expense, { removeLocalId = null } = {}) => {
    setGroups((current) =>
      current.map((g) => {
        if (g.id !== groupId) return g;
        let expenses = g.expenses;
        // A carried-over local copy that was just persisted server-side must
        // not linger as a duplicate of the real (server) expense.
        if (removeLocalId) {
          expenses = expenses.filter((e) => e.isServerExpense || e.id !== removeLocalId);
        }
        const existingIdx = expenses.findIndex((e) => e.id === expense.id);
        expenses =
          existingIdx >= 0
            ? expenses.map((e) => (e.id === expense.id ? expense : e))
            : [...expenses, expense];
        return { ...g, expenses };
      })
    );
  };

  const handleSaveExpense = async (expensePayload) => {
    const targetGroup = groups.find((g) => g.id === selectedGroupId) || groups[0];
    if (!targetGroup) return null;

    // Server-backed groups always persist through the API. The viewer's
    // membership entry carries the server user id ("you" -> members.find(...));
    // without it there is nothing the backend could address.
    if (targetGroup.isServerGroup) {
      const existing = targetGroup.expenses.find((e) => e.id === expensePayload.id);
      try {
        if (existing && existing.isServerExpense) {
          // EDIT — fields-only patch when the split is unchanged so stored
          // participant/item rows are preserved (Task 6 update contract).
          const patch = buildExpensePatchPayload(
            expensePayload,
            targetGroup,
            existing
          );
          const dto = await apiUpdateExpense(targetGroup.id, existing.id, patch);
          const mapped = mapExpenseFromApi(dto, { myUserId: backendUser?.id ?? null });
          replaceExpenseInGroup(targetGroup.id, mapped);
          showToast({ message: "Expense updated", type: "success" });
          return mapped;
        }
        // CREATE
        const payload = buildExpenseApiPayload(expensePayload, targetGroup);
        const dto = await apiCreateExpense(targetGroup.id, payload);
        const mapped = mapExpenseFromApi(dto, { myUserId: backendUser?.id ?? null });
        replaceExpenseInGroup(targetGroup.id, mapped, {
          removeLocalId: expensePayload.id,
        });
        showToast({ message: "Expense added!", type: "success" });
        return mapped;
      } catch (error) {
        showToast({
          message:
            error?.userMessage ||
            "Couldn't save the expense. Please check your connection and try again.",
          type: "error",
        });
        return null; // modal stays open; no fake expense is ever inserted
      }
    }

    // Genuinely local group: preserve the original synchronous local behavior.
    const localExpense = { ...expensePayload };
    const existingIdx = targetGroup.expenses.findIndex((e) => e.id === localExpense.id);
    const updatedExpenses =
      existingIdx >= 0
        ? targetGroup.expenses.map((e) => (e.id === localExpense.id ? localExpense : e))
        : [...targetGroup.expenses, localExpense];
    setGroups(
      groups.map((g) => (g.id === targetGroup.id ? { ...g, expenses: updatedExpenses } : g))
    );
    showToast({ message: existingIdx >= 0 ? "Expense updated" : "Expense added!", type: "success" });
    return localExpense;
  };

  const removeExpenseOnServer = async (groupId, expenseId) => {
    setDeletingExpenseIds((ids) => [...ids, expenseId]);
    try {
      await apiDeleteExpense(groupId, expenseId);
      setGroups((current) =>
        current.map((g) =>
          g.id === groupId
            ? { ...g, expenses: g.expenses.filter((e) => e.id !== expenseId) }
            : g
        )
      );
      showToast({ message: "Expense deleted", type: "info" });
      return true;
    } catch (error) {
      showToast({
        message:
          error?.userMessage ||
          "Couldn't delete the expense. Please check your connection and try again.",
        type: "error",
      });
      return false; // expense stays visible
    } finally {
      setDeletingExpenseIds((ids) => ids.filter((id) => id !== expenseId));
    }
  };

  const handleOpenUPIModal = (details) => {
    setPayeeDetails(details);
    setShowUPI(true);
  };

  // Task 9: the UPI "settled" marker becomes a real server expense too —
  // payer = the viewer, participant = the payee. On failure nothing is saved
  // and the error surfaces via toast; the modal shows its own flow state.
  const handleConfirmUPIPayment = async (details) => {
    const targetGroup = groups.find((g) => g.id === selectedGroupId) || groups[0];
    if (!targetGroup) return null;

    const settlementExpense = {
      desc: `UPI Settlement to ${details.payeeName}`,
      category: "Other",
      paidBy: "you",
      amount: details.amount,
      date: new Date().toISOString(),
      splitType: "equal",
      participants: [targetGroup.members.find((m) => m.name === details.payeeName)?.id || targetGroup.members[0].id],
      recurring: false,
    };

    const saved = await handleSaveExpense(settlementExpense);
    if (saved) {
      showToast({ message: `Payment of ₹${details.amount} marked as settled!`, type: "success" });
    }
    return saved;
  };

  const handleTriggerProUpgrade = (reason = "") => {
    setProCustomReason(reason);
    setShowProUpgrade(true);
  };

  const handleResetData = async () => {
    const currentUid = authSession?.uid;
    await firebaseSignOut();
    if (currentUid) {
      clearUserCache(currentUid);
    } else {
      localStorage.clear();
    }
    clearAuthSession();
    setProfile(null);
    setAuthSession(null);
    setBackendUser(null);
    setGroups([]);
    setSelectedGroupId(null);
    setActiveTab("home");
    setAuthStage("landing");
  };

  const selectedGroup = groups.find((g) => g.id === selectedGroupId);

  // 1. If not authenticated: Show Landing Animation or Auth Screen
  // Hold on the shell until Firebase's first auth-state report arrives, so a
  // refreshing Google user goes straight into the app instead of the login.
  if (!authSession && !firebaseReady) {
    return (
      <ThemeProvider themeMode={themeMode} setThemeMode={handleThemeChange}>
        <MobileContainer>
          <style>{GLOBAL_STYLES(themeMode === "dark")}</style>
          <div
            style={{
              minHeight: "100vh",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: "14px",
            }}
          >
            <div
              style={{
                width: "56px",
                height: "56px",
                borderRadius: "18px",
                backgroundColor: theme.primary,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: theme.clayRaised,
              }}
            >
              <Coins size={30} color="#FFF" />
            </div>
            <div style={{ fontSize: "14px", fontWeight: "700", color: theme.muted }}>
              Loading Splitzy...
            </div>
          </div>
        </MobileContainer>
      </ThemeProvider>
    );
  }

  if (!authSession) {
    return (
      <ThemeProvider themeMode={themeMode} setThemeMode={handleThemeChange}>
        <MobileContainer>
          <style>{GLOBAL_STYLES(themeMode === "dark")}</style>
          {authStage === "landing" ? (
            <LandingAnimation onGetStarted={() => setAuthStage("login")} theme={theme} />
          ) : (
            <AuthScreen onAuthenticate={handleAuthenticate} theme={theme} />
          )}
        </MobileContainer>
      </ThemeProvider>
    );
  }

  if (authSession && !backendUser && !userProfileReady) {
    return (
      <ThemeProvider themeMode={themeMode} setThemeMode={handleThemeChange}>
        <MobileContainer>
          <style>{GLOBAL_STYLES(themeMode === "dark")}</style>
          <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: theme.text, fontWeight: 700 }}>
            Loading your profile…
          </div>
        </MobileContainer>
      </ThemeProvider>
    );
  }

  // 2. If authenticated but profile is not completed: Show Create Your Profile flow
  if (
    authSession &&
    ((!backendUser && !profile?.profileCompleted) ||
      (backendUser && !backendUser.profileCompleted))
  ) {
    return (
      <ThemeProvider themeMode={themeMode} setThemeMode={handleThemeChange}>
        <MobileContainer>
          <style>{GLOBAL_STYLES(themeMode === "dark")}</style>
          <OnboardingFlow
            initialEmail={authSession.email}
            initialUsername={backendUser?.username || profile?.username || ""}
            onComplete={handleCompleteProfile}
            theme={theme}
            onThemeChange={handleThemeChange}
          />
        </MobileContainer>
      </ThemeProvider>
    );
  }

  // 3. Main Application with 5-tab navigation
  return (
    <ThemeProvider themeMode={themeMode} setThemeMode={handleThemeChange}>
      <MobileContainer
        bottomNav={
          <BottomNav
            activeTab={activeTab}
            onSelectTab={(tab) => {
              setActiveTab(tab);
              setSelectedGroupId(null);
            }}
            isPro={profile.isPro}
            theme={theme}
          />
        }
      >
        <style>{GLOBAL_STYLES(themeMode === "dark")}</style>
        <Toast toast={toast} onClose={() => setToast(null)} />

        {/* Home Tab */}
        {activeTab === "home" && !selectedGroup && (
          <HomeScreen
            profile={profile}
            groups={groups}
            onOpenGroup={(id) => {
              setSelectedGroupId(id);
              setActiveTab("groups");
            }}
            onAddExpense={() => {
              if (groups.length === 0) {
                setShowCreateGroup(true);
              } else {
                if (!selectedGroupId) setSelectedGroupId(groups[0].id);
                setEditingExpense(null);
                setShowAddExpense(true);
              }
            }}
            onOpenGraph={() => setShowMonthlyGraph(true)}
            onCreateGroup={() => setShowCreateGroup(true)}
            onOpenInsights={() => setActiveTab("insights")}
            onOpenCalendar={() => setActiveTab("calendar")}
            onOpenSettle={() => {
              if (groups.length > 0) {
                setSelectedGroupId(groups[0].id);
                setActiveTab("groups");
              }
            }}
            theme={theme}
          />
        )}

        {/* Groups Tab — wrapped in ScreenErrorBoundary so render errors never blank the app */}
        {activeTab === "groups" && !selectedGroup && (
          <ScreenErrorBoundary>
            <GroupListScreen
              groups={groups}
              onSelectGroup={(id) => setSelectedGroupId(id)}
              onCreateGroup={() => setShowCreateGroup(true)}
              isPro={profile.isPro}
              onShowProUpgrade={handleTriggerProUpgrade}
              serverSync={groupsSyncState}
              syncErrorMessage={syncErrorMessage}
              onRetrySync={() => setSyncNonce((n) => n + 1)}
              theme={theme}
            />
          </ScreenErrorBoundary>
        )}

        {/* Group Detail View — wrapped so a render bug can never blank the
            whole app; the boundary shows an existing-style error card. */}
        {selectedGroup && (
          <ScreenErrorBoundary>
          <GroupDetailScreen
            group={selectedGroup}
            deletingExpenseIds={deletingExpenseIds}
            onBack={() => setSelectedGroupId(null)}
            onUpdateGroup={handleUpdateGroup}
            onDeleteGroup={() => handleDeleteGroup(selectedGroup.id)}
            onAddExpense={() => {
              setEditingExpense(null);
              setShowAddExpense(true);
            }}
            onEditExpense={(exp) => {
              setEditingExpense(exp);
              setShowAddExpense(true);
            }}
            onOpenUPI={handleOpenUPIModal}
            onOpenShareLink={() => setShowShareLink(true)}
            isPro={profile.isPro}
            onShowProUpgrade={handleTriggerProUpgrade}
            onToast={showToast}
            onSearchUsers={handleSearchGroupUsers}
            onAddMember={(username) => handleAddGroupMember(selectedGroupId, username)}
            onRemoveServerMember={(member) => handleRemoveGroupMember(selectedGroupId, member)}
            theme={theme}
          />
          </ScreenErrorBoundary>
        )}

        {/* Calendar Tab */}
        {activeTab === "calendar" && !selectedGroup && (
          <CalendarScreen
            groups={groups}
            profile={profile}
            onSelectGroup={(id) => {
              setSelectedGroupId(id);
              setActiveTab("groups");
            }}
            theme={theme}
          />
        )}

        {/* Insights Tab */}
        {activeTab === "insights" && !selectedGroup && (
          <InsightsScreen
            groups={groups}
            profile={profile}
            isPro={profile.isPro}
            onShowProUpgrade={handleTriggerProUpgrade}
            theme={theme}
          />
        )}

        {/* Settings Tab */}
        {activeTab === "settings" && !selectedGroup && (
          <SettingsScreen
            profile={profile}
            onUpdateProfile={handleUpdateProfile}
            isPro={profile.isPro}
            onTogglePro={handleTogglePro}
            onResetData={handleResetData}
            onLogout={handleLogout}
            theme={theme}
            onThemeChange={handleThemeChange}
          />
        )}

        {/* Modals */}
        <CreateGroupModal
          isOpen={showCreateGroup}
          onClose={() => setShowCreateGroup(false)}
          onCreateGroup={handleCreateGroup}
          userProfile={profile}
          groupCount={groups.length}
          onShowProUpgrade={handleTriggerProUpgrade}
        />

        <AddExpenseModal
          isOpen={showAddExpense}
          onClose={() => {
            setShowAddExpense(false);
            setEditingExpense(null);
          }}
          group={selectedGroup || groups[0]}
          onSaveExpense={handleSaveExpense}
          editingExpense={editingExpense}
        />

        <MonthlyGraphModal
          isOpen={showMonthlyGraph}
          onClose={() => setShowMonthlyGraph(false)}
          groups={groups}
          profile={profile}
        />

        <ProUpgradeModal
          isOpen={showProUpgrade}
          onClose={() => setShowProUpgrade(false)}
          isPro={profile.isPro}
          onTogglePro={handleTogglePro}
          customReason={proCustomReason}
        />

        <UPIPaymentModal
          isOpen={showUPI}
          onClose={() => setShowUPI(false)}
          payeeDetails={payeeDetails}
          onConfirmPayment={handleConfirmUPIPayment}
        />

        <GroupLinkModal
          isOpen={showShareLink}
          onClose={() => setShowShareLink(false)}
          group={selectedGroup || groups[0]}
        />
      </MobileContainer>
    </ThemeProvider>
  );
}
