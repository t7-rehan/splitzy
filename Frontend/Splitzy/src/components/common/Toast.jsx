import React, { useEffect } from "react";
import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";
import { useTheme } from "../../theme/clayTheme";

export function Toast({ toast, onClose }) {
  const { theme } = useTheme();

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => {
      onClose();
    }, toast.duration || 3200);
    return () => clearTimeout(timer);
  }, [toast, onClose]);

  if (!toast) return null;

  const isError = toast.type === "error";
  const isSuccess = toast.type === "success";

  const getToastBg = () => {
    if (theme.mode === "dark") {
      return isError ? "#450A0A" : isSuccess ? "#064E3B" : "#1E293B";
    }
    return isError ? "#FEF2F2" : isSuccess ? "#ECFDF5" : "#EFF6FF";
  };

  return (
    <div
      style={{
        position: "absolute",
        top: "20px",
        left: "16px",
        right: "16px",
        zIndex: 100,
        backgroundColor: getToastBg(),
        border: `1.5px solid ${isError ? theme.coral : isSuccess ? theme.emerald : theme.primary}`,
        borderRadius: "18px",
        padding: "14px 16px",
        boxShadow: "0 10px 25px rgba(0, 0, 0, 0.25)",
        display: "flex",
        alignItems: "center",
        gap: "12px",
        animation: "slideUp 0.25s ease forwards",
      }}
    >
      {isError ? (
        <AlertCircle size={20} color={theme.coral} style={{ flexShrink: 0 }} />
      ) : isSuccess ? (
        <CheckCircle2 size={20} color={theme.emerald} style={{ flexShrink: 0 }} />
      ) : (
        <Info size={20} color={theme.primary} style={{ flexShrink: 0 }} />
      )}

      <div style={{ flex: 1, fontSize: "13.5px", fontWeight: "700", color: isError ? theme.coralDark : isSuccess ? theme.emeraldDark : theme.text }}>
        {toast.message}
      </div>

      <button
        onClick={onClose}
        style={{
          background: "none",
          border: "none",
          padding: 0,
          color: theme.mutedSoft,
          cursor: "pointer",
          display: "flex",
        }}
      >
        <X size={16} />
      </button>
    </div>
  );
}
