import React, { useState } from "react";
import { ChevronLeft, Plus, Share2, Trash2, TrendingUp, TrendingDown, CheckCircle2, Sparkles, Repeat } from "lucide-react";
import { fmtMoney } from "../../services/currency";
import { computeBalances, simplifySettlements } from "../../services/storage";
import { ClayCard } from "../common/ClayCard";
import { ClayButton } from "../common/ClayButton";
import { PeopleManager } from "./PeopleManager";
import { SettleFlowDiagram } from "./SettleFlowDiagram";
import { ExpenseCard } from "../expenses/ExpenseCard";
import { RecurringSection } from "../expenses/RecurringSection";

export function GroupDetailScreen({
  group,
  onBack,
  onUpdateGroup,
  onDeleteGroup,
  onAddExpense,
  onEditExpense,
  onOpenUPI,
  onOpenShareLink,
  isPro,
  onShowProUpgrade,
  onToast,
  theme,
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Compute fresh live balances
  const net = computeBalances(group.members, group.expenses);
  const settlements = simplifySettlements(net);
  const myNet = net["you"] || 0;
  const isOwed = myNet > 0.5;
  const isOwe = myNet < -0.5;

  const handleMarkPaid = (settlement) => {
    // Record a settlement expense in group
    const fromName = group.members.find((m) => m.id === settlement.from)?.name || "Someone";
    const toName = group.members.find((m) => m.id === settlement.to)?.name || "Someone";

    const settlementExpense = {
      id: "e_settle_" + Date.now(),
      desc: `Settlement: ${fromName} paid ${toName}`,
      category: "Other",
      paidBy: settlement.from,
      amount: settlement.amount,
      date: new Date().toISOString(),
      splitType: "equal",
      participants: [settlement.to],
      recurring: false,
    };

    onUpdateGroup({
      ...group,
      expenses: [...group.expenses, settlementExpense],
    });

    if (onToast) onToast({ type: "success", message: `Settled ${fmtMoney(settlement.amount, group.currency)}!` });
  };

  const handleDeleteExpense = (expenseId) => {
    onUpdateGroup({
      ...group,
      expenses: group.expenses.filter((e) => e.id !== expenseId),
    });
    if (onToast) onToast({ type: "info", message: "Expense deleted" });
  };

  const handleLogRecurring = (recurringExpense) => {
    const newExpense = {
      ...recurringExpense,
      id: "e_" + Date.now(),
      date: new Date().toISOString(),
    };
    onUpdateGroup({
      ...group,
      expenses: [...group.expenses, newExpense],
    });
    if (onToast) onToast({ type: "success", message: `Logged ${recurringExpense.desc} for this month!` });
  };

  return (
    <div style={{ padding: "16px 18px 90px" }} className="animate-fade-in">
      {/* Top Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
        <button
          onClick={onBack}
          style={{
            width: "36px",
            height: "36px",
            borderRadius: "12px",
            border: `1px solid ${theme.border}`,
            backgroundColor: theme.card,
            boxShadow: theme.clayRaisedSm,
            color: theme.text,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
          }}
        >
          <ChevronLeft size={20} />
        </button>

        <div style={{ flex: 1, padding: "0 12px", textAlign: "center" }}>
          <h2 style={{ margin: 0, fontSize: "18px", fontWeight: "800", color: theme.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {group.name}
          </h2>
          <div style={{ fontSize: "11.5px", color: theme.muted }}>
            {group.members.length} members · {group.currency}
          </div>
        </div>

        <button
          onClick={onOpenShareLink}
          style={{
            width: "36px",
            height: "36px",
            borderRadius: "12px",
            border: `1px solid ${theme.border}`,
            backgroundColor: theme.card,
            boxShadow: theme.clayRaisedSm,
            color: theme.primary,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
          }}
        >
          <Share2 size={18} />
        </button>
      </div>

      {/* Large Balance Card */}
      <ClayCard
        style={{
          marginBottom: "20px",
          padding: "20px 18px",
          background: isOwed
            ? (theme.mode === "dark" ? "linear-gradient(135deg, #064E3B 0%, #172033 100%)" : "linear-gradient(135deg, #ECFDF5 0%, #EEF3F8 100%)")
            : isOwe
            ? (theme.mode === "dark" ? "linear-gradient(135deg, #7F1D1D 0%, #172033 100%)" : "linear-gradient(135deg, #FEF2F2 0%, #EEF3F8 100%)")
            : (theme.mode === "dark" ? "linear-gradient(135deg, #1E293B 0%, #172033 100%)" : "linear-gradient(135deg, #EFF6FF 0%, #EEF3F8 100%)"),
        }}
      >
        <div style={{ fontSize: "11.5px", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.8px", color: theme.muted, marginBottom: "6px" }}>
          Your Group Balance
        </div>

        <div
          className="font-num"
          style={{
            fontSize: "30px",
            fontWeight: "800",
            color: isOwed ? theme.emeraldDark : isOwe ? theme.coralDark : theme.text,
            letterSpacing: "-0.5px",
            marginBottom: "6px",
          }}
        >
          {!isOwed && !isOwe
            ? "Settled ✓"
            : isOwed
            ? `+${fmtMoney(myNet, group.currency)}`
            : `-${fmtMoney(myNet, group.currency)}`}
        </div>

        <div style={{ fontSize: "12.5px", fontWeight: "600", color: isOwed ? theme.emeraldDark : isOwe ? theme.coralDark : theme.muted }}>
          {isOwed
            ? "You are owed in this group"
            : isOwe
            ? "You owe in this group"
            : "Everyone is settled"}
        </div>
      </ClayCard>

      {/* Action CTA bar */}
      <div style={{ display: "flex", gap: "10px", marginBottom: "20px" }}>
        <ClayButton fullWidth size="md" onClick={onAddExpense}>
          <Plus size={18} /> Add Expense
        </ClayButton>
      </div>

      {/* People Manager */}
      <PeopleManager
        group={group}
        onUpdateGroup={onUpdateGroup}
        isPro={isPro}
        onShowProUpgrade={onShowProUpgrade}
        onErrorToast={(msg) => onToast && onToast({ type: "error", message: msg })}
      />

      {/* Smart Settlement Diagram */}
      <SettleFlowDiagram
        members={group.members}
        settlements={settlements}
        currency={group.currency}
        onMarkPaid={handleMarkPaid}
        onOpenUPI={onOpenUPI}
        isPro={isPro}
      />

      {/* Recurring Monthly Expenses */}
      <RecurringSection
        expenses={group.expenses.filter((e) => e.recurring)}
        currency={group.currency}
        onLogMonthly={handleLogRecurring}
      />

      {/* Recent Expenses List */}
      <div>
        <div style={{ fontSize: "12px", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.8px", color: theme.muted, marginBottom: "12px" }}>
          Recent Expenses ({group.expenses.length})
        </div>

        {group.expenses.length === 0 ? (
          <ClayCard style={{ textAlign: "center", padding: "28px 18px", marginBottom: "20px" }}>
            <Sparkles size={26} color={theme.primary} style={{ margin: "0 auto 8px" }} />
            <div style={{ fontSize: "14px", fontWeight: "700", color: theme.text }}>No expenses yet</div>
            <div style={{ fontSize: "12px", color: theme.muted, marginTop: "4px" }}>
              Add the first expense for your group.
            </div>
          </ClayCard>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginBottom: "24px" }}>
            {[...group.expenses].reverse().map((exp) => (
              <ExpenseCard
                key={exp.id}
                expense={exp}
                members={group.members}
                currency={group.currency}
                onEdit={() => onEditExpense(exp)}
                onDelete={() => handleDeleteExpense(exp.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Delete Group Option */}
      <div style={{ textAlign: "center", marginTop: "30px", paddingTop: "20px", borderTop: `1px solid ${theme.border}` }}>
        {!confirmDelete ? (
          <button
            onClick={() => setConfirmDelete(true)}
            style={{
              background: "none",
              border: "none",
              color: theme.coral,
              fontSize: "13px",
              fontWeight: "600",
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            <Trash2 size={14} /> Delete Group
          </button>
        ) : (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "12px" }}>
            <span style={{ fontSize: "12.5px", color: theme.coral, fontWeight: "700" }}>Delete this group?</span>
            <button
              onClick={onDeleteGroup}
              style={{
                backgroundColor: theme.coral,
                color: "#FFF",
                border: "none",
                borderRadius: "10px",
                padding: "6px 12px",
                fontSize: "12px",
                fontWeight: "700",
                cursor: "pointer",
              }}
            >
              Yes, Delete
            </button>
            <button
              onClick={() => setConfirmDelete(false)}
              style={{
                backgroundColor: theme.card,
                color: theme.text,
                border: `1px solid ${theme.border}`,
                borderRadius: "10px",
                padding: "6px 12px",
                fontSize: "12px",
                fontWeight: "600",
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
