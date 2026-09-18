import React from "react";
import { Home, Users, Calendar, PieChart, Settings } from "lucide-react";

export function BottomNav({ activeTab, onSelectTab, isPro, theme }) {
  const tabs = [
    { id: "home", label: "Home", icon: Home },
    { id: "groups", label: "Groups", icon: Users },
    { id: "calendar", label: "Calendar", icon: Calendar },
    { id: "insights", label: "Insights", icon: PieChart },
    { id: "settings", label: "Settings", icon: Settings },
  ];

  return (
    <div
      style={{
        position: "absolute",
        bottom: 0,
        left: 0,
        right: 0,
        height: "76px",
        backgroundColor: theme.card,
        boxShadow: theme.mode === "dark" ? "0 -8px 24px rgba(0, 0, 0, 0.5)" : "0 -8px 24px rgba(209, 217, 230, 0.6)",
        borderTop: `1px solid ${theme.border}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-around",
        padding: "0 6px 10px",
        zIndex: 50,
      }}
    >
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = activeTab === tab.id;

        return (
          <button
            key={tab.id}
            onClick={() => onSelectTab(tab.id)}
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: "3px",
              padding: "6px 0",
              border: "none",
              backgroundColor: "transparent",
              cursor: "pointer",
              position: "relative",
            }}
          >
            <div
              style={{
                padding: "6px 14px",
                borderRadius: "16px",
                backgroundColor: isActive ? theme.primaryTint : "transparent",
                boxShadow: isActive ? theme.clayPressed : "none",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                transition: "all 0.15s ease",
              }}
            >
              <Icon
                size={19}
                color={isActive ? theme.primary : theme.muted}
                strokeWidth={isActive ? 2.4 : 1.8}
              />
            </div>
            <span
              style={{
                fontSize: "10px",
                fontWeight: isActive ? "800" : "600",
                color: isActive ? theme.primary : theme.muted,
              }}
            >
              {tab.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
