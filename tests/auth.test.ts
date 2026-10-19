import { describe, expect, it } from "vitest";
import {
  LOGIN_NOTICES,
  authCallbackUrl,
  authErrorCopy,
  emailDomain,
  loginNotice,
  mapAuthError,
  pendingSignupLogPayload,
  validateLogin,
  validateNewPassword,
  validateSignup,
} from "@/components/auth/rules";
import { safeNext } from "@/lib/safe-next";

const goodSignup = {
  name: "Xavier",
  workshopName: "Taller Pillco",
  city: "Cuenca",
  email: "xavier@tallerpillco.com",
  password: "12345678",
  agreed: true,
};

describe("validateLogin", () => {
  it("empty email", () => {
    expect(validateLogin({ email: "", password: "x" })).toEqual({ email: "Enter your email." });
  });
  it("bad email", () => {
    expect(validateLogin({ email: "abc", password: "x" })).toEqual({ email: "That doesn't look like an email." });
  });
  it("empty password", () => {
    expect(validateLogin({ email: "a@b.co", password: "" })).toEqual({ password: "Enter your password." });
  });
  it("valid", () => {
    expect(validateLogin({ email: "a@b.co", password: "x" })).toEqual({});
  });
});

describe("validateSignup", () => {
  it("accepts a complete form", () => {
    expect(validateSignup(goodSignup)).toEqual({});
  });
  it("7 characters blocks, 8 passes", () => {
    expect(validateSignup({ ...goodSignup, password: "1234567" }).password).toBeTruthy();
    expect(validateSignup({ ...goodSignup, password: "12345678" }).password).toBeUndefined();
  });
  it("terms are required", () => {
    expect(validateSignup({ ...goodSignup, agreed: false }).agreed).toBeTruthy();
  });
  it("city must be in the list", () => {
    expect(validateSignup({ ...goodSignup, city: "Quito" }).city).toBeTruthy();
    expect(validateSignup({ ...goodSignup, city: "Sígsig" }).city).toBeUndefined();
  });
  it("names are trimmed and capped", () => {
    expect(validateSignup({ ...goodSignup, name: "   " }).name).toBeTruthy();
    expect(validateSignup({ ...goodSignup, workshopName: "x".repeat(81) }).workshopName).toBeTruthy();
  });
});

describe("mapAuthError", () => {
  it.each([
    [{ status: 400, code: "invalid_credentials" }, "invalid_credentials"],
    [{ status: 400, message: "Invalid login credentials" }, "invalid_credentials"],
    [{ status: 429 }, "rate_limited"],
    [{ code: "over_request_rate_limit" }, "rate_limited"],
    [{ code: "user_already_exists" }, "email_taken"],
    [{ message: "User already registered" }, "email_taken"],
    [{ code: "weak_password" }, "weak_password"],
    [new TypeError("fetch failed"), "network"],
    [{ status: 0 }, "network"],
    [{ status: 500, message: "boom" }, "unknown"],
    [null, "unknown"],
  ])("%o -> %s", (input, expected) => {
    expect(mapAuthError(input)).toBe(expected);
  });
});

describe("copy and helpers", () => {
  it("banner copy", () => {
    expect(authErrorCopy("rate_limited")).toBe("Too many attempts. Try again in 1 minute.");
    expect(authErrorCopy("invalid_credentials")).toBe("Email or password is incorrect.");
    expect(authErrorCopy("network")).toBe("Couldn't reach the server. Check your connection and try again.");
  });
  it("email domain only, never the address", () => {
    expect(emailDomain("Xavier@TallerPillco.com")).toBe("tallerpillco.com");
  });
  it("safeNext blocks open redirects", () => {
    expect(safeNext("/hats/TQ-7F3K2")).toBe("/hats/TQ-7F3K2");
    expect(safeNext("//evil.com")).toBe("/workshop");
    expect(safeNext("https://evil.com")).toBe("/workshop");
    expect(safeNext(null)).toBe("/workshop");
    expect(safeNext("/\\evil.com")).toBe("/workshop");
  });
});

describe("pendingSignupLogPayload", () => {
  it("logs a pending sign-up with the email domain only", () => {
    const p = pendingSignupLogPayload({ email: "Rosa@Taller.EC", city: "Cuenca", requestId: "req_0123456789ab", durationMs: 12 });
    expect(p).toEqual({
      ok: true,
      pending_confirmation: true,
      city: "Cuenca",
      email_domain: "taller.ec",
      request_id: "req_0123456789ab",
      duration_ms: 12,
    });
    expect(JSON.stringify(p)).not.toContain("Rosa@");
  });
});

describe("email links (confirm and reset)", () => {
  it("builds the callback from the request origin", () => {
    expect(authCallbackUrl("http://localhost:3000", "/reset")).toBe("http://localhost:3000/auth/confirm?next=%2Freset");
    expect(authCallbackUrl("https://toquilla-trace.vercel.app", "/workshop?welcome=1")).toBe(
      "https://toquilla-trace.vercel.app/auth/confirm?next=%2Fworkshop%3Fwelcome%3D1",
    );
  });
  it("falls back to the live site for a missing or odd origin", () => {
    const live = "https://toquilla-trace.vercel.app/auth/confirm?next=%2Freset";
    expect(authCallbackUrl(null, "/reset")).toBe(live);
    expect(authCallbackUrl("javascript:alert(1)", "/reset")).toBe(live);
    expect(authCallbackUrl("https://a.example/path", "/reset")).toBe(live);
    expect(authCallbackUrl("not a url", "/reset")).toBe(live);
  });
  it("login notices are fixed copy, never text from the URL", () => {
    expect(loginNotice("link_invalid")).toBe(LOGIN_NOTICES.link_invalid);
    expect(loginNotice("<script>")).toBeNull();
    expect(loginNotice("toString")).toBeNull();
    expect(loginNotice(null)).toBeNull();
  });
  it("new password follows the sign-up rule and must match", () => {
    expect(validateNewPassword("12345678", "12345678")).toEqual({});
    expect(validateNewPassword("1234567", "1234567").password).toBe("Use at least 8 characters.");
    expect(validateNewPassword("12345678", "12345679").confirm).toBe("The passwords don't match.");
  });
  it("maps reusing the current password to its own message", () => {
    expect(mapAuthError({ status: 422, code: "same_password", message: "x" })).toBe("same_password");
    expect(authErrorCopy("same_password")).toBe("That is your current password. Choose a new one.");
  });
});
