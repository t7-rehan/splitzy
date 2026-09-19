/**
 * Auth form validation rules (Task: Production-Ready Auth).
 *
 * Rules:
 *   Email:
 *     - required
 *     - valid format (tested against standard email regex)
 *     - trimmed
 *   Password:
 *     - required
 *     - minimum 6 characters
 *     - NOT trimmed
 *   Confirm Password (sign-up only):
 *     - required
 *     - must exactly match password
 *   Name (sign-up only):
 *     - required
 *     - trimmed leading/trailing whitespace
 *     - reasonable length (2 to 70 characters, never over-restrictive)
 */

export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateEmail(email) {
  if (!email || typeof email !== "string" || !email.trim()) {
    return "Please enter your email address.";
  }
  const trimmed = email.trim();
  if (!EMAIL_REGEX.test(trimmed)) {
    return "Please enter a valid email address.";
  }
  return null;
}

export function validatePassword(password) {
  if (!password || typeof password !== "string") {
    return "Please enter your password.";
  }
  if (password.length < 6) {
    return "Password must be at least 6 characters.";
  }
  return null;
}

export function validateConfirmPassword(password, confirmPassword) {
  if (!confirmPassword || typeof confirmPassword !== "string") {
    return "Please confirm your password.";
  }
  if (password !== confirmPassword) {
    return "Passwords do not match.";
  }
  return null;
}

export function validateName(name) {
  if (!name || typeof name !== "string" || !name.trim()) {
    return "Please enter your name.";
  }
  const trimmed = name.trim();
  if (trimmed.length < 2) {
    return "Name must be at least 2 characters.";
  }
  if (trimmed.length > 70) {
    return "Name must be under 70 characters.";
  }
  return null;
}

export function validateAuthForm({ mode, email, password, confirmPassword, name }) {
  if (mode === "signup") {
    const nameError = validateName(name);
    if (nameError) return nameError;
  }

  const emailError = validateEmail(email);
  if (emailError) return emailError;

  if (mode === "forgot") {
    return null;
  }

  const passwordError = validatePassword(password);
  if (passwordError) return passwordError;

  if (mode === "signup") {
    const confirmError = validateConfirmPassword(password, confirmPassword);
    if (confirmError) return confirmError;
  }

  return null;
}
