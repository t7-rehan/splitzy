import React, { useEffect } from "react";
import { X } from "lucide-react";
import { useTheme } from "../../theme/clayTheme";

export function BottomSheet({ isOpen, onClose, title, subtitle, children, theme: propTheme }) {
  const { theme: contextTheme } = useTheme();
  const theme = propTheme || contextTheme;

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape" && isOpen) onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(3, 7, 18, 0.65)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        zIndex: 90,
        display: "flex",
        flexDirection: "column",
        justifyContent: "flex-end",
        animation: "fadeIn 0.2s ease forwards",
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: theme.card,
          borderTopLeftRadius: "32px",
          borderTopRightRadius: "32px",
          padding: "24px 20px 36px",
          maxHeight: "88vh",
          overflowY: "auto",
          boxShadow: theme.mode === "dark" ? "0 -10px 40px rgba(0, 0, 0, 0.6)" : "0 -10px 40px rgba(0, 0, 0, 0.15)",
          borderTop: `1px solid ${theme.borderLight}`,
          animation: "slideUp 0.28s cubic-bezier(0.16, 1, 0.3, 1) forwards",
          position: "relative",
          color: theme.text,
        }}
      >
        {/* Top Handle pill */}
        <div
          style={{
            width: "44px",
            height: "5px",
            backgroundColor: theme.sheetHandle,
            borderRadius: "3px",
            margin: "0 auto 18px",
          }}
        />

        {/* Title bar */}
        {(title || subtitle) && (
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "20px" }}>
            <div>
              {title && <h3 style={{ margin: 0, fontSize: "20px", fontWeight: "800", color: theme.text }}>{title}</h3>}
              {subtitle && <p style={{ margin: "4px 0 0", fontSize: "13px", color: theme.muted }}>{subtitle}</p>}
            </div>
            <button
              onClick={onClose}
              style={{
                width: "32px",
                height: "32px",
                borderRadius: "50%",
                border: "none",
                backgroundColor: theme.sheetCloseBg,
                color: theme.muted,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
              }}
            >
              <X size={18} />
            </button>
          </div>
        )}

        {children}
      </div>
    </div>
  );
}
