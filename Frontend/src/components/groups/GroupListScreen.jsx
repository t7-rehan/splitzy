import React, { useState } from "react";
import { Plus, Search, Sparkles, ChevronRight, Crown, AlertCircle } from "lucide-react";
import { avatarStyle } from "../../theme/clayTheme";
import { fmtMoney } from "../../services/currency";
import { computeBalances } from "../../services/storage";
import { ClayCard } from "../common/ClayCard";
import { ClayButton } from "../common/ClayButton";

export function GroupListScreen({ groups = [], onSelectGroup, onCreateGroup, isPro, onShowProUpgrade, serverSync = "idle", syncErrorMessage = null, onRetrySync, theme }) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all"); // 'all' | 'due' | 'paid'

  const safeGroups = Array.isArray(groups) ? groups : [];

  const filteredGroups = safeGroups.filter((g) => {
    if (!g) return false;

    // Search match
    const name = typeof g.name === "string" ? g.name : "";
    const matchesSearch = name.toLowerCase().includes(search.toLowerCase());
    if (!matchesSearch) return false;

    // Filter match
    const members = Array.isArray(g.members) ? g.members : [];
    const expenses = Array.isArray(g.expenses) ? g.expenses : [];
    const net = computeBalances(members, expenses);
    const myNet = net["you"] || 0;

    if (filter === "due") {
      return myNet < -0.5; // owes money / due payment
    }
    if (filter === "paid") {
      return myNet >= -0.5; // already paid / settled / owed
    }
    return true;
  });

  return (
    <div style={{ padding: "20px 18px" }} className="animate-fade-in">
      {/* Screen Title Bar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
        <div>
          <h2 style={{ margin: 0, fontSize: "22px", fontWeight: "800", color: theme?.text || "#0F172A" }}>
            Groups
          </h2>
          <div style={{ fontSize: "12px", color: theme?.muted || "#64748B", marginTop: "2px" }}>
            {safeGroups.length} active group{safeGroups.length === 1 ? "" : "s"}
          </div>
        </div>
        <ClayButton size="sm" onClick={onCreateGroup}>
          <Plus size={16} /> New Group
        </ClayButton>
      </div>

      {/* Server sync status (Task 8) — existing visual language, no redesign */}
      {serverSync === "loading" && (
        <div
          style={{
            backgroundColor: theme.inputBg,
            border: `1px solid ${theme.border}`,
            borderRadius: "16px",
            padding: "10px 14px",
            marginBottom: "16px",
            fontSize: "12px",
            fontWeight: "600",
            color: theme.muted,
          }}
        >
          Syncing your groups...
        </div>
      )}
      {serverSync === "error" && (
        <div
          style={{
            backgroundColor: theme.mode === "dark" ? theme.coralTint : "#FEF2F2",
            border: `1px solid ${theme.coral}`,
            borderRadius: "16px",
            padding: "12px 14px",
            marginBottom: "16px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "10px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <AlertCircle size={16} color={theme.coral} />
            <span style={{ fontSize: "12px", fontWeight: "600", color: theme.coralDark }}>
              {/* The REAL failure cause (network vs HTTP error), not a
                  hardcoded network message. */}
              {syncErrorMessage || "Couldn't reach the server"}
            </span>
          </div>
          <button
            onClick={onRetrySync}
            style={{
              backgroundColor: theme.coral,
              color: "#FFF",
              border: "none",
              borderRadius: "10px",
              padding: "5px 12px",
              fontSize: "11.5px",
              fontWeight: "700",
              cursor: "pointer",
            }}
          >
            Retry
          </button>
        </div>
      )}

      {/* Free Tier Limit Indicator */}
      {!isPro && (
        <div
          onClick={() => onShowProUpgrade("Upgrade to Splitzy Pro for unlimited groups & smart features!")}
          style={{
            backgroundColor: theme.mode === "dark" ? "#2E1065" : "#FEF3C7",
            border: `1px solid ${theme.mode === "dark" ? theme.purple : theme.amber}`,
            borderRadius: "16px",
            padding: "12px 14px",
            marginBottom: "16px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            cursor: "pointer",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <Crown size={18} color={theme.mode === "dark" ? theme.purple : theme.amber} />
            <div style={{ fontSize: "12px", fontWeight: "700", color: theme.mode === "dark" ? "#DDD6FE" : "#92400E" }}>
              Free Tier: {safeGroups.length}/5 Groups Used
            </div>
          </div>
          <span style={{ fontSize: "11px", fontWeight: "800", color: theme.mode === "dark" ? theme.purple : theme.amber, textTransform: "uppercase" }}>
            Upgrade Pro
          </span>
        </div>
      )}

      {/* Search Input */}
      <div style={{ position: "relative", marginBottom: "12px" }}>
        <Search size={18} color={theme.muted} style={{ position: "absolute", left: "14px", top: "12px" }} />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search groups..."
          style={{
            width: "100%",
            padding: "11px 14px 11px 40px",
            borderRadius: "16px",
            border: `1px solid ${theme.border}`,
            backgroundColor: theme.inputBg,
            boxShadow: theme.clayPressed,
            fontSize: "14px",
            fontWeight: "600",
            color: theme.text,
          }}
        />
      </div>

      {/* Filter Segmented Control */}
      <div
        style={{
          display: "flex",
          backgroundColor: theme.inputBg,
          padding: "4px",
          borderRadius: "16px",
          boxShadow: theme.clayPressed,
          marginBottom: "16px",
          gap: "4px",
        }}
      >
        {[
          { id: "all", label: "All" },
          { id: "due", label: "Due Payment" },
          { id: "paid", label: "Already Paid" },
        ].map((tab) => {
          const isSelected = filter === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFilter(tab.id)}
              style={{
                flex: 1,
                padding: "8px 0",
                borderRadius: "12px",
                border: "none",
                backgroundColor: isSelected ? theme.card : "transparent",
                boxShadow: isSelected ? theme.clayRaisedSm : "none",
                color: isSelected ? theme.primary : theme.muted,
                fontSize: "12px",
                fontWeight: "700",
                cursor: "pointer",
                transition: "all 0.12s ease",
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Groups List */}
      {filteredGroups.length === 0 ? (
        <ClayCard style={{ textAlign: "center", padding: "36px 20px" }}>
          <Sparkles size={32} color={theme.primary} style={{ margin: "0 auto 10px" }} />
          <div style={{ fontWeight: "700", fontSize: "15px", color: theme.text, marginBottom: "4px" }}>
            {search
              ? "No groups found"
              : filter === "due"
              ? "No groups with due payments"
              : filter === "paid"
              ? "No settled groups found"
              : "No groups yet"}
          </div>
          <div style={{ fontSize: "13px", color: theme.muted, marginBottom: "16px" }}>
            {search
              ? "Try searching for another name."
              : filter !== "all"
              ? "Try changing your filter to view other groups."
              : "Start by creating a group for a trip or apartment."}
          </div>
          {!search && filter === "all" && (
            <ClayButton size="sm" onClick={onCreateGroup}>
              <Plus size={16} /> Create Group
            </ClayButton>
          )}
        </ClayCard>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {filteredGroups.map((group) => {
            if (!group || !group.id) return null;
            const members = Array.isArray(group.members) ? group.members : [];
            const expenses = Array.isArray(group.expenses) ? group.expenses : [];
            const net = computeBalances(members, expenses);
            const myNet = net["you"] || 0;
            const isOwed = myNet > 0.5;
            const isOwe = myNet < -0.5;
            const currency = group.currency || "INR";
            const groupName = group.name || "Untitled Group";

            return (
              <ClayCard
                key={group.id}
                onClick={() => onSelectGroup(group.id)}
                style={{ padding: "18px 20px" }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: "17px", fontWeight: "800", color: theme.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {groupName}
                    </div>
                    <div style={{ fontSize: "12.5px", color: theme.muted, marginTop: "2px" }}>
                      {members.length} people · {expenses.length} expense{expenses.length === 1 ? "" : "s"} · {currency}
                    </div>
                  </div>

                  <div style={{ textAlign: "right", display: "flex", alignItems: "center", gap: "8px" }}>
                    <div>
                      <div
                        className="font-num"
                        style={{
                          fontSize: "15px",
                          fontWeight: "800",
                          color: isOwed ? theme.emeraldDark : isOwe ? theme.coralDark : theme.mutedSoft,
                        }}
                      >
                        {isOwed
                          ? `+${fmtMoney(myNet, currency)}`
                          : isOwe
                          ? fmtMoney(myNet, currency)
                          : "Settled ✓"}
                      </div>
                      <div style={{ fontSize: "10.5px", color: theme.muted, marginTop: "2px" }}>
                        {isOwed ? "you are owed" : isOwe ? "you owe" : "all clear"}
                      </div>
                    </div>
                    <ChevronRight size={18} color={theme.mutedSoft} />
                  </div>
                </div>

                {/* Member Avatars */}
                <div style={{ display: "flex", alignItems: "center", marginTop: "14px" }}>
                  {members.slice(0, 5).map((m, idx) => {
                    const av = avatarStyle(idx);
                    const memberName = m && typeof m.name === "string" && m.name.trim().length > 0 ? m.name.trim() : "Member";
                    const initial = (memberName.charAt(0) || "M").toUpperCase();
                    return (
                      <div
                        key={m?.id || idx}
                        style={{
                          width: "26px",
                          height: "26px",
                          borderRadius: "50%",
                          backgroundColor: av.bg,
                          color: av.text,
                          fontSize: "11px",
                          fontWeight: "700",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          marginLeft: idx === 0 ? 0 : "-6px",
                          border: `2px solid ${theme.card}`,
                        }}
                      >
                        {initial}
                      </div>
                    );
                  })}
                  {members.length > 5 && (
                    <div style={{ fontSize: "11px", fontWeight: "700", color: theme.muted, marginLeft: "8px" }}>
                      +{members.length - 5} more
                    </div>
                  )}
                </div>
              </ClayCard>
            );
          })}
        </div>
      )}
    </div>
  );
}
