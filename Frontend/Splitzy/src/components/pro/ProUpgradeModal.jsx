import React from "react";
import { Crown, Check, Sparkles, Zap, Shield, Infinity as InfinityIcon } from "lucide-react";
import { BottomSheet } from "../common/BottomSheet";
import { ClayButton } from "../common/ClayButton";
import { useTheme } from "../../theme/clayTheme";
import { PRO_FEATURES } from "../../services/proService";

export function ProUpgradeModal({ isOpen, onClose, isPro, onTogglePro, customReason }) {
  const C = useTheme();
  return (
    <BottomSheet isOpen={isOpen} onClose={onClose}>
      <div style={{ textAlign: "center", padding: "0 4px 10px" }} className="animate-fade-in">
        <div
          style={{
            width: "64px",
            height: "64px",
            borderRadius: "22px",
            backgroundColor: C.purple,
            color: "#FFF",
            margin: "0 auto 16px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 10px 24px rgba(139, 92, 246, 0.35)",
          }}
        >
          <Crown size={32} />
        </div>

        <h2 style={{ fontSize: "22px", fontWeight: "800", color: C.text, margin: "0 0 6px" }}>
          Splitzy Pro
        </h2>
        <p style={{ fontSize: "14px", fontWeight: "600", color: C.purple, margin: "0 0 16px" }}>
          Less tracking. More splitting.
        </p>

        {customReason && (
          <div
            style={{
              backgroundColor: C.amberTint,
              border: `1px solid ${C.amber}`,
              borderRadius: "14px",
              padding: "10px 14px",
              fontSize: "12.5px",
              fontWeight: "600",
              color: "#92400E",
              marginBottom: "16px",
              textAlign: "left",
            }}
          >
            {customReason}
          </div>
        )}

        {/* Features List */}
        <div style={{ display: "flex", flexDirection: "column", gap: "10px", textAlign: "left", marginBottom: "24px" }}>
          {PRO_FEATURES.map((feat) => (
            <div key={feat.id} style={{ display: "flex", gap: "10px", alignItems: "flex-start" }}>
              <div
                style={{
                  width: "20px",
                  height: "20px",
                  borderRadius: "50%",
                  backgroundColor: C.purpleTint,
                  color: C.purple,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  marginTop: "2px",
                }}
              >
                <Check size={12} strokeWidth={3} />
              </div>
              <div>
                <div style={{ fontSize: "13px", fontWeight: "700", color: C.text }}>{feat.title}</div>
                <div style={{ fontSize: "11.5px", color: C.muted }}>{feat.desc}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Pricing / Toggle CTA */}
        <div style={{ backgroundColor: C.bg, borderRadius: "18px", padding: "16px", boxShadow: C.clayPressed, marginBottom: "18px" }}>
          <div style={{ fontSize: "13px", fontWeight: "700", color: C.text, marginBottom: "4px" }}>
            Splitzy Pro Pass
          </div>
          <div style={{ fontSize: "22px", fontWeight: "800", color: C.purple, marginBottom: "12px" }}>
            ₹199 / year <span style={{ fontSize: "12px", color: C.muted, fontWeight: "500" }}>(or test instant switch below)</span>
          </div>

          <ClayButton
            fullWidth
            style={{ backgroundColor: isPro ? C.emerald : C.purple, color: "#FFF" }}
            onClick={() => {
              onTogglePro(!isPro);
              onClose();
            }}
          >
            <Sparkles size={16} />
            {isPro ? "Currently Pro Unlocked (Click to revert Free)" : "Unlock Splitzy Pro Now"}
          </ClayButton>
        </div>

        <button
          onClick={onClose}
          style={{
            background: "none",
            border: "none",
            color: C.muted,
            fontSize: "13px",
            fontWeight: "600",
            cursor: "pointer",
          }}
        >
          Maybe later
        </button>
      </div>
    </BottomSheet>
  );
}
