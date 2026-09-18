import React, { useState } from "react";
import { Calendar, ChevronLeft, ChevronRight, Check } from "lucide-react";
import { ClayCard } from "./ClayCard";
import { ClayButton } from "./ClayButton";
import { useTheme } from "../../theme/clayTheme";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

export function ClayDatePicker({ value, onChange, theme: propTheme, onClose }) {
  const defaultTheme = useTheme();
  const theme = propTheme || defaultTheme;
  const initialDate = value ? new Date(value) : new Date(2000, 0, 1);
  const [selectedYear, setSelectedYear] = useState(initialDate.getFullYear() || 2000);
  const [selectedMonth, setSelectedMonth] = useState(initialDate.getMonth() || 0);
  const [selectedDay, setSelectedDay] = useState(initialDate.getDate() || 1);

  // Generate days in current selected month & year
  const daysInMonth = new Date(selectedYear, selectedMonth + 1, 0).getDate();

  const handleConfirm = () => {
    const formatted = `${selectedYear}-${String(selectedMonth + 1).padStart(2, "0")}-${String(selectedDay).padStart(2, "0")}`;
    onChange(formatted);
    if (onClose) onClose();
  };

  // Generate year options (from 1940 to current year)
  const currentYear = new Date().getFullYear();
  const years = [];
  for (let y = currentYear; y >= 1950; y--) {
    years.push(y);
  }

  return (
    <ClayCard
      style={{
        padding: "18px 16px",
        backgroundColor: theme.card,
        border: `1px solid ${theme.border}`,
        boxShadow: theme.clayRaisedLg,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
        <div style={{ fontSize: "14px", fontWeight: "800", color: theme.text, display: "flex", alignItems: "center", gap: "6px" }}>
          <Calendar size={16} color={theme.primary} />
          <span>Select Birthday</span>
        </div>
        <div style={{ fontSize: "12px", fontWeight: "700", color: theme.primary }}>
          {selectedDay} {MONTH_NAMES[selectedMonth]} {selectedYear}
        </div>
      </div>

      {/* Month & Year Controls */}
      <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: "8px", marginBottom: "14px" }}>
        <select
          value={selectedMonth}
          onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
          style={{
            padding: "10px 12px",
            borderRadius: "14px",
            border: `1px solid ${theme.border}`,
            backgroundColor: theme.inputBg,
            color: theme.text,
            fontSize: "13px",
            fontWeight: "700",
            boxShadow: theme.clayPressed,
          }}
        >
          {MONTH_NAMES.map((m, idx) => (
            <option key={m} value={idx}>
              {m}
            </option>
          ))}
        </select>

        <select
          value={selectedYear}
          onChange={(e) => setSelectedYear(parseInt(e.target.value))}
          style={{
            padding: "10px 12px",
            borderRadius: "14px",
            border: `1px solid ${theme.border}`,
            backgroundColor: theme.inputBg,
            color: theme.text,
            fontSize: "13px",
            fontWeight: "700",
            boxShadow: theme.clayPressed,
          }}
        >
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </div>

      {/* Days Grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(7, 1fr)",
          gap: "6px",
          marginBottom: "16px",
          maxHeight: "180px",
          overflowY: "auto",
          padding: "4px",
        }}
      >
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day = i + 1;
          const isSelected = selectedDay === day;
          return (
            <button
              type="button"
              key={day}
              onClick={() => setSelectedDay(day)}
              style={{
                height: "34px",
                borderRadius: "10px",
                border: isSelected ? `2px solid ${theme.primary}` : "none",
                backgroundColor: isSelected ? theme.primary : theme.inputBg,
                color: isSelected ? "#FFFFFF" : theme.text,
                fontSize: "12.5px",
                fontWeight: isSelected ? "800" : "600",
                cursor: "pointer",
                boxShadow: isSelected ? theme.clayButtonActive : theme.clayRaisedSm,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                transition: "all 0.1s ease",
              }}
            >
              {day}
            </button>
          );
        })}
      </div>

      <ClayButton fullWidth size="sm" onClick={handleConfirm}>
        <Check size={16} /> Confirm Date
      </ClayButton>
    </ClayCard>
  );
}
