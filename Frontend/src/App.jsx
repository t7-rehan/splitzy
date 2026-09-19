import React, { useState, useEffect } from "react";
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
  loadStoredTheme,
} from "./services/storage";

// Services — authentication (Firebase identity) + backend integration (Task 8)
import {
  subscribeToAuthState,
  signOut as firebaseSignOut,
} from "./services/authService";
import { fetchBackendUser } from "./services/bootstrapService";
import {
  fetchMyGroups,
  fetchGroupDetails,
  createGroup as apiCreateGroup,
} from "./services/groupsService";
import {
  mapGroupFromApi,
  mapGroupsFromApi,
  mergeServerAndLocalGroups,
} from "./services/groupMapper";

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
  // Firebase identity is authoritative for sign-in; `authSession` (localStorage
  // mirror) exists only for a flicker-free first paint until Firebase reports.
  const [authSession, setAuthSession] = useState(() => loadAuthSession());
  const [firebaseReady, setFirebaseReady] = useState(false);
  const [profile, setProfile] = useState(() => loadProfile());
  const [themeMode, setThemeMode] = useState(() => profile?.theme || loadStoredTheme() || "light");
  const [groups, setGroups] = useState(() => loadGroups(profile?.name || "Sarthak", profile?.homeCurrency || "INR"));

  // Task 8: server-backed identity + groups state.
  //   backendUser     — the PostgreSQL User resolved from the Firebase identity
  //                     via GET /auth/me (the backend is authoritative; the
  //                     frontend never creates or assigns it).
  //   groupsSyncState — 'idle' | 'loading' | 'ready' | 'error' for the groups sync.
  //   syncNonce       — bump to retry a failed sync.
  //   creatingGroup   — guards double-submits of server group creation.
  const [backendUser, setBackendUser] = useState(null);
  const [groupsSyncState, setGroupsSyncState] = useState("idle");
  const [syncNonce, setSyncNonce] = useState(0);
  const [creatingGroup, setCreatingGroup] = useState(false);
  
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
        saveAuthSession(sessionData);
        setAuthSession(sessionData);
      } else {
        // Real sign-out — but only drop Firebase-derived sessions; the legacy
        // local-only flow is untouched until backend integration migrates it.
        setAuthSession((current) => {
          if (current?.authType === "google") {
            clearAuthSession();
            return null;
          }
          return current;
        });
      }
    });
    return unsubscribe;
  }, []);

  // Save profile changes to localStorage
  useEffect(() => {
    if (profile) {
      saveProfile(profile);
      if (profile.theme && profile.theme !== themeMode) {
        setThemeMode(profile.theme);
      }
    }
  }, [profile]);

  // Save groups changes to localStorage
  useEffect(() => {
    if (groups) saveGroups(groups);
  }, [groups]);

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
    (async () => {
      try {
        const user = await fetchBackendUser();
        if (cancelled) return;
        setBackendUser(user);
        const summaries = await fetchMyGroups();
        if (cancelled) return;
        // Authoritative member lists live on the detail endpoint; a detail
        // failure falls back to its summary DTO (bounded 1+N — groups are few).
        const detailed = await Promise.all(
          summaries.map((dto) => fetchGroupDetails(dto.id).catch(() => dto))
        );
        if (cancelled) return;
        setGroups((current) => {
          const mapped = mapGroupsFromApi(detailed, {
            localGroups: current,
            myUserId: user.id,
          });
          // Server data wins; local twins of server groups are dropped so
          // there is never a second source of truth for the same group.
          return mergeServerAndLocalGroups(mapped, current);
        });
        setGroupsSyncState("ready");
      } catch (error) {
        if (cancelled) return;
        setGroupsSyncState("error");
        showToast({
          message: error?.userMessage || "Couldn't sync your groups from the server.",
          type: "error",
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [firebaseReady, authSession, syncNonce]);

  // Opening a server-backed group re-reads authoritative details (members,
  // roles, metadata). Local expense data carried in state is preserved by the
  // mapper; expenses themselves remain local in Task 8 by design.
  useEffect(() => {
    if (!selectedGroupId || !backendUser) return;
    const target = groups.find((g) => g.id === selectedGroupId);
    if (!target || !target.isServerGroup) return;
    let cancelled = false;
    (async () => {
      try {
        const dto = await fetchGroupDetails(selectedGroupId);
        if (cancelled) return;
        setGroups((current) =>
          current.map((g) =>
            g.id === selectedGroupId
              ? mapGroupFromApi(dto, { localGroup: g, myUserId: backendUser.id })
              : g
          )
        );
      } catch {
        // Non-fatal: keep showing the last known data.
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
    const sessionData = { email: authData.email, authType: authData.authType, loggedInAt: new Date().toISOString() };

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

  const handleCompleteProfile = (newProfile) => {
    const fullProfile = {
      ...newProfile,
      email: authEmail || newProfile.email || "user@splitzy.app",
      profileCompleted: true,
    };

    setProfile(fullProfile);
    saveProfile(fullProfile);
    saveAuthSession({ email: fullProfile.email, loggedInAt: new Date().toISOString() });
    setAuthSession({ email: fullProfile.email });

    const initialGroups = loadGroups(fullProfile.name, fullProfile.homeCurrency);
    setGroups(initialGroups);
    showToast({ message: `Welcome to Splitzy, ${fullProfile.name.split(" ")[0]}!`, type: "success" });
  };

  const handleUpdateProfile = (updatedProfile) => {
    setProfile(updatedProfile);
    showToast({ message: "Profile updated successfully", type: "success" });
  };

  // Signs out of Firebase (safe no-op if Firebase is unavailable) and clears
  // the local mirror session. Splitzy app data (profile/groups) is preserved.
  const handleLogout = async () => {
    await firebaseSignOut();
    clearAuthSession();
    setAuthSession(null);
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
    if (creatingGroup) return;
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
      setGroups((current) => [...current, mapped]);
      setSelectedGroupId(mapped.id);
      setActiveTab("groups");
      showToast({ message: `Created group "${mapped.name}"`, type: "success" });
    } catch (error) {
      showToast({
        message: error?.userMessage || "Could not create the group. Please try again.",
        type: "error",
      });
    } finally {
      setCreatingGroup(false);
    }
  };

  const handleUpdateGroup = (updatedGroup) => {
    const current = groups.find((g) => g.id === updatedGroup.id);
    // Server-backed groups: membership is authoritative in PostgreSQL. The
    // member UI (free-text local names) cannot address server users, so member
    // changes are politely refused while everything else (local expenses,
    // settlements) keeps working.
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

  const handleSaveExpense = (expensePayload) => {
    const targetGroup = groups.find((g) => g.id === selectedGroupId) || groups[0];
    if (!targetGroup) return;

    const existingIdx = targetGroup.expenses.findIndex((e) => e.id === expensePayload.id);
    let updatedExpenses;
    if (existingIdx >= 0) {
      updatedExpenses = targetGroup.expenses.map((e) => (e.id === expensePayload.id ? expensePayload : e));
    } else {
      updatedExpenses = [...targetGroup.expenses, expensePayload];
    }

    handleUpdateGroup({ ...targetGroup, expenses: updatedExpenses });
    showToast({ message: existingIdx >= 0 ? "Expense updated" : "Expense added!", type: "success" });
  };

  const handleOpenUPIModal = (details) => {
    setPayeeDetails(details);
    setShowUPI(true);
  };

  const handleConfirmUPIPayment = (details) => {
    const targetGroup = groups.find((g) => g.id === selectedGroupId) || groups[0];
    if (!targetGroup) return;

    const settlementExpense = {
      id: "e_upi_" + Date.now(),
      desc: `UPI Settlement to ${details.payeeName}`,
      category: "Other",
      paidBy: "you",
      amount: details.amount,
      date: new Date().toISOString(),
      splitType: "equal",
      participants: [targetGroup.members.find((m) => m.name === details.payeeName)?.id || targetGroup.members[0].id],
      recurring: false,
    };

    handleUpdateGroup({ ...targetGroup, expenses: [...targetGroup.expenses, settlementExpense] });
    showToast({ message: `Payment of ₹${details.amount} marked as settled!`, type: "success" });
  };

  const handleTriggerProUpgrade = (reason = "") => {
    setProCustomReason(reason);
    setShowProUpgrade(true);
  };

  const handleResetData = async () => {
    await firebaseSignOut();
    localStorage.clear();
    setProfile(null);
    setAuthSession(null);
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

  // 2. If authenticated but profile is not completed: Show Create Your Profile flow
  if (!profile || !profile.profileCompleted) {
    return (
      <ThemeProvider themeMode={themeMode} setThemeMode={handleThemeChange}>
        <MobileContainer>
          <style>{GLOBAL_STYLES(themeMode === "dark")}</style>
          <OnboardingFlow
            initialEmail={authSession.email}
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
              if (tab !== "groups") setSelectedGroupId(null);
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

        {/* Groups Tab */}
        {activeTab === "groups" && !selectedGroup && (
          <GroupListScreen
            groups={groups}
            onSelectGroup={(id) => setSelectedGroupId(id)}
            onCreateGroup={() => setShowCreateGroup(true)}
            isPro={profile.isPro}
            onShowProUpgrade={handleTriggerProUpgrade}
            serverSync={groupsSyncState}
            onRetrySync={() => setSyncNonce((n) => n + 1)}
            theme={theme}
          />
        )}

        {/* Group Detail View */}
        {selectedGroup && (
          <GroupDetailScreen
            group={selectedGroup}
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
            theme={theme}
          />
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
