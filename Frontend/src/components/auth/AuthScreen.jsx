import React, { useState } from "react";
import { Eye, EyeOff, ArrowRight, Coins, Lock, Mail } from "lucide-react";
import { ClayButton } from "../common/ClayButton";
import { signInWithGoogle, mapAuthError } from "../../services/authService";

export function AuthScreen({ onAuthenticate, theme }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [isSigningIn, setIsSigningIn] = useState(false);

  const handleSignIn = (e) => {
    e.preventDefault();
    setError("");

    if (!email.trim() || !email.includes("@")) {
      setError("Please enter a valid email address");
      return;
    }

    if (!password.trim() || password.length < 4) {
      setError("Password must be at least 4 characters");
      return;
    }

    onAuthenticate({
      email: email.trim(),
      authType: "email",
    });
  };

  /** Real Firebase Google sign-in. The existing session flow (onAuthenticate)
   *  and the visual design are unchanged — only the identity source is real. */
  const handleGoogleSignIn = async () => {
    if (isSigningIn) return;
    setError("");
    setIsSigningIn(true);
    try {
      const user = await signInWithGoogle();
      if (user && !user.redirecting) {
        onAuthenticate({
          email: user.email,
          authType: "google",
          nameFromGoogle: user.displayName,
        });
      }
      // user.redirecting: the browser is navigating to Google — nothing to do.
    } catch (err) {
      setError(mapAuthError(err));
    } finally {
      setIsSigningIn(false);
    }
  };

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
      }}
      className="animate-fade-in"
    >
      <div style={{ width: "100%", maxWidth: "340px" }}>
        {/* Brand Icon Header */}
        <div style={{ textAlign: "center", marginBottom: "28px" }}>
          <div
            style={{
              width: "60px",
              height: "60px",
              borderRadius: "20px",
              backgroundColor: theme.primary,
              margin: "0 auto 16px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: `0 8px 20px ${theme.primaryTint}`,
            }}
          >
            <Coins size={30} color="#FFFFFF" strokeWidth={2.2} />
          </div>
          <h2 style={{ fontSize: "24px", fontWeight: "800", color: theme.text, margin: "0 0 6px" }}>
            Welcome to Splitzy
          </h2>
          <p style={{ fontSize: "13.5px", color: theme.muted, margin: 0 }}>
            Sign in to access your shared expenses
          </p>
        </div>

        {/* Auth Form */}
        <form onSubmit={handleSignIn}>
          {/* Email Input */}
          <div style={{ marginBottom: "14px" }}>
            <label style={{ display: "block", fontSize: "11.5px", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.6px", color: theme.muted, marginBottom: "6px" }}>
              Email
            </label>
            <div style={{ position: "relative" }}>
              <Mail size={16} color={theme.muted} style={{ position: "absolute", left: "14px", top: "14px" }} />
              <input
                autoFocus
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setError("");
                }}
                placeholder="Enter your email"
                style={{
                  width: "100%",
                  padding: "12px 14px 12px 38px",
                  borderRadius: "16px",
                  border: `1px solid ${theme.border}`,
                  backgroundColor: theme.inputBg,
                  boxShadow: theme.clayPressed,
                  fontSize: "14px",
                  fontWeight: "600",
                  color: theme.text,
                }}
              />
            </div>
          </div>

          {/* Password Input with Show/Hide */}
          <div style={{ marginBottom: "18px" }}>
            <label style={{ display: "block", fontSize: "11.5px", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.6px", color: theme.muted, marginBottom: "6px" }}>
              Password
            </label>
            <div style={{ position: "relative" }}>
              <Lock size={16} color={theme.muted} style={{ position: "absolute", left: "14px", top: "14px" }} />
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setError("");
                }}
                placeholder="Enter your password"
                style={{
                  width: "100%",
                  padding: "12px 40px 12px 38px",
                  borderRadius: "16px",
                  border: `1px solid ${theme.border}`,
                  backgroundColor: theme.inputBg,
                  boxShadow: theme.clayPressed,
                  fontSize: "14px",
                  fontWeight: "600",
                  color: theme.text,
                }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{
                  position: "absolute",
                  right: "12px",
                  top: "12px",
                  background: "none",
                  border: "none",
                  color: theme.muted,
                  cursor: "pointer",
                  padding: "2px",
                  display: "flex",
                }}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          {error && (
            <div style={{ color: theme.coral, fontSize: "12.5px", fontWeight: "600", marginBottom: "16px" }}>
              {error}
            </div>
          )}

          <ClayButton type="submit" fullWidth size="lg">
            Sign In <ArrowRight size={18} />
          </ClayButton>
        </form>

        {/* Divider */}
        <div style={{ display: "flex", alignItems: "center", margin: "22px 0", gap: "10px" }}>
          <div style={{ flex: 1, height: "1px", backgroundColor: theme.divider }} />
          <span style={{ fontSize: "11.5px", fontWeight: "700", color: theme.mutedSoft, textTransform: "uppercase" }}>
            OR
          </span>
          <div style={{ flex: 1, height: "1px", backgroundColor: theme.divider }} />
        </div>

        {/* Google Sign In Button */}
        <button
          type="button"
          onClick={handleGoogleSignIn}
          disabled={isSigningIn}
          style={{
            width: "100%",
            padding: "13px 18px",
            borderRadius: "18px",
            border: `1px solid ${theme.border}`,
            backgroundColor: theme.card,
            boxShadow: theme.clayRaisedSm,
            color: theme.text,
            fontSize: "14px",
            fontWeight: "700",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "10px",
            cursor: isSigningIn ? "wait" : "pointer",
            transition: "transform 0.12s ease",
            fontFamily: "'Plus Jakarta Sans', sans-serif",
            opacity: isSigningIn ? 0.7 : 1,
          }}
          className="active:scale-[0.97]"
        >
          {/* Official Google G Logo SVG */}
          <svg width="18" height="18" viewBox="0 0 48 48">
            <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
            <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
            <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
            <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
          </svg>
          <span>{isSigningIn ? "Opening Google…" : "Continue with Google"}</span>
        </button>
      </div>
    </div>
  );
}
