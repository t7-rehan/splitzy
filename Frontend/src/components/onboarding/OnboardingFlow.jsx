import React, { useState } from "react";
import { ArrowRight, Check, Calendar, Sun, Moon, Sparkles, CheckCircle2 } from "lucide-react";
import { CURRENCIES } from "../../services/currency";
import { AVATARS } from "../../theme/clayTheme";
import { ClayButton } from "../common/ClayButton";
import { ClayCard } from "../common/ClayCard";
import { ClayDatePicker } from "../common/ClayDatePicker";

export function OnboardingFlow({ onComplete, initialEmail = "", theme, onThemeChange }) {
  const [step, setStep] = useState(0); // 0: Name, 1: Birthday, 2: Theme, 3: Currency, 4: Avatar, 5: All Set
  const [name, setName] = useState("");
  const [birthday, setBirthday] = useState("2000-01-15");
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [selectedTheme, setSelectedTheme] = useState(theme.mode || "light");
  const [homeCurrency, setHomeCurrency] = useState("INR");
  const [selectedAvatarId, setSelectedAvatarId] = useState("avatar_cool");
  const [error, setError] = useState("");

  const formatBirthdayDisplay = (dateStr) => {
    if (!dateStr) return "Select your birthday";
    try {
      const [y, m, d] = dateStr.split("-");
      const dt = new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
      return dt.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
    } catch {
      return dateStr;
    }
  };

  const handleNext = () => {
    setError("");
    if (step === 0) {
      if (!name.trim()) {
        setError("Please enter your name");
        return;
      }
      setStep(1);
    } else if (step === 1) {
      if (!birthday) {
        setError("Please select your birthday");
        return;
      }
      setStep(2);
    } else if (step === 2) {
      setStep(3);
    } else if (step === 3) {
      setStep(4);
    } else if (step === 4) {
      setStep(5);
    } else if (step === 5) {
      onComplete({
        name: name.trim(),
        email: initialEmail || "user@splitzy.app",
        birthday,
        theme: selectedTheme,
        homeCurrency,
        avatarId: selectedAvatarId,
        profileCompleted: true,
        isPro: false,
      });
    }
  };

  const handleThemeSelect = (newTheme) => {
    setSelectedTheme(newTheme);
    if (onThemeChange) onThemeChange(newTheme);
  };

  return (
    <div
      style={{
        minHeight: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "28px 22px",
        backgroundColor: theme.bg,
        color: theme.text,
      }}
    >
      <div style={{ width: "100%", maxWidth: "360px" }}>
        {/* Step 0: Name */}
        {step === 0 && (
          <div className="animate-fade-in">
            <ProgressDots step={0} total={5} theme={theme} />
            <h2 style={{ fontSize: "24px", fontWeight: "800", color: theme.text, margin: "0 0 8px" }}>
              What's your name?
            </h2>
            <p style={{ fontSize: "14px", color: theme.muted, margin: "0 0 24px" }}>
              You'll show up as "You" in your groups.
            </p>

            <input
              autoFocus
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setError("");
              }}
              onKeyDown={(e) => e.key === "Enter" && handleNext()}
              placeholder="Enter your name"
              style={{
                width: "100%",
                padding: "15px 18px",
                borderRadius: "18px",
                border: `1px solid ${theme.border}`,
                backgroundColor: theme.inputBg,
                boxShadow: theme.clayPressed,
                fontSize: "16px",
                fontWeight: "600",
                color: theme.text,
                marginBottom: error ? "10px" : "24px",
              }}
            />

            {error && (
              <div style={{ color: theme.coral, fontSize: "13px", fontWeight: "600", marginBottom: "18px" }}>
                {error}
              </div>
            )}

            <ClayButton fullWidth size="lg" onClick={handleNext}>
              Next <ArrowRight size={18} />
            </ClayButton>
          </div>
        )}

        {/* Step 1: Birthday */}
        {step === 1 && (
          <div className="animate-fade-in">
            <ProgressDots step={1} total={5} theme={theme} />
            <h2 style={{ fontSize: "24px", fontWeight: "800", color: theme.text, margin: "0 0 8px" }}>
              When's your birthday?
            </h2>
            <p style={{ fontSize: "14px", color: theme.muted, margin: "0 0 24px" }}>
              Used to personalize your celebrations and reminders.
            </p>

            <button
              type="button"
              onClick={() => setShowDatePicker(!showDatePicker)}
              style={{
                width: "100%",
                padding: "16px 18px",
                borderRadius: "18px",
                border: `1px solid ${theme.border}`,
                backgroundColor: theme.card,
                boxShadow: theme.clayRaisedSm,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                color: theme.text,
                cursor: "pointer",
                marginBottom: "20px",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <Calendar size={18} color={theme.primary} />
                <span style={{ fontSize: "15px", fontWeight: "700" }}>
                  {formatBirthdayDisplay(birthday)}
                </span>
              </div>
              <span style={{ fontSize: "12px", color: theme.primary, fontWeight: "700" }}>
                {showDatePicker ? "Close" : "Change"}
              </span>
            </button>

            {showDatePicker && (
              <div style={{ marginBottom: "20px" }}>
                <ClayDatePicker
                  value={birthday}
                  onChange={(newDate) => setBirthday(newDate)}
                  theme={theme}
                  onClose={() => setShowDatePicker(false)}
                />
              </div>
            )}

            {error && (
              <div style={{ color: theme.coral, fontSize: "13px", fontWeight: "600", marginBottom: "18px" }}>
                {error}
              </div>
            )}

            <ClayButton fullWidth size="lg" onClick={handleNext}>
              Next <ArrowRight size={18} />
            </ClayButton>
          </div>
        )}

        {/* Step 2: Theme Selection */}
        {step === 2 && (
          <div className="animate-fade-in">
            <ProgressDots step={2} total={5} theme={theme} />
            <h2 style={{ fontSize: "24px", fontWeight: "800", color: theme.text, margin: "0 0 8px" }}>
              Choose your theme
            </h2>
            <p style={{ fontSize: "14px", color: theme.muted, margin: "0 0 24px" }}>
              Personalize Splitzy's appearance. You can change this anytime in Settings.
            </p>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px", marginBottom: "28px" }}>
              {/* Light Option */}
              <button
                type="button"
                onClick={() => handleThemeSelect("light")}
                style={{
                  padding: "22px 14px",
                  borderRadius: "22px",
                  border: selectedTheme === "light" ? `2.5px solid ${theme.primary}` : `1px solid ${theme.border}`,
                  backgroundColor: "#EEF3F8",
                  color: "#1E293B",
                  boxShadow: selectedTheme === "light" ? "inset 2px 2px 6px #CBD5E1, 0 8px 18px rgba(59,130,246,0.2)" : "6px 6px 14px #D1D9E6",
                  textAlign: "center",
                  cursor: "pointer",
                  transition: "transform 0.12s ease",
                }}
              >
                <Sun size={28} color="#F59E0B" style={{ margin: "0 auto 10px" }} />
                <div style={{ fontSize: "15px", fontWeight: "800" }}>☀ Light</div>
                <div style={{ fontSize: "11px", color: "#64748B", marginTop: "4px" }}>Soft Clay</div>
              </button>

              {/* Dark Option */}
              <button
                type="button"
                onClick={() => handleThemeSelect("dark")}
                style={{
                  padding: "22px 14px",
                  borderRadius: "22px",
                  border: selectedTheme === "dark" ? `2.5px solid ${theme.primary}` : `1px solid #1E293B`,
                  backgroundColor: "#0B1120",
                  color: "#F8FAFC",
                  boxShadow: selectedTheme === "dark" ? "inset 2px 2px 6px #000, 0 8px 18px rgba(59,130,246,0.3)" : "6px 6px 14px #080D1A",
                  textAlign: "center",
                  cursor: "pointer",
                  transition: "transform 0.12s ease",
                }}
              >
                <Moon size={28} color="#818CF8" style={{ margin: "0 auto 10px" }} />
                <div style={{ fontSize: "15px", fontWeight: "800" }}>🌙 Dark</div>
                <div style={{ fontSize: "11px", color: "#94A3B8", marginTop: "4px" }}>Deep Slate</div>
              </button>
            </div>

            <ClayButton fullWidth size="lg" onClick={handleNext}>
              Next <ArrowRight size={18} />
            </ClayButton>
          </div>
        )}

        {/* Step 3: Currency */}
        {step === 3 && (
          <div className="animate-fade-in">
            <ProgressDots step={3} total={5} theme={theme} />
            <h2 style={{ fontSize: "24px", fontWeight: "800", color: theme.text, margin: "0 0 8px" }}>
              Choose your currency
            </h2>
            <p style={{ fontSize: "14px", color: theme.muted, margin: "0 0 20px" }}>
              Your default home currency for balance summaries.
            </p>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "10px", marginBottom: "28px" }}>
              {CURRENCIES.map((c) => {
                const isSelected = homeCurrency === c.code;
                return (
                  <button
                    key={c.code}
                    type="button"
                    onClick={() => setHomeCurrency(c.code)}
                    style={{
                      padding: "16px 8px",
                      borderRadius: "18px",
                      border: isSelected ? `2px solid ${theme.primary}` : `1px solid ${theme.border}`,
                      backgroundColor: theme.card,
                      boxShadow: isSelected ? theme.clayPressed : theme.clayRaisedSm,
                      color: isSelected ? theme.primary : theme.text,
                      textAlign: "center",
                      cursor: "pointer",
                    }}
                  >
                    <div style={{ fontSize: "22px", fontWeight: "700" }}>{c.symbol}</div>
                    <div style={{ fontSize: "11px", fontWeight: "600", marginTop: "4px", color: theme.muted }}>
                      {c.code}
                    </div>
                  </button>
                );
              })}
            </div>

            <ClayButton fullWidth size="lg" onClick={handleNext}>
              Next <ArrowRight size={18} />
            </ClayButton>
          </div>
        )}

        {/* Step 4: Avatar Selection */}
        {step === 4 && (
          <div className="animate-fade-in">
            <ProgressDots step={4} total={5} theme={theme} />
            <h2 style={{ fontSize: "24px", fontWeight: "800", color: theme.text, margin: "0 0 8px" }}>
              Choose your avatar
            </h2>
            <p style={{ fontSize: "14px", color: theme.muted, margin: "0 0 20px" }}>
              Pick a friendly illustrated avatar for your profile.
            </p>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "14px", marginBottom: "28px" }}>
              {AVATARS.map((av) => {
                const isSelected = selectedAvatarId === av.id;
                return (
                  <button
                    key={av.id}
                    type="button"
                    onClick={() => setSelectedAvatarId(av.id)}
                    style={{
                      padding: "14px 8px",
                      borderRadius: "20px",
                      border: isSelected ? `2.5px solid ${theme.primary}` : `1px solid ${theme.border}`,
                      backgroundColor: theme.card,
                      boxShadow: isSelected ? theme.clayPressed : theme.clayRaisedSm,
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: "6px",
                      cursor: "pointer",
                      position: "relative",
                      transition: "transform 0.12s ease",
                    }}
                  >
                    <div
                      style={{
                        width: "52px",
                        height: "52px",
                        borderRadius: "50%",
                        backgroundColor: av.bg,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "26px",
                        boxShadow: `0 4px 10px ${av.bg}`,
                        border: isSelected ? `2px solid ${av.accent}` : "none",
                      }}
                    >
                      {av.emoji}
                    </div>
                    <span style={{ fontSize: "11.5px", fontWeight: isSelected ? "800" : "600", color: theme.text }}>
                      {av.label}
                    </span>

                    {isSelected && (
                      <div
                        style={{
                          position: "absolute",
                          top: "-4px",
                          right: "-4px",
                          backgroundColor: theme.primary,
                          color: "#FFF",
                          borderRadius: "50%",
                          width: "18px",
                          height: "18px",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <Check size={12} strokeWidth={3} />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            <ClayButton fullWidth size="lg" onClick={handleNext}>
              Next <ArrowRight size={18} />
            </ClayButton>
          </div>
        )}

        {/* Step 5: You're all set! */}
        {step === 5 && (
          <div className="animate-pop-in" style={{ textAlign: "center", padding: "10px 0" }}>
            <div
              style={{
                width: "84px",
                height: "84px",
                borderRadius: "50%",
                backgroundColor: theme.emerald,
                margin: "0 auto 20px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: `0 12px 28px ${theme.emeraldTint}`,
              }}
            >
              <Check size={44} color="#FFFFFF" strokeWidth={3} />
            </div>

            <h2 style={{ fontSize: "24px", fontWeight: "800", color: theme.text, margin: "0 0 8px" }}>
              You're all set, {name.split(" ")[0]}!
            </h2>
            <p style={{ fontSize: "14px", color: theme.muted, margin: "0 0 32px", lineHeight: "1.5" }}>
              Your profile has been created. Ready to split fair and settle smart.
            </p>

            <ClayButton fullWidth size="lg" onClick={handleNext}>
              Continue to Splitzy <ArrowRight size={18} />
            </ClayButton>
          </div>
        )}
      </div>
    </div>
  );
}

function ProgressDots({ step, total = 5, theme }) {
  return (
    <div style={{ display: "flex", gap: "6px", marginBottom: "24px" }}>
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          style={{
            height: "5px",
            flex: 1,
            borderRadius: "3px",
            backgroundColor: i <= step ? theme.primary : theme.border,
            transition: "all 0.2s ease",
          }}
        />
      ))}
    </div>
  );
}
