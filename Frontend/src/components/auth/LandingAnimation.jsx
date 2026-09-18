import React, { useState, useEffect } from "react";
import { Coins, ArrowRight } from "lucide-react";
import { ClayButton } from "../common/ClayButton";

export function LandingAnimation({ onGetStarted, theme }) {
  const [animDone, setAnimDone] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setAnimDone(true);
    }, 1200);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div
      style={{
        minHeight: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "32px 24px",
        backgroundColor: theme.bg,
        color: theme.text,
        textAlign: "center",
        position: "relative",
      }}
    >
      <div style={{ width: "100%", maxWidth: "340px" }}>
        {/* Animated Brand Coin */}
        <div
          className="animate-float-coin"
          style={{
            width: "92px",
            height: "92px",
            borderRadius: "30px",
            backgroundColor: theme.primary,
            margin: "0 auto 28px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: `0 14px 28px ${theme.primaryTint}, inset 2px 2px 2px rgba(255, 255, 255, 0.4)`,
            transition: "transform 0.4s ease",
          }}
        >
          <Coins size={46} color="#FFFFFF" strokeWidth={2.2} />
        </div>

        <h1
          className="animate-fade-in"
          style={{
            fontSize: "36px",
            fontWeight: "800",
            color: theme.text,
            margin: "0 0 10px",
            letterSpacing: "-0.5px",
          }}
        >
          Splitzy
        </h1>

        <p
          className="animate-fade-in"
          style={{
            fontSize: "15px",
            color: theme.muted,
            lineHeight: "1.6",
            margin: "0 0 40px",
            padding: "0 8px",
          }}
        >
          Split fair. Settle smart. The clean way to manage shared expenses.
        </p>

        <div className={animDone ? "animate-pop-in" : "animate-fade-in"}>
          <ClayButton fullWidth size="lg" onClick={onGetStarted}>
            Get Started <ArrowRight size={18} />
          </ClayButton>
        </div>
      </div>
    </div>
  );
}
