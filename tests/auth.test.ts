import { describe, expect, it } from "vitest";
import { authErrorCopy, emailDomain, mapAuthError, validateLogin, validateSignup } from "@/components/auth/rules";
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
