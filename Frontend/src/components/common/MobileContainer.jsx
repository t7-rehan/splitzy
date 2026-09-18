import React from "react";
import { useTheme, LIGHT_THEME } from "../../theme/clayTheme";

export function MobileContainer({ children, header, bottomNav }) {
  const themeContext = useTheme();
  const theme = themeContext?.theme || themeContext || LIGHT_THEME;

  return (
    <div
      style={{
        minHeight: "100vh",
        backgroundColor: theme.desktopOuterBg,
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        padding: "0",
        fontFamily: "'Plus Jakarta Sans', sans-serif",
        transition: "background-color 0.2s ease",
      }}
    >
      {/* Phone frame shell */}
      <div
        style={{
          width: "100%",
          maxWidth: "440px",
          height: "100vh",
          maxHeight: "920px",
          backgroundColor: theme.bg,
          position: "relative",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          boxShadow: theme.mode === "dark" ? "0 25px 60px rgba(0, 0, 0, 0.7)" : "0 25px 60px rgba(15, 23, 42, 0.18)",
          borderRadius: "0px",
          color: theme.text,
          transition: "background-color 0.2s ease",
        }}
        className="mobile-shell-container"
      >
        <style>{`
          @media (min-width: 450px) {
            .mobile-shell-container {
              border-radius: 36px !important;
              height: 92vh !important;
              border: 8px solid ${theme.phoneFrameBg} !important;
            }
          }
        `}</style>

        {/* Mobile Safe Header Bar */}
        {header}

        {/* Scrollable Screen Content */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            WebkitOverflowScrolling: "touch",
            paddingBottom: bottomNav ? "85px" : "24px",
            position: "relative",
          }}
        >
          {children}
        </div>

        {/* Fixed Mobile Bottom Navigation */}
        {bottomNav}
      </div>
    </div>
  );
}
