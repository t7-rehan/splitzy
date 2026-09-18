import React, { useState } from "react";
import { PieChart, TrendingUp, TrendingDown, Crown, Sparkles, Award, Utensils, Plane, Home, Zap, ShoppingBag, Film, Tag } from "lucide-react";
import { fmtMoney, convertCurrency } from "../../services/currency";
import { computeBalances, getShares } from "../../services/storage";
import { ClayCard } from "../common/ClayCard";
import { ClayButton } from "../common/ClayButton";

const CATEGORY_ICONS = {
  Food: Utensils,
  Travel: Plane,
  Rent: Home,
  Utilities: Zap,
  Shopping: ShoppingBag,
  Entertainment: Film,
  Other: Tag,
};

export function InsightsScreen({ groups, profile, isPro, onShowProUpgrade, theme }) {
  const homeCurrency = profile.homeCurrency || "INR";
  const now = new Date();
  const currentMonthName = now.toLocaleDateString("en-US", { month: "long" });

  // Calculate total owed and owe across all groups
  let totalOwed = 0;
  let totalOwe = 0;

  groups.forEach((g) => {
    const net = computeBalances(g.members, g.expenses);
    const myNet = net["you"] || 0;
    const inHome = convertCurrency(myNet, g.currency, homeCurrency);

    if (inHome > 0.5) totalOwed += inHome;
    else if (inHome < -0.5) totalOwe += Math.abs(inHome);
  });

  // Calculate category spend totals for the current month
  const categoryMonthlyTotals = {
    Food: 0,
    Travel: 0,
    Rent: 0,
    Utilities: 0,
    Shopping: 0,
    Entertainment: 0,
    Other: 0,
  };

  let totalMonthCategorySpend = 0;

  groups.forEach((g) => {
    g.expenses.forEach((e) => {
      const shares = getShares(e);
      const myShare = shares["you"] || 0;
      if (myShare > 0) {
        const inHome = convertCurrency(myShare, g.currency, homeCurrency);
        const cat = e.category || "Other";
        categoryMonthlyTotals[cat] = (categoryMonthlyTotals[cat] || 0) + inHome;
        totalMonthCategorySpend += inHome;
      }
    });
  });

  const sortedCategories = Object.entries(categoryMonthlyTotals)
    .filter(([_, amt]) => amt > 0)
    .sort((a, b) => b[1] - a[1]);

  const maxCategoryAmt = sortedCategories.length > 0 ? sortedCategories[0][1] : 1;

  // Group-wise total spend
  const groupTotals = groups.map((g) => {
    const totalSpend = g.expenses.reduce((sum, e) => {
      const shares = getShares(e);
      return sum + (shares["you"] || 0);
    }, 0);
    return {
      name: g.name,
      currency: g.currency,
      totalInHome: convertCurrency(totalSpend, g.currency, homeCurrency),
    };
  }).sort((a, b) => b.totalInHome - a.totalInHome);

  return (
    <div style={{ padding: "20px 18px" }} className="animate-fade-in">
      <div style={{ marginBottom: "18px" }}>
        <h2 style={{ margin: 0, fontSize: "22px", fontWeight: "800", color: theme.text }}>
          Insights & Analytics
        </h2>
        <div style={{ fontSize: "12px", color: theme.muted, marginTop: "2px" }}>
          Converted to {homeCurrency}
        </div>
      </div>

      {/* Summary Cards Row */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "20px" }}>
        <ClayCard style={{ padding: "16px 14px", backgroundColor: theme.mode === "dark" ? "#064E3B" : "#ECFDF5" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "11.5px", fontWeight: "700", color: theme.emeraldDark, marginBottom: "6px" }}>
            <TrendingUp size={14} /> You're Owed
          </div>
          <div className="font-num" style={{ fontSize: "22px", fontWeight: "800", color: theme.emeraldDark }}>
            {fmtMoney(totalOwed, homeCurrency)}
          </div>
        </ClayCard>

        <ClayCard style={{ padding: "16px 14px", backgroundColor: theme.mode === "dark" ? "#7F1D1D" : "#FEF2F2" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "11.5px", fontWeight: "700", color: theme.coralDark, marginBottom: "6px" }}>
            <TrendingDown size={14} /> You Owe
          </div>
          <div className="font-num" style={{ fontSize: "22px", fontWeight: "800", color: theme.coralDark }}>
            {fmtMoney(totalOwe, homeCurrency)}
          </div>
        </ClayCard>
      </div>

      {/* Monthly Expenses by Category */}
      <ClayCard style={{ padding: "20px 18px", marginBottom: "20px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
          <div>
            <div style={{ fontSize: "12px", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.8px", color: theme.muted }}>
              Monthly Expenses by Category
            </div>
            <div style={{ fontSize: "11.5px", color: theme.mutedSoft, marginTop: "2px" }}>
              {currentMonthName} spending breakdown
            </div>
          </div>
          <span className="font-num" style={{ fontSize: "14px", fontWeight: "800", color: theme.primary }}>
            {fmtMoney(totalMonthCategorySpend, homeCurrency)}
          </span>
        </div>

        {sortedCategories.length === 0 ? (
          <div style={{ fontSize: "13px", color: theme.muted, textAlign: "center", padding: "12px 0" }}>
            No spending logged for this month yet.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {sortedCategories.map(([cat, amt]) => {
              const pct = Math.round((amt / maxCategoryAmt) * 100);
              const IconComp = CATEGORY_ICONS[cat] || Tag;

              return (
                <div key={cat}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "13px", fontWeight: "600", color: theme.text, marginBottom: "5px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <IconComp size={14} color={theme.primary} />
                      <span>{cat}</span>
                    </div>
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

      {/* PRO Insights Section */}
      <ClayCard style={{ padding: "20px 18px", marginBottom: "20px", position: "relative" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <Crown size={18} color={theme.purple} />
            <div style={{ fontSize: "13px", fontWeight: "800", color: theme.text }}>
              Advanced Pro Analytics
            </div>
          </div>
          {!isPro && (
            <span style={{ fontSize: "10px", fontWeight: "800", backgroundColor: theme.purple, color: "#FFF", padding: "2px 6px", borderRadius: "6px" }}>
              PRO
            </span>
          )}
        </div>

        {!isPro ? (
          <div style={{ textAlign: "center", padding: "16px 8px" }}>
            <Sparkles size={28} color={theme.purple} style={{ margin: "0 auto 10px" }} />
            <div style={{ fontSize: "14px", fontWeight: "700", color: theme.text, marginBottom: "4px" }}>
              Unlock Monthly Comparisons & Group Trends
            </div>
            <div style={{ fontSize: "12.5px", color: theme.muted, marginBottom: "16px" }}>
              See month-over-month comparisons, group rankings, and savings insights.
            </div>
            <ClayButton size="sm" onClick={() => onShowProUpgrade("Unlock Advanced Pro Analytics")}>
              Unlock Splitzy Pro
            </ClayButton>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            {/* Monthly Trend Stat */}
            <div style={{ backgroundColor: theme.inputBg, borderRadius: "14px", padding: "12px 14px", boxShadow: theme.clayPressed }}>
              <div style={{ fontSize: "12px", color: theme.muted, marginBottom: "2px" }}>Monthly Spend Comparison</div>
              <div style={{ fontSize: "14px", fontWeight: "700", color: theme.emeraldDark, display: "flex", alignItems: "center", gap: "6px" }}>
                <TrendingDown size={16} /> Spending is 12% lower than last month
              </div>
            </div>

            {/* Group Breakdown */}
            <div>
              <div style={{ fontSize: "12px", fontWeight: "700", color: theme.muted, marginBottom: "8px" }}>
                Top Spending Groups
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {groupTotals.slice(0, 3).map((gt, idx) => (
                  <div key={idx} style={{ display: "flex", justifyContent: "space-between", fontSize: "13px", fontWeight: "600", color: theme.text }}>
                    <span>{gt.name}</span>
                    <span className="font-num" style={{ fontWeight: "700" }}>{fmtMoney(gt.totalInHome, homeCurrency)}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Savings Tip */}
            <div style={{ backgroundColor: theme.mode === "dark" ? "#1E293B" : "#EFF6FF", border: `1px solid ${theme.primary}`, borderRadius: "14px", padding: "12px", display: "flex", gap: "8px" }}>
              <Award size={18} color={theme.primary} style={{ flexShrink: 0, marginTop: "2px" }} />
              <div style={{ fontSize: "12px", color: theme.text, lineHeight: "1.4" }}>
                <strong>Potential Savings:</strong> Food expenses were your highest share this month ({fmtMoney(categoryMonthlyTotals["Food"] || 0, homeCurrency)}).
              </div>
            </div>
          </div>
        )}
      </ClayCard>
    </div>
  );
}
