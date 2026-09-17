import React, { useState } from "react";
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, Sparkles, Utensils, Plane, Home, Zap, ShoppingBag, Film, Tag } from "lucide-react";
import { fmtMoney, convertCurrency } from "../../services/currency";
import { getShares } from "../../services/storage";
import { ClayCard } from "../common/ClayCard";
import { ClayButton } from "../common/ClayButton";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

const WEEK_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const ICON_MAP = {
  Food: Utensils,
  Travel: Plane,
  Rent: Home,
  Utilities: Zap,
  Shopping: ShoppingBag,
  Entertainment: Film,
  Other: Tag,
};

export function CalendarScreen({ groups, profile, onSelectGroup, theme }) {
  const homeCurrency = profile.homeCurrency || "INR";
  const now = new Date();
  const [currentYear, setCurrentYear] = useState(now.getFullYear());
  const [currentMonth, setCurrentMonth] = useState(now.getMonth());
  const [selectedDateStr, setSelectedDateStr] = useState(() => {
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  });

  // Navigate months
  const handlePrevMonth = () => {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear(currentYear - 1);
    } else {
      setCurrentMonth(currentMonth - 1);
    }
  };

  const handleNextMonth = () => {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear(currentYear + 1);
    } else {
      setCurrentMonth(currentMonth + 1);
    }
  };

  // Build map of all expenses by date string: YYYY-MM-DD
  const expensesByDate = {};
  const monthlyGroupSpend = {};
  let totalMonthSpend = 0;

  groups.forEach((g) => {
    g.expenses.forEach((e) => {
      try {
        const d = new Date(e.date);
        const y = d.getFullYear();
        const m = d.getMonth();
        const dateKey = `${y}-${String(m + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

        const shares = getShares(e);
        const myShare = shares["you"] || 0;
        const inHomeCurrency = convertCurrency(myShare, g.currency, homeCurrency);

        if (!expensesByDate[dateKey]) {
          expensesByDate[dateKey] = [];
        }
        expensesByDate[dateKey].push({
          ...e,
          groupName: g.name,
          groupCurrency: g.currency,
          myShare,
          inHomeCurrency,
        });

        // If in selected month, record for monthly graph
        if (y === currentYear && m === currentMonth) {
          monthlyGroupSpend[g.name] = (monthlyGroupSpend[g.name] || 0) + inHomeCurrency;
          totalMonthSpend += inHomeCurrency;
        }
      } catch (err) {
        console.error("Invalid expense date", err);
      }
    });
  });

  // Calendar math
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const firstDayIndex = (new Date(currentYear, currentMonth, 1).getDay() + 6) % 7; // Monday = 0

  const selectedDayExpenses = expensesByDate[selectedDateStr] || [];

  const formatSelectedHeading = (dateKey) => {
    try {
      const [y, m, d] = dateKey.split("-");
      const dt = new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
      return dt.toLocaleDateString("en-US", { month: "short", day: "numeric", weekday: "short" });
    } catch {
      return dateKey;
    }
  };

  const sortedMonthlyGroups = Object.entries(monthlyGroupSpend).sort((a, b) => b[1] - a[1]);
  const maxGroupSpend = sortedMonthlyGroups.length ? sortedMonthlyGroups[0][1] : 1;

  return (
    <div style={{ padding: "20px 18px" }} className="animate-fade-in">
      <div style={{ marginBottom: "16px" }}>
        <h2 style={{ margin: 0, fontSize: "22px", fontWeight: "800", color: theme.text }}>
          Expense Calendar
        </h2>
        <div style={{ fontSize: "12px", color: theme.muted, marginTop: "2px" }}>
          Track daily expenses across all groups
        </div>
      </div>

      {/* Month Navigator Header */}
      <ClayCard style={{ padding: "16px 14px", marginBottom: "16px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
          <button
            onClick={handlePrevMonth}
            style={{
              width: "32px",
              height: "32px",
              borderRadius: "10px",
              border: `1px solid ${theme.border}`,
              backgroundColor: theme.card,
              color: theme.text,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
            }}
          >
            <ChevronLeft size={18} />
          </button>

          <div style={{ fontSize: "16px", fontWeight: "800", color: theme.text }}>
            {MONTH_NAMES[currentMonth]} {currentYear}
          </div>

          <button
            onClick={handleNextMonth}
            style={{
              width: "32px",
              height: "32px",
              borderRadius: "10px",
              border: `1px solid ${theme.border}`,
              backgroundColor: theme.card,
              color: theme.text,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
            }}
          >
            <ChevronRight size={18} />
          </button>
        </div>

        {/* Days of week header */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", textAlign: "center", marginBottom: "8px" }}>
          {WEEK_DAYS.map((day) => (
            <div key={day} style={{ fontSize: "11px", fontWeight: "700", color: theme.muted }}>
              {day}
            </div>
          ))}
        </div>

        {/* Calendar Day Cells */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "4px" }}>
          {/* Empty spacer cells before 1st of month */}
          {Array.from({ length: firstDayIndex }).map((_, i) => (
            <div key={`empty_${i}`} style={{ height: "38px" }} />
          ))}

          {/* Month days */}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const dayNum = i + 1;
            const dateKey = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`;
            const dayExpenses = expensesByDate[dateKey] || [];
            const hasExpenses = dayExpenses.length > 0;
            const isSelected = selectedDateStr === dateKey;

            return (
              <button
                type="button"
                key={dayNum}
                onClick={() => setSelectedDateStr(dateKey)}
                style={{
                  height: "38px",
                  borderRadius: "12px",
                  border: isSelected ? `2px solid ${theme.primary}` : "none",
                  backgroundColor: isSelected ? (theme.mode === "dark" ? "#1E293B" : theme.primaryTint) : "transparent",
                  color: isSelected ? theme.primary : theme.text,
                  boxShadow: isSelected ? theme.clayPressed : "none",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                  position: "relative",
                  transition: "all 0.12s ease",
                }}
              >
                <span style={{ fontSize: "13px", fontWeight: isSelected ? "800" : "600" }}>
                  {dayNum}
                </span>

                {hasExpenses && (
                  <div
                    style={{
                      width: "5px",
                      height: "5px",
                      borderRadius: "50%",
                      backgroundColor: isSelected ? theme.primary : theme.emerald,
                      marginTop: "2px",
                    }}
                  />
                )}
              </button>
            );
          })}
        </div>
      </ClayCard>

      {/* Selected Day Expenses Breakdown */}
      <div style={{ marginBottom: "20px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
          <div style={{ fontSize: "12px", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.8px", color: theme.muted }}>
            Expenses on {formatSelectedHeading(selectedDateStr)}
          </div>
          <span style={{ fontSize: "12px", fontWeight: "700", color: theme.primary }}>
            {selectedDayExpenses.length} expense{selectedDayExpenses.length === 1 ? "" : "s"}
          </span>
        </div>

        {selectedDayExpenses.length === 0 ? (
          <ClayCard style={{ textAlign: "center", padding: "24px 16px" }}>
            <div style={{ fontSize: "13px", color: theme.muted }}>
              No expenses recorded on this day.
            </div>
          </ClayCard>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {selectedDayExpenses.map((exp) => {
              const IconComp = ICON_MAP[exp.category] || Tag;
              return (
                <ClayCard key={exp.id} style={{ padding: "14px 16px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <div
                        style={{
                          width: "36px",
                          height: "36px",
                          borderRadius: "12px",
                          backgroundColor: theme.primaryTint,
                          color: theme.primary,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <IconComp size={16} />
                      </div>
                      <div>
                        <div style={{ fontSize: "14px", fontWeight: "700", color: theme.text }}>
                          {exp.desc}
                        </div>
                        <div style={{ fontSize: "11.5px", color: theme.muted, marginTop: "2px" }}>
                          {exp.groupName} · {exp.category}
                        </div>
                      </div>
                    </div>

                    <div style={{ textAlign: "right" }}>
                      <div className="font-num" style={{ fontSize: "14.5px", fontWeight: "800", color: theme.text }}>
                        {fmtMoney(exp.amount, exp.groupCurrency)}
                      </div>
                      <div style={{ fontSize: "11px", fontWeight: "600", color: theme.primary, marginTop: "2px" }}>
                        Your share: {fmtMoney(exp.myShare, exp.groupCurrency)}
                      </div>
                    </div>
                  </div>
                </ClayCard>
              );
            })}
          </div>
        )}
      </div>

      {/* Monthly Expenses Graph */}
      <ClayCard style={{ padding: "20px 18px", marginBottom: "20px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
          <div>
            <div style={{ fontSize: "12px", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.8px", color: theme.muted }}>
              Monthly Expenses
            </div>
            <div style={{ fontSize: "12px", color: theme.mutedSoft, marginTop: "2px" }}>
              {MONTH_NAMES[currentMonth]} {currentYear}
            </div>
          </div>
          <div className="font-num" style={{ fontSize: "18px", fontWeight: "800", color: theme.primary }}>
            {fmtMoney(totalMonthSpend, homeCurrency)}
          </div>
        </div>

        {sortedMonthlyGroups.length === 0 ? (
          <div style={{ fontSize: "13px", color: theme.muted, textAlign: "center", padding: "12px 0" }}>
            No expenses recorded for this month yet.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {sortedMonthlyGroups.map(([groupName, amt]) => {
              const pct = Math.round((amt / maxGroupSpend) * 100);
              return (
                <div key={groupName}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px", fontWeight: "600", color: theme.text, marginBottom: "4px" }}>
                    <span>{groupName}</span>
                    <span className="font-num" style={{ fontWeight: "700" }}>{fmtMoney(amt, homeCurrency)}</span>
                  </div>
                  <div style={{ height: "8px", borderRadius: "4px", backgroundColor: theme.inputBg, boxShadow: theme.clayPressed, overflow: "hidden" }}>
                    <div
                      style={{
                        height: "100%",
                        width: `${pct}%`,
                        borderRadius: "4px",
                        backgroundColor: theme.primary,
                        transition: "width 0.4s ease",
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </ClayCard>
    </div>
  );
}
