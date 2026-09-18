import React, { useState } from "react";
import { Pencil, Trash2, Repeat, Utensils, Plane, Home, Zap, ShoppingBag, Film, Tag } from "lucide-react";
import { fmtMoney } from "../../services/currency";
import { getShares } from "../../services/storage";
import { ClayCard } from "../common/ClayCard";
import { useTheme } from "../../theme/clayTheme";

const ICON_MAP = {
  Food: Utensils,
  Travel: Plane,
  Rent: Home,
  Utilities: Zap,
  Shopping: ShoppingBag,
  Entertainment: Film,
  Other: Tag,
};

export function ExpenseCard({ expense, members, currency, onEdit, onDelete }) {
  const { theme } = useTheme();
  const [confirming, setConfirming] = useState(false);

  const IconComp = ICON_MAP[expense.category] || Tag;
  const payerName = members.find((m) => m.id === expense.paidBy)?.name || "Someone";
  const isYouPayer = expense.paidBy === "you";

  const shares = getShares(expense);
  const myShare = shares["you"] || 0;

  const formatDate = (isoStr) => {
    try {
      const d = new Date(isoStr);
      return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    } catch {
      return "";
    }
  };

  return (
    <ClayCard style={{ padding: "14px 16px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "10px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px", flex: 1, minWidth: 0 }}>
          <div
            style={{
              width: "38px",
              height: "38px",
              borderRadius: "14px",
              backgroundColor: theme.primaryTint,
              color: theme.primary,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <IconComp size={18} />
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: "14.5px", fontWeight: "700", color: theme.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {expense.desc}
            </div>
            <div style={{ fontSize: "11.5px", color: theme.muted, marginTop: "2px", display: "flex", gap: "6px", alignItems: "center", flexWrap: "wrap" }}>
              <span>{isYouPayer ? "You paid" : `${payerName} paid`}</span>
              <span>·</span>
              <span>{formatDate(expense.date)}</span>
              {expense.recurring && (
                <span style={{ color: theme.primary, fontWeight: "700", display: "inline-flex", alignItems: "center", gap: "2px" }}>
                  <Repeat size={10} /> Monthly
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Right side Amount & Share */}
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div className="font-num" style={{ fontSize: "15px", fontWeight: "800", color: theme.text }}>
            {fmtMoney(expense.amount, currency)}
          </div>
          <div style={{ fontSize: "11px", fontWeight: "600", color: isYouPayer ? theme.emeraldDark : theme.coralDark, marginTop: "2px" }}>
            {isYouPayer ? `You lent ${fmtMoney(expense.amount - myShare, currency)}` : `Your share: ${fmtMoney(myShare, currency)}`}
          </div>
        </div>
      </div>

      {/* Edit & Confirm Delete Action Row */}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "10px", paddingTop: "8px", borderTop: `1px dashed ${theme.border}` }}>
        <button
          onClick={onEdit}
          style={{
            background: "none",
            border: "none",
            color: theme.muted,
            fontSize: "11.5px",
            fontWeight: "600",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: "4px",
            padding: "2px 6px",
          }}
        >
          <Pencil size={12} /> Edit
        </button>

        {!confirming ? (
          <button
            onClick={() => setConfirming(true)}
            style={{
              background: "none",
              border: "none",
              color: theme.mutedSoft,
              fontSize: "11.5px",
              fontWeight: "600",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "4px",
              padding: "2px 6px",
            }}
          >
            <Trash2 size={12} /> Delete
          </button>
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span style={{ fontSize: "11px", color: theme.coral, fontWeight: "700" }}>Confirm?</span>
            <button
              onClick={onDelete}
              style={{
                backgroundColor: theme.coral,
                color: "#FFF",
                border: "none",
                borderRadius: "6px",
                padding: "2px 8px",
                fontSize: "11px",
                fontWeight: "700",
                cursor: "pointer",
              }}
            >
              Yes
            </button>
            <button
              onClick={() => setConfirming(false)}
              style={{
                backgroundColor: theme.inputBg,
                color: theme.muted,
                border: "none",
                borderRadius: "6px",
                padding: "2px 6px",
                fontSize: "11px",
                cursor: "pointer",
              }}
            >
              No
            </button>
          </div>
        )}
      </div>
    </ClayCard>
  );
}
