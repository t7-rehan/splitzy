import React, { useState } from "react";
import { User, Globe, Crown, Shield, RefreshCw, Sparkles, Check, LogOut, Sun, Moon, Calendar, Pencil } from "lucide-react";
import { CURRENCIES } from "../../services/currency";
import { getAvatarById } from "../../theme/clayTheme";
import { ClayCard } from "../common/ClayCard";
import { ClayButton } from "../common/ClayButton";
import { BottomSheet } from "../common/BottomSheet";
import { EditProfileModal } from "./EditProfileModal";

export function SettingsScreen({
  profile,
  onUpdateProfile,
  isPro,
  onTogglePro,
  onResetData,
  onLogout,
  theme,
  onThemeChange,
}) {
  const [showEditModal, setShowEditModal] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  const avatar = getAvatarById(profile.avatarId);

  const formatBirthdayDisplay = (dateStr) => {
    if (!dateStr) return "Not set";
    try {
      const [y, m, d] = dateStr.split("-");
      const dt = new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
      return dt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    } catch {
      return dateStr;
    }
  };

  return (
    <div style={{ padding: "20px 18px" }} className="animate-fade-in">
      <div style={{ marginBottom: "18px" }}>
        <h2 style={{ margin: 0, fontSize: "22px", fontWeight: "800", color: theme.text }}>
          Settings
        </h2>
        <div style={{ fontSize: "12px", color: theme.muted, marginTop: "2px" }}>
          Profile & App Preferences
        </div>
      </div>

      {/* User Profile Card */}
      <ClayCard style={{ padding: "18px 16px", marginBottom: "16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div
            style={{
              width: "50px",
              height: "50px",
              borderRadius: "50%",
              backgroundColor: avatar.bg,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "24px",
              boxShadow: theme.clayRaisedSm,
            }}
          >
            {avatar.emoji}
          </div>
          <div>
            <div style={{ fontSize: "16px", fontWeight: "800", color: theme.text }}>
              {profile.name || "Splitzy User"}
            </div>
            <div style={{ fontSize: "12px", color: theme.muted, marginTop: "2px" }}>
              {profile.email || "user@splitzy.app"}
            </div>
            <div style={{ fontSize: "11px", color: theme.mutedSoft, marginTop: "2px" }}>
              🎂 {formatBirthdayDisplay(profile.birthday)}
            </div>
          </div>
        </div>

        <button
          onClick={() => setShowEditModal(true)}
          style={{
            padding: "8px 12px",
            borderRadius: "12px",
            border: `1px solid ${theme.border}`,
            backgroundColor: theme.card,
            boxShadow: theme.clayRaisedSm,
            color: theme.primary,
            fontSize: "12px",
            fontWeight: "700",
            display: "flex",
            alignItems: "center",
            gap: "4px",
            cursor: "pointer",
          }}
        >
          <Pencil size={13} /> Edit
        </button>
      </ClayCard>

      {/* Pro Membership Banner */}
      <ClayCard
        style={{
          padding: "18px 16px",
          marginBottom: "16px",
          background: isPro
            ? (theme.mode === "dark" ? "linear-gradient(135deg, #2E1065 0%, #172033 100%)" : "linear-gradient(135deg, #F3E8FF 0%, #EEF3F8 100%)")
            : (theme.mode === "dark" ? "linear-gradient(135deg, #451A03 0%, #172033 100%)" : "linear-gradient(135deg, #FEF3C7 0%, #EEF3F8 100%)"),
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <Crown size={24} color={isPro ? theme.purple : theme.amber} />
            <div>
              <div style={{ fontSize: "15px", fontWeight: "800", color: theme.text }}>
                {isPro ? "Splitzy Pro Active" : "Splitzy Free Plan"}
              </div>
              <div style={{ fontSize: "12px", color: theme.muted, marginTop: "2px" }}>
                {isPro ? "Unlimited groups, smart settlement & UPI" : "Max 5 groups & 6 members per group"}
              </div>
            </div>
          </div>
        </div>

        <div style={{ marginTop: "14px" }}>
          <ClayButton
            size="sm"
            fullWidth
            onClick={() => onTogglePro(!isPro)}
            style={{ backgroundColor: isPro ? theme.card : theme.purple, color: isPro ? theme.text : "#FFF" }}
          >
            <Sparkles size={14} />
            {isPro ? "Revert to Free Tier Mode" : "Upgrade to Splitzy Pro"}
          </ClayButton>
        </div>
      </ClayCard>

      {/* Appearance / Theme Toggle */}
      <ClayCard style={{ padding: "18px 16px", marginBottom: "16px" }}>
        <div style={{ fontSize: "12px", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.8px", color: theme.muted, marginBottom: "12px" }}>
          Appearance
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
          <button
            type="button"
            onClick={() => onThemeChange("light")}
            style={{
              padding: "12px",
              borderRadius: "14px",
              border: theme.mode === "light" ? `2px solid ${theme.primary}` : `1px solid ${theme.border}`,
              backgroundColor: theme.card,
              boxShadow: theme.mode === "light" ? theme.clayPressed : theme.clayRaisedSm,
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
            onClick={() => onThemeChange("dark")}
            style={{
              padding: "12px",
              borderRadius: "14px",
              border: theme.mode === "dark" ? `2px solid ${theme.primary}` : `1px solid ${theme.border}`,
              backgroundColor: theme.card,
              boxShadow: theme.mode === "dark" ? theme.clayPressed : theme.clayRaisedSm,
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
      </ClayCard>

      {/* Log Out & Reset Actions */}
      <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginTop: "24px" }}>
        <ClayButton
          variant="secondary"
          size="md"
          fullWidth
          onClick={() => setShowLogoutConfirm(true)}
          icon={<LogOut size={16} color={theme.muted} />}
        >
          Log Out
        </ClayButton>

        <button
          onClick={onResetData}
          style={{
            background: "none",
            border: "none",
            color: theme.coral,
            fontSize: "12px",
            fontWeight: "600",
            cursor: "pointer",
            padding: "8px",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "4px",
          }}
        >
          <RefreshCw size={12} /> Reset Demo Data & Cache
        </button>
      </div>

      {/* Edit Profile Modal */}
      <EditProfileModal
        isOpen={showEditModal}
        onClose={() => setShowEditModal(false)}
        profile={profile}
        onSaveProfile={onUpdateProfile}
        theme={theme}
        onThemeChange={onThemeChange}
      />

      {/* Log Out Confirmation BottomSheet */}
      <BottomSheet
        isOpen={showLogoutConfirm}
        onClose={() => setShowLogoutConfirm(false)}
        title="Log out of Splitzy?"
        subtitle="You can sign back in anytime. Your expense data is safely preserved."
      >
        <div style={{ paddingTop: "10px", display: "flex", gap: "10px" }}>
          <ClayButton variant="secondary" fullWidth onClick={() => setShowLogoutConfirm(false)}>
            Cancel
          </ClayButton>
          <ClayButton
            variant="danger"
            fullWidth
            onClick={() => {
              setShowLogoutConfirm(false);
              onLogout();
            }}
          >
            Log Out
          </ClayButton>
        </div>
      </BottomSheet>
    </div>
  );
}
