import React from "react";
import { useTheme } from "../../theme/clayTheme";

export function ClayCard({
  children,
  onClick,
  inset = false,
  padding = "18px 20px",
  borderRadius = "24px",
  style = {},
  className = "",
  highlight = false,
  accentColor = null,
  theme: propTheme = null,
}) {
  const { theme: contextTheme } = useTheme();
  const theme = propTheme || contextTheme;
  const isClickable = Boolean(onClick);

  return (
    <div
      onClick={onClick}
      className={`${className} ${isClickable ? "active:scale-[0.985] transition-transform" : ""}`}
      style={{
        backgroundColor: theme.card,
        borderRadius: borderRadius,
        padding: padding,
        boxShadow: inset ? theme.clayPressed : highlight ? theme.clayRaisedLg : theme.clayRaised,
        border: accentColor ? `2px solid ${accentColor}` : `1px solid ${theme.borderLight}`,
        position: "relative",
        transition: "transform 0.15s ease, box-shadow 0.15s ease, background-color 0.2s ease",
        cursor: isClickable ? "pointer" : "default",
        color: theme.text,
        ...style,
      }}
    >
      {children}
    </div>
  );
}
