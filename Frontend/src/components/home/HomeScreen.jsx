import React from "react";
import { BarChart3, Users, TrendingUp, TrendingDown, CheckCircle2, PieChart, Sparkles, ChevronRight, Calendar, Plus } from "lucide-react";
import { avatarStyle, getAvatarById, useTheme } from "../../theme/clayTheme";
import { fmtMoney, convertCurrency } from "../../services/currency";
import { computeBalances } from "../../services/storage";
import { ClayCard } from "../common/ClayCard";
import { ClayButton } from "../common/ClayButton";

function getTimeGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export function HomeScreen({
  profile,
  groups,
  onOpenGroup,
  onOpenGraph,
  onCreateGroup,
  onOpenInsights,
  onOpenCalendar,
  theme: propTheme,
}) {
  const { theme: contextTheme } = useTheme();
  const theme = propTheme || contextTheme;

  const firstName = profile.name ? profile.name.split(" ")[0] : "there";
  const homeCurrency = profile.homeCurrency || "INR";
  const userAvatar = getAvatarById(profile.avatarId);

  // Calculate overall balance across all groups converted to user's home currency
  const overallNet = groups.reduce((sum, g) => {
    const net = computeBalances(g.members, g.expenses);
    const myNetInGroup = net["you"] || 0;
    return sum + convertCurrency(myNetInGroup, g.currency, homeCurrency);
  }, 0);

  const isOwed = overallNet > 0.5;
  const isOwe = overallNet < -0.5;
  const isSettled = !isOwed && !isOwe;

  return (
    <div style={{ padding: "20px 18px" }} className="animate-fade-in">
      {/* Top Bar Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
        <div>
          <div style={{ fontSize: "13px", fontWeight: "600", color: theme.muted }}>{getTimeGreeting()},</div>
          <div style={{ fontSize: "22px", fontWeight: "800", color: theme.text }}>{firstName}</div>
        </div>
        <div
          style={{
            width: "44px",
            height: "44px",
            borderRadius: "50%",
            backgroundColor: userAvatar.bg,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "22px",
            boxShadow: theme.clayRaisedSm,
            border: `2px solid ${theme.border}`,
          }}
        >
          {userAvatar.emoji}
        </div>
      </div>

      {/* Main Overall Balance Card (Clay morphism) */}
      <ClayCard
        style={{
          marginBottom: "24px",
          padding: "24px 20px",
          background: isOwed
            ? (theme.mode === "dark" ? "linear-gradient(135deg, #064E3B 0%, #172033 100%)" : "linear-gradient(135deg, #ECFDF5 0%, #EEF3F8 100%)")
            : isOwe
            ? (theme.mode === "dark" ? "linear-gradient(135deg, #7F1D1D 0%, #172033 100%)" : "linear-gradient(135deg, #FEF2F2 0%, #EEF3F8 100%)")
            : (theme.mode === "dark" ? "linear-gradient(135deg, #1E293B 0%, #172033 100%)" : "linear-gradient(135deg, #EFF6FF 0%, #EEF3F8 100%)"),
        }}
      >
        <div style={{ fontSize: "12px", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.8px", color: theme.muted, marginBottom: "8px" }}>
          Overall Balance
        </div>

        <div style={{ display: "flex", alignItems: "baseline", gap: "8px", marginBottom: "12px" }}>
          <div
            className="font-num"
            style={{
              fontSize: "36px",
              fontWeight: "800",
              color: isOwed ? theme.emeraldDark : isOwe ? theme.coralDark : theme.text,
              letterSpacing: "-0.5px",
            }}
          >
            {isSettled
              ? "All Settled ✓"
              : isOwed
              ? `+${fmtMoney(overallNet, homeCurrency)}`
              : `-${fmtMoney(overallNet, homeCurrency)}`}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", fontWeight: "600", color: isOwed ? theme.emeraldDark : isOwe ? theme.coralDark : theme.muted }}>
          {isOwed && <TrendingUp size={16} />}
          {isOwe && <TrendingDown size={16} />}
          {isSettled && <CheckCircle2 size={16} color={theme.primary} />}
          <span>
            {isOwed
              ? "You are owed money across your groups"
              : isOwe
              ? "You owe money across your groups"
              : "No pending balances right now"}
          </span>
        </div>
      </ClayCard>

      {/* Quick Actions Grid - Graph, Group, Calendar, Insights */}
      <div style={{ marginBottom: "28px" }}>
        <div style={{ fontSize: "12px", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.8px", color: theme.muted, marginBottom: "12px" }}>
          Quick Actions
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "10px" }}>
          <QuickActionButton
            icon={<BarChart3 size={20} color={theme.primary} />}
            label="Graph"
            onClick={onOpenGraph}
            theme={theme}
          />
          <QuickActionButton
            icon={<Users size={20} color={theme.purple} />}
            label="Group"
            onClick={onCreateGroup}
            theme={theme}
          />
          <QuickActionButton
            icon={<Calendar size={20} color={theme.emerald} />}
            label="Calendar"
            onClick={onOpenCalendar}
            theme={theme}
          />
          <QuickActionButton
            icon={<PieChart size={20} color={theme.amber} />}
            label="Insights"
            onClick={onOpenInsights}
            theme={theme}
          />
        </div>
      </div>

      {/* Your Groups Section */}
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
          <div style={{ fontSize: "12px", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.8px", color: theme.muted }}>
            Your Groups ({groups.length})
          </div>
          <button
            onClick={onCreateGroup}
            style={{
              background: "none",
              border: "none",
              color: theme.primary,
              fontSize: "13px",
              fontWeight: "700",
              cursor: "pointer",
              padding: 0,
            }}
          >
            + Create
          </button>
        </div>

        {groups.length === 0 ? (
          <ClayCard style={{ textAlign: "center", padding: "32px 20px" }}>
            <Sparkles size={32} color={theme.primary} style={{ margin: "0 auto 10px" }} />
            <div style={{ fontWeight: "700", fontSize: "15px", color: theme.text, marginBottom: "4px" }}>
              Nothing to split yet
            </div>
            <div style={{ fontSize: "13px", color: theme.muted, marginBottom: "16px" }}>
              Create your first group to start tracking expenses with friends.
            </div>
            <ClayButton size="sm" onClick={onCreateGroup}>
              <Plus size={16} /> Create Group
            </ClayButton>
          </ClayCard>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {groups.map((group) => {
              const net = computeBalances(group.members, group.expenses);
              const myNet = net["you"] || 0;
              const gOwed = myNet > 0.5;
              const gOwe = myNet < -0.5;

              return (
                <ClayCard
                  key={group.id}
                  onClick={() => onOpenGroup(group.id)}
                  style={{ padding: "16px 18px", display: "flex", alignItems: "center", justifyContent: "space-between" }}
                >
                  <div style={{ flex: 1, minWidth: 0, paddingRight: "12px" }}>
                    <div style={{ fontWeight: "700", fontSize: "16px", color: theme.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {group.name}
                    </div>
                    <div style={{ fontSize: "12px", color: theme.muted, marginTop: "2px" }}>
                      {(group.members || []).length} people · {(group.expenses || []).length} expense{(group.expenses || []).length === 1 ? "" : "s"}
                    </div>

                    {/* Member Avatars */}
                    <div style={{ display: "flex", marginTop: "10px" }}>
                      {(group.members || []).slice(0, 4).map((m, idx) => {
                        const av = avatarStyle(idx);
                        const memberName = m && typeof m.name === "string" && m.name.trim().length > 0 ? m.name.trim() : "Member";
                        const initial = (memberName.charAt(0) || "M").toUpperCase();
                        return (
                          <div
                            key={m?.id || idx}
                            style={{
                              width: "24px",
                              height: "24px",
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
                    </div>
                  </div>

                  <div style={{ textAlign: "right", display: "flex", alignItems: "center", gap: "8px" }}>
                    <div>
                      <div
                        className="font-num"
                        style={{
                          fontWeight: "800",
                          fontSize: "14px",
                          color: gOwed ? theme.emeraldDark : gOwe ? theme.coralDark : theme.mutedSoft,
                        }}
                      >
                        {gOwed
                          ? `+${fmtMoney(myNet, group.currency)}`
                          : gOwe
                          ? fmtMoney(myNet, group.currency)
                          : "Settled ✓"}
                      </div>
                      <div style={{ fontSize: "10.5px", color: theme.muted, marginTop: "2px" }}>
                        {gOwed ? "you are owed" : gOwe ? "you owe" : "all clear"}
                      </div>
                    </div>
                    <ChevronRight size={18} color={theme.mutedSoft} />
                  </div>
                </ClayCard>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function QuickActionButton({ icon, label, onClick, theme }) {
  return (
    <button
      onClick={onClick}
      style={{
        backgroundColor: theme.card,
        borderRadius: "20px",
        padding: "14px 6px",
        border: `1px solid ${theme.borderLight}`,
        boxShadow: theme.clayRaisedSm,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "6px",
        cursor: "pointer",
        transition: "transform 0.12s ease",
      }}
      className="active:scale-[0.96]"
    >
      <div
        style={{
          width: "36px",
          height: "36px",
          borderRadius: "14px",
          backgroundColor: theme.inputBg,
          boxShadow: theme.clayPressed,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {icon}
      </div>
      <span style={{ fontSize: "11.5px", fontWeight: "700", color: theme.text }}>{label}</span>
    </button>
  );
}
