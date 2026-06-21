import { describe, expect, it } from "vitest";
import { ZodError } from "zod";
import { isValidationError, publicErrorMessage } from "@/src/services/errors";

describe("isValidationError", () => {
  it("detects a ZodError", () => {
    expect(isValidationError(new ZodError([]))).toBe(true);
    expect(isValidationError(new Error("x"))).toBe(false);
  });
});

describe("publicErrorMessage", () => {
  it("maps a ZodError to a generic validation message (no schema dump)", () => {
    expect(publicErrorMessage(new ZodError([]), "fallback")).toBe("Invalid request.");
  });

  it("returns the fallback for unexpected errors and never leaks the original message", () => {
    const internal = new Error("DSQL: relation consent_event constraint detail leak");
    expect(publicErrorMessage(internal, "Could not save.")).toBe("Could not save.");
    expect(publicErrorMessage(internal, "Could not save.")).not.toContain("DSQL");
  });
});
