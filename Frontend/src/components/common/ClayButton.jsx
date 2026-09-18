import React, { useState } from "react";
import { useTheme } from "../../theme/clayTheme";

export function ClayButton({
  children,
  onClick,
  variant = "primary", // primary | secondary | outline | danger | text
  size = "md", // sm | md | lg
  disabled = false,
  fullWidth = false,
  style = {},
  type = "button",
  icon = null,
  theme: propTheme = null,
}) {
  const [pressed, setPressed] = useState(false);
  const { theme: contextTheme } = useTheme();
  const theme = propTheme || contextTheme;

  const getVariantStyles = () => {
    switch (variant) {
      case "primary":
        return {
          backgroundColor: theme.primary,
          color: "#FFFFFF",
          boxShadow: pressed
            ? "inset 2px 2px 5px rgba(0, 0, 0, 0.3)"
            : "4px 6px 14px rgba(59, 130, 246, 0.35), inset 1px 1px 1px rgba(255, 255, 255, 0.35)",
          border: "none",
        };
      case "secondary":
        return {
          backgroundColor: theme.card,
          color: theme.text,
          boxShadow: pressed ? theme.clayPressed : theme.clayRaisedSm,
          border: `1px solid ${theme.borderLight}`,
        };
      case "danger":
        return {
          backgroundColor: theme.coralTint,
          color: theme.coralDark,
          boxShadow: pressed ? theme.clayPressed : theme.clayRaisedSm,
          border: `1.5px solid ${theme.coral}`,
        };
      case "outline":
        return {
          backgroundColor: "transparent",
          color: theme.primary,
          border: `2px solid ${theme.primary}`,
          boxShadow: "none",
        };
      case "text":
        return {
          backgroundColor: "transparent",
          color: theme.muted,
          border: "none",
          boxShadow: "none",
        };
      default:
        return {};
    }
  };

  const getSizePadding = () => {
    switch (size) {
      case "sm":
        return "8px 14px";
      case "lg":
        return "16px 24px";
      default:
        return "12px 20px";
    }
  };

  const getSizeFontSize = () => {
    switch (size) {
      case "sm":
        return "13px";
      case "lg":
        return "16px";
      default:
        return "14px";
    }
  };

  const vStyles = getVariantStyles();

  return (
    <button
      type={type}
      onClick={disabled ? undefined : onClick}
      onMouseDown={() => setPressed(true)}
      onMouseUp={() => setPressed(false)}
      onMouseLeave={() => setPressed(false)}
      onTouchStart={() => setPressed(true)}
      onTouchEnd={() => setPressed(false)}
      disabled={disabled}
      style={{
        width: fullWidth ? "100%" : "auto",
        padding: getSizePadding(),
        fontSize: getSizeFontSize(),
        fontWeight: "700",
        borderRadius: "18px",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "8px",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.55 : 1,
        transition: "all 0.12s ease",
        transform: pressed && !disabled ? "scale(0.97)" : "scale(1)",
        fontFamily: "'Plus Jakarta Sans', sans-serif",
        ...vStyles,
        ...style,
      }}
    >
      {icon && <span>{icon}</span>}
      {children}
    </button>
  );
}
