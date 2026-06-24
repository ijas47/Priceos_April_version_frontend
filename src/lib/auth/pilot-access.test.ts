import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  envPilotBypassCode,
  generatePilotCodeValue,
  isOpenRegistrationEnabled,
} from "./pilot-access";

describe("pilot-access", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.PILOT_BYPASS_CODE;
    delete process.env.ALLOW_OPEN_REGISTRATION;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("isOpenRegistrationEnabled respects env flag", () => {
    expect(isOpenRegistrationEnabled()).toBe(false);
    process.env.ALLOW_OPEN_REGISTRATION = "true";
    expect(isOpenRegistrationEnabled()).toBe(true);
    process.env.ALLOW_OPEN_REGISTRATION = "1";
    expect(isOpenRegistrationEnabled()).toBe(true);
  });

  it("envPilotBypassCode normalizes whitespace and case", () => {
    process.env.PILOT_BYPASS_CODE = "  pilot demo  ";
    expect(envPilotBypassCode()).toBe("PILOT-DEMO");
  });

  it("generatePilotCodeValue uses prefix", () => {
    const code = generatePilotCodeValue("ACME");
    expect(code.startsWith("ACME-")).toBe(true);
    expect(code.length).toBeGreaterThan(6);
  });
});