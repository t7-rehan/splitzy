import React from "react";
import { Repeat, CalendarCheck } from "lucide-react";
import { fmtMoney } from "../../services/currency";
import { ClayCard } from "../common/ClayCard";
import { useTheme } from "../../theme/clayTheme";

export function RecurringSection({ expenses, currency, onLogMonthly }) {
  const { theme } = useTheme();

  if (!expenses || expenses.length === 0) return null;

  return (
    <ClayCard style={{ padding: "16px 18px", marginBottom: "20px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
        <Repeat size={16} color={theme.primary} />
        <div style={{ fontSize: "12px", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.8px", color: theme.muted }}>
          Monthly Recurring Expenses ({expenses.length})
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
        {expenses.map((e) => (
          <div
            key={e.id}
            style={{
              backgroundColor: theme.inputBg,
              borderRadius: "14px",
              padding: "10px 12px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              boxShadow: theme.clayPressed,
            }}
          >
            <div>
              <div style={{ fontSize: "13.5px", fontWeight: "700", color: theme.text }}>{e.desc}</div>
              <div style={{ fontSize: "11.5px", color: theme.muted, marginTop: "2px" }}>
                {fmtMoney(e.amount, currency)} / month
              </div>
            </div>

            <button
              onClick={() => onLogMonthly(e)}
              style={{
                backgroundColor: theme.primary,
                color: "#FFF",
                border: "none",
                borderRadius: "10px",
                padding: "6px 12px",
                fontSize: "11.5px",
                fontWeight: "700",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "4px",
                boxShadow: theme.clayRaisedSm,
              }}
            >
              <CalendarCheck size={14} /> Log This Month
            </button>
          </div>
        ))}
      </div>
    </ClayCard>
  );
}
