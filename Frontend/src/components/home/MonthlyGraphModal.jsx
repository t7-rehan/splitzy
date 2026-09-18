import React, { useState } from "react";
import { BarChart3, ChevronLeft, ChevronRight, TrendingUp, TrendingDown, Users, Utensils, Plane, Home, Zap, ShoppingBag, Film, Tag } from "lucide-react";
import { BottomSheet } from "../common/BottomSheet";
import { ClayCard } from "../common/ClayCard";
import { ClayButton } from "../common/ClayButton";
import { fmtMoney, convertCurrency } from "../../services/currency";
import { getShares } from "../../services/storage";
import { useTheme } from "../../theme/clayTheme";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

const CATEGORY_ICONS = {
  Food: Utensils,
  Travel: Plane,
  Rent: Home,
  Utilities: Zap,
  Shopping: ShoppingBag,
  Entertainment: Film,
  Other: Tag,
};

export function MonthlyGraphModal({ isOpen, onClose, groups, profile }) {
  const { theme } = useTheme();
  const homeCurrency = profile.homeCurrency || "INR";
  const now = new Date();
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth());

  const handlePrevMonth = () => {
    if (selectedMonth === 0) {
      setSelectedMonth(11);
      setSelectedYear(selectedYear - 1);
    } else {
      setSelectedMonth(selectedMonth - 1);
    }
  };

  const handleNextMonth = () => {
    if (selectedMonth === 11) {
      setSelectedMonth(0);
      setSelectedYear(selectedYear + 1);
    } else {
      setSelectedMonth(selectedMonth + 1);
    }
  };

  // Calculate actual user expense shares for the selected month
  const groupSpendMap = {};
  const categorySpendMap = {};
  let totalMonthSpend = 0;
  let expenseCount = 0;

  groups.forEach((g) => {
    g.expenses.forEach((e) => {
      try {
        const d = new Date(e.date);
        const y = d.getFullYear();
        const m = d.getMonth();

        if (y === selectedYear && m === selectedMonth) {
          const shares = getShares(e);
          const myShare = shares["you"] || 0;
          if (myShare > 0) {
            const inHome = convertCurrency(myShare, g.currency, homeCurrency);
            groupSpendMap[g.name] = (groupSpendMap[g.name] || 0) + inHome;
            const cat = e.category || "Other";
            categorySpendMap[cat] = (categorySpendMap[cat] || 0) + inHome;
            totalMonthSpend += inHome;
            expenseCount += 1;
          }
        }
      } catch (err) {
        console.error("Invalid expense date", err);
      }
    });
  });

  const sortedGroups = Object.entries(groupSpendMap).sort((a, b) => b[1] - a[1]);
  const maxGroupSpend = sortedGroups.length ? sortedGroups[0][1] : 1;

  const sortedCategories = Object.entries(categorySpendMap).sort((a, b) => b[1] - a[1]);
  const maxCatSpend = sortedCategories.length ? sortedCategories[0][1] : 1;

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title="Monthly Expense Graph" subtitle="Detailed spending visualization">
      <div className="animate-fade-in" style={{ paddingBottom: "10px" }}>
        {/* Month Selector Switcher */}
        <ClayCard style={{ padding: "14px 16px", marginBottom: "16px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <button
              type="button"
              onClick={handlePrevMonth}
              style={{
                width: "34px",
                height: "34px",
                borderRadius: "12px",
                border: `1px solid ${theme.border}`,
                backgroundColor: theme.card,
                color: theme.text,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                boxShadow: theme.clayRaisedSm,
              }}
            >
              <ChevronLeft size={18} />
            </button>

            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: "17px", fontWeight: "800", color: theme.text }}>
                {MONTH_NAMES[selectedMonth]} {selectedYear}
              </div>
              <div style={{ fontSize: "11px", color: theme.muted, marginTop: "2px" }}>
                {expenseCount} transaction{expenseCount === 1 ? "" : "s"} logged
              </div>
            </div>

            <button
              type="button"
              onClick={handleNextMonth}
              style={{
                width: "34px",
                height: "34px",
                borderRadius: "12px",
                border: `1px solid ${theme.border}`,
                backgroundColor: theme.card,
                color: theme.text,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                boxShadow: theme.clayRaisedSm,
              }}
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </ClayCard>

        {/* Total Month Spend Card */}
        <ClayCard
          style={{
            padding: "20px 18px",
            marginBottom: "16px",
            background: theme.mode === "dark" ? "linear-gradient(135deg, #1E293B 0%, #172033 100%)" : "linear-gradient(135deg, #EFF6FF 0%, #EEF3F8 100%)",
          }}
        >
          <div style={{ fontSize: "11.5px", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.8px", color: theme.muted, marginBottom: "6px" }}>
            Total Your Share This Month
          </div>
          <div className="font-num" style={{ fontSize: "32px", fontWeight: "800", color: theme.primary, letterSpacing: "-0.5px" }}>
            {fmtMoney(totalMonthSpend, homeCurrency)}
          </div>
          <div style={{ fontSize: "12px", color: theme.muted, marginTop: "4px" }}>
            Calculated across all your active groups in {homeCurrency}
          </div>
        </ClayCard>

        {/* Group-Wise Spending Graph */}
        <ClayCard style={{ padding: "18px 16px", marginBottom: "16px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
            <div style={{ fontSize: "12px", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.8px", color: theme.muted }}>
              Group-Wise Spending
            </div>
            <span style={{ fontSize: "11px", color: theme.mutedSoft, fontWeight: "600" }}>
              {sortedGroups.length} group{sortedGroups.length === 1 ? "" : "s"}
            </span>
          </div>

          {sortedGroups.length === 0 ? (
            <div style={{ textAlign: "center", padding: "16px 8px", color: theme.muted, fontSize: "13px" }}>
              No expenses found for {MONTH_NAMES[selectedMonth]} {selectedYear}.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              {sortedGroups.map(([groupName, amt]) => {
                const pct = Math.round((amt / maxGroupSpend) * 100);
                const shareOfTotal = totalMonthSpend > 0 ? Math.round((amt / totalMonthSpend) * 100) : 0;

                return (
                  <div key={groupName}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "13px", fontWeight: "700", color: theme.text, marginBottom: "5px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <Users size={14} color={theme.primary} />
                        <span>{groupName}</span>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <span className="font-num" style={{ color: theme.text }}>{fmtMoney(amt, homeCurrency)}</span>
                        <span style={{ fontSize: "10.5px", color: theme.muted, marginLeft: "6px" }}>({shareOfTotal}%)</span>
                      </div>
                    </div>
                    {/* Visual Bar */}
                    <div style={{ height: "9px", borderRadius: "5px", backgroundColor: theme.inputBg, boxShadow: theme.clayPressed, overflow: "hidden" }}>
                      <div
                        style={{
                          height: "100%",
                          width: `${pct}%`,
                          borderRadius: "5px",
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

        {/* Category Breakdown for Month */}
        {sortedCategories.length > 0 && (
          <ClayCard style={{ padding: "18px 16px", marginBottom: "16px" }}>
            <div style={{ fontSize: "12px", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.8px", color: theme.muted, marginBottom: "14px" }}>
              Category Distribution
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {sortedCategories.map(([cat, amt]) => {
                const pct = Math.round((amt / maxCatSpend) * 100);
                const IconComp = CATEGORY_ICONS[cat] || Tag;

                return (
                  <div key={cat}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "12.5px", fontWeight: "600", color: theme.text, marginBottom: "4px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <IconComp size={14} color={theme.emerald} />
                        <span>{cat}</span>
                      </div>
                      <span className="font-num" style={{ fontWeight: "700" }}>{fmtMoney(amt, homeCurrency)}</span>
                    </div>
                    <div style={{ height: "7px", borderRadius: "4px", backgroundColor: theme.inputBg, boxShadow: theme.clayPressed, overflow: "hidden" }}>
                      <div
                        style={{
                          height: "100%",
                          width: `${pct}%`,
                          borderRadius: "4px",
                          backgroundColor: theme.emerald,
                          transition: "width 0.4s ease",
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </ClayCard>
        )}

        <ClayButton fullWidth variant="secondary" onClick={onClose}>
          Close Graph
        </ClayButton>
      </div>
    </BottomSheet>
  );
}
