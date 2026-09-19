import assert from "node:assert/strict";
import test from "node:test";
import {
  validateEmail,
  validatePassword,
  validateConfirmPassword,
  validateName,
  validateAuthForm,
} from "../src/utils/authValidation.js";

test("validateEmail: accepts valid email formats", () => {
  const valid = [
    "user@example.com",
    "user.name+tag@sub.domain.co",
    "john_doe123@test.org",
    "  user@example.com  ", // leading/trailing spaces will be trimmed
  ];
  for (const email of valid) {
    assert.equal(validateEmail(email), null, `expected valid for ${email}`);
  }
});

test("validateEmail: rejects invalid email formats", () => {
  const invalid = [
    "",
    "   ",
    null,
    undefined,
    "user@",
    "@example.com",
    "plainaddress",
    "user @example.com",
    "user@example",
  ];
  for (const email of invalid) {
    const error = validateEmail(email);
    assert.ok(typeof error === "string" && error.length > 0, `expected error for ${email}`);
  }
});

test("validatePassword: requires at least 6 characters and preserves leading/trailing spaces", () => {
  assert.equal(validatePassword("123456"), null);
  assert.equal(validatePassword("strongPassword!"), null);
  assert.equal(validatePassword("  1234  "), null); // untrimmed length is 8 >= 6

  assert.ok(typeof validatePassword("") === "string");
  assert.ok(typeof validatePassword(null) === "string");
  assert.ok(typeof validatePassword("12345") === "string");
});

test("validateConfirmPassword: requires exact match", () => {
  assert.equal(validateConfirmPassword("mysecret", "mysecret"), null);
  assert.ok(typeof validateConfirmPassword("mysecret", "different") === "string");
  assert.ok(typeof validateConfirmPassword("mysecret", "mysecret ") === "string");
  assert.ok(typeof validateConfirmPassword("mysecret", "") === "string");
});

test("validateName: requires 2-70 characters and trims leading/trailing whitespace", () => {
  assert.equal(validateName("Samara"), null);
  assert.equal(validateName("  John Doe  "), null);
  assert.equal(validateName("A B"), null);

  assert.ok(typeof validateName("") === "string");
  assert.ok(typeof validateName("   ") === "string");
  assert.ok(typeof validateName("A") === "string"); // 1 char
  assert.ok(typeof validateName("A".repeat(71)) === "string"); // > 70 chars
});

test("validateAuthForm: handles all three modes correctly", () => {
  // Sign In mode
  assert.equal(
    validateAuthForm({ mode: "signin", email: "user@example.com", password: "password123" }),
    null
  );
  assert.ok(
    typeof validateAuthForm({ mode: "signin", email: "invalid", password: "password123" }) === "string"
  );
  assert.ok(
    typeof validateAuthForm({ mode: "signin", email: "user@example.com", password: "123" }) === "string"
  );

  // Forgot Password mode
  assert.equal(
    validateAuthForm({ mode: "forgot", email: "user@example.com" }),
    null
  );
  assert.ok(
    typeof validateAuthForm({ mode: "forgot", email: "invalid-email" }) === "string"
  );

  // Sign Up mode
  assert.equal(
    validateAuthForm({
      mode: "signup",
      name: "Alice",
      email: "alice@example.com",
      password: "securepassword",
      confirmPassword: "securepassword",
    }),
    null
  );
  // Password mismatch in sign up
  assert.ok(
    typeof validateAuthForm({
      mode: "signup",
      name: "Alice",
      email: "alice@example.com",
      password: "securepassword",
      confirmPassword: "wrongpassword",
    }) === "string"
  );
  // Missing name in sign up
  assert.ok(
    typeof validateAuthForm({
      mode: "signup",
      name: "",
      email: "alice@example.com",
      password: "securepassword",
      confirmPassword: "securepassword",
    }) === "string"
  );
});
