import React, { useState } from "react";
import { Calendar, Check, Sun, Moon } from "lucide-react";
import { BottomSheet } from "../common/BottomSheet";
import { ClayButton } from "../common/ClayButton";
import { ClayDatePicker } from "../common/ClayDatePicker";
import { CURRENCIES } from "../../services/currency";
import { AVATARS } from "../../theme/clayTheme";

export function EditProfileModal({ isOpen, onClose, profile, onSaveProfile, theme, onThemeChange }) {
  const [name, setName] = useState(profile?.name || "");
  const [birthday, setBirthday] = useState(profile?.birthday || "2000-01-15");
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [selectedAvatarId, setSelectedAvatarId] = useState(profile?.avatarId || "avatar_cool");
  const [homeCurrency, setHomeCurrency] = useState(profile?.homeCurrency || "INR");
  const [selectedTheme, setSelectedTheme] = useState(profile?.theme || "light");
  const [error, setError] = useState("");

  const formatBirthdayDisplay = (dateStr) => {
    if (!dateStr) return "Select your birthday";
    try {
      const [y, m, d] = dateStr.split("-");
      const dt = new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
      return dt.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
    } catch {
      return dateStr;
    }
  };

  const handleSave = (e) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Please enter your name");
      return;
    }

    onSaveProfile({
      ...profile,
      name: name.trim(),
      birthday,
      avatarId: selectedAvatarId,
      homeCurrency,
      theme: selectedTheme,
    });
    onClose();
  };

  const handleThemeToggle = (mode) => {
    setSelectedTheme(mode);
    if (onThemeChange) onThemeChange(mode);
  };

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title="Edit Profile" subtitle="Update your personal details">
      <form onSubmit={handleSave}>
        {/* Name Input */}
        <div style={{ marginBottom: "16px" }}>
          <label style={{ display: "block", fontSize: "11.5px", fontWeight: "700", textTransform: "uppercase", color: theme.muted, marginBottom: "6px" }}>
            Display Name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setError("");
            }}
            placeholder="Your name"
            style={{
              width: "100%",
              padding: "13px 16px",
              borderRadius: "16px",
              border: `1px solid ${theme.border}`,
              backgroundColor: theme.inputBg,
              boxShadow: theme.clayPressed,
              fontSize: "14px",
              fontWeight: "600",
              color: theme.text,
            }}
          />
          {error && <div style={{ color: theme.coral, fontSize: "12px", fontWeight: "600", marginTop: "4px" }}>{error}</div>}
        </div>

        {/* Birthday Picker */}
        <div style={{ marginBottom: "16px" }}>
          <label style={{ display: "block", fontSize: "11.5px", fontWeight: "700", textTransform: "uppercase", color: theme.muted, marginBottom: "6px" }}>
            Birthday
          </label>
          <button
            type="button"
            onClick={() => setShowDatePicker(!showDatePicker)}
            style={{
              width: "100%",
              padding: "13px 16px",
              borderRadius: "16px",
              border: `1px solid ${theme.border}`,
              backgroundColor: theme.card,
              boxShadow: theme.clayRaisedSm,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              color: theme.text,
              cursor: "pointer",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <Calendar size={16} color={theme.primary} />
              <span style={{ fontSize: "14px", fontWeight: "600" }}>{formatBirthdayDisplay(birthday)}</span>
            </div>
            <span style={{ fontSize: "11.5px", color: theme.primary, fontWeight: "700" }}>
              {showDatePicker ? "Close" : "Edit"}
            </span>
          </button>

          {showDatePicker && (
            <div style={{ marginTop: "12px" }}>
              <ClayDatePicker
                value={birthday}
                onChange={(d) => setBirthday(d)}
                theme={theme}
                onClose={() => setShowDatePicker(false)}
              />
            </div>
          )}
        </div>

        {/* Avatar Picker (6 options) */}
        <div style={{ marginBottom: "18px" }}>
          <label style={{ display: "block", fontSize: "11.5px", fontWeight: "700", textTransform: "uppercase", color: theme.muted, marginBottom: "8px" }}>
            Avatar
          </label>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: "8px" }}>
            {AVATARS.map((av) => {
              const isSelected = selectedAvatarId === av.id;
              return (
                <button
                  type="button"
                  key={av.id}
                  onClick={() => setSelectedAvatarId(av.id)}
                  style={{
                    padding: "8px 4px",
                    borderRadius: "14px",
                    border: isSelected ? `2px solid ${theme.primary}` : `1px solid ${theme.border}`,
                    backgroundColor: theme.card,
                    boxShadow: isSelected ? theme.clayPressed : theme.clayRaisedSm,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    cursor: "pointer",
                  }}
                >
                  <div
                    style={{
                      width: "36px",
                      height: "36px",
                      borderRadius: "50%",
                      backgroundColor: av.bg,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "18px",
                    }}
                  >
                    {av.emoji}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Currency Picker */}
        <div style={{ marginBottom: "18px" }}>
          <label style={{ display: "block", fontSize: "11.5px", fontWeight: "700", textTransform: "uppercase", color: theme.muted, marginBottom: "8px" }}>
            Default Home Currency
          </label>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "8px" }}>
            {CURRENCIES.map((c) => {
              const isSelected = homeCurrency === c.code;
              return (
                <button
                  type="button"
                  key={c.code}
                  onClick={() => setHomeCurrency(c.code)}
                  style={{
                    padding: "10px 6px",
                    borderRadius: "14px",
                    border: isSelected ? `2px solid ${theme.primary}` : `1px solid ${theme.border}`,
                    backgroundColor: theme.card,
                    boxShadow: isSelected ? theme.clayPressed : theme.clayRaisedSm,
                    color: isSelected ? theme.primary : theme.text,
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

        {/* Theme Preference */}
        <div style={{ marginBottom: "22px" }}>
          <label style={{ display: "block", fontSize: "11.5px", fontWeight: "700", textTransform: "uppercase", color: theme.muted, marginBottom: "8px" }}>
            Appearance
          </label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
            <button
              type="button"
              onClick={() => handleThemeToggle("light")}
              style={{
                padding: "12px",
                borderRadius: "14px",
                border: selectedTheme === "light" ? `2px solid ${theme.primary}` : `1px solid ${theme.border}`,
                backgroundColor: theme.card,
                boxShadow: selectedTheme === "light" ? theme.clayPressed : theme.clayRaisedSm,
                color: theme.text,
                fontSize: "13px",
                fontWeight: "700",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "6px",
                cursor: "pointer",
              }}
            >
              <Sun size={16} color="#F59E0B" /> Light
            </button>
            <button
              type="button"
              onClick={() => handleThemeToggle("dark")}
              style={{
                padding: "12px",
                borderRadius: "14px",
                border: selectedTheme === "dark" ? `2px solid ${theme.primary}` : `1px solid ${theme.border}`,
                backgroundColor: theme.card,
                boxShadow: selectedTheme === "dark" ? theme.clayPressed : theme.clayRaisedSm,
                color: theme.text,
                fontSize: "13px",
                fontWeight: "700",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "6px",
                cursor: "pointer",
              }}
            >
              <Moon size={16} color="#818CF8" /> Dark
            </button>
          </div>
        </div>

        <div style={{ display: "flex", gap: "10px" }}>
          <ClayButton variant="secondary" fullWidth onClick={onClose}>
            Cancel
          </ClayButton>
          <ClayButton type="submit" variant="primary" fullWidth>
            Save Changes
          </ClayButton>
        </div>
      </form>
    </BottomSheet>
  );
}
