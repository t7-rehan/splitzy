import React from "react";
import { Home, CalendarCheck, Crown, Plus, Sparkles, CheckCircle2 } from "lucide-react";
import { useTheme } from "../../theme/clayTheme";
import { fmtMoney } from "../../services/currency";
import { computeBalances, getShares } from "../../services/storage";
import { ClayCard } from "../common/ClayCard";
import { ClayButton } from "../common/ClayButton";

export function RoommateMode({ groups, onSelectGroup, isPro, onShowProUpgrade, onLogRecurringExpense }) {
  const C = useTheme();
  // Find roommate / apartment groups
  const roommateGroups = groups.filter((g) => g.isRoommateGroup || g.name.toLowerCase().includes("flat") || g.name.toLowerCase().includes("apt") || g.name.toLowerCase().includes("house"));

  const targetGroup = roommateGroups[0] || groups[0];

  if (!targetGroup) return null;

  const totalHouseholdExpenses = targetGroup.expenses.reduce((sum, e) => sum + e.amount, 0);
  const myHouseholdShare = targetGroup.expenses.reduce((sum, e) => {
    const shares = getShares(e);
    return sum + (shares["you"] || 0);
  }, 0);

  const recurringBills = targetGroup.expenses.filter((e) => e.recurring);

  return (
    <div style={{ padding: "20px 18px" }} className="animate-fade-in">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <Home size={20} color={C.purple} />
            <h2 style={{ margin: 0, fontSize: "22px", fontWeight: "800", color: C.text }}>
              Roommate Mode
            </h2>
          </div>
          <div style={{ fontSize: "12px", color: C.muted, marginTop: "2px" }}>
            Household Hub · {targetGroup.name}
          </div>
        </div>

        {!isPro && (
          <span style={{ fontSize: "10.5px", fontWeight: "800", backgroundColor: C.purple, color: "#FFF", padding: "3px 8px", borderRadius: "8px" }}>
            PRO FEATURE
          </span>
        )}
      </div>

      {!isPro ? (
        <ClayCard style={{ textAlign: "center", padding: "36px 20px" }}>
          <Crown size={36} color={C.purple} style={{ margin: "0 auto 12px" }} />
          <div style={{ fontSize: "17px", fontWeight: "800", color: C.text, marginBottom: "6px" }}>
            Dedicated Household Expense Hub
          </div>
          <div style={{ fontSize: "13px", color: C.muted, lineHeight: "1.5", marginBottom: "20px" }}>
            Manage apartment rent, electricity, Wi-Fi, and groceries with automated monthly logging and per-roommate summaries.
          </div>
          <ClayButton fullWidth size="lg" onClick={() => onShowProUpgrade("Unlock Roommate Mode for household bill splitting!")}>
            Unlock Roommate Mode
          </ClayButton>
        </ClayCard>
      ) : (
        <>
          {/* Monthly Household Summary Card */}
          <ClayCard style={{ padding: "20px 18px", marginBottom: "20px", background: C.mode === "dark" ? "linear-gradient(135deg, #2E1065 0%, #1E293B 100%)" : "linear-gradient(135deg, #F3E8FF 0%, #EEF3F8 100%)" }}>
            <div style={{ fontSize: "11.5px", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.8px", color: C.purple, marginBottom: "8px" }}>
              September Household Summary
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
              <div>
                <div style={{ fontSize: "11.5px", color: C.muted }}>Total Household</div>
                <div className="font-num" style={{ fontSize: "20px", fontWeight: "800", color: C.text }}>
                  {fmtMoney(totalHouseholdExpenses, targetGroup.currency)}
                </div>
              </div>

              <div>
                <div style={{ fontSize: "11.5px", color: C.muted }}>Your Share</div>
                <div className="font-num" style={{ fontSize: "20px", fontWeight: "800", color: C.purple }}>
                  {fmtMoney(myHouseholdShare, targetGroup.currency)}
                </div>
              </div>
            </div>
          </ClayCard>

          {/* Members Breakdown */}
          <div style={{ fontSize: "12px", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.8px", color: C.muted, marginBottom: "10px" }}>
            Flatmate Shares ({targetGroup.members.length} members)
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "20px" }}>
            {targetGroup.members.map((m) => {
              const mShare = targetGroup.expenses.reduce((sum, e) => {
                const shares = getShares(e);
                return sum + (shares[m.id] || 0);
              }, 0);

              return (
                <ClayCard key={m.id} style={{ padding: "12px 14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ fontWeight: "700", fontSize: "14px", color: C.text }}>
                    {m.name} {m.id === "you" ? "(You)" : ""}
                  </div>
                  <div className="font-num" style={{ fontSize: "14px", fontWeight: "800", color: C.text }}>
                    {fmtMoney(mShare, targetGroup.currency)}
                  </div>
                </ClayCard>
              );
            })}
          </div>

          {/* Recurring Bills */}
          <div style={{ fontSize: "12px", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.8px", color: C.muted, marginBottom: "10px" }}>
            Monthly Household Bills
          </div>

          <ClayCard style={{ padding: "16px 18px", marginBottom: "20px" }}>
            {recurringBills.length === 0 ? (
              <div style={{ fontSize: "13px", color: C.muted, textAlign: "center", padding: "10px 0" }}>
                No recurring bills logged yet. Mark rent or utilities as recurring when adding expenses.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {recurringBills.map((e) => (
                  <div key={e.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: `1px dashed ${C.border}` }}>
                    <div>
                      <div style={{ fontSize: "13.5px", fontWeight: "700", color: C.text }}>{e.desc}</div>
                      <div style={{ fontSize: "11.5px", color: C.muted }}>{fmtMoney(e.amount, targetGroup.currency)}/mo</div>
                    </div>
                    <button
                      onClick={() => onLogRecurringExpense(targetGroup.id, e)}
                      style={{
                        backgroundColor: C.purple,
                        color: "#FFF",
                        border: "none",
                        borderRadius: "10px",
                        padding: "6px 12px",
                        fontSize: "11.5px",
                        fontWeight: "700",
                        cursor: "pointer",
                      }}
                    >
                      Log Month
                    </button>
                  </div>
                ))}
              </div>
            )}
          </ClayCard>

          <ClayButton fullWidth onClick={() => onSelectGroup(targetGroup.id)}>
            Open Full Household Group
          </ClayButton>
        </>
      )}
    </div>
  );
}
