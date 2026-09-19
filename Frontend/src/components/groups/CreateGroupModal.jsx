import React, { useState } from "react";
import { BottomSheet } from "../common/BottomSheet";
import { ClayButton } from "../common/ClayButton";
import { CURRENCIES } from "../../services/currency";
import { checkCanCreateGroup } from "../../services/proService";
import { useTheme } from "../../theme/clayTheme";

export function CreateGroupModal({ isOpen, onClose, onCreateGroup, userProfile, groupCount, onShowProUpgrade }) {
  const { theme } = useTheme();
  const [name, setName] = useState("");
  const [currency, setCurrency] = useState(userProfile.homeCurrency || "INR");
  const [isRoommate, setIsRoommate] = useState(false);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!name.trim()) {
      setError("Please enter a group name");
      return;
    }

    // Check free limit
    const limitCheck = checkCanCreateGroup(groupCount, userProfile.isPro);
    if (!limitCheck.allowed) {
      onClose();
      onShowProUpgrade(limitCheck.reason);
      return;
    }

    // Task 8: creation is server-backed and async. The handler resolves with
    // the created (mapped) group on success or null on failure — the sheet
    // stays open on failure (the toast explains why) so the user can retry.
    setIsSubmitting(true);
    try {
      const created = await onCreateGroup({
        name: name.trim(),
        currency,
        isRoommateGroup: isRoommate,
      });
      if (created !== null && created !== undefined) {
        setName("");
        setIsRoommate(false);
        onClose();
      } else if (!error) {
        setError("Could not create the group. Please try again.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title="Create Group" subtitle="Set up a group for trips, apartments, or events">
      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: "16px" }}>
          <label style={{ display: "block", fontSize: "12px", fontWeight: "700", textTransform: "uppercase", color: theme.muted, marginBottom: "8px" }}>
            Group Name
          </label>
          <input
            autoFocus
            type="text"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setError("");
            }}
            placeholder="e.g. Goa Trip 2026 or Flat 304"
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
          {error && <div style={{ color: theme.coral, fontSize: "12px", fontWeight: "600", marginTop: "6px" }}>{error}</div>}
        </div>

        {/* Currency selection */}
        <div style={{ marginBottom: "20px" }}>
          <label style={{ display: "block", fontSize: "12px", fontWeight: "700", textTransform: "uppercase", color: theme.muted, marginBottom: "8px" }}>
            Group Currency
          </label>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "8px" }}>
            {CURRENCIES.map((c) => {
              const selected = currency === c.code;
              return (
                <button
                  type="button"
                  key={c.code}
                  onClick={() => setCurrency(c.code)}
                  style={{
                    padding: "10px 6px",
                    borderRadius: "14px",
                    border: selected ? `2px solid ${theme.primary}` : `1px solid ${theme.border}`,
                    backgroundColor: theme.card,
                    boxShadow: selected ? theme.clayPressed : theme.clayRaisedSm,
                    color: selected ? theme.primary : theme.text,
                    fontSize: "12px",
                    fontWeight: "700",
                    cursor: "pointer",
                  }}
                >
                  {c.symbol} {c.code}
                </button>
              );
            })}
          </div>
        </div>

        {/* Roommate mode checkbox */}
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            fontSize: "13.5px",
            fontWeight: "600",
            color: theme.text,
            marginBottom: "24px",
            cursor: "pointer",
          }}
        >
          <input
            type="checkbox"
            checked={isRoommate}
            onChange={(e) => setIsRoommate(e.target.checked)}
            style={{ width: "18px", height: "18px", accentColor: theme.primary }}
          />
          <span>Set up as Roommate / Apartment Group</span>
        </label>

        <div style={{ display: "flex", gap: "10px" }}>
          <ClayButton variant="secondary" fullWidth onClick={onClose}>
            Cancel
          </ClayButton>
          <ClayButton type="submit" variant="primary" fullWidth disabled={isSubmitting}>
            {isSubmitting ? "Creating..." : "Create Group"}
          </ClayButton>
        </div>
      </form>
    </BottomSheet>
  );
}
