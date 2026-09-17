import React, { createContext, useContext } from "react";

export const LIGHT_THEME = {
  mode: "light",
  isDark: false,
  bg: "#EEF3F8",
  surface: "#EEF3F8",
  card: "#EEF3F8",
  cardElevated: "#FFFFFF",
  text: "#1E293B",
  textSecondary: "#475569",
  muted: "#64748B",
  mutedSoft: "#94A3B8",
  
  primary: "#3B82F6",
  primaryHover: "#2563EB",
  primaryTint: "rgba(59, 130, 246, 0.12)",
  
  secondary: "#6366F1",
  secondaryTint: "rgba(99, 102, 241, 0.12)",
  
  emerald: "#10B981",
  emeraldTint: "rgba(16, 185, 129, 0.12)",
  emeraldDark: "#047857",
  
  coral: "#EF4444",
  coralTint: "rgba(239, 68, 68, 0.12)",
  coralDark: "#B91C1C",

  amber: "#F59E0B",
  amberTint: "rgba(245, 158, 11, 0.12)",

  purple: "#8B5CF6",
  purpleTint: "rgba(139, 92, 246, 0.12)",

  border: "#E2E8F0",
  borderLight: "rgba(255, 255, 255, 0.8)",
  divider: "#E2E8F0",
  inputBg: "#EEF3F8",
  phoneFrameBg: "#FFFFFF",
  desktopOuterBg: "#D9E2EC",
  sheetHandle: "#CBD5E1",
  sheetCloseBg: "#E2E8F0",

  // Soft Clay Shadows - Light
  clayRaised: "8px 8px 16px #D1D9E6, -8px -8px 16px #FFFFFF",
  clayRaisedSm: "4px 4px 10px #D1D9E6, -4px -4px 10px #FFFFFF",
  clayRaisedLg: "12px 12px 24px #CAD3E1, -12px -12px 24px #FFFFFF",
  clayPressed: "inset 3px 3px 6px #CBD5E1, inset -3px -3px 6px #FFFFFF",
  clayPill: "5px 5px 10px #D1D9E6, -5px -5px 10px #FFFFFF",
  clayButton: "6px 6px 12px #D1D9E6, -6px -6px 12px #FFFFFF",
  clayButtonActive: "inset 2px 2px 5px #CBD5E1, inset -2px -2px 5px #FFFFFF",
};

export const DARK_THEME = {
  mode: "dark",
  isDark: true,
  bg: "#0B1120",
  surface: "#111827",
  card: "#172033",
  cardElevated: "#1E293B",
  text: "#F8FAFC",
  textSecondary: "#CBD5E1",
  muted: "#94A3B8",
  mutedSoft: "#64748B",
  
  primary: "#3B82F6",
  primaryHover: "#60A5FA",
  primaryTint: "rgba(59, 130, 246, 0.22)",
  
  secondary: "#818CF8",
  secondaryTint: "rgba(129, 140, 248, 0.22)",
  
  emerald: "#34D399",
  emeraldTint: "rgba(52, 211, 153, 0.2)",
  emeraldDark: "#6EE7B7",
  
  coral: "#F87171",
  coralTint: "rgba(248, 113, 113, 0.2)",
  coralDark: "#FCA5A5",

  amber: "#FBBF24",
  amberTint: "rgba(251, 191, 36, 0.2)",

  purple: "#A78BFA",
  purpleTint: "rgba(167, 139, 250, 0.22)",

  border: "#1E293B",
  borderLight: "#27354E",
  divider: "#1E293B",
  inputBg: "#0F172A",
  phoneFrameBg: "#172033",
  desktopOuterBg: "#030712",
  sheetHandle: "#334155",
  sheetCloseBg: "#1E293B",

  // Soft Clay Shadows - Dark
  clayRaised: "8px 8px 16px #080D1A, -8px -8px 16px #202D45",
  clayRaisedSm: "4px 4px 10px #080D1A, -4px -4px 10px #202D45",
  clayRaisedLg: "12px 12px 24px #060914, -12px -12px 24px #263552",
  clayPressed: "inset 3px 3px 6px #080D1A, inset -3px -3px 6px #202D45",
  clayPill: "5px 5px 10px #080D1A, -5px -5px 10px #202D45",
  clayButton: "6px 6px 12px #080D1A, -6px -6px 12px #202D45",
  clayButtonActive: "inset 2px 2px 5px #080D1A, inset -2px -2px 5px #202D45",
};

export function getThemeTokens(themeName = "light") {
  return themeName === "dark" ? DARK_THEME : LIGHT_THEME;
}

export const C = LIGHT_THEME;

export const ThemeContext = createContext({
  theme: LIGHT_THEME,
  themeMode: "light",
  setThemeMode: () => {},
  isDark: false,
  ...LIGHT_THEME,
});

export function ThemeProvider({ children, themeMode = "light", setThemeMode }) {
  const theme = getThemeTokens(themeMode);
  const contextValue = {
    theme,
    themeMode,
    setThemeMode,
    isDark: themeMode === "dark",
    ...theme,
  };
  return React.createElement(ThemeContext.Provider, { value: contextValue }, children);
}

export function useTheme() {
  const context = useContext(ThemeContext);
  const tokens = context?.bg ? context : (context?.theme || LIGHT_THEME);
  return {
    ...tokens,
    theme: tokens,
    themeMode: context?.themeMode || tokens.mode || "light",
    setThemeMode: context?.setThemeMode || (() => {}),
    isDark: context?.isDark ?? tokens.isDark ?? false,
  };
}

export const GLOBAL_STYLES = (isDark = false) => `
  * {
    box-sizing: border-box;
    -webkit-tap-highlight-color: transparent;
  }
  
  body {
    background-color: ${isDark ? "#0B1120" : "#EEF3F8"};
    color: ${isDark ? "#F8FAFC" : "#1E293B"};
    font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif;
    margin: 0;
    padding: 0;
    user-select: none;
    transition: background-color 0.25s ease, color 0.25s ease;
  }

  .font-num {
    font-family: 'Space Grotesk', sans-serif;
  }

  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(8px); }
    to { opacity: 1; transform: translateY(0); }
  }

  @keyframes popIn {
    from { opacity: 0; transform: scale(0.95); }
    to { opacity: 1; transform: scale(1); }
  }

  @keyframes slideUp {
    from { transform: translateY(100%); }
    to { transform: translateY(0); }
  }

  @keyframes floatCoin {
    0%, 100% { transform: translateY(0px) rotate(0deg); }
    50% { transform: translateY(-10px) rotate(4deg); }
  }

  .animate-fade-in {
    animation: fadeIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
  }

  .animate-pop-in {
    animation: popIn 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards;
  }

  .animate-slide-up {
    animation: slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
  }

  .animate-float-coin {
    animation: floatCoin 2.4s ease-in-out infinite;
  }

  input, textarea, select {
    font-family: 'Plus Jakarta Sans', sans-serif;
    user-select: text;
  }

  input::placeholder, textarea::placeholder {
    color: ${isDark ? "#64748B" : "#94A3B8"};
  }

  input:focus, textarea:focus, select:focus {
    outline: none;
    border-color: #3B82F6 !important;
  }

  ::-webkit-scrollbar {
    width: 4px;
    height: 4px;
  }
  ::-webkit-scrollbar-thumb {
    background: ${isDark ? "#334155" : "#CBD5E1"};
    border-radius: 4px;
  }
`;

// Exactly 6 distinct custom illustrated avatars
export const AVATARS = [
  {
    id: "avatar_cool",
    label: "Cool Vibes",
    bg: "#DBEAFE",
    accent: "#3B82F6",
    emoji: "😎",
  },
  {
    id: "avatar_creative",
    label: "Creative",
    bg: "#FCE7F3",
    accent: "#EC4899",
    emoji: "🎨",
  },
  {
    id: "avatar_tech",
    label: "Techie",
    bg: "#D1FAE5",
    accent: "#10B981",
    emoji: "💻",
  },
  {
    id: "avatar_gamer",
    label: "Gamer",
    bg: "#FEF3C7",
    accent: "#F59E0B",
    emoji: "🎧",
  },
  {
    id: "avatar_adventurer",
    label: "Explorer",
    bg: "#EDE9FE",
    accent: "#8B5CF6",
    emoji: "🚀",
  },
  {
    id: "avatar_zen",
    label: "Zen",
    bg: "#FFEDD5",
    accent: "#F97316",
    emoji: "☕",
  },
];

export function getAvatarById(id) {
  return AVATARS.find((a) => a.id === id) || AVATARS[0];
}

export const AVATAR_COLORS = [
  { bg: "#DBEAFE", text: "#1E40AF" },
  { bg: "#FCE7F3", text: "#9D174D" },
  { bg: "#D1FAE5", text: "#065F46" },
  { bg: "#FEF3C7", text: "#92400E" },
  { bg: "#EDE9FE", text: "#5B21B6" },
  { bg: "#FFEDD5", text: "#9A3412" },
];

export function avatarStyle(idx) {
  return AVATAR_COLORS[idx % AVATAR_COLORS.length];
}
