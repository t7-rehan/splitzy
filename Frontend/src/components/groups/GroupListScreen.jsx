import React, { useState } from "react";
import { Plus, Search, Sparkles, ChevronRight, Crown, AlertCircle } from "lucide-react";
import { avatarStyle } from "../../theme/clayTheme";
import { fmtMoney } from "../../services/currency";
import { computeBalances } from "../../services/storage";
import { ClayCard } from "../common/ClayCard";
import { ClayButton } from "../common/ClayButton";

export function GroupListScreen({ groups, onSelectGroup, onCreateGroup, isPro, onShowProUpgrade, theme }) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all"); // 'all' | 'due' | 'paid'

  const filteredGroups = groups.filter((g) => {
    // Search match
    const matchesSearch = g.name.toLowerCase().includes(search.toLowerCase());
    if (!matchesSearch) return false;

    // Filter match
    const net = computeBalances(g.members, g.expenses);
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
          <h2 style={{ margin: 0, fontSize: "22px", fontWeight: "800", color: theme.text }}>
            Groups
          </h2>
          <div style={{ fontSize: "12px", color: theme.muted, marginTop: "2px" }}>
            {groups.length} active group{groups.length === 1 ? "" : "s"}
          </div>
        </div>
        <ClayButton size="sm" onClick={onCreateGroup}>
          <Plus size={16} /> New Group
        </ClayButton>
      </div>

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
              Free Tier: {groups.length}/5 Groups Used
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
            const net = computeBalances(group.members, group.expenses);
            const myNet = net["you"] || 0;
            const isOwed = myNet > 0.5;
            const isOwe = myNet < -0.5;

            return (
              <ClayCard
                key={group.id}
                onClick={() => onSelectGroup(group.id)}
                style={{ padding: "18px 20px" }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: "17px", fontWeight: "800", color: theme.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {group.name}
                    </div>
                    <div style={{ fontSize: "12.5px", color: theme.muted, marginTop: "2px" }}>
                      {group.members.length} people · {group.expenses.length} expense{group.expenses.length === 1 ? "" : "s"} · {group.currency}
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
                          ? `+${fmtMoney(myNet, group.currency)}`
                          : isOwe
                          ? `-${fmtMoney(myNet, group.currency)}`
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
                  {group.members.slice(0, 5).map((m, idx) => {
                    const av = avatarStyle(idx);
                    return (
                      <div
                        key={m.id}
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
                        {m.name[0].toUpperCase()}
                      </div>
                    );
                  })}
                  {group.members.length > 5 && (
                    <div style={{ fontSize: "11px", fontWeight: "700", color: theme.muted, marginLeft: "8px" }}>
                      +{group.members.length - 5} more
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
