import React, { useState } from "react";
import { Eye, EyeOff, ArrowRight, Coins, Lock, Mail, User, CheckCircle2 } from "lucide-react";
import { ClayButton } from "../common/ClayButton";
import {
  signInWithGoogle,
  signInWithEmail,
  signUpWithEmail,
  resetPassword,
  mapAuthError,
} from "../../services/authService";
import { validateAuthForm } from "../../utils/authValidation";

export function AuthScreen({ onAuthenticate, theme }) {
  // Modes: "signin" | "signup" | "forgot"
  const [mode, setMode] = useState("signin");

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [error, setError] = useState("");
  const [resetSent, setResetSent] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGoogleSigningIn, setIsGoogleSigningIn] = useState(false);

  const switchMode = (newMode) => {
    setMode(newMode);
    setError("");
    setResetSent(false);
    setPassword("");
    setConfirmPassword("");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isSubmitting || isGoogleSigningIn) return;
    setError("");
    setResetSent(false);

    // Validate form inputs before any Firebase call
    const validationError = validateAuthForm({
      mode,
      name,
      email,
      password,
      confirmPassword,
    });

    if (validationError) {
      setError(validationError);
      return;
    }

    setIsSubmitting(true);
    try {
      if (mode === "signin") {
        const user = await signInWithEmail(email.trim(), password);
        if (user) {
          onAuthenticate({
            email: user.email,
            authType: "email",
            displayName: user.displayName,
          });
        }
      } else if (mode === "signup") {
        const user = await signUpWithEmail(email.trim(), password, name.trim());
        if (user) {
          onAuthenticate({
            email: user.email,
            authType: "email",
            displayName: user.displayName,
          });
        }
      } else if (mode === "forgot") {
        await resetPassword(email.trim());
        setResetSent(true);
      }
    } catch (err) {
      setError(mapAuthError(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  /** Real Firebase Google sign-in */
  const handleGoogleSignIn = async () => {
    if (isSubmitting || isGoogleSigningIn) return;
    setError("");
    setResetSent(false);
    setIsGoogleSigningIn(true);
    try {
      const user = await signInWithGoogle();
      if (user && !user.redirecting) {
        onAuthenticate({
          email: user.email,
          authType: "google",
          nameFromGoogle: user.displayName,
        });
      }
    } catch (err) {
      setError(mapAuthError(err));
    } finally {
      setIsGoogleSigningIn(false);
    }
  };

  const isBusy = isSubmitting || isGoogleSigningIn;

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
            {mode === "signup"
              ? "Create an Account"
              : mode === "forgot"
              ? "Reset Password"
              : "Welcome to Splitzy"}
          </h2>
          <p style={{ fontSize: "13.5px", color: theme.muted, margin: 0 }}>
            {mode === "signup"
              ? "Sign up to track and split shared expenses"
              : mode === "forgot"
              ? "Enter your email to receive a password reset link"
              : "Sign in to access your shared expenses"}
          </p>
        </div>

        {/* Auth Form */}
        <form onSubmit={handleSubmit}>
          {/* Name Field (Sign Up only) */}
          {mode === "signup" && (
            <div style={{ marginBottom: "14px" }}>
              <label
                style={{
                  display: "block",
                  fontSize: "11.5px",
                  fontWeight: "700",
                  textTransform: "uppercase",
                  letterSpacing: "0.6px",
                  color: theme.muted,
                  marginBottom: "6px",
                }}
              >
                Name
              </label>
              <div style={{ position: "relative" }}>
                <User
                  size={16}
                  color={theme.muted}
                  style={{ position: "absolute", left: "14px", top: "14px" }}
                />
                <input
                  autoFocus
                  type="text"
                  disabled={isBusy}
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    setError("");
                  }}
                  placeholder="Enter your full name"
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
                    opacity: isBusy ? 0.7 : 1,
                  }}
                />
              </div>
            </div>
          )}

          {/* Email Field */}
          <div style={{ marginBottom: "14px" }}>
            <label
              style={{
                display: "block",
                fontSize: "11.5px",
                fontWeight: "700",
                textTransform: "uppercase",
                letterSpacing: "0.6px",
                color: theme.muted,
                marginBottom: "6px",
              }}
            >
              Email
            </label>
            <div style={{ position: "relative" }}>
              <Mail
                size={16}
                color={theme.muted}
                style={{ position: "absolute", left: "14px", top: "14px" }}
              />
              <input
                autoFocus={mode !== "signup"}
                type="email"
                disabled={isBusy}
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
                  opacity: isBusy ? 0.7 : 1,
                }}
              />
            </div>
          </div>

          {/* Password Field (Sign In & Sign Up only) */}
          {mode !== "forgot" && (
            <div style={{ marginBottom: mode === "signin" ? "8px" : "14px" }}>
              <label
                style={{
                  display: "block",
                  fontSize: "11.5px",
                  fontWeight: "700",
                  textTransform: "uppercase",
                  letterSpacing: "0.6px",
                  color: theme.muted,
                  marginBottom: "6px",
                }}
              >
                Password
              </label>
              <div style={{ position: "relative" }}>
                <Lock
                  size={16}
                  color={theme.muted}
                  style={{ position: "absolute", left: "14px", top: "14px" }}
                />
                <input
                  type={showPassword ? "text" : "password"}
                  disabled={isBusy}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setError("");
                  }}
                  placeholder="Enter your password (min 6 characters)"
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
                    opacity: isBusy ? 0.7 : 1,
                  }}
                />
                <button
                  type="button"
                  tabIndex={-1}
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
          )}

          {/* Forgot Password Link (Sign In mode only) */}
          {mode === "signin" && (
            <div style={{ textAlign: "right", marginBottom: "16px" }}>
              <button
                type="button"
                onClick={() => switchMode("forgot")}
                style={{
                  background: "none",
                  border: "none",
                  color: theme.primary,
                  fontSize: "12.5px",
                  fontWeight: "700",
                  cursor: "pointer",
                  padding: "2px 0",
                  fontFamily: "'Plus Jakarta Sans', sans-serif",
                }}
              >
                Forgot password?
              </button>
            </div>
          )}

          {/* Confirm Password Field (Sign Up mode only) */}
          {mode === "signup" && (
            <div style={{ marginBottom: "18px" }}>
              <label
                style={{
                  display: "block",
                  fontSize: "11.5px",
                  fontWeight: "700",
                  textTransform: "uppercase",
                  letterSpacing: "0.6px",
                  color: theme.muted,
                  marginBottom: "6px",
                }}
              >
                Confirm Password
              </label>
              <div style={{ position: "relative" }}>
                <Lock
                  size={16}
                  color={theme.muted}
                  style={{ position: "absolute", left: "14px", top: "14px" }}
                />
                <input
                  type={showConfirmPassword ? "text" : "password"}
                  disabled={isBusy}
                  value={confirmPassword}
                  onChange={(e) => {
                    setConfirmPassword(e.target.value);
                    setError("");
                  }}
                  placeholder="Re-enter your password"
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
                    opacity: isBusy ? 0.7 : 1,
                  }}
                />
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
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
                  {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div
              style={{
                color: theme.coral,
                fontSize: "12.5px",
                fontWeight: "600",
                marginBottom: "16px",
                lineHeight: "1.4",
              }}
            >
              {error}
            </div>
          )}

          {/* Success Message for Password Reset */}
          {resetSent && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                backgroundColor: theme.mintTint || "rgba(16, 185, 129, 0.12)",
                color: theme.mint || "#10B981",
                padding: "12px 14px",
                borderRadius: "14px",
                fontSize: "12.5px",
                fontWeight: "600",
                marginBottom: "16px",
                lineHeight: "1.4",
              }}
            >
              <CheckCircle2 size={18} style={{ flexShrink: 0 }} />
              <span>If an account exists for this email, a password reset link has been sent. Check your inbox.</span>
            </div>
          )}

          {/* Submit Button */}
          <ClayButton
            type="submit"
            fullWidth
            size="lg"
            disabled={isBusy}
          >
            {isSubmitting
              ? mode === "forgot"
                ? "Sending link…"
                : mode === "signup"
                ? "Creating account…"
                : "Signing in…"
              : mode === "forgot"
              ? "Send reset link"
              : mode === "signup"
              ? "Create account"
              : "Sign In"}
            {!isSubmitting && <ArrowRight size={18} />}
          </ClayButton>
        </form>

        {/* Mode Toggle Link for Forgot Password */}
        {mode === "forgot" && (
          <div style={{ textAlign: "center", marginTop: "20px" }}>
            <button
              type="button"
              onClick={() => switchMode("signin")}
              disabled={isBusy}
              style={{
                background: "none",
                border: "none",
                color: theme.primary,
                fontSize: "13.5px",
                fontWeight: "700",
                cursor: "pointer",
                padding: "4px",
                fontFamily: "'Plus Jakarta Sans', sans-serif",
              }}
            >
              Back to sign in
            </button>
          </div>
        )}

        {/* Divider & Google Sign In (Sign In & Sign Up only) */}
        {mode !== "forgot" && (
          <>
            {/* Divider */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                margin: "22px 0",
                gap: "10px",
              }}
            >
              <div style={{ flex: 1, height: "1px", backgroundColor: theme.divider }} />
              <span
                style={{
                  fontSize: "11.5px",
                  fontWeight: "700",
                  color: theme.mutedSoft,
                  textTransform: "uppercase",
                }}
              >
                OR
              </span>
              <div style={{ flex: 1, height: "1px", backgroundColor: theme.divider }} />
            </div>

            {/* Google Sign In Button */}
            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={isBusy}
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
                cursor: isBusy ? "wait" : "pointer",
                transition: "transform 0.12s ease",
                fontFamily: "'Plus Jakarta Sans', sans-serif",
                opacity: isBusy ? 0.7 : 1,
              }}
              className="active:scale-[0.97]"
            >
              {/* Official Google G Logo SVG */}
              <svg width="18" height="18" viewBox="0 0 48 48">
                <path
                  fill="#EA4335"
                  d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
                />
                <path
                  fill="#4285F4"
                  d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
                />
                <path
                  fill="#FBBC05"
                  d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
                />
                <path
                  fill="#34A853"
                  d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
                />
              </svg>
              <span>{isGoogleSigningIn ? "Opening Google…" : "Continue with Google"}</span>
            </button>

            {/* Mode Toggle Link between Sign In and Sign Up */}
            <div style={{ textAlign: "center", marginTop: "22px" }}>
              <span style={{ fontSize: "13.5px", color: theme.muted }}>
                {mode === "signin" ? "Don't have an account? " : "Already have an account? "}
              </span>
              <button
                type="button"
                onClick={() => switchMode(mode === "signin" ? "signup" : "signin")}
                disabled={isBusy}
                style={{
                  background: "none",
                  border: "none",
                  color: theme.primary,
                  fontSize: "13.5px",
                  fontWeight: "700",
                  cursor: "pointer",
                  padding: "2px 0",
                  fontFamily: "'Plus Jakarta Sans', sans-serif",
                }}
              >
                {mode === "signin" ? "Create account" : "Sign in"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
