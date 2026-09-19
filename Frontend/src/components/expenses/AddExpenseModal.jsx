import React, { useState, useEffect } from "react";
import { Utensils, Plane, Home, Zap, ShoppingBag, Film, Tag, Plus, X, Repeat, Check } from "lucide-react";
import { BottomSheet } from "../common/BottomSheet";
import { ClayButton } from "../common/ClayButton";
import { symbolFor, fmtMoney } from "../../services/currency";
import { validateExpenseData } from "../../services/validation";
import { useTheme } from "../../theme/clayTheme";

export const CATEGORIES = [
  { id: "Food", label: "Food", icon: Utensils, color: "#F59E0B" },
  { id: "Travel", label: "Travel", icon: Plane, color: "#3B82F6" },
  { id: "Rent", label: "Rent", icon: Home, color: "#8B5CF6" },
  { id: "Utilities", label: "Utilities", icon: Zap, color: "#10B981" },
  { id: "Shopping", label: "Shopping", icon: ShoppingBag, color: "#EC4899" },
  { id: "Entertainment", label: "Entertainment", icon: Film, color: "#F97316" },
  { id: "Other", label: "Other", icon: Tag, color: "#64748B" },
];

export function AddExpenseModal({ isOpen, onClose, group, onSaveExpense, editingExpense = null }) {
  const { theme } = useTheme();
  const currencySymbol = symbolFor(group?.currency || "INR");

  const [desc, setDesc] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("Food");
  const [paidBy, setPaidBy] = useState("you");
  const [splitType, setSplitType] = useState("equal");
  const [participants, setParticipants] = useState([]);
  const [percentages, setPercentages] = useState({});
  const [items, setItems] = useState([]);
  const [recurring, setRecurring] = useState(false);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!group || !isOpen) return;

    if (editingExpense) {
      setDesc(editingExpense.desc);
      setAmount(editingExpense.amount ? String(editingExpense.amount) : "");
      setCategory(editingExpense.category || "Food");
      setPaidBy(editingExpense.paidBy || group.members[0]?.id || "you");
      setSplitType(editingExpense.splitType || "equal");
      setParticipants(editingExpense.participants || group.members.map((m) => m.id));
      setPercentages(editingExpense.percentages || {});
      setItems(editingExpense.items || []);
      setRecurring(Boolean(editingExpense.recurring));
    } else {
      setDesc("");
      setAmount("");
      setCategory("Food");
      setPaidBy(group.members[0]?.id || "you");
      setSplitType("equal");
      setParticipants(group.members.map((m) => m.id));
      setPercentages({});
      setItems([]);
      setRecurring(false);
    }
    setError("");
  }, [isOpen, editingExpense, group]);

  if (!group) return null;

  const handleToggleParticipant = (id) => {
    if (participants.includes(id)) {
      if (participants.length === 1) return; // keep at least 1
      setParticipants(participants.filter((p) => p !== id));
    } else {
      setParticipants([...participants, id]);
    }
  };

  const handleSwitchPercentage = () => {
    setSplitType("percentage");
    const count = group.members.length;
    const evenPct = Math.floor(100 / count);
    const pMap = {};
    group.members.forEach((m, idx) => {
      pMap[m.id] = idx === count - 1 ? 100 - evenPct * (count - 1) : evenPct;
    });
    setPercentages(pMap);
  };

  const handleAddItem = () => {
    setItems((prev) => [
      ...prev,
      {
        id: "item_" + Date.now(),
        name: "",
        price: "",
        participants: group.members.map((m) => m.id),
      },
    ]);
  };

  const handleUpdateItem = (idx, patch) => {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  };

  const handleRemoveItem = (idx) => {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleToggleItemParticipant = (idx, memberId) => {
    setItems((prev) =>
      prev.map((it, i) => {
        if (i !== idx) return it;
        const p = it.participants || [];
        const nextP = p.includes(memberId) ? p.filter((x) => x !== memberId) : [...p, memberId];
        return { ...it, participants: nextP };
      })
    );
  };

  const itemsTotal = items.reduce((sum, it) => sum + (parseFloat(it.price) || 0), 0);
  const pctTotal = Object.values(percentages).reduce((sum, p) => sum + (parseFloat(p) || 0), 0);

  // Task 9: saving is server-backed and async. onSaveExpense resolves with the
  // saved (server-authoritative) expense on success or null on failure — the
  // sheet stays open on failure (the toast/form error explains why) so the
  // user can retry without retyping.
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    const validation = validateExpenseData({
      desc,
      amount: splitType === "itemized" ? itemsTotal : amount,
      splitType,
      participants,
      percentages,
      items,
      paidBy,
    });

    if (!validation.valid) {
      setError(validation.error);
      return;
    }

    const expensePayload = {
      id: editingExpense ? editingExpense.id : "e_" + Date.now(),
      desc: desc.trim(),
      category,
      paidBy,
      amount: splitType === "itemized" ? itemsTotal : parseFloat(amount),
      date: editingExpense ? editingExpense.date : new Date().toISOString(),
      splitType,
      participants: splitType === "equal" ? participants : group.members.map((m) => m.id),
      percentages: splitType === "percentage" ? percentages : {},
      items: splitType === "itemized" ? items : [],
      recurring,
    };

    setIsSubmitting(true);
    try {
      const saved = await onSaveExpense(expensePayload);
      if (saved !== null && saved !== undefined) {
        onClose();
      } else if (!error) {
        setError("Could not save the expense. Please try again.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={onClose}
      title={editingExpense ? "Edit Expense" : "Add Expense"}
      subtitle={group.name}
    >
      <form onSubmit={handleSubmit}>
        {/* Description & Amount */}
        <div style={{ marginBottom: "14px" }}>
          <input
            autoFocus
            type="text"
            value={desc}
            onChange={(e) => {
              setDesc(e.target.value);
              setError("");
            }}
            placeholder="What was it for? (e.g. Dinner or Uber)"
            style={{
              width: "100%",
              padding: "14px 16px",
              borderRadius: "16px",
              border: `1px solid ${theme.border}`,
              backgroundColor: theme.inputBg,
              boxShadow: theme.clayPressed,
              fontSize: "15px",
              fontWeight: "600",
              color: theme.text,
            }}
          />
        </div>

        {splitType !== "itemized" && (
          <div style={{ marginBottom: "16px" }}>
            <div style={{ position: "relative" }}>
              <span
                style={{
                  position: "absolute",
                  left: "16px",
                  top: "13px",
                  fontSize: "18px",
                  fontWeight: "800",
                  color: theme.primary,
                }}
              >
                {currencySymbol}
              </span>
              <input
                type="number"
                step="any"
                value={amount}
                onChange={(e) => {
                  setAmount(e.target.value);
                  setError("");
                }}
                placeholder="0.00"
                className="font-num"
                style={{
                  width: "100%",
                  padding: "14px 16px 14px 38px",
                  borderRadius: "16px",
                  border: `1px solid ${theme.border}`,
                  backgroundColor: theme.inputBg,
                  boxShadow: theme.clayPressed,
                  fontSize: "20px",
                  fontWeight: "800",
                  color: theme.text,
                }}
              />
            </div>
          </div>
        )}

        {/* Category Picker */}
        <div style={{ marginBottom: "16px" }}>
          <label style={{ display: "block", fontSize: "11.5px", fontWeight: "700", textTransform: "uppercase", color: theme.muted, marginBottom: "8px" }}>
            Category
          </label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
            {CATEGORIES.map((cat) => {
              const selected = category === cat.id;
              const Icon = cat.icon;
              return (
                <button
                  type="button"
                  key={cat.id}
                  onClick={() => setCategory(cat.id)}
                  style={{
                    padding: "8px 12px",
                    borderRadius: "14px",
                    border: selected ? `2px solid ${theme.primary}` : `1px solid ${theme.border}`,
                    backgroundColor: selected ? theme.primaryTint : theme.card,
                    boxShadow: selected ? theme.clayPressed : theme.clayRaisedSm,
                    color: selected ? theme.primary : theme.text,
                    fontSize: "12px",
                    fontWeight: "700",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                  }}
                >
                  <Icon size={14} color={selected ? theme.primary : cat.color} />
                  {cat.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Paid By Picker */}
        <div style={{ marginBottom: "16px" }}>
          <label style={{ display: "block", fontSize: "11.5px", fontWeight: "700", textTransform: "uppercase", color: theme.muted, marginBottom: "8px" }}>
            Paid By
          </label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
            {group.members.map((m) => {
              const selected = paidBy === m.id;
              return (
                <button
                  type="button"
                  key={m.id}
                  onClick={() => setPaidBy(m.id)}
                  style={{
                    padding: "8px 14px",
                    borderRadius: "14px",
                    border: selected ? `2px solid ${theme.primary}` : `1px solid ${theme.border}`,
                    backgroundColor: selected ? theme.primary : theme.card,
                    boxShadow: selected ? theme.clayButtonActive : theme.clayRaisedSm,
                    color: selected ? "#FFF" : theme.text,
                    fontSize: "12.5px",
                    fontWeight: "700",
                    cursor: "pointer",
                  }}
                >
                  {m.name} {m.id === "you" ? "(You)" : ""}
                </button>
              );
            })}
          </div>
        </div>

        {/* Split Mode Control */}
        <div style={{ marginBottom: "16px" }}>
          <label style={{ display: "block", fontSize: "11.5px", fontWeight: "700", textTransform: "uppercase", color: theme.muted, marginBottom: "8px" }}>
            Split Mode
          </label>
          <div style={{ display: "flex", backgroundColor: theme.inputBg, padding: "4px", borderRadius: "14px", boxShadow: theme.clayPressed }}>
            {[
              { id: "equal", label: "Equal" },
              { id: "percentage", label: "Percentage" },
              { id: "itemized", label: "Itemized" },
            ].map((s) => {
              const selected = splitType === s.id;
              return (
                <button
                  type="button"
                  key={s.id}
                  onClick={() => {
                    if (s.id === "percentage") handleSwitchPercentage();
                    else setSplitType(s.id);
                  }}
                  style={{
                    flex: 1,
                    padding: "8px 0",
                    borderRadius: "10px",
                    border: "none",
                    backgroundColor: selected ? theme.card : "transparent",
                    boxShadow: selected ? theme.clayRaisedSm : "none",
                    color: selected ? theme.primary : theme.muted,
                    fontSize: "12px",
                    fontWeight: "700",
                    cursor: "pointer",
                  }}
                >
                  {s.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Split Details */}
        {splitType === "equal" && (
          <div style={{ marginBottom: "16px" }}>
            <div style={{ fontSize: "12px", color: theme.muted, marginBottom: "8px" }}>
              Participating members ({participants.length}):
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
              {group.members.map((m) => {
                const active = participants.includes(m.id);
                return (
                  <button
                    type="button"
                    key={m.id}
                    onClick={() => handleToggleParticipant(m.id)}
                    style={{
                      padding: "6px 12px",
                      borderRadius: "12px",
                      border: active ? `1.5px solid ${theme.emerald}` : `1px solid ${theme.border}`,
                      backgroundColor: active ? theme.emeraldTint : "transparent",
                      color: active ? theme.emeraldDark : theme.muted,
                      fontSize: "12px",
                      fontWeight: "700",
                      cursor: "pointer",
                    }}
                  >
                    {m.name} {active ? "✓" : ""}
                  </button>
                );
              })}
            </div>
            {amount > 0 && participants.length > 0 && (
              <div style={{ fontSize: "12.5px", color: theme.primary, fontWeight: "700", marginTop: "8px" }}>
                {currencySymbol}{amount} ÷ {participants.length} = {fmtMoney(amount / participants.length, group.currency)} each
              </div>
            )}
          </div>
        )}

        {splitType === "percentage" && (
          <div style={{ marginBottom: "16px" }}>
            {group.members.map((m) => (
              <div key={m.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px" }}>
                <span style={{ fontSize: "13px", fontWeight: "600", color: theme.text }}>{m.name}</span>
                <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                  <input
                    type="number"
                    value={percentages[m.id] ?? 0}
                    onChange={(e) =>
                      setPercentages({
                        ...percentages,
                        [m.id]: parseFloat(e.target.value) || 0,
                      })
                    }
                    style={{
                      width: "60px",
                      padding: "6px 8px",
                      borderRadius: "10px",
                      border: `1px solid ${theme.border}`,
                      backgroundColor: theme.card,
                      boxShadow: theme.clayPressed,
                      fontSize: "13px",
                      fontWeight: "700",
                      color: theme.text,
                      textAlign: "right",
                    }}
                  />
                  <span style={{ fontSize: "12px", color: theme.muted }}>%</span>
                </div>
              </div>
            ))}
            <div style={{ fontSize: "12px", fontWeight: "700", color: Math.abs(pctTotal - 100) < 0.01 ? theme.emeraldDark : theme.coral, marginTop: "6px" }}>
              Total: {pctTotal.toFixed(0)}% {Math.abs(pctTotal - 100) < 0.01 ? "✓ (100%)" : "— Must sum to 100%"}
            </div>
          </div>
        )}

        {splitType === "itemized" && (
          <div style={{ marginBottom: "16px" }}>
            {items.map((item, idx) => (
              <div key={item.id} style={{ backgroundColor: theme.inputBg, borderRadius: "14px", padding: "10px", marginBottom: "8px" }}>
                <div style={{ display: "flex", gap: "8px", marginBottom: "6px" }}>
                  <input
                    type="text"
                    placeholder="Item name"
                    value={item.name}
                    onChange={(e) => handleUpdateItem(idx, { name: e.target.value })}
                    style={{ flex: 2, padding: "8px 10px", borderRadius: "10px", border: `1px solid ${theme.border}`, backgroundColor: theme.card, color: theme.text, fontSize: "13px" }}
                  />
                  <input
                    type="number"
                    placeholder="Price"
                    value={item.price}
                    onChange={(e) => handleUpdateItem(idx, { price: e.target.value })}
                    style={{ flex: 1, padding: "8px 10px", borderRadius: "10px", border: `1px solid ${theme.border}`, backgroundColor: theme.card, color: theme.text, fontSize: "13px" }}
                  />
                  <button onClick={() => handleRemoveItem(idx)} style={{ background: "none", border: "none", color: theme.coral, cursor: "pointer" }}>
                    <X size={16} />
                  </button>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
                  {group.members.map((m) => {
                    const active = (item.participants || []).includes(m.id);
                    return (
                      <button
                        type="button"
                        key={m.id}
                        onClick={() => handleToggleItemParticipant(idx, m.id)}
                        style={{
                          padding: "4px 8px",
                          borderRadius: "8px",
                          border: active ? `1px solid ${theme.emerald}` : `1px solid ${theme.border}`,
                          backgroundColor: active ? theme.emeraldTint : "transparent",
                          fontSize: "11px",
                          fontWeight: "600",
                          color: active ? theme.emeraldDark : theme.muted,
                        }}
                      >
                        {m.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
            <button
              type="button"
              onClick={handleAddItem}
              style={{
                width: "100%",
                padding: "8px 0",
                borderRadius: "12px",
                border: `1.5px dashed ${theme.primary}`,
                backgroundColor: "transparent",
                color: theme.primary,
                fontSize: "12.5px",
                fontWeight: "700",
                cursor: "pointer",
              }}
            >
              + Add Item
            </button>
            <div style={{ fontSize: "13px", fontWeight: "800", color: theme.text, marginTop: "8px" }}>
              Total: {fmtMoney(itemsTotal, group.currency)}
            </div>
          </div>
        )}

        {/* Monthly Recurring Checkbox */}
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            fontSize: "13px",
            fontWeight: "600",
            color: theme.text,
            marginBottom: "20px",
            cursor: "pointer",
          }}
        >
          <input
            type="checkbox"
            checked={recurring}
            onChange={(e) => setRecurring(e.target.checked)}
            style={{ width: "16px", height: "16px", accentColor: theme.primary }}
          />
          <Repeat size={14} color={theme.primary} />
          <span>Make this a monthly recurring expense</span>
        </label>

        {error && (
          <div style={{ color: theme.coral, fontSize: "12.5px", fontWeight: "600", marginBottom: "14px" }}>
            {error}
          </div>
        )}

        <div style={{ display: "flex", gap: "10px" }}>
          <ClayButton variant="secondary" fullWidth onClick={onClose}>
            Cancel
          </ClayButton>
          <ClayButton type="submit" variant="primary" fullWidth disabled={isSubmitting}>
            {isSubmitting ? "Saving..." : editingExpense ? "Save Changes" : "Save Expense"}
          </ClayButton>
        </div>
      </form>
    </BottomSheet>
  );
}
